import { runPowerShellJson } from '../utils/shell'
import { regQueryDword, regSetVerbose } from '../utils/registry'
import type { TweakResult } from '../../shared/types'
import { TweakMsg, tweakMessage } from '../../shared/tweakMessages'

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

export async function warmupMsiTargets(): Promise<void> {
  await getTargets()
}

export function getCachedMsiInstanceIds(): string[] {
  if (!cachedTargets) return []
  return [cachedTargets.gpu, cachedTargets.nic].filter((id): id is string => Boolean(id))
}

function interruptKey(instanceId: string): string {
  return `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${instanceId}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`
}

export async function getMsiState(): Promise<boolean> {
  const { gpu, nic } = await getTargets()
  const ids = [gpu, nic].filter(Boolean) as string[]
  if (ids.length === 0) return false
  const values = await Promise.all(ids.map((id) => regQueryDword(interruptKey(id), 'MSISupported')))
  return values.every((v) => v === 1)
}

export async function setMsiModeForGpuAndNic(enabled: boolean): Promise<TweakResult> {
  const { gpu, nic } = await getTargets()
  const ids = [gpu, nic].filter(Boolean) as string[]
  if (ids.length === 0) {
    const msg = tweakMessage(TweakMsg.noMsiDevices)
    return { ok: false, verified: false, error: msg.message, message: msg.message, messageKey: msg.messageKey }
  }

  const value = enabled ? '1' : '0'
  const writes = await Promise.all(ids.map((id) => regSetVerbose(interruptKey(id), 'MSISupported', 'REG_DWORD', value)))
  const failed = writes.find((w) => !w.ok)
  if (failed) {
    console.error(`[msiMode] fallo al escribir MSISupported: ${failed.error}`)
    const msg = tweakMessage(TweakMsg.applyAdmin, failed.error ?? undefined)
    return {
      ok: false,
      verified: false,
      error: failed.error ?? 'Error desconocido al escribir en el registro.',
      message: msg.message,
      messageKey: msg.messageKey,
      messageParams: msg.messageParams
    }
  }

  // Verificacion post-aplicacion real: relee MSISupported en cada dispositivo
  // en vez de asumir que exit code 0 de reg.exe significa que quedo aplicado.
  const readBack = await Promise.all(ids.map((id) => regQueryDword(interruptKey(id), 'MSISupported')))
  const expected = enabled ? 1 : 0
  const verified = readBack.every((v) => v === expected)
  if (!verified) {
    console.error(`[msiMode] no se pudo confirmar MSISupported=${expected} tras aplicar en ${ids.length} dispositivo(s)`)
  }

  return {
    ok: verified,
    verified,
    error: verified
      ? undefined
      : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado.',
    message: verified
      ? enabled
        ? `Modo MSI activado en ${ids.length} dispositivo(s). Reinicia para aplicar.`
        : `Modo MSI desactivado en ${ids.length} dispositivo(s).`
      : tweakMessage(TweakMsg.unverifiedRegistry).message,
    messageKey: verified ? undefined : TweakMsg.unverifiedRegistry
  }
}
