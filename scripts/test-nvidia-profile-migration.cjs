'use strict'

/**
 * Test manual (sin framework) para la migracion de IDs viejos de perfiles
 * NVIDIA -> LEGACY_PROFILE_ALIASES en src/main/tweaks/nvidiaProfiles.ts.
 *
 * Que hace:
 *  - Compila nvidiaProfiles.ts (y sus dependencias relativas: gpuRegistry.ts,
 *    utils/registry.ts, utils/shell.ts) a un solo bundle CJS con esbuild,
 *    dejando 'electron' y los builtins de Node como external.
 *  - Mockea 'electron' (solo `app.getPath`) para que markerPath() apunte a
 *    una carpeta temporal, en vez de la carpeta real de userData.
 *  - Para cada uno de los 7 IDs viejos, escribe un nvidia-profile.json falso
 *    y llama a la funcion REAL getActiveNvidiaProfile() exportada por el
 *    modulo, verificando que devuelva el ID nuevo correcto.
 *
 * Que NO hace:
 *  - No llama a findGpuAdapterKeys/regQueryDword/regSet ni nada que dispare
 *    reg.exe o PowerShell. No toca el registro de Windows en absoluto.
 *
 * Uso: node scripts/test-nvidia-profile-migration.cjs
 *   (o "npm run test:nvidia-profile-migration")
 *
 * Nota: usa `esbuild`, que ya esta instalado de forma transitiva (via vite/
 * electron-vite). No se agrego como dependencia nueva del proyecto.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')
const esbuild = require('esbuild')

const projectRoot = path.join(__dirname, '..')
const entry = path.join(projectRoot, 'src', 'main', 'tweaks', 'nvidiaProfiles.ts')

function loadNvidiaProfilesModule() {
  const bundle = esbuild.buildSync({
    entryPoints: [entry],
    absWorkingDir: projectRoot,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    write: false,
    external: ['electron', 'fs', 'path', 'child_process']
  })
  const code = bundle.outputFiles[0].text

  const mod = new Module(entry, null)
  mod.filename = entry
  mod.paths = Module._nodeModulePaths(path.dirname(entry))
  mod._compile(code, entry)
  return mod.exports
}

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomzboost-nvidia-profile-test-'))
  const markerFile = path.join(tmpDir, 'nvidia-profile.json')

  // Mock minimo de 'electron': nvidiaProfiles.ts solo usa app.getPath('userData').
  const electronMock = { app: { getPath: () => tmpDir } }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock
    return originalLoad.call(this, request, parent, isMain)
  }

  let nvidiaProfiles
  try {
    nvidiaProfiles = loadNvidiaProfilesModule()
  } finally {
    Module._load = originalLoad
  }

  const { getActiveNvidiaProfile, NVIDIA_PROFILE_IDS } = nvidiaProfiles

  if (typeof getActiveNvidiaProfile !== 'function' || !Array.isArray(NVIDIA_PROFILE_IDS)) {
    console.error('FAIL  el bundle no exporto getActiveNvidiaProfile/NVIDIA_PROFILE_IDS como se esperaba.')
    fs.rmSync(tmpDir, { recursive: true, force: true })
    process.exit(1)
  }

  let passed = 0
  let failed = 0

  function check(label, actual, expected) {
    const ok = actual === expected
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} got=${String(actual)} expected=${String(expected)}`)
    if (ok) passed++
    else failed++
  }

  console.log(`Marcador temporal (no toca datos reales): ${markerFile}\n`)

  // --- Los 7 casos pedidos: cada ID viejo debe mapear al nuevo correcto ---
  const LEGACY_CASES = [
    ['nvidiaProfileBasic', 'nvidiaProfileBalanced'],
    ['nvidiaProfileCasual', 'nvidiaProfileBalanced'],
    ['nvidiaProfileCompetitive', 'nvidiaProfileMaxPerformance'],
    ['nvidiaProfileFps', 'nvidiaProfileMaxPerformance'],
    ['nvidiaProfileFps2', 'nvidiaProfileMaxPerformance'],
    ['nvidiaProfileLatency', 'nvidiaProfileMaxPerformance'],
    ['nvidiaProfileAdvanced', 'nvidiaProfileMaxPerformance']
  ]

  for (const [legacyId, expectedNewId] of LEGACY_CASES) {
    fs.writeFileSync(markerFile, JSON.stringify({ id: legacyId }), 'utf8')
    check(`legacy '${legacyId}'`, getActiveNvidiaProfile(), expectedNewId)
  }

  // --- Casos de sanidad extra (no pedidos, pero baratos de cubrir) ---
  for (const currentId of NVIDIA_PROFILE_IDS) {
    fs.writeFileSync(markerFile, JSON.stringify({ id: currentId }), 'utf8')
    check(`id actual '${currentId}' (identidad)`, getActiveNvidiaProfile(), currentId)
  }

  fs.writeFileSync(markerFile, JSON.stringify({ id: 'idQueNuncaExistio' }), 'utf8')
  check('id desconocido -> null', getActiveNvidiaProfile(), null)

  fs.writeFileSync(markerFile, JSON.stringify({}), 'utf8')
  check('marcador sin "id" -> null', getActiveNvidiaProfile(), null)

  fs.rmSync(markerFile, { force: true })
  check('sin archivo de marcador -> null', getActiveNvidiaProfile(), null)

  fs.rmSync(tmpDir, { recursive: true, force: true })

  console.log(`\n${passed} OK, ${failed} FAIL de ${passed + failed} casos.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
