/**
 * Smoke test: QR PNG generation + AR copy helpers (sin llamar a Mercado Pago).
 */
const assert = require('assert')
const QRCode = require('qrcode')
const { copyFor } = require('./lib/pay-copy.cjs')

async function main() {
  const payload =
    '00020101021226580014br.gov.bcb.qr01368ee55a9c-7db3-41e0-a8cd-fbff4d4765b5204000053039865802BR5925TEST'
  const buf = await QRCode.toBuffer(payload, {
    type: 'png',
    margin: 1,
    width: 420,
    errorCorrectionLevel: 'M'
  })
  assert.ok(Buffer.isBuffer(buf) && buf.length > 100, 'QR PNG vacio')
  assert.equal(buf[0], 0x89, 'no parece PNG')

  const es = copyFor('es')
  assert.match(es.ar.body, /Checkout Pro|QR/i)
  assert.match(es.br.body, /Pix/i)

  console.log('ok · qr png', buf.length, 'bytes · copy ar/br listos')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
