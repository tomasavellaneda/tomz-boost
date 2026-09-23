import { regQuery, regQueryDword, regSetVerbose, regDeleteVerbose, type RegType } from '../utils/registry'
import { getBackup, saveBackup } from './backup'
import type { TweakResult } from '../../shared/types'
import { TweakMsg, tweakMessage } from '../../shared/tweakMessages'

/**
 * Generalizacion de registryDwordToggle.ts para tweaks que mezclan REG_SZ y
 * REG_DWORD en varias claves (ej. 'visualEffects', 'gaming', 'rawInput'):
 * cada target declara su propio par de valores activado/desactivado (como
 * string, para poder representar tanto SZ como DWORD) y su tipo real de
 * registro. Igual filosofia que registryDwordToggle.ts: se confirma
 * releyendo, y al desactivar se restaura el valor ORIGINAL real (via backup),
 * no un default fijo -- ver resolveExpectation().
 */
export interface RegistryValueTarget {
  keyPath: string
  valueName: string
  type: RegType
  enabledValue: string
  disabledValue: string
}

export interface RegistryValueToggleSpec {
  targets: RegistryValueTarget[]
  enabledMessage: string
  disabledMessage: string
  /**
   * Opt-in de Fase 4. Si es true, al activar se guarda el valor original real
   * (via backup.ts) y al desactivar se restaura ese valor. Si es false
   * (default), se sigue escribiendo `disabledValue` fijo — el comportamiento
   * anterior, para no migrar todos los callers de golpe.
   */
  restoreOriginal?: boolean
}

function expectedFor(target: RegistryValueTarget, enabled: boolean): string {
  return enabled ? target.enabledValue : target.disabledValue
}

function readTarget(target: RegistryValueTarget): Promise<string | number | null> {
  return target.type === 'REG_DWORD' ? regQueryDword(target.keyPath, target.valueName) : regQuery(target.keyPath, target.valueName)
}

function matches(target: RegistryValueTarget, actual: string | number | null, enabled: boolean): boolean {
  const expected = expectedFor(target, enabled)
  return target.type === 'REG_DWORD' ? actual === Number(expected) : actual === expected
}

/** Confirma en TODOS los targets, con el tipo real de cada uno (SZ o DWORD). */
export async function getRegistryValueToggleState(targets: RegistryValueTarget[], enabled = true): Promise<boolean> {
  if (targets.length === 0) return false
  const actuals = await Promise.all(targets.map(readTarget))
  return targets.every((t, i) => matches(t, actuals[i], enabled))
}

/**
 * Id de backup keado por clave real de registro (no por tweak): igual
 * criterio que registryDwordToggle.ts.
 */
function originalBackupId(target: RegistryValueTarget): string {
  return `reg-original:${target.keyPath}\\${target.valueName}`
}

/**
 * Antes de la PRIMERA escritura de un tweak sobre esta clave, guarda el valor
 * real que habia (o null si la clave no existia) para poder restaurarlo de
 * verdad al desactivar. Si ya hay backup no lo pisa (ver misma nota en
 * registryDwordToggle.ts).
 */
async function backupOriginalIfMissing(target: RegistryValueTarget): Promise<{ ok: boolean; error?: string }> {
  const id = originalBackupId(target)
  if (getBackup<string | number | null>(id) !== undefined) return { ok: true }
  const current = await readTarget(target)
  const res = saveBackup(id, current)
  if (!res.ok) {
    console.error(`[registryValueToggle] no se pudo guardar el valor original de ${target.keyPath}\\${target.valueName}: ${res.error}`)
  }
  return res
}

interface ResolvedExpectation {
  absent: boolean
  value: string
}

/**
 * Al desactivar, si hay un backup real, se restaura ESE valor (o se borra la
 * clave si originalmente no existia) en vez del `disabledValue` fijo del
 * spec. Sin backup (tweak nunca activado antes por esta app), se usa
 * `disabledValue` como fallback.
 */
function resolveExpectation(
  target: RegistryValueTarget,
  enabled: boolean,
  restoreOriginal?: boolean
): ResolvedExpectation {
  if (!enabled && restoreOriginal) {
    const original = getBackup<string | number | null>(originalBackupId(target))
    if (original !== undefined) {
      return original === null ? { absent: true, value: '' } : { absent: false, value: String(original) }
    }
  }
  return { absent: false, value: expectedFor(target, enabled) }
}

function matchesExpectation(target: RegistryValueTarget, actual: string | number | null, exp: ResolvedExpectation): boolean {
  if (exp.absent) return actual === null
  return target.type === 'REG_DWORD' ? actual === Number(exp.value) : actual === exp.value
}

export async function applyRegistryValueToggle(spec: RegistryValueToggleSpec, enabled: boolean): Promise<TweakResult> {
  if (enabled && spec.restoreOriginal) {
    // Se captura el valor real ANTES de la escritura de activacion: es el
    // unico momento en que el registro todavia refleja lo que tenia el
    // usuario antes de tocar este tweak. Si el backup falla, abortamos:
    // sin original no hay rollback honesto.
    const backups = await Promise.all(spec.targets.map(backupOriginalIfMissing))
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

  const expectations = spec.targets.map((t) => resolveExpectation(t, enabled, spec.restoreOriginal))

  const writes = await Promise.all(
    spec.targets.map((t, i) => {
      const exp = expectations[i]
      return exp.absent ? regDeleteVerbose(t.keyPath, t.valueName) : regSetVerbose(t.keyPath, t.valueName, t.type, exp.value)
    })
  )
  const failed = writes.find((w) => !w.ok)
  if (failed) {
    console.error(
      `[registryValueToggle] fallo al escribir en ${spec.targets.map((t) => `${t.keyPath}\\${t.valueName}`).join(', ')}: ${failed.error}`
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

  // Verificacion post-aplicacion real: relee cada valor (con el parser
  // correcto segun su tipo) en vez de asumir que exit code 0 significa que
  // quedo aplicado.
  const actuals = await Promise.all(spec.targets.map(readTarget))
  const verified = spec.targets.every((t, i) => matchesExpectation(t, actuals[i], expectations[i]))

  if (!verified) {
    console.error(
      `[registryValueToggle] no se pudo confirmar en el registro tras aplicar enabled=${enabled} en ${spec.targets
        .map((t) => `${t.keyPath}\\${t.valueName}`)
        .join(', ')}`
    )
  }

  return {
    ok: verified,
    verified,
    error: verified
      ? undefined
      : 'La escritura no reporto error pero la relectura del registro no confirma los valores esperados.',
    message: verified
      ? enabled
        ? spec.enabledMessage
        : spec.disabledMessage
      : tweakMessage(TweakMsg.unverifiedRegistry).message,
    messageKey: verified ? undefined : TweakMsg.unverifiedRegistry
  }
}
