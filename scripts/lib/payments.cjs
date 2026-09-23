const fs = require('fs')
const path = require('path')
const http = require('http')
const { randomUUID } = require('crypto')
const QRCode = require('qrcode')
const { generateLicenseKey } = require('./license-key.cjs')
const { METHODS } = require('./pay-copy.cjs')
require('./load-env.cjs')

const FILE = path.join(__dirname, '..', 'data', 'payments.json')
const TTL_MS = 40 * 60 * 1000

function env(name) {
  return String(process.env[name] || '').trim()
}

function numEnv(name) {
  const raw = env(name).replace(',', '.')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function publicUrl() {
  return env('PAYMENTS_PUBLIC_URL').replace(/\/$/, '')
}

function productTitle(product) {
  return product === 'custom' ? 'Tomz Boost · Optimizacion 1 a 1' : 'Tomz Boost'
}

function priceOf(method, product) {
  const custom = product === 'custom'
  if (method === 'ar') return custom ? numEnv('PRICE_CUSTOM_ARS') : numEnv('PRICE_ARS')
  if (method === 'br') return custom ? numEnv('PRICE_CUSTOM_BRL') : numEnv('PRICE_BRL')
  if (method === 'crypto') {
    return custom
      ? numEnv('PRICE_CUSTOM_CRYPTO_USD') || numEnv('PRICE_CUSTOM_USD')
      : numEnv('PRICE_CRYPTO_USD') || numEnv('PRICE_USD')
  }
  return custom ? numEnv('PRICE_CUSTOM_USD') : numEnv('PRICE_USD')
}

function configured(product = 'app') {
  return {
    ar: Boolean(env('MP_AR_ACCESS_TOKEN') && priceOf('ar', product)),
    br: Boolean(env('MP_BR_ACCESS_TOKEN') && priceOf('br', product)),
    stripe: Boolean(env('STRIPE_SECRET_KEY') && priceOf('stripe', product)),
    crypto: Boolean(env('NOWPAYMENTS_API_KEY') && priceOf('crypto', product))
  }
}

function money(method, product = 'app') {
  const amount = priceOf(method, product)
  if (method === 'ar') return { amount, currency: 'ARS', label: formatMoney(amount, 'ARS', 'es-AR') }
  if (method === 'br') return { amount, currency: 'BRL', label: formatMoney(amount, 'BRL', 'pt-BR') }
  return { amount, currency: 'USD', label: formatMoney(amount, 'USD', 'en-US') }
}

function formatMoney(amount, currency, locale) {
  if (!amount) return ''
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
}

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return { orders: {} }
  }
}

function saveDb(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
}

function saveOrder(order) {
  const db = loadDb()
  db.orders[order.id] = order
  saveDb(db)
  return order
}

function getOrder(id) {
  return loadDb().orders[id] || null
}

function listPending() {
  const now = Date.now()
  return Object.values(loadDb().orders).filter((o) => o.status === 'pending' && o.expiresAt > now)
}

function latestPendingForUser(userId) {
  return listPending()
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
}

function hasPaidProduct(userId, product) {
  return Object.values(loadDb().orders).some(
    (o) => o.userId === String(userId) && o.product === product && o.status === 'paid'
  )
}

async function qrPng(text) {
  return QRCode.toBuffer(String(text), {
    type: 'png',
    margin: 1,
    width: 420,
    errorCorrectionLevel: 'M'
  })
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.statusMessage || text || res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

function payerEmail(userId) {
  return `u${userId}@pay.tomzboost.app`
}

async function createMercadoPagoPix({ orderId, userId, product, amount }) {
  const token = env('MP_BR_ACCESS_TOKEN')
  const body = {
    transaction_amount: amount,
    description: productTitle(product),
    payment_method_id: 'pix',
    payer: { email: payerEmail(userId) },
    external_reference: orderId,
    date_of_expiration: new Date(Date.now() + TTL_MS).toISOString()
  }
  const notify = publicUrl()
  if (notify) body.notification_url = `${notify}/webhooks/mercadopago`
  const data = await jsonFetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderId
    },
    body: JSON.stringify(body)
  })
  const tx = data.point_of_interaction?.transaction_data || {}
  if (!tx.qr_code && !tx.qr_code_base64) {
    throw new Error('Mercado Pago no devolvio QR Pix. Revisa que la cuenta BR tenga Pix activo.')
  }
  return {
    mpPaymentId: String(data.id),
    copyPaste: tx.qr_code || '',
    qrBase64: tx.qr_code_base64 || '',
    url: tx.ticket_url || ''
  }
}

function moneyAmount(amount) {
  return Number(amount).toFixed(2)
}

function arPosId() {
  return env('MP_AR_POS_ID') || env('MP_AR_EXTERNAL_POS_ID') || 'tomzboost-discord'
}

function arQrMode() {
  // En Discord siempre queremos un QR unico por pedido (dynamic / hybrid).
  const mode = (env('MP_AR_QR_MODE') || 'dynamic').toLowerCase()
  if (mode === 'hybrid') return 'hybrid'
  return 'dynamic'
}

/** QR nativo MP (Orders API). Requiere caja creada en Mercado Pago. */
async function createMercadoPagoArQr({ orderId, product, amount }) {
  const token = env('MP_AR_ACCESS_TOKEN')
  const posId = arPosId()
  const amountStr = moneyAmount(amount)
  const body = {
    type: 'qr',
    total_amount: amountStr,
    description: productTitle(product).slice(0, 150),
    external_reference: String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
    expiration_time: 'PT40M',
    config: {
      qr: {
        external_pos_id: posId,
        mode: arQrMode()
      }
    },
    transactions: {
      payments: [{ amount: amountStr }]
    },
    items: [
      {
        title: productTitle(product).slice(0, 150),
        unit_price: amountStr,
        quantity: 1,
        unit_measure: 'unit',
        external_code: String(orderId).slice(0, 60)
      }
    ]
  }
  const data = await jsonFetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orderId
    },
    body: JSON.stringify(body)
  })
  const qrData = data.type_response?.qr_data || data.qr_data || ''
  if (!qrData) {
    throw new Error(
      `Mercado Pago AR no devolvio qr_data (caja ${posId}). Crea una caja QR en MP y setea MP_AR_POS_ID con su external_id.`
    )
  }
  const paymentId = data.transactions?.payments?.[0]?.id
  return {
    mpOrderId: String(data.id),
    mpPaymentId: paymentId ? String(paymentId) : '',
    qrPayload: qrData,
    arQrNative: true
  }
}

async function createMercadoPagoArCheckout({ orderId, userId, product, amount }) {
  const token = env('MP_AR_ACCESS_TOKEN')
  const notify = publicUrl()
  const body = {
    items: [
      {
        title: productTitle(product),
        quantity: 1,
        currency_id: 'ARS',
        unit_price: amount
      }
    ],
    payer: { email: payerEmail(userId) },
    external_reference: orderId,
    metadata: { discord_user: userId, product },
    statement_descriptor: 'TOMZ BOOST',
    expires: true,
    expiration_date_to: new Date(Date.now() + TTL_MS).toISOString(),
    auto_return: 'approved',
    back_urls: {
      success: env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app',
      failure: env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app',
      pending: env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app'
    }
  }
  if (notify) body.notification_url = `${notify}/webhooks/mercadopago`
  try {
    return await postArPreference(token, body)
  } catch {
    delete body.auto_return
    delete body.back_urls
    delete body.expires
    delete body.expiration_date_to
    return postArPreference(token, body)
  }
}

/**
 * Integracion online = Checkout Pro (preferencia + QR del checkout).
 * Opcional: MP_AR_QR=native usa Orders/caja presencial.
 */
async function createMercadoPagoAr({ orderId, userId, product, amount }) {
  const mode = (env('MP_AR_QR') || 'checkout').toLowerCase()
  if (['native', 'orders', 'pos', 'caja'].includes(mode)) {
    try {
      return await createMercadoPagoArQr({ orderId, product, amount })
    } catch (err) {
      console.warn('MP AR QR de caja fallo, uso Checkout Pro:', err.message || err)
    }
  }
  return createMercadoPagoArCheckout({ orderId, userId, product, amount })
}

async function postArPreference(token, body) {
  const data = await jsonFetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const url = data.init_point || data.sandbox_init_point
  if (!url) throw new Error('Mercado Pago AR no devolvio el link de pago.')
  // QR apunta al checkout de la preferencia (integracion Checkout Pro).
  const qrPayload =
    data.id != null
      ? `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${encodeURIComponent(data.id)}`
      : url
  return { mpPreferenceId: data.id, url, qrPayload, arQrNative: false }
}

function formBody(fields) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  return params
}

async function createStripe({ orderId, userId, product, amount }) {
  const cents = Math.round(amount * 100)
  const success = env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app'
  const data = await jsonFetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formBody({
      mode: 'payment',
      success_url: success,
      cancel_url: success,
      client_reference_id: orderId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': productTitle(product),
      'metadata[order_id]': orderId,
      'metadata[discord_user]': userId,
      'metadata[product]': product
    }).toString()
  })
  if (!data.url) throw new Error('Stripe no devolvio el Checkout.')
  return { stripeSessionId: data.id, url: data.url }
}

async function createCrypto({ orderId, userId, product, amount }) {
  const body = {
    price_amount: amount,
    price_currency: 'usd',
    order_id: orderId,
    order_description: `${productTitle(product)} ${userId}`,
    success_url: env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app',
    cancel_url: env('PAYMENTS_SUCCESS_URL') || 'https://discord.com/app'
  }
  const notify = publicUrl()
  if (notify) body.ipn_callback_url = `${notify}/webhooks/nowpayments`
  const data = await jsonFetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: {
      'x-api-key': env('NOWPAYMENTS_API_KEY'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const url = data.invoice_url
  if (!url) throw new Error('NOWPayments no devolvio la factura crypto.')
  return { nowInvoiceId: String(data.id), url }
}

async function createPayment({ method, userId, lang, product }) {
  const kind = product === 'custom' ? 'custom' : 'app'
  if (!METHODS[method]) throw new Error('Medio de pago desconocido.')
  if (!configured(kind)[method]) throw new Error('Ese medio de pago no esta configurado todavia.')
  const quote = money(method, kind)
  if (!quote.amount) throw new Error('Ese medio de pago no esta configurado todavia.')

  const order = {
    id: randomUUID(),
    method,
    product: kind,
    userId: String(userId),
    lang: lang || 'es',
    amount: quote.amount,
    currency: quote.currency,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS
  }

  let pay = {}
  if (method === 'br') pay = await createMercadoPagoPix({ orderId: order.id, userId, product: kind, amount: quote.amount })
  else if (method === 'ar') pay = await createMercadoPagoAr({ orderId: order.id, userId, product: kind, amount: quote.amount })
  else if (method === 'stripe') pay = await createStripe({ orderId: order.id, userId, product: kind, amount: quote.amount })
  else pay = await createCrypto({ orderId: order.id, userId, product: kind, amount: quote.amount })

  Object.assign(order, pay)
  order.quoteLabel = quote.label
  saveOrder(order)

  let qrBuffer = null
  if (pay.qrBase64) qrBuffer = Buffer.from(pay.qrBase64, 'base64')
  else if (pay.qrPayload || pay.copyPaste) qrBuffer = await qrPng(pay.qrPayload || pay.copyPaste)
  else if (pay.url) qrBuffer = await qrPng(pay.url)

  return { order, quote, qrBuffer }
}

function fulfill(order) {
  if (!order) return null
  if (order.status !== 'paid') {
    order.status = 'paid'
    order.paidAt = Date.now()
  }
  if (order.product !== 'custom' && !order.licenseKey) {
    order.licenseKey = generateLicenseKey()
  }
  saveOrder(order)
  return order
}

function expireIfNeeded(order) {
  if (order.status === 'pending' && Date.now() > order.expiresAt) {
    order.status = 'expired'
    saveOrder(order)
  }
  return order
}

async function mpPaymentApproved(paymentId, token) {
  if (!paymentId || !token) return false
  const data = await jsonFetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return data.status === 'approved'
}

async function mpOrderPaid(orderId, token) {
  if (!orderId || !token) return false
  const data = await jsonFetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const status = String(data.status || '').toLowerCase()
  if (['processed', 'paid', 'closed'].includes(status)) return true
  const payments = data.transactions?.payments || []
  return payments.some((p) => ['processed', 'approved', 'paid'].includes(String(p.status || '').toLowerCase()))
}

async function mpSearchApproved(externalId, token) {
  if (!externalId || !token) return false
  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalId)}&sort=date_created&criteria=desc`
  const data = await jsonFetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const results = data.results || []
  return results.some((p) => p.status === 'approved')
}

async function stripePaid(sessionId) {
  if (!sessionId) return false
  const data = await jsonFetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}` }
  })
  return data.payment_status === 'paid' || data.status === 'complete'
}

async function cryptoPaid(order) {
  const key = env('NOWPAYMENTS_API_KEY')
  if (!key) return false
  const headers = { 'x-api-key': key }
  if (order.nowInvoiceId) {
    try {
      const inv = await jsonFetch(`https://api.nowpayments.io/v1/invoice/${order.nowInvoiceId}`, { headers })
      const status = String(inv.payment_status || inv.invoice_status || '').toLowerCase()
      if (['finished', 'confirmed', 'paid', 'completed'].includes(status)) return true
    } catch {
      /* invoice endpoint varia segun plan; caemos al listado */
    }
  }
  try {
    const list = await jsonFetch(
      `https://api.nowpayments.io/v1/payment/?limit=20&order_id=${encodeURIComponent(order.id)}`,
      { headers }
    )
    const rows = list.data || list.payments || (Array.isArray(list) ? list : [])
    return rows.some((p) => ['finished', 'confirmed', 'sending'].includes(String(p.payment_status || '').toLowerCase()))
  } catch {
    return false
  }
}

async function checkOrder(order) {
  expireIfNeeded(order)
  if (order.status !== 'pending') return order
  let paid = false
  try {
    if (order.method === 'br') paid = await mpPaymentApproved(order.mpPaymentId, env('MP_BR_ACCESS_TOKEN'))
    else if (order.method === 'ar') {
      const token = env('MP_AR_ACCESS_TOKEN')
      paid =
        (order.mpOrderId ? await mpOrderPaid(order.mpOrderId, token) : false) ||
        (await mpSearchApproved(order.id, token)) ||
        (order.mpPaymentId ? await mpPaymentApproved(order.mpPaymentId, token) : false)
    } else if (order.method === 'stripe') paid = await stripePaid(order.stripeSessionId)
    else if (order.method === 'crypto') paid = await cryptoPaid(order)
  } catch (err) {
    console.error('Pago: no pude consultar', order.id, err.message || err)
    return order
  }
  if (paid) return fulfill(order)
  return order
}

async function collectPaid(onPaid) {
  for (const order of listPending()) {
    const next = await checkOrder(order)
    if (next.status === 'paid' && !next.delivered) {
      await onPaid(next)
    }
  }
}

function markDelivered(order, ok) {
  order.delivered = true
  order.dmOk = Boolean(ok)
  order.deliverAttemptAt = Date.now()
  saveOrder(order)
}

function findByExternal(ref) {
  if (!ref) return null
  const db = loadDb()
  if (db.orders[ref]) return db.orders[ref]
  return (
    Object.values(db.orders).find(
      (o) =>
        o.mpPaymentId === String(ref) ||
        o.mpOrderId === String(ref) ||
        o.mpPreferenceId === String(ref) ||
        o.stripeSessionId === String(ref) ||
        o.nowInvoiceId === String(ref)
    ) || null
  )
}

function startPoller(onPaid) {
  const ms = Math.max(8000, numEnv('PAYMENTS_POLL_MS') || 15000)
  const tick = () => collectPaid(onPaid).catch((err) => console.error('Pago poller:', err))
  tick()
  return setInterval(tick, ms)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function startWebhookServer(onPaid) {
  const port = Number(env('PAYMENTS_PORT') || env('PORT') || 0)
  if (!port) return null
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(404)
        res.end()
        return
      }
      const raw = await readBody(req)
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/webhooks/mercadopago') {
        let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id')
        let topic = url.searchParams.get('topic') || url.searchParams.get('type') || ''
        try {
          const json = JSON.parse(raw.toString('utf8') || '{}')
          paymentId = json.data?.id || json.id || paymentId
          topic = json.type || json.action || topic
        } catch {
          /* querystring IPN */
        }
        if (paymentId) {
          let order = findByExternal(String(paymentId))
          if (!order) {
            const tokens = [env('MP_AR_ACCESS_TOKEN'), env('MP_BR_ACCESS_TOKEN')].filter(Boolean)
            const looksLikeOrder = String(topic).toLowerCase().includes('order') || String(paymentId).startsWith('ORD')
            for (const token of tokens) {
              try {
                if (looksLikeOrder || token === env('MP_AR_ACCESS_TOKEN')) {
                  try {
                    const ord = await jsonFetch(`https://api.mercadopago.com/v1/orders/${paymentId}`, {
                      headers: { Authorization: `Bearer ${token}` }
                    })
                    order = findByExternal(ord.external_reference) || findByExternal(String(ord.id))
                    if (order) {
                      order.mpOrderId = String(ord.id)
                      const payId = ord.transactions?.payments?.[0]?.id
                      if (payId) order.mpPaymentId = String(payId)
                      const next = await checkOrder(order)
                      if (next.status === 'paid') await onPaid(next)
                      break
                    }
                  } catch {
                    /* no es order, probar payment */
                  }
                }
                const data = await jsonFetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                  headers: { Authorization: `Bearer ${token}` }
                })
                order = findByExternal(data.external_reference)
                if (order && data.status === 'approved') {
                  order.mpPaymentId = String(data.id)
                  await onPaid(fulfill(order))
                }
                break
              } catch {
                /* probar la otra cuenta */
              }
            }
          } else {
            const next = await checkOrder(order)
            if (next.status === 'paid') await onPaid(next)
          }
        }
      } else if (url.pathname === '/webhooks/stripe') {
        const json = JSON.parse(raw.toString('utf8') || '{}')
        const session = json.data?.object
        const ref = session?.client_reference_id || session?.metadata?.order_id || session?.id
        const order = findByExternal(ref)
        if (order) {
          const next = await checkOrder(order)
          if (next.status === 'paid') await onPaid(next)
        }
      } else if (url.pathname === '/webhooks/nowpayments') {
        const json = JSON.parse(raw.toString('utf8') || '{}')
        const order = findByExternal(json.order_id || json.invoice_id)
        if (order) {
          const next = await checkOrder(order)
          if (next.status === 'paid') await onPaid(next)
        }
      } else {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
    } catch (err) {
      console.error('Webhook de pago:', err)
      res.writeHead(500)
      res.end('error')
    }
  })
  server.listen(port, () => {
    console.log(`Webhooks de pago en puerto ${port}${publicUrl() ? ` · ${publicUrl()}` : ''}`)
  })
  return server
}

module.exports = {
  METHODS,
  configured,
  money,
  formatMoney,
  createPayment,
  getOrder,
  listPending,
  latestPendingForUser,
  hasPaidProduct,
  fulfill,
  checkOrder,
  collectPaid,
  markDelivered,
  startPoller,
  startWebhookServer,
  findByExternal
}
