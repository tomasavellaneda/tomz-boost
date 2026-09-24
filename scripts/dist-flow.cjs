/**
 * Instalador aparte para ver el flujo sin key.
 * Otro nombre y otro userData: no lee la licencia de Tomz Boost ya instalada.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const env = { ...process.env, TOMZ_VARIANT: 'flow' }
const node = process.execPath
const vite = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js')

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run(node, [vite, 'build'])
run(node, [
  builder,
  '--win',
  '-c.appId=com.tomzboost.flow',
  '-c.productName=Tomz Boost Flow',
  '-c.extraMetadata.name=tomz-boost-flow',
  '-c.win.executableName=Tomz Boost Flow',
  '-c.nsis.shortcutName=Tomz Boost Flow',
  '-c.nsis.uninstallDisplayName=Tomz Boost Flow',
  '-c.artifactName=Tomz-Boost-Flow-Setup-${version}.${ext}'
])
