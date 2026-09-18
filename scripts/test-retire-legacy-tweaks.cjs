'use strict'

/**
 * Test manual (sin framework) del retiro Fase 7 de las 6 claves legacy.
 * Registro FALSO en memoria: no toca HKLM real.
 *
 * Uso: node scripts/test-retire-legacy-tweaks.cjs
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const esbuild = require('esbuild')

const projectRoot = path.join(__dirname, '..')
const NV_ADAPTER = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000'
const AMD_ADAPTER = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0001'
const DPC_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel'
const DPC_VALUE = 'DistributeTimers'
const DPC_BACKUP_ID = `reg-original:${DPC_KEY}\\${DPC_VALUE}`

function makeFakeRegistry() {
  const store = new Map()
  const id = (keyPath, valueName) => `${keyPath}|${valueName}`
  let deletes = 0
  let sets = 0
  return {
    store,
    counts: () => ({ deletes, sets }),
    mock: {
      regQuery: async (keyPath, valueName) => {
        const e = store.get(id(keyPath, valueName))
        return e === undefined ? null : String(e)
      },
      regQueryDword: async (keyPath, valueName) => {
        const e = store.get(id(keyPath, valueName))
        return e === undefined ? null : Number(e)
      },
      regSetVerbose: async (keyPath, valueName, _type, data) => {
        sets++
        store.set(id(keyPath, valueName), Number(data))
        return { ok: true }
      },
      regDeleteVerbose: async (keyPath, valueName) => {
        deletes++
        store.delete(id(keyPath, valueName))
        return { ok: true }
      }
    }
  }
}

function loadRetireModule({ tmpDir, registry, adapters, elevated }) {
  const electronMock = { app: { getPath: () => tmpDir } }
  const elevationMock = { isElevated: async () => elevated }
  const gpuMock = {
    findGpuAdapterKeys: async (vendor) => adapters[vendor] ?? []
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock
    if (request === '../utils/registry') return registry
    if (request === '../utils/elevation') return elevationMock
    if (request === './gpuRegistry') return gpuMock
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const bundle = esbuild.buildSync({
      entryPoints: [path.join(projectRoot, 'src', 'main', 'tweaks', 'retireLegacyTweaks.ts')],
      absWorkingDir: projectRoot,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
      external: ['electron', '../utils/registry', '../utils/elevation', './gpuRegistry']
    })
    const entry = path.join(projectRoot, 'src', 'main', 'tweaks', 'retireLegacyTweaks.ts')
    const mod = new Module(entry, null)
    mod.filename = entry
    mod.paths = Module._nodeModulePaths(path.dirname(entry))
    mod._compile(bundle.outputFiles[0].text, entry)
    return mod.exports
  } finally {
    Module._load = originalLoad
  }
}

let passed = 0
let failed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(72)} got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) passed++
  else failed++
}

function seedOurs(store) {
  store.set(`${NV_ADAPTER}|PowerMizerEnable`, 0)
  store.set(`${NV_ADAPTER}|PowerMizerLevel`, 1)
  store.set(`${NV_ADAPTER}|PerfLevelSrc`, 0x2222)
  store.set(`${AMD_ADAPTER}|PP_ThermalAutoThrottlingEnable`, 0)
  store.set(`${AMD_ADAPTER}|DisableSAMUPowerGating`, 1)
  store.set(`${DPC_KEY}|${DPC_VALUE}`, 1)
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tomzboost-retire-legacy-'))
  console.log(`Carpeta temporal de backups (no toca datos reales): ${tmpRoot}\n`)

  try {
    const adapters = { NVIDIA: [NV_ADAPTER], AMD: [AMD_ADAPTER] }

    console.log('--- sin admin: no toca registro ni marca ---')
    {
      const tmpDir = path.join(tmpRoot, 'noadmin')
      const { mock, store } = makeFakeRegistry()
      seedOurs(store)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: false })
      const first = await retireLegacyTweaks()
      check('sin admin: skipped', first.skipped, 'not-elevated')
      check('sin admin: ok=false (reintentar)', first.ok, false)
      check('sin admin: no borra PowerMizerEnable', store.has(`${NV_ADAPTER}|PowerMizerEnable`), true)
      check('sin admin: no borra DistributeTimers', store.get(`${DPC_KEY}|${DPC_VALUE}`), 1)
      const second = await retireLegacyTweaks()
      check('sin admin 2da vez: sigue skipped (idempotente, sin marker)', second.skipped, 'not-elevated')
    }

    console.log('\n--- GPU: borra solo nuestros valores; deja los ajenos ---')
    {
      const tmpDir = path.join(tmpRoot, 'gpu')
      const { mock, store, counts } = makeFakeRegistry()
      seedOurs(store)
      store.set(`${NV_ADAPTER}|UnrelatedCustom`, 99)
      store.set(`${AMD_ADAPTER}|PP_ThermalAutoThrottlingEnable`, 2)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('gpu: primer arranque ok', first.ok, true)
      check('gpu: no era alreadyDone', first.alreadyDone, false)
      check('gpu: PowerMizerEnable borrado', store.has(`${NV_ADAPTER}|PowerMizerEnable`), false)
      check('gpu: PowerMizerLevel borrado', store.has(`${NV_ADAPTER}|PowerMizerLevel`), false)
      check('gpu: PerfLevelSrc borrado', store.has(`${NV_ADAPTER}|PerfLevelSrc`), false)
      check('gpu: DisableSAMUPowerGating borrado', store.has(`${AMD_ADAPTER}|DisableSAMUPowerGating`), false)
      check('gpu: PP_Thermal ajeno (2) NO se toca', store.get(`${AMD_ADAPTER}|PP_ThermalAutoThrottlingEnable`), 2)
      check('gpu: UnrelatedCustom NO se toca', store.get(`${NV_ADAPTER}|UnrelatedCustom`), 99)
      const afterFirst = counts()
      const second = await retireLegacyTweaks()
      check('gpu: segundo arranque ok', second.ok, true)
      check('gpu: segundo arranque alreadyDone (marker)', second.alreadyDone, true)
      check('gpu: segundo arranque no vuelve a escribir/borrar', counts(), afterFirst)
    }

    console.log('\n--- DPC: backup original=null -> borra; original=5 -> restaura 5; sin backup y =1 -> borra; otro valor no se toca ---')
    // Sembrar backup en disco ANTES de instanciar JsonStore.
    {
      const tmpDir = path.join(tmpRoot, 'dpc-backup-null')
      const dataDir = path.join(tmpDir, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(
        path.join(dataDir, 'tweak-backups.json'),
        JSON.stringify({ [DPC_BACKUP_ID]: null }, null, 2)
      )
      const { mock, store } = makeFakeRegistry()
      seedOurs(store)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('dpc backup null: ok', first.ok, true)
      check('dpc backup null: DistributeTimers borrado', store.has(`${DPC_KEY}|${DPC_VALUE}`), false)
      const second = await retireLegacyTweaks()
      check('dpc backup null: 2do arranque alreadyDone', second.alreadyDone, true)
      check('dpc backup null: 2do arranque sigue ausente', store.has(`${DPC_KEY}|${DPC_VALUE}`), false)
    }

    {
      const tmpDir = path.join(tmpRoot, 'dpc-backup-5')
      const dataDir = path.join(tmpDir, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(
        path.join(dataDir, 'tweak-backups.json'),
        JSON.stringify({ [DPC_BACKUP_ID]: 5 }, null, 2)
      )
      const { mock, store } = makeFakeRegistry()
      seedOurs(store)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('dpc backup 5: ok', first.ok, true)
      check('dpc backup 5: restaura 5, no borra ni escribe 0', store.get(`${DPC_KEY}|${DPC_VALUE}`), 5)
      const second = await retireLegacyTweaks()
      check('dpc backup 5: 2do arranque alreadyDone', second.alreadyDone, true)
      check('dpc backup 5: 2do arranque sigue en 5', store.get(`${DPC_KEY}|${DPC_VALUE}`), 5)
    }

    {
      const tmpDir = path.join(tmpRoot, 'dpc-orphan-1')
      const { mock, store } = makeFakeRegistry()
      seedOurs(store)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('dpc sin backup valor=1: ok', first.ok, true)
      check('dpc sin backup valor=1: borra (huerfano nuestro)', store.has(`${DPC_KEY}|${DPC_VALUE}`), false)
      const second = await retireLegacyTweaks()
      check('dpc sin backup: 2do arranque alreadyDone', second.alreadyDone, true)
    }

    {
      const tmpDir = path.join(tmpRoot, 'dpc-foreign-7')
      const { mock, store } = makeFakeRegistry()
      seedOurs(store)
      store.set(`${DPC_KEY}|${DPC_VALUE}`, 7)
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('dpc valor ajeno 7: ok', first.ok, true)
      check('dpc valor ajeno 7: NO se toca', store.get(`${DPC_KEY}|${DPC_VALUE}`), 7)
    }

    console.log('\n--- ya limpio (nada nuestro) sigue siendo ok e idempotente ---')
    {
      const tmpDir = path.join(tmpRoot, 'clean')
      const { mock, store, counts } = makeFakeRegistry()
      const { retireLegacyTweaks } = loadRetireModule({ tmpDir, registry: mock, adapters, elevated: true })
      const first = await retireLegacyTweaks()
      check('limpio: primer arranque ok', first.ok, true)
      check('limpio: no escribio ni borro', counts(), { deletes: 0, sets: 0 })
      check('limpio: registro vacio', store.size, 0)
      const second = await retireLegacyTweaks()
      check('limpio: 2do alreadyDone', second.alreadyDone, true)
      check('limpio: 2do sigue sin writes', counts(), { deletes: 0, sets: 0 })
    }

    console.log('\n--- sin GPU NVIDIA/AMD: no falla ---')
    {
      const tmpDir = path.join(tmpRoot, 'nogpu')
      const { mock, store } = makeFakeRegistry()
      store.set(`${DPC_KEY}|${DPC_VALUE}`, 1)
      const { retireLegacyTweaks } = loadRetireModule({
        tmpDir,
        registry: mock,
        adapters: { NVIDIA: [], AMD: [] },
        elevated: true
      })
      const first = await retireLegacyTweaks()
      check('sin GPU: ok', first.ok, true)
      check('sin GPU: igual retira DPC huerfano', store.has(`${DPC_KEY}|${DPC_VALUE}`), false)
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }

  console.log(`\n${passed} OK, ${failed} FAIL de ${passed + failed} casos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
