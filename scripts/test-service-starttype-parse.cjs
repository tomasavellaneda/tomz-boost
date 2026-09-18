'use strict'

/**
 * Parser de StartType (catalog.ts parseServiceStartType): ConvertTo-Json de
 * PS 5.1 emite 2/3/4, no "Automatic"/"Manual"/"Disabled". location/services/
 * memoria deben mapear ambos y no tratar null como satisfecho.
 *
 * Uso: node scripts/test-service-starttype-parse.cjs
 */

const { spawnSync } = require('child_process')

const START_TYPE_MAP = { Automatic: 2, Manual: 3, Disabled: 4 }

function parseServiceStartType(raw) {
  if (typeof raw === 'number') {
    return raw === 2 || raw === 3 || raw === 4 ? raw : null
  }
  if (typeof raw === 'string') {
    const mapped = START_TYPE_MAP[raw]
    if (mapped !== undefined) return mapped
    const asNum = Number(raw)
    if (asNum === 2 || asNum === 3 || asNum === 4) return asNum
  }
  return null
}

function serviceStartTypeMatches(actual, expected) {
  return actual === expected
}

function oldBrokenMap(raw) {
  return START_TYPE_MAP[raw] ?? null
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error(`FAIL: ${msg}`)
  } else {
    console.log(`ok: ${msg}`)
  }
}

assert(parseServiceStartType(2) === 2, 'numero 2 -> Automatic')
assert(parseServiceStartType(3) === 3, 'numero 3 -> Manual')
assert(parseServiceStartType(4) === 4, 'numero 4 -> Disabled')
assert(parseServiceStartType('Automatic') === 2, 'string Automatic')
assert(parseServiceStartType('Manual') === 3, 'string Manual')
assert(parseServiceStartType('Disabled') === 4, 'string Disabled')
assert(parseServiceStartType('2') === 2, 'string "2"')
assert(parseServiceStartType(0) === null, 'numero 0 (Boot) no es valido')
assert(parseServiceStartType('Auto') === null, 'CIM Auto no se inventa')
assert(parseServiceStartType(null) === null, 'null sigue siendo null')

assert(oldBrokenMap(2) === null, 'el mapa viejo rompe el entero 2')
assert(parseServiceStartType(2) === 2, 'el mapa nuevo lee el entero 2')

assert(serviceStartTypeMatches(2, 2) === true, 'verificacion: 2 === 2')
assert(serviceStartTypeMatches(null, 2) === false, 'verificacion: null NO satisface Automatic')
assert(serviceStartTypeMatches(null, 4) === false, 'verificacion: null NO satisface Disabled (services/memoria)')
assert(serviceStartTypeMatches(3, 4) === false, 'verificacion: Manual no es Disabled')

const names = ['lfsvc', 'SysMain', 'DiagTrack', 'dmwappushservice', 'MapsBroker', 'RetailDemo', 'WalletService']
const list = names.map((n) => `'${n}'`).join(',')
const ps = `$ErrorActionPreference='SilentlyContinue'; Get-Service -Name ${list} -ErrorAction SilentlyContinue | Select-Object Name, StartType | ConvertTo-Json -Depth 6 -Compress`
const res = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
  { encoding: 'utf8', windowsHide: true }
)

assert(res.status === 0, `Get-Service exit 0 (code=${res.status})`)
assert(Boolean(res.stdout && res.stdout.trim()), 'Get-Service devolvio JSON')

let rows
try {
  rows = JSON.parse(res.stdout.trim())
} catch (err) {
  assert(false, `JSON.parse: ${err}`)
  rows = []
}
const arr = Array.isArray(rows) ? rows : rows ? [rows] : []
const out = {}
for (const n of names) out[n] = null
for (const row of arr) {
  if (!row?.Name) continue
  out[row.Name] = parseServiceStartType(row.StartType)
}

console.log('live JSON:', JSON.stringify(rows))
console.log('parsed:', JSON.stringify(out))

const lfsvcRow = arr.find((r) => r.Name === 'lfsvc')
if (lfsvcRow) {
  assert(out.lfsvc === 2 || out.lfsvc === 3 || out.lfsvc === 4, `lfsvc parseado a 2/3/4 (got ${out.lfsvc})`)
  if (typeof lfsvcRow.StartType === 'number') {
    assert(oldBrokenMap(lfsvcRow.StartType) === null, 'regresion: mapa viejo deja el entero en null')
  }
  assert(serviceStartTypeMatches(out.lfsvc, START_TYPE_MAP.Automatic) === (out.lfsvc === 2), 'location: Automatic solo si el parse es 2')
  assert(serviceStartTypeMatches(null, 2) === false, 'location: null no pasa como Automatic')
} else {
  assert(false, 'lfsvc no aparecio en Get-Service')
}

for (const n of ['SysMain', 'DiagTrack']) {
  if (out[n] === null) {
    console.log(`skip: ${n} ausente en esta instalacion`)
    continue
  }
  assert(out[n] === 2 || out[n] === 3 || out[n] === 4, `${n} parseado a 2/3/4 (got ${out[n]})`)
}

const servicesExpected = 4
const servicesWouldPassWithNullBypass = names
  .filter((n) => n !== 'lfsvc' && n !== 'SysMain')
  .every((s) => out[s] === servicesExpected || out[s] === null)
const servicesStrict = names
  .filter((n) => n !== 'lfsvc' && n !== 'SysMain')
  .every((s) => serviceStartTypeMatches(out[s], servicesExpected))
console.log(`services strict Disabled match=${servicesStrict} (null-bypass would be ${servicesWouldPassWithNullBypass})`)

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nall assertions passed')
