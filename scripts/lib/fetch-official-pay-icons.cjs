const { writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync } = require('fs')
const { join, extname } = require('path')
const { execFileSync } = require('child_process')

const DIR = join(__dirname, '..', 'assets', 'emojis')
const UA = 'TomzBoost/1.0 (license-bot assets; official brand logos for Discord payment buttons)'

const FILES = {
  'tomz_btc.png': {
    wiki: 'File:Bitcoin.svg',
    urls: ['https://upload.wikimedia.org/wikipedia/commons/5/50/Bitcoin.png']
  },
  'tomz_pix.png': {
    wiki: 'File:Logo - pix powered by Banco Central (Brazil, 2020).png',
    urls: [
      'https://upload.wikimedia.org/wikipedia/commons/d/de/Logo_-_pix_powered_by_Banco_Central_%28Brazil%2C_2020%29.png'
    ]
  },
  'tomz_stripe.png': {
    wiki: 'File:Stripe Logo, revised 2016.svg',
    urls: ['https://upload.wikimedia.org/wikipedia/commons/2/2a/Stripe_logo%2C_revised_2014.png']
  },
  'tomz_usdt.png': {
    wiki: 'File:Tether USDT.png',
    urls: [
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/USDT_Logo.png/256px-USDT_Logo.png',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Tether_USDT.png'
    ]
  }
}

const MP_ZIP =
  'https://http2.mlstatic.com/storage/pog-cm-admin/calm-assets/Logos%20Mercado%20Pago%202025--fb6f16c9.zip'

async function fetchBuf(url, expectPng) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: expectPng ? 'image/png,image/*;q=0.8,*/*;q=0.1' : '*/*' },
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (expectPng && (buf[0] !== 0x89 || buf[1] !== 0x50)) {
    throw new Error(`No es PNG ${url}`)
  }
  return buf
}

async function download(url) {
  return fetchBuf(url, true)
}

async function wikiThumb(title) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=256&format=json`
  const res = await fetch(api, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} wiki api ${title}`)
  const data = await res.json()
  const page = Object.values(data.query?.pages || {})[0]
  const info = page?.imageinfo?.[0]
  const url = info?.thumburl || info?.url
  if (!url) throw new Error(`Sin URL para ${title}`)
  return url.split('?')[0]
}

async function downloadFirst(spec) {
  const urls = []
  if (spec.wiki) {
    try {
      urls.push(await wikiThumb(spec.wiki))
    } catch (err) {
      console.warn(String(err.message || err))
    }
  }
  urls.push(...(spec.urls || []))
  let last = null
  for (const url of urls) {
    try {
      return await download(url)
    } catch (err) {
      last = err
      console.warn(String(err.message || err))
    }
  }
  throw last
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function pickMpPng(files) {
  const pngs = files.filter((f) => {
    const name = f.replace(/\\/g, '/').toLowerCase()
    if (extname(f).toLowerCase() !== '.png') return false
    if (name.includes('__macosx') || name.includes('/._')) return false
    if (statSync(f).size < 2000) return false
    return true
  })
  const scored = pngs.map((f) => {
    const name = f.replace(/\\/g, '/').toLowerCase()
    let score = 0
    if (name.includes('rgb') || name.includes('digital')) score += 40
    if (name.includes('color_vertical')) score += 30
    if (name.includes('color_horizontal')) score += 12
    if (name.includes('pluma')) score -= 15
    if (name.includes('cmyk') || name.includes('impreso')) score -= 25
    const size = statSync(f).size
    if (size > 256 * 1024) score -= 80
    return { f, score, size }
  })
  scored.sort((a, b) => b.score - a.score || a.size - b.size)
  return scored[0]?.f || pngs[0]
}

async function extractOfficialMp() {
  const zipPath = join(DIR, '_mp_official.zip')
  const dest = join(DIR, '_mp_official')
  const buf = await fetchBuf(MP_ZIP, false)
  writeFileSync(zipPath, buf)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${dest}'`])
  const files = walk(dest)
  files.forEach((f) => console.log('MP pack', f, statSync(f).size))
  const chosen = pickMpPng(files)
  if (!chosen) throw new Error('El zip oficial de Mercado Pago no trajo PNG.')
  copyFileSync(chosen, join(DIR, 'tomz_mp.png'))
  console.log(`OK tomz_mp.png from ${chosen} ${statSync(chosen).size} bytes`)
  rmSync(zipPath, { force: true })
  rmSync(dest, { recursive: true, force: true })
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  for (const [name, spec] of Object.entries(FILES)) {
    const buf = await downloadFirst(spec)
    writeFileSync(join(DIR, name), buf)
    console.log(`OK ${name} ${buf.length} bytes`)
  }
  if (!existsSync(join(DIR, 'tomz_mp.png'))) await extractOfficialMp()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
