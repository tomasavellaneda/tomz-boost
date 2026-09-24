/**
 * Arranque de desarrollo, sin .exe.
 *   npm run dev -- --key off   ver el flujo de licencia
 *   npm run dev -- --key on    app desbloqueada
 * El instalador ignora este switch.
 */
const { spawn } = require('child_process')
const path = require('path')

const args = process.argv.slice(2)
let key = ''
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--key') key = args[++i] ?? ''
  else if (arg === '--key=on' || arg === '--key=off') key = arg.slice('--key='.length)
  else if (arg === '--no-key') key = 'off'
}

if (key && key !== 'on' && key !== 'off') {
  console.error('Switch invalido. Usa: npm run dev -- --key on|off')
  process.exit(1)
}

if (key) process.env.TOMZ_DEV_KEY = key
if (key === 'on') process.env.TOMZ_DEV_UNLOCK = '1'
if (key === 'off') delete process.env.TOMZ_DEV_UNLOCK

const label = key === 'on' ? 'activada (app desbloqueada)' : key === 'off' ? 'desactivada (vas a ver el flujo)' : 'la que este guardada en esta PC'
console.log(`Tomz Boost dev — key ${label}`)

const root = path.join(__dirname, '..')
const cli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
const child = spawn(process.execPath, [cli, 'dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: root
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
