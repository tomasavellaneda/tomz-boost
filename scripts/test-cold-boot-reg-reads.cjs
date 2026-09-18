'use strict'

/**
 * Arranque en frio simulado: el lote de PowerShell (el viejo prime) hace
 * timeout, y getState igual tiene que leer el registro real via reg.exe
 * en paralelo. Si catalog.ts volviera a importar primeRegQueries, este
 * test falla.
 *
 * Uso: node scripts/test-cold-boot-reg-reads.cjs
 */

const fs = require('fs')
const path = require('path')
const Module = require('module')
const esbuild = require('esbuild')

const projectRoot = path.join(__dirname, '..')

let passed = 0
let failed = 0
function check(label, actual, expected) {
  const ok = actual === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) passed++
  else failed++
}

function buildEntry(entry) {
  const bundle = esbuild.buildSync({
    entryPoints: [entry],
    absWorkingDir: projectRoot,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    write: false,
    external: ['electron']
  })
  const mod = new Module(entry, null)
  mod.filename = entry
  mod.paths = Module._nodeModulePaths(path.dirname(entry))
  mod._compile(bundle.outputFiles[0].text, entry)
  return mod.exports
}

const KEYS = [
  {
    keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
    valueName: 'VisualFXSetting',
    kind: 'dword'
  },
  {
    keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
    valueName: 'HwSchMode',
    kind: 'dword'
  },
  {
    keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    valueName: 'NtfsDisableLastAccessUpdate',
    kind: 'dword'
  },
  { keyPath: 'HKCU\\Control Panel\\Mouse', valueName: 'MouseSpeed', kind: 'sz' },
  {
    keyPath: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
    valueName: 'NetworkThrottlingIndex',
    kind: 'dword'
  }
]

async function main() {
  const catalogSrc = fs.readFileSync(path.join(projectRoot, 'src/main/tweaks/catalog.ts'), 'utf8')
  const registrySrc = fs.readFileSync(path.join(projectRoot, 'src/main/utils/registry.ts'), 'utf8')
  check('catalog.ts no importa/llama primeRegQueries', catalogSrc.includes('primeRegQueries'), false)
  check('catalog.ts no arma STATIC_REG_QUERIES del lote', catalogSrc.includes('STATIC_REG_QUERIES'), false)
  check('registry.ts ya no exporta primeRegQueries', registrySrc.includes('export async function primeRegQueries'), false)
  check('registry.ts ya no cachea primedValues', registrySrc.includes('primedValues'), false)

  const { runPowerShellJson } = buildEntry(path.join(projectRoot, 'src/main/utils/shell.ts'))
  const { regQuery, regQueryDword } = buildEntry(path.join(projectRoot, 'src/main/utils/registry.ts'))

  console.log('\n--- timeout forzado del lote PowerShell (1ms, como arranque en frio) ---')
  const t0 = Date.now()
  const batch = await runPowerShellJson('Start-Sleep -Milliseconds 400; 1', 1)
  const elapsed = Date.now() - t0
  check('el lote con timeout 1ms no devuelve datos', batch === null, true)
  check('el timeout corto no se cuelga varios segundos', elapsed < 3000, true)
  console.log(`  lote timeout en ${elapsed}ms`)

  console.log('\n--- lecturas getState: Promise.all de reg.exe (fuente de verdad) ---')
  const t1 = Date.now()
  const values = await Promise.all(
    KEYS.map((k) => (k.kind === 'dword' ? regQueryDword(k.keyPath, k.valueName) : regQuery(k.keyPath, k.valueName)))
  )
  const readMs = Date.now() - t1
  console.log(`  ${KEYS.length} lecturas en paralelo: ${readMs}ms`)
  values.forEach((v, i) => {
    console.log(`  ${KEYS[i].valueName}=${JSON.stringify(v)}`)
  })
  const hits = values.filter((v) => v !== null).length
  check('reg.exe paralelo leyo al menos 3 claves reales (no todo-null)', hits >= 3, true)
  check(
    'HwSchMode se leyo como numero (no como null de prime fallido)',
    typeof values[1] === 'number',
    true
  )

  console.log(`\n${passed} OK, ${failed} FAIL de ${passed + failed} casos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
