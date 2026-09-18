import { spawn } from 'child_process'

export interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Ejecuta un comando de PowerShell y devuelve stdout/stderr.
 * Se usa -NoProfile -ExecutionPolicy Bypass para que corra igual en cualquier
 * maquina, sin depender del perfil de PowerShell del usuario.
 */
export function runPowerShell(command: string, timeoutMs = 20000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        resolve({ ok: false, stdout, stderr: stderr || 'timeout', code: null })
      }
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: String(err), code: null })
    })
  })
}

/** Corre un comando de PowerShell que devuelve JSON (ConvertTo-Json) y lo parsea. */
export async function runPowerShellJson<T>(command: string, timeoutMs = 20000): Promise<T | null> {
  const wrapped = `$ErrorActionPreference='SilentlyContinue'; ${command} | ConvertTo-Json -Depth 6 -Compress`
  const res = await runPowerShell(wrapped, timeoutMs)
  if (!res.stdout) return null
  try {
    return JSON.parse(res.stdout) as T
  } catch {
    return null
  }
}

export function runCmd(command: string, args: string[], timeoutMs = 15000): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        resolve({ ok: false, stdout, stderr: stderr || 'timeout', code: null })
      }
    }, timeoutMs)

    // powercfg/reg/netsh escriben ANSI (CP1252 en ES) al pipe, no UTF-8.
    // toString() por defecto asume UTF-8 y convierte "Parámetros" en "Par´┐¢metros".
    // latin1 mapea 1:1 los bytes 0x80-0xFF; cubre tildes/ñ de 1252 sin dependencia.
    // PowerShell (runPowerShell) se deja en UTF-8: su JSON puede ir multibyte.
    const decode = (d: Buffer | string): string => (Buffer.isBuffer(d) ? d.toString('latin1') : d)
    child.stdout?.on('data', (d) => (stdout += decode(d)))
    child.stderr?.on('data', (d) => (stderr += decode(d)))
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim(), code })
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: String(err), code: null })
    })
  })
}
