import { runPowerShellJson } from '../utils/shell'
import { regQuery, regSet } from '../utils/registry'

interface PnpRow {
  InstanceId?: string
  Class?: string
  FriendlyName?: string
}

let cachedTargets: { gpu: string | null; nic: string | null } | null = null

/** Resuelve el InstanceId de la GPU principal y la NIC principal (cacheado por sesion). */
async function getTargets(): Promise<{ gpu: string | null; nic: string | null }> {
  if (cachedTargets) return cachedTargets

  const rows = await runPowerShellJson<PnpRow[]>(
    "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Display','Net') -and $_.Status -eq 'OK' } | Select-Object InstanceId, Class, FriendlyName"
  )
  const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
  const gpu = arr.find((r) => r.Class === 'Display')?.InstanceId ?? null
  const nic =
    arr.find((r) => r.Class === 'Net' && !/virtual|loopback|bluetooth/i.test(r.FriendlyName || ''))?.InstanceId ??
    null

  cachedTargets = { gpu, nic }
  return cachedTargets
}

function interruptKey(instanceId: string): string {
  return `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${instanceId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`
}

export async function getMsiState(): Promise<boolean> {
  const { gpu, nic } = await getTargets()
  const ids = [gpu, nic].filter(Boolean) as string[]
  if (ids.length === 0) return false
  const values = await Promise.all(ids.map((id) => regQuery(interruptKey(id), 'MSISupported')))
  return values.every((v) => v === '1')
}

export async function setMsiModeForGpuAndNic(enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const { gpu, nic } = await getTargets()
  const ids = [gpu, nic].filter(Boolean) as string[]
  if (ids.length === 0) return { ok: false, message: 'No se encontraron dispositivos de GPU/red compatibles.' }
  const results = await Promise.all(ids.map((id) => regSet(interruptKey(id), 'MSISupported', 'REG_DWORD', enabled ? '1' : '0')))
  return {
    ok: results.every(Boolean),
    message: enabled
      ? `Modo MSI activado en ${ids.length} dispositivo(s). Reinicia para aplicar.`
      : `Modo MSI desactivado en ${ids.length} dispositivo(s).`
  }
}
