import { app } from 'electron'
import { spawn } from 'child_process'
import { runPowerShell } from './shell'
import type { TweakResult } from '../../shared/types'
import { TweakMsg, tweakMessage } from '../../shared/tweakMessages'

export const ADMIN_REQUIRED_MESSAGE = tweakMessage(TweakMsg.adminRequired).message

let cachedElevated: boolean | null = null

export async function isElevated(): Promise<boolean> {
  if (cachedElevated !== null) return cachedElevated
  if (process.platform !== 'win32') {
    cachedElevated = true
    return true
  }
  const res = await runPowerShell(
    "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
  )
  cachedElevated = res.ok && res.stdout.trim().toLowerCase() === 'true'
  return cachedElevated
}

/**
 * Si el proceso no esta elevado, devuelve un TweakResult listo para
 * devolverle al usuario. Si esta elevado, devuelve null y el llamador sigue.
 * El token de elevacion no cambia sin relanzar la app, asi que isElevated
 * se cachea por proceso.
 */
export async function requireElevated(): Promise<TweakResult | null> {
  if (await isElevated()) return null
  const msg = tweakMessage(TweakMsg.adminRequired)
  return {
    ok: false,
    verified: false,
    error: msg.message,
    message: msg.message,
    messageKey: msg.messageKey
  }
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
