/**
 * Arranque local sin key. Solo funciona con la app sin empaquetar
 * (`npm run dev:local`). El .exe ignora TOMZ_DEV_UNLOCK.
 */
const { spawn } = require('child_process')
const path = require('path')

process.env.TOMZ_DEV_UNLOCK = '1'

const cli = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '..')
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
