const { readFileSync, existsSync } = require('fs')
const { join } = require('path')

const DIR = join(__dirname, '..', 'assets', 'emojis')

const EMOJIS = {
  es: { name: 'tomz_es', file: 'tomz_es.png', fallback: '🇪🇸' },
  en: { name: 'tomz_en', file: 'tomz_en.png', fallback: '🇺🇸' },
  pt: { name: 'tomz_pt', file: 'tomz_pt.png', fallback: '🇧🇷' },
  ar: { name: 'tomz_mp', file: 'tomz_mp.png', fallback: '💳' },
  br: { name: 'tomz_pix', file: 'tomz_pix.png', fallback: '💠' },
  stripe: { name: 'tomz_stripe', file: 'tomz_stripe.png', fallback: '🌍' },
  crypto: { name: 'tomz_btc', file: 'tomz_btc.png', fallback: '🪙' },
  usdt: { name: 'tomz_usdt', file: 'tomz_usdt.png', fallback: '🟢' }
}

const cache = {}

function specByName(name) {
  return Object.entries(EMOJIS).find(([, spec]) => spec.name === name)
}

function dataUri(file) {
  const buf = readFileSync(file)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function remember(name, emoji) {
  const found = specByName(name)
  if (!found || !emoji?.id) return
  cache[found[0]] = { id: emoji.id, name: emoji.name || name }
}

function emojiFor(key) {
  return cache[key] || EMOJIS[key]?.fallback || undefined
}

function emojiMention(key) {
  const custom = cache[key]
  if (custom) return `<:${custom.name}:${custom.id}>`
  return EMOJIS[key]?.fallback || ''
}

async function listAppEmojis(rest, clientId) {
  const data = await rest.get(`/applications/${clientId}/emojis`)
  return data.items || data || []
}

async function createAppEmoji(rest, clientId, name, image) {
  return rest.post(`/applications/${clientId}/emojis`, { body: { name, image } })
}

async function deleteAppEmoji(rest, clientId, id) {
  await rest.delete(`/applications/${clientId}/emojis/${id}`)
}

async function ensureFromApp(rest, clientId) {
  const existing = await listAppEmojis(rest, clientId)
  const byName = new Map(existing.map((e) => [e.name, e]))

  const replace = new Set(['tomz_stripe', 'tomz_mp', 'tomz_pix', 'tomz_btc', 'tomz_usdt', 'tomz_ar', 'tomz_br', 'tomz_crypto'])
  for (const [name, emoji] of byName) {
    if (!replace.has(name)) remember(name, emoji)
  }

  for (const [key, spec] of Object.entries(EMOJIS)) {
    if (cache[key]) continue
    const path = join(DIR, spec.file)
    if (!existsSync(path)) continue
    const old = byName.get(spec.name)
    if (old && replace.has(spec.name)) {
      try {
        await deleteAppEmoji(rest, clientId, old.id)
      } catch {
        /* si no se puede borrar, creo otro nombre abajo */
      }
    } else if (old && !replace.has(spec.name)) {
      remember(spec.name, old)
      continue
    }
    try {
      const created = await createAppEmoji(rest, clientId, spec.name, dataUri(path))
      remember(created.name, created)
      console.log(`Emoji de app listo: ${spec.name}`)
    } catch (err) {
      const alt = `${spec.name}2`
      try {
        const created = await createAppEmoji(rest, clientId, alt, dataUri(path))
        cache[key] = { id: created.id, name: created.name || alt }
        console.log(`Emoji de app listo: ${alt}`)
      } catch (err2) {
        console.warn(`No pude crear ${spec.name}:`, err2.message || err.message || err2)
      }
    }
  }
}

async function ensureFromGuild(guild) {
  await guild.emojis.fetch()
  for (const [key, spec] of Object.entries(EMOJIS)) {
    if (cache[key]) continue
    let emoji = guild.emojis.cache.find((e) => e.name === spec.name)
    if (!emoji) {
      const path = join(DIR, spec.file)
      if (!existsSync(path)) continue
      emoji = await guild.emojis.create({ name: spec.name, attachment: path, reason: 'Tomz Boost' })
      console.log(`Emoji del server listo: ${spec.name}`)
    }
    remember(spec.name, emoji)
  }
}

async function ensureEmojis({ rest, clientId, guild }) {
  try {
    await ensureFromApp(rest, clientId)
    if (Object.keys(cache).length >= Object.keys(EMOJIS).length) return cache
  } catch (err) {
    console.warn('No pude subir emojis de la app, pruebo en el server:', err.message || err)
  }
  if (guild) {
    try {
      await ensureFromGuild(guild)
    } catch (err) {
      console.warn('No pude subir emojis al server. Uso unicode:', err.message || err)
    }
  }
  return cache
}

module.exports = { ensureEmojis, emojiFor, emojiMention }
