import { regQueryDword, regSetVerbose, regDeleteVerbose } from '../utils/registry'
import { getBackup, saveBackup } from './backup'
import type { TweakResult } from '../../shared/types'
import { TweakMsg, tweakMessage } from '../../shared/tweakMessages'

/**
 * Patron que comparten varios tweaks de CPU/sistema que NO son por-adaptador
 * de GPU (ver gpuDwordTweak.ts para ese caso): escriben un REG_DWORD
 * explicito (distinto para activado/desactivado, nunca se borra la clave) en
 * una o mas rutas de registro conocidas de antemano, y confirman releyendo.
 */

/**
 * Id de backup keado por clave real de registro (no por tweak): el valor
 * "original" de HKCU\...\Foo\Bar es un hecho del sistema, no algo que le
 * pertenezca a un tweak en particular.
 */
function originalBackupId(keyPath: string, valueName: string): string {
  return `reg-original:${keyPath}\\${valueName}`
}

/**
 * Antes de la PRIMERA escritura de un tweak sobre esta clave, guarda el valor
 * real que habia (o null si la clave no existia) para poder restaurarlo de
 * verdad al desactivar, en vez de asumir que `disabledValue` es correcto para
 * todos los usuarios. Si ya existe un backup para esta clave no lo pisa: eso
 * evitaria que una segunda activacion guarde como "original" un valor que la
 * propia app ya habia escrito antes.
 */
async function backupOriginalDwordIfMissing(keyPath: string, valueName: string): Promise<{ ok: boolean; error?: string }> {
  const id = originalBackupId(keyPath, valueName)
  if (getBackup<number | null>(id) !== undefined) return { ok: true }
  const current = await regQueryDword(keyPath, valueName)
  const res = saveBackup(id, current)
  if (!res.ok) {
    console.error(`[registryDwordToggle] no se pudo guardar el valor original de ${keyPath}\\${valueName}: ${res.error}`)
  }
  return res
}

interface ResolvedExpectation {
  absent: boolean
  value: number
}
export interface RegistryDwordTarget {
  keyPath: string
  valueName: string
  /**
   * Si se omite, se usa enabledValue/disabledValue del spec. Sirve para
   * tweaks donde cada clave necesita un valor distinto (ver 'gameDvrFse':
   * GameDVR_FSEBehaviorMode usa 2/0 mientras las otras dos usan 0/1).
   */
  enabledValue?: number
  disabledValue?: number
}

export interface RegistryDwordToggleSpec {
  targets: RegistryDwordTarget[]
  enabledValue: number
  disabledValue: number
  enabledMessage: string
  disabledMessage: string
  /**
   * Opt-in de Fase 4. Si es true, al activar se guarda el valor original real
   * (via backup.ts) y al desactivar se restaura ese valor. Si es false
   * (default), se sigue escribiendo `disabledValue` fijo — el comportamiento
   * anterior, para no migrar todos los callers de golpe.
   */
  restoreOriginal?: boolean
  /**
   * Al activar, la verificacion post-escritura usa este predicado en vez de
   * `=== enabledValue` si esta definido. Al desactivar se sigue exigiendo el
   * valor restaurado/disabledValue exacto.
   */
  isEnabledValue?: (value: number | null) => boolean
}

/**
 * Windows 10 20H1+ guarda NtfsDisableLastAccessUpdate como modo 0/1/2 con el
 * bit 0x80000000 ("user specified"). El tweak escribe 1 (disabled); en cada
 * boot Windows suele reescribir 0x80000002 (system managed), que en SSD/NVMe
 * equivale a no actualizar last-access. exigirlo `=== 1` era un falso OFF.
 */
export function ntfsLastAccessUpdatesReduced(value: number | null): boolean {
  if (value === null) return false
  const mode = (value >>> 0) & 0x7fffffff
  return mode === 1 || mode === 2
}

function resolveExpected(
  target: RegistryDwordTarget,
  spec: Pick<RegistryDwordToggleSpec, 'enabledValue' | 'disabledValue'>,
  enabled: boolean
): number {
  return enabled ? (target.enabledValue ?? spec.enabledValue) : (target.disabledValue ?? spec.disabledValue)
}

export interface RegistryDwordToggleStateSpec extends Pick<RegistryDwordToggleSpec, 'targets' | 'enabledValue'> {
  /**
   * Windows trata la AUSENCIA de esta clave como "activado por defecto" (ej.
   * ToastEnabled, AutoGameModeEnabled: si nunca se escribieron, el
   * comportamiento real de Windows es el mismo que si valieran 1). Sin este
   * flag, una clave ausente se lee como "no confirmado" -- correcto para la
   * mayoria de los casos (HVCI, DPC, IFEO), donde ausente = default apagado.
   */
  treatMissingAsEnabled?: boolean
  /**
   * Si esta presente, reemplaza la comparacion `=== enabledValue` al leer
   * estado (y al verificar un apply(true)). Sirve cuando Windows reescribe el
   * DWORD a un equivalente funcional (ver NtfsDisableLastAccessUpdate).
   */
  isEnabledValue?: (value: number | null) => boolean
}

/** Confirma en TODAS las rutas, no solo la primera. */
export async function getRegistryDwordToggleState(spec: RegistryDwordToggleStateSpec): Promise<boolean> {
  if (spec.targets.length === 0) return false
  const values = await Promise.all(spec.targets.map((t) => regQueryDword(t.keyPath, t.valueName)))
  return spec.targets.every((t, i) => {
    if (spec.isEnabledValue) return spec.isEnabledValue(values[i])
    if (values[i] === null && spec.treatMissingAsEnabled) return true
    return values[i] === (t.enabledValue ?? spec.enabledValue)
  })
}

/**
 * Resuelve que valor debe quedar escrito en esta clave. Al desactivar, si hay
 * un backup real (guardado antes de la primera activacion), se restaura ESE
 * valor -- incluida la posibilidad de que la clave no existiera, en cuyo
 * caso se borra en vez de escribir un 0/1 inventado. Si no hay backup (por
 * ejemplo, la app se instalo despues de esta fase y el usuario nunca activo
 * este tweak, o el tweak se desactiva sin haberse activado antes por esta
 * app), se cae al `disabledValue` fijo del spec como fallback razonable.
 */
function resolveExpectation(
  target: RegistryDwordTarget,
  spec: Pick<RegistryDwordToggleSpec, 'enabledValue' | 'disabledValue' | 'restoreOriginal'>,
  enabled: boolean
): ResolvedExpectation {
  if (!enabled && spec.restoreOriginal) {
    const original = getBackup<number | null>(originalBackupId(target.keyPath, target.valueName))
    if (original !== undefined) {
      return original === null ? { absent: true, value: 0 } : { absent: false, value: original }
    }
  }
  return { absent: false, value: resolveExpected(target, spec, enabled) }
}

export async function applyRegistryDwordToggle(spec: RegistryDwordToggleSpec, enabled: boolean): Promise<TweakResult> {
  if (enabled && spec.restoreOriginal) {
    // Se captura el valor real ANTES de la escritura de activacion: es el
    // unico momento en que el registro todavia refleja lo que tenia el
    // usuario antes de tocar este tweak. Si el backup falla, abortamos:
    // sin original no hay rollback honesto.
    const backups = await Promise.all(spec.targets.map((t) => backupOriginalDwordIfMissing(t.keyPath, t.valueName)))
    const failedBackup = backups.find((b) => !b.ok)
    if (failedBackup) {
    const msg = tweakMessage(TweakMsg.backupAborted, failedBackup.error ?? undefined)
    return {
      ok: false,
      verified: false,
      error: failedBackup.error ?? 'No se pudo guardar el backup.',
      message: msg.message,
      messageKey: msg.messageKey,
      messageParams: msg.messageParams
    }
    }
  }

  const expectations = spec.targets.map((t) => resolveExpectation(t, spec, enabled))

  const writes = await Promise.all(
    spec.targets.map((t, i) => {
      const exp = expectations[i]
      return exp.absent ? regDeleteVerbose(t.keyPath, t.valueName) : regSetVerbose(t.keyPath, t.valueName, 'REG_DWORD', String(exp.value))
    })
  )
  const failed = writes.find((w) => !w.ok)
  if (failed) {
    console.error(
      `[registryDwordToggle] fallo al escribir en ${spec.targets.map((t) => `${t.keyPath}\\${t.valueName}`).join(', ')}: ${failed.error}`
    )
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

  // Verificacion post-aplicacion real: relee cada valor en vez de asumir que
  // exit code 0 de reg.exe significa que quedo aplicado.
  const readBack = await Promise.all(spec.targets.map((t) => regQueryDword(t.keyPath, t.valueName)))
  const verified = spec.targets.every((t, i) => {
    const exp = expectations[i]
    if (exp.absent) return readBack[i] === null
    if (enabled && spec.isEnabledValue) return spec.isEnabledValue(readBack[i])
    return readBack[i] === exp.value
  })

  if (!verified) {
    console.error(
      `[registryDwordToggle] no se pudo confirmar en el registro tras aplicar enabled=${enabled} en ${spec.targets
        .map((t) => `${t.keyPath}\\${t.valueName}`)
        .join(', ')}`
    )
  }

  const unverified = tweakMessage(TweakMsg.unverifiedRegistry)
  return {
    ok: verified,
    verified,
    error: verified
      ? undefined
      : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado.',
    message: verified ? (enabled ? spec.enabledMessage : spec.disabledMessage) : unverified.message,
    messageKey: verified ? undefined : unverified.messageKey,
    messageParams: verified ? undefined : unverified.messageParams
  }
}
