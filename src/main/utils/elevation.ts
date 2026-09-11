import { app } from 'electron'
import { spawn } from 'child_process'
import { runPowerShell } from './shell'

export async function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  const res = await runPowerShell(
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
  )
  return res.stdout.trim().toLowerCase() === 'true'
}

/** Relanza la app actual con privilegios de administrador (UAC) y cierra esta instancia. */
export function relaunchAsAdmin(): void {
  const exePath = process.execPath
  const args = process.argv.slice(1).filter((a) => a !== '--relaunched')
  const argString = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')
  const psCommand = `Start-Process -FilePath '${exePath}' -ArgumentList ${
    argString ? `@(${argString})` : '@()'
  } -Verb RunAs`

  spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore'
  }).unref()

  app.exit(0)
}
