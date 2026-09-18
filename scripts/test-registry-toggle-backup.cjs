'use strict'

/**
 * Test manual (sin framework) para el backup real de valor original agregado
 * en registryDwordToggle.ts y registryValueToggle.ts (Fase 4).
 *
 * Que hace:
 *  - Compila cada modulo a un bundle CJS con esbuild, dejando 'electron' y
 *    '../utils/registry' como external.
 *  - Mockea 'electron' (app.getPath) igual que el test de perfiles NVIDIA,
 *    para que backup.ts (via JsonStore) escriba en una carpeta temporal.
 *  - Mockea '../utils/registry' con un registro FALSO en memoria (nunca se
 *    llama a reg.exe ni se toca el registro real de Windows).
 *  - Ejercita applyRegistryDwordToggle/applyRegistryValueToggle contra ese
 *    registro falso para confirmar:
 *      1. Al activar por primera vez, se guarda el valor ORIGINAL real
 *         (incluso si la clave no existia -> se guarda null).
 *      2. Al desactivar, se restaura ESE valor original (no el
 *         disabledValue fijo del spec) -- y si el original era "ausente", se
 *         borra la clave en vez de escribir un 0/1 inventado.
 *      3. Activar una segunda vez NO pisa el backup ya guardado (si lo
 *         pisara, el valor original real se perderia para siempre).
 *      4. Sin backup previo (fallback), desactivar usa el disabledValue fijo
 *         del spec, tal como se comportaba antes de este fix.
 *
 * Uso: node scripts/test-registry-toggle-backup.cjs
 *   (o "npm run test:registry-toggle-backup")
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const esbuild = require('esbuild')

const projectRoot = path.join(__dirname, '..')

function buildModule(entry, extraExternal) {
  const bundle = esbuild.buildSync({
    entryPoints: [entry],
    absWorkingDir: projectRoot,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    write: false,
    external: ['electron', '../utils/registry', ...extraExternal]
  })
  const code = bundle.outputFiles[0].text
  const mod = new Module(entry, null)
  mod.filename = entry
  mod.paths = Module._nodeModulePaths(path.dirname(entry))
  mod._compile(code, entry)
  return mod.exports
}

function makeFakeRegistry() {
  const store = new Map()
  const id = (keyPath, valueName) => `${keyPath}|${valueName}`
  return {
    store,
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
        store.set(id(keyPath, valueName), data)
        return { ok: true }
      },
      regDeleteVerbose: async (keyPath, valueName) => {
        store.delete(id(keyPath, valueName))
        return { ok: true }
      }
    }
  }
}

let passed = 0
let failed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(60)} got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  if (ok) passed++
  else failed++
}

async function testDwordToggle(tmpDir) {
  const entry = path.join(projectRoot, 'src', 'main', 'tweaks', 'registryDwordToggle.ts')
  const { mock, store } = makeFakeRegistry()

  const electronMock = { app: { getPath: () => tmpDir } }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock
    if (request === '../utils/registry') return mock
    return originalLoad.call(this, request, parent, isMain)
  }

  let mod
  try {
    mod = buildModule(entry, [])
  } finally {
    Module._load = originalLoad
  }
  const { applyRegistryDwordToggle, getRegistryDwordToggleState, ntfsLastAccessUpdatesReduced } = mod

  console.log('\n--- registryDwordToggle.ts ---')

  // Caso 1: la clave ya tenia un valor "custom" del usuario (5) antes de que
  // la app la tocara. enabledValue=1 / disabledValue=0 (los fijos del spec).
  const specCustom = {
    targets: [{ keyPath: 'HKCU\\Test', valueName: 'CustomDword' }],
    enabledValue: 1,
    disabledValue: 0,
    enabledMessage: 'on',
    disabledMessage: 'off',
    restoreOriginal: true
  }
  store.set('HKCU\\Test|CustomDword', 5)

  let res = await applyRegistryDwordToggle(specCustom, true)
  check('caso1: activar -> ok', res.ok, true)
  check('caso1: activar -> valor quedo en enabledValue (1)', store.get('HKCU\\Test|CustomDword'), '1')

  res = await applyRegistryDwordToggle(specCustom, false)
  check('caso1: desactivar -> ok', res.ok, true)
  check('caso1: desactivar -> restaura el ORIGINAL real (5), no el disabledValue fijo (0)', store.get('HKCU\\Test|CustomDword'), '5')

  // Reactivar y volver a desactivar: el backup no debe haberse pisado con "1".
  await applyRegistryDwordToggle(specCustom, true)
  await applyRegistryDwordToggle(specCustom, false)
  check('caso1: segundo ciclo activar/desactivar sigue restaurando 5 (backup no se piso)', store.get('HKCU\\Test|CustomDword'), '5')

  // Caso 2: la clave NO existia antes de la primera activacion.
  const specAbsent = {
    targets: [{ keyPath: 'HKLM\\Test2', valueName: 'AbsentDword' }],
    enabledValue: 1,
    disabledValue: 0,
    enabledMessage: 'on',
    disabledMessage: 'off',
    restoreOriginal: true
  }
  res = await applyRegistryDwordToggle(specAbsent, true)
  check('caso2: activar -> ok', res.ok, true)
  check('caso2: activar -> valor quedo en enabledValue (1)', store.get('HKLM\\Test2|AbsentDword'), '1')

  res = await applyRegistryDwordToggle(specAbsent, false)
  check('caso2: desactivar -> ok', res.ok, true)
  check('caso2: desactivar -> BORRA la clave (originalmente no existia), no escribe 0', store.has('HKLM\\Test2|AbsentDword'), false)

  // Caso 3: fallback sin backup previo (desactivar algo que nunca se activo
  // por esta app) -> debe usar el disabledValue fijo del spec, como antes.
  const specFallback = {
    targets: [{ keyPath: 'HKCU\\Test3', valueName: 'NeverEnabled' }],
    enabledValue: 1,
    disabledValue: 7,
    enabledMessage: 'on',
    disabledMessage: 'off',
    restoreOriginal: true
  }
  res = await applyRegistryDwordToggle(specFallback, false)
  check('caso3: desactivar sin backup previo -> ok', res.ok, true)
  check('caso3: desactivar sin backup previo -> usa disabledValue fijo (7) como fallback', store.get('HKCU\\Test3|NeverEnabled'), '7')

  console.log('\n--- NtfsDisableLastAccessUpdate equivalentes ---')
  check('ntfs: 1 (disabled) cuenta', ntfsLastAccessUpdatesReduced(1), true)
  check('ntfs: 2 (system managed) cuenta', ntfsLastAccessUpdatesReduced(2), true)
  check('ntfs: 0x80000001 (user+disabled) cuenta', ntfsLastAccessUpdatesReduced(0x80000001), true)
  check('ntfs: 0x80000002 (user+system managed, rewrite de boot) cuenta', ntfsLastAccessUpdatesReduced(0x80000002), true)
  check('ntfs: 0 (last access on) NO cuenta', ntfsLastAccessUpdatesReduced(0), false)
  check('ntfs: null NO cuenta', ntfsLastAccessUpdatesReduced(null), false)

  store.set('HKLM\\FS|NtfsDisableLastAccessUpdate', 0x80000002)
  const ntfsOn = await getRegistryDwordToggleState({
    targets: [{ keyPath: 'HKLM\\FS', valueName: 'NtfsDisableLastAccessUpdate' }],
    enabledValue: 1,
    isEnabledValue: ntfsLastAccessUpdatesReduced
  })
  check('ntfs getState: 0x80000002 se lee como aplicado (no exige === 1)', ntfsOn, true)
  store.set('HKLM\\FS|NtfsDisableLastAccessUpdate', 0)
  const ntfsOff = await getRegistryDwordToggleState({
    targets: [{ keyPath: 'HKLM\\FS', valueName: 'NtfsDisableLastAccessUpdate' }],
    enabledValue: 1,
    isEnabledValue: ntfsLastAccessUpdatesReduced
  })
  check('ntfs getState: 0 se lee como apagado', ntfsOff, false)
}

async function testValueToggle(tmpDir) {
  const entry = path.join(projectRoot, 'src', 'main', 'tweaks', 'registryValueToggle.ts')
  const { mock, store } = makeFakeRegistry()

  const electronMock = { app: { getPath: () => tmpDir } }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock
    if (request === '../utils/registry') return mock
    return originalLoad.call(this, request, parent, isMain)
  }

  let mod
  try {
    mod = buildModule(entry, [])
  } finally {
    Module._load = originalLoad
  }
  const { applyRegistryValueToggle } = mod

  console.log('\n--- registryValueToggle.ts ---')

  // Caso 1: REG_SZ con valor custom del usuario (ej. sensibilidad de mouse "2").
  const specCustom = {
    targets: [{ keyPath: 'HKCU\\Mouse', valueName: 'MouseSpeed', type: 'REG_SZ', enabledValue: '0', disabledValue: '1' }],
    enabledMessage: 'on',
    disabledMessage: 'off',
    restoreOriginal: true
  }
  store.set('HKCU\\Mouse|MouseSpeed', '2')

  let res = await applyRegistryValueToggle(specCustom, true)
  check('caso1: activar -> ok', res.ok, true)
  check('caso1: activar -> valor quedo en enabledValue (0)', store.get('HKCU\\Mouse|MouseSpeed'), '0')

  res = await applyRegistryValueToggle(specCustom, false)
  check('caso1: desactivar -> ok', res.ok, true)
  check('caso1: desactivar -> restaura el ORIGINAL real ("2"), no el disabledValue fijo ("1")', store.get('HKCU\\Mouse|MouseSpeed'), '2')

  // Caso 2: REG_DWORD ausente originalmente (ej. clave de politica que nunca se escribio).
  const specAbsent = {
    targets: [{ keyPath: 'HKLM\\Policy', valueName: 'AbsentPolicy', type: 'REG_DWORD', enabledValue: '1', disabledValue: '0' }],
    enabledMessage: 'on',
    disabledMessage: 'off',
    restoreOriginal: true
  }
  res = await applyRegistryValueToggle(specAbsent, true)
  check('caso2: activar -> ok', res.ok, true)
  res = await applyRegistryValueToggle(specAbsent, false)
  check('caso2: desactivar -> ok', res.ok, true)
  check('caso2: desactivar -> BORRA la clave (originalmente no existia)', store.has('HKLM\\Policy|AbsentPolicy'), false)
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomzboost-registry-backup-test-'))
  console.log(`Carpeta temporal de backups (no toca datos reales de la app): ${tmpDir}\n`)
  try {
    await testDwordToggle(path.join(tmpDir, 'dword'))
    await testValueToggle(path.join(tmpDir, 'value'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log(`\n${passed} OK, ${failed} FAIL de ${passed + failed} casos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
