const { generateLicenseKey, normalizeHwid } = require('./lib/license-key.cjs')

const args = process.argv.slice(2)
let hwid = ''
let count = 1
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hwid') {
    hwid = args[++i] ?? ''
    continue
  }
  if (/^\d+$/.test(args[i])) count = Math.max(1, Number(args[i]))
}

if (hwid && !normalizeHwid(hwid)) {
  console.error('HWID invalido. Podes omitirlo: npm run key:new')
  process.exit(1)
}

for (let i = 0; i < count; i++) console.log(generateLicenseKey(hwid))
