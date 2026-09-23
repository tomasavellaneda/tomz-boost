import { regQueryDword } from '../utils/registry'
import { findGpuAdapterKeys, setValueOnAdaptersVerbose, deleteValueOnAdaptersVerbose } from './gpuRegistry'
import type { TweakResult } from '../../shared/types'
import { TweakMsg, tweakMessage } from '../../shared/tweakMessages'

/**
 * Varios tweaks de GPU (NVIDIA/AMD) comparten exactamente el mismo patron:
 * detectar los adaptadores del fabricante, escribir un unico REG_DWORD en
 * todos ellos para "activar", borrar esa clave para "desactivar" (asi el
 * driver vuelve a su propio default en vez de quedar atado a un valor
 * inventado por la app), y confirmar releyendo el registro. Este modulo
 * centraliza ese patron para no repetir la logica (y el bug) en cada tweak.
 */
export interface AdapterDwordTweakSpec {
  /** Texto que debe contener DriverDesc del adaptador (ej. 'NVIDIA', 'AMD'). */
  vendor: string
  /** Nombre del valor de registro a escribir/leer en la clave del adaptador. */
  valueName: string
  /** Valor DWORD que representa "activado". Al desactivar se borra la clave. */
  enabledValue: number
  notFoundMessage: string
  enabledMessage: string
  disabledMessage: string
}

/**
 * Estado real del tweak: confirma en TODOS los adaptadores detectados (no
 * solo el primero) que el valor coincide con `enabledValue`. Antes, varios
 * tweaks solo miraban keys[0] -- en un sistema con GPU hibrida/multi-adaptador
 * eso podia mostrar "activado" aunque el segundo adaptador no lo tuviera.
 */
export async function getAdapterDwordTweakState(
  spec: Pick<AdapterDwordTweakSpec, 'vendor' | 'valueName' | 'enabledValue'>
): Promise<boolean> {
  const keys = await findGpuAdapterKeys(spec.vendor)
  if (keys.length === 0) return false
  const values = await Promise.all(keys.map((key) => regQueryDword(key, spec.valueName)))
  return values.every((v) => v === spec.enabledValue)
}

async function clearedOnAllAdapters(keys: string[], valueName: string): Promise<boolean> {
  const values = await Promise.all(keys.map((key) => regQueryDword(key, valueName)))
  return values.every((v) => v === null)
}

export async function applyAdapterDwordTweak(spec: AdapterDwordTweakSpec, enabled: boolean): Promise<TweakResult> {
  const keys = await findGpuAdapterKeys(spec.vendor)
  if (keys.length === 0) {
    return { ok: false, verified: false, error: spec.notFoundMessage, message: spec.notFoundMessage }
  }

  const write = enabled
    ? await setValueOnAdaptersVerbose(keys, spec.valueName, 'REG_DWORD', String(spec.enabledValue))
    : await deleteValueOnAdaptersVerbose(keys, spec.valueName)

  if (!write.ok) {
    // Al desactivar, un "delete" que falla porque el valor ya no existia es
    // el resultado esperado (idempotente) -- se loggea como aviso, no error,
    // y se sigue a la verificacion real en vez de cortar aca.
    const level = enabled ? 'error' : 'warn'
    console[level](
      `[gpuDwordTweak] ${enabled ? 'fallo al escribir' : 'aviso al restaurar'} ${spec.valueName} (${spec.vendor}): ${write.error}`
    )
    if (enabled) {
      const msg = tweakMessage(TweakMsg.applyAdmin, write.error ?? undefined)
      return {
        ok: false,
        verified: false,
        error: write.error ?? 'Error desconocido al escribir en el registro.',
        message: msg.message,
        messageKey: msg.messageKey,
        messageParams: msg.messageParams
      }
    }
  }

  const verified = enabled
    ? await getAdapterDwordTweakState(spec)
    : await clearedOnAllAdapters(keys, spec.valueName)

  if (!verified) {
    console.error(
      `[gpuDwordTweak] ${spec.valueName} (${spec.vendor}) no se pudo confirmar en el registro tras aplicar enabled=${enabled}`
    )
  }

  return {
    ok: verified,
    verified,
    error: verified
      ? undefined
      : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado (el driver puede haberlo rechazado, o falta administrador).',
    message: verified
      ? enabled
        ? spec.enabledMessage
        : spec.disabledMessage
      : tweakMessage(TweakMsg.unverifiedRegistry).message,
    messageKey: verified ? undefined : TweakMsg.unverifiedRegistry
  }
}
