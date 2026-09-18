import { getBackup, saveBackup } from './backup'
import { findGpuAdapterKeys } from './gpuRegistry'
import { isElevated } from '../utils/elevation'
import { regQueryDword, regSetVerbose, regDeleteVerbose } from '../utils/registry'

/**
 * Fase 7: al actualizar, restaurar las 6 claves legacy ANTES de que desaparezca
 * el switch. Sin esto, un usuario con el tweak activado se quedaria con la
 * DWORD puesta y sin UI para revertirla.
 *
 * Marker persistido en tweak-backups.json. Solo se marca despues de verificar
 * la relectura del registro. Sin admin no se marca: el token no cambia sin
 * relanzar, y hay que reintentar en el proximo arranque elevado.
 *
 * GPU: estos tweaks NUNCA usaron backup.ts (disable = borrar). El rollback
 * honesto es borrar SOLO si el valor actual es exactamente el que escribia
 * la app. Un numero distinto no se toca.
 *
 * DPC: si hay backup Fase 4 (`reg-original:...`), se restaura ese original.
 * Si no hay backup y el valor es 1 (lo que escribiamos), se borra. El backup
 * NO se borra: si el original era 1, perderlo haria que una segunda pasada
 * (marker perdido) lo trate como huerfano y lo elimine.
 */
export const RETIRED_LEGACY_MARKER = 'retired-legacy-keys-v1'

const GPU_SPECS = [
  { vendor: 'NVIDIA', valueName: 'PowerMizerEnable', ourValue: 0 },
  { vendor: 'NVIDIA', valueName: 'PowerMizerLevel', ourValue: 1 },
  { vendor: 'NVIDIA', valueName: 'PerfLevelSrc', ourValue: 0x2222 },
  { vendor: 'AMD', valueName: 'PP_ThermalAutoThrottlingEnable', ourValue: 0 },
  { vendor: 'AMD', valueName: 'DisableSAMUPowerGating', ourValue: 1 }
] as const

const DPC_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel'
const DPC_VALUE = 'DistributeTimers'
const DPC_OUR_VALUE = 1
const DPC_BACKUP_ID = `reg-original:${DPC_KEY}\\${DPC_VALUE}`

export interface RetireResult {
  ok: boolean
  alreadyDone: boolean
  skipped?: 'not-elevated'
  error?: string
}

export async function retireLegacyTweaks(): Promise<RetireResult> {
  try {
    return await runRetirement()
  } catch (err) {
    console.error(`[retireLegacyTweaks] fallo inesperado: ${String(err)}`)
    return { ok: false, alreadyDone: false, error: String(err) }
  }
}

async function runRetirement(): Promise<RetireResult> {
  if (getBackup(RETIRED_LEGACY_MARKER) === true) {
    return { ok: true, alreadyDone: true }
  }

  if (!(await isElevated())) {
    console.warn('[retireLegacyTweaks] sin administrador: no se restauran claves HKLM, se reintenta en el proximo arranque')
    return { ok: false, alreadyDone: false, skipped: 'not-elevated' }
  }

  let allOk = true
  let lastError: string | undefined

  for (const spec of GPU_SPECS) {
    const result = await retireGpuSpec(spec)
    if (!result.ok) {
      allOk = false
      lastError = result.error
      console.error(`[retireLegacyTweaks] ${spec.vendor} ${spec.valueName}: ${result.error}`)
    }
  }

  const dpc = await retireDpc()
  if (!dpc.ok) {
    allOk = false
    lastError = dpc.error
    console.error(`[retireLegacyTweaks] DistributeTimers: ${dpc.error}`)
  }

  if (!allOk) {
    return { ok: false, alreadyDone: false, error: lastError }
  }

  const marked = saveBackup(RETIRED_LEGACY_MARKER, true)
  if (!marked.ok) {
    console.error(`[retireLegacyTweaks] registro restaurado pero no se pudo persistir el marker: ${marked.error}`)
    return { ok: false, alreadyDone: false, error: marked.error ?? 'No se pudo guardar el marker de retiro.' }
  }

  console.log('[retireLegacyTweaks] claves legacy restauradas y verificadas')
  return { ok: true, alreadyDone: false }
}

async function retireGpuSpec(spec: {
  vendor: string
  valueName: string
  ourValue: number
}): Promise<{ ok: boolean; error?: string }> {
  const keys = await findGpuAdapterKeys(spec.vendor)
  // Sin adaptadores de ese fabricante: esta maquina nunca tuvo esas DWORDs
  // (o la GPU se desinstalo y las subclaves ya no existen). No es un fallo.
  if (keys.length === 0) return { ok: true }

  for (const key of keys) {
    const current = await regQueryDword(key, spec.valueName)
    if (current !== spec.ourValue) continue
    const del = await regDeleteVerbose(key, spec.valueName)
    if (!del.ok) {
      console.warn(`[retireLegacyTweaks] aviso al borrar ${spec.valueName} en ${key}: ${del.error}`)
    }
  }

  const readBack = await Promise.all(keys.map((key) => regQueryDword(key, spec.valueName)))
  const verified = readBack.every((v) => v !== spec.ourValue)
  return verified
    ? { ok: true }
    : {
        ok: false,
        error: `${spec.valueName} (${spec.vendor}) sigue teniendo el valor que escribia la app despues de intentar borrarlo.`
      }
}

async function retireDpc(): Promise<{ ok: boolean; error?: string }> {
  const current = await regQueryDword(DPC_KEY, DPC_VALUE)
  const original = getBackup<number | null>(DPC_BACKUP_ID)

  if (original !== undefined) {
    if (original === null) {
      if (current !== null) {
        const del = await regDeleteVerbose(DPC_KEY, DPC_VALUE)
        if (!del.ok) console.warn(`[retireLegacyTweaks] aviso al borrar DistributeTimers: ${del.error}`)
      }
      const after = await regQueryDword(DPC_KEY, DPC_VALUE)
      return after === null
        ? { ok: true }
        : { ok: false, error: 'DistributeTimers deberia estar ausente (original de Fase 4) y sigue presente.' }
    }

    if (current !== original) {
      const write = await regSetVerbose(DPC_KEY, DPC_VALUE, 'REG_DWORD', String(original))
      if (!write.ok) {
        return { ok: false, error: write.error ?? 'No se pudo restaurar DistributeTimers desde el backup.' }
      }
    }
    const after = await regQueryDword(DPC_KEY, DPC_VALUE)
    return after === original
      ? { ok: true }
      : { ok: false, error: `DistributeTimers no coincidio con el original de Fase 4 (${original}).` }
  }

  if (current === null) return { ok: true }
  if (current !== DPC_OUR_VALUE) return { ok: true }

  const del = await regDeleteVerbose(DPC_KEY, DPC_VALUE)
  if (!del.ok) console.warn(`[retireLegacyTweaks] aviso al borrar DistributeTimers huerfano: ${del.error}`)
  const after = await regQueryDword(DPC_KEY, DPC_VALUE)
  return after === null
    ? { ok: true }
    : { ok: false, error: 'DistributeTimers=1 (sin backup) no se pudo borrar.' }
}
