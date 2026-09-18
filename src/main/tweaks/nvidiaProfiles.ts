import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { regQueryDword, regSetVerbose } from '../utils/registry'
import { deleteValueOnAdaptersVerbose, findGpuAdapterKeys, setValueOnAdaptersVerbose } from './gpuRegistry'
import type { TweakResult } from '../../shared/types'

// Los 7 perfiles originales (Basic/Casual/Competitive/Fps/Fps2/Latency/Advanced)
// colapsaban en solo 2 configuraciones de registro reales: se consolidaron en
// estos 2 IDs. Ver LEGACY_PROFILE_ALIASES para la migracion de usuarios que
// ya tenian un marcador local con un ID viejo.
export const NVIDIA_PROFILE_IDS = ['nvidiaProfileBalanced', 'nvidiaProfileMaxPerformance'] as const

export type NvidiaProfileId = (typeof NVIDIA_PROFILE_IDS)[number]

const ANSEL_KEY = 'HKLM\\SOFTWARE\\NVIDIA Corporation\\Global\\Ansel'
const PROFILE_OWNED = ['PowerMizerLevelAC', 'PowerMizerDefaultAC', 'DisableDynamicPstate'] as const

interface ProfilePack {
  powerMizerLevelAC: boolean
  disableDynamicPstate: boolean
  disableAnsel: boolean
}

const PACKS: Record<NvidiaProfileId, ProfilePack> = {
  nvidiaProfileBalanced: { powerMizerLevelAC: true, disableDynamicPstate: false, disableAnsel: true },
  nvidiaProfileMaxPerformance: { powerMizerLevelAC: true, disableDynamicPstate: true, disableAnsel: true }
}

/**
 * IDs viejos (pre-consolidacion) mapeados a su equivalente actual. Se usa
 * solo para que un marcador local (nvidia-profile.json) escrito por una
 * version anterior de la app siga reconociendose como "activo" si el
 * registro todavia tiene ese pack aplicado -- sin esto, un usuario que ya
 * tenia "Fps" o "Latency" aplicado veria el switch nuevo como apagado pese a
 * que el sistema sigue con esos valores.
 */
const LEGACY_PROFILE_ALIASES: Record<string, NvidiaProfileId> = {
  nvidiaProfileBasic: 'nvidiaProfileBalanced',
  nvidiaProfileCasual: 'nvidiaProfileBalanced',
  nvidiaProfileCompetitive: 'nvidiaProfileMaxPerformance',
  nvidiaProfileFps: 'nvidiaProfileMaxPerformance',
  nvidiaProfileFps2: 'nvidiaProfileMaxPerformance',
  nvidiaProfileLatency: 'nvidiaProfileMaxPerformance',
  nvidiaProfileAdvanced: 'nvidiaProfileMaxPerformance'
}

function markerPath(): string {
  return join(app.getPath('userData'), 'nvidia-profile.json')
}

/**
 * Ultimo perfil que el usuario selecciono. Es SOLO una pista de UI para
 * desempatar entre perfiles con packs identicos -- nunca la fuente de verdad
 * de si el perfil esta activo. Ver isNvidiaProfileEnabled().
 */
export function getActiveNvidiaProfile(): NvidiaProfileId | null {
  try {
    if (!existsSync(markerPath())) return null
    const raw = JSON.parse(readFileSync(markerPath(), 'utf8')) as { id?: string }
    if (!raw.id) return null
    if ((NVIDIA_PROFILE_IDS as readonly string[]).includes(raw.id)) return raw.id as NvidiaProfileId
    return LEGACY_PROFILE_ALIASES[raw.id] ?? null
  } catch {
    // ignore
  }
  return null
}

/** Escribe el marcador local. Debe llamarse SOLO despues de confirmar (verified) el estado real. */
function persistMarker(id: NvidiaProfileId | null): void {
  try {
    writeFileSync(markerPath(), JSON.stringify({ id }), 'utf8')
  } catch (err) {
    console.error(`[nvidiaProfiles] no se pudo escribir el marcador local (${markerPath()}): ${String(err)}`)
  }
}

/** Confirma contra el registro real de la GPU (no el marcador) si un pack esta aplicado. */
async function registryMatchesPack(keys: string[], pack: ProfilePack): Promise<boolean> {
  if (keys.length === 0) return false

  if (pack.disableAnsel) {
    const ansel = await regQueryDword(ANSEL_KEY, 'AnselEnable')
    if (ansel !== 0) return false
  }

  const perAdapter = await Promise.all(
    keys.map(async (key) => {
      const [levelAC, defaultAC, dynPstate] = await Promise.all([
        regQueryDword(key, 'PowerMizerLevelAC'),
        regQueryDword(key, 'PowerMizerDefaultAC'),
        regQueryDword(key, 'DisableDynamicPstate')
      ])
      if (pack.powerMizerLevelAC && !(levelAC === 1 && defaultAC === 1)) return false
      if (pack.disableDynamicPstate && dynPstate !== 1) return false
      return true
    })
  )
  return perAdapter.every(Boolean)
}

/** Confirma contra el registro real que NINGUN valor propio de un perfil quedo escrito. */
async function registryMatchesClearedState(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return false
  const ansel = await regQueryDword(ANSEL_KEY, 'AnselEnable')
  if (ansel !== 1) return false
  const perAdapter = await Promise.all(
    keys.map(async (key) => {
      const values = await Promise.all(PROFILE_OWNED.map((name) => regQueryDword(key, name)))
      return values.every((v) => v === null)
    })
  )
  return perAdapter.every(Boolean)
}

/**
 * Fuente de verdad para el switch de la UI: confirma contra el registro real
 * de la GPU, NUNCA solo contra el marcador local (antes, el marcador se leia
 * solo y se escribia sin importar si la escritura real habia fallado -- ese
 * era el falso positivo).
 *
 * Como varios perfiles comparten exactamente el mismo pack (ver PACKS), el
 * marcador local se usa como desempate SOLO despues de confirmar que el
 * sistema realmente tiene ese pack aplicado.
 */
export async function isNvidiaProfileEnabled(id: NvidiaProfileId): Promise<boolean> {
  const keys = await findGpuAdapterKeys('NVIDIA')
  if (keys.length === 0) return false
  const pack = PACKS[id]
  const matches = await registryMatchesPack(keys, pack)
  if (!matches) return false
  return getActiveNvidiaProfile() === id
}

async function clearProfileValues(keys: string[]): Promise<{ ok: boolean; error?: string }> {
  const deletes = await Promise.all(PROFILE_OWNED.map((name) => deleteValueOnAdaptersVerbose(keys, name)))
  const anselReset = await regSetVerbose(ANSEL_KEY, 'AnselEnable', 'REG_DWORD', '1')
  // Un "delete" que falla porque el valor ya no existia es un resultado
  // esperado (idempotente), no un error real: por eso el ok/error final de
  // esta funcion es solo informativo para logging, y el resultado real de
  // applyNvidiaProfile() se decide con registryMatchesClearedState().
  const failed = [...deletes, anselReset].find((r) => !r.ok)
  return { ok: !failed, error: failed?.error }
}

export async function applyNvidiaProfile(id: NvidiaProfileId | null): Promise<TweakResult> {
  const keys = await findGpuAdapterKeys('NVIDIA')
  if (keys.length === 0) {
    return {
      ok: false,
      verified: false,
      error: 'No se detecto una GPU NVIDIA.',
      message: 'No se detecto una GPU NVIDIA.'
    }
  }

  const clear = await clearProfileValues(keys)
  if (clear.error) {
    console.error(`[nvidiaProfiles] aviso al limpiar el perfil anterior: ${clear.error}`)
  }

  if (!id) {
    const verified = await registryMatchesClearedState(keys)
    if (verified) {
      persistMarker(null)
    } else {
      console.error('[nvidiaProfiles] no se pudo confirmar en el registro que el perfil se restauro')
    }
    return {
      ok: verified,
      verified,
      error: verified
        ? undefined
        : 'La relectura del registro no confirma que los valores se hayan restaurado.',
      message: verified
        ? 'Perfil NVIDIA restaurado y confirmado en el registro.'
        : 'Se intento restaurar el perfil pero no se pudo confirmar en el registro (revisa permisos de administrador).'
    }
  }

  const pack = PACKS[id]
  const writes: { ok: boolean; error?: string }[] = []
  if (pack.powerMizerLevelAC) {
    writes.push(await setValueOnAdaptersVerbose(keys, 'PowerMizerLevelAC', 'REG_DWORD', '1'))
    writes.push(await setValueOnAdaptersVerbose(keys, 'PowerMizerDefaultAC', 'REG_DWORD', '1'))
  }
  if (pack.disableDynamicPstate) {
    writes.push(await setValueOnAdaptersVerbose(keys, 'DisableDynamicPstate', 'REG_DWORD', '1'))
  }
  if (pack.disableAnsel) {
    writes.push(await regSetVerbose(ANSEL_KEY, 'AnselEnable', 'REG_DWORD', '0'))
  }

  const failedWrite = writes.find((w) => !w.ok)
  if (failedWrite) {
    console.error(`[nvidiaProfiles] fallo al escribir el perfil ${id}: ${failedWrite.error}`)
    return {
      ok: false,
      verified: false,
      error: failedWrite.error ?? 'Error desconocido al escribir en el registro.',
      message: `No se pudo aplicar el perfil (revisa permisos de administrador). ${failedWrite.error ?? ''}`.trim()
    }
  }

  const verified = await registryMatchesPack(keys, pack)
  if (verified) {
    persistMarker(id)
  } else {
    console.error(
      `[nvidiaProfiles] el perfil ${id} se escribio sin error reportado, pero la verificacion post-aplicacion no coincide con lo esperado`
    )
  }

  return {
    ok: verified,
    verified,
    error: verified
      ? undefined
      : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado (el driver puede haberlo rechazado).',
    message: verified
      ? 'Perfil NVIDIA aplicado y confirmado en el registro. Reinicia o relanza el juego para notarlo.'
      : 'Se escribio el perfil pero no se pudo confirmar en el registro. Puede que el driver lo haya rechazado.'
  }
}

// nvidiaDriverPerfEnabled/setNvidiaDriverPerf se migraron en la Fase 2 a
// gpuDwordTweak.ts. El tweak de catalogo 'nvidiaDriverPerf' se retiro en la
// Fase 7 (PowerMizer/PerfLevelSrc legacy); los perfiles de este modulo siguen.
