// Regenera build/icon.ico a partir de build/icon.png
// Uso: node scripts/generate-icon.cjs
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'build', 'icon.png')
const dest = path.join(__dirname, '..', 'build', 'icon.ico')

async function main() {
  const { default: pngToIco } = await import('png-to-ico')
  const buf = await pngToIco(src)
  fs.writeFileSync(dest, buf)
  console.log('Generado', dest)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
