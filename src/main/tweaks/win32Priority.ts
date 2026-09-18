import { regQueryDword, regSetVerbose, regDeleteVerbose } from '../utils/registry'
import { requireElevated } from '../utils/elevation'
import type { TweakResult } from '../../shared/types'

const KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl'
const VALUE = 'Win32PrioritySeparation'

// Solo valores documentados/reales para este DWORD (rango valido 0x00-0x3F).
// "FFFF311" que aparecia en una captura de referencia no es un valor de
// Windows valido: escribirlo literal metia un numero fuera de rango en el
// planificador y podia degradar el scheduling de TODOS los procesos,
// incluido el juego. Se saco de la lista.
export const WIN32_PRIORITY_PRESETS = ['18', '1A', '26', '28', '2A'] as const
export type Win32PriorityPreset = (typeof WIN32_PRIORITY_PRESETS)[number]

export async function resetWin32PriorityToDefault(): Promise<TweakResult> {
  const denied = await requireElevated()
  if (denied) return denied
  const del = await regDeleteVerbose(KEY, VALUE)
  if (!del.ok) {
    console.error(`[win32Priority] fallo al restaurar: ${del.error}`)
  }
  // Un delete que falla porque el valor ya no existia es el resultado
  // esperado: la verificacion real es releer y confirmar que no esta.
  const verified = (await regQueryDword(KEY, VALUE)) === null
  if (!verified) {
    console.error('[win32Priority] no se pudo confirmar la restauracion (el valor sigue presente en el registro)')
  }
  return {
    ok: verified,
    verified,
    error: verified ? undefined : (del.error ?? 'El valor sigue presente en el registro tras intentar borrarlo.'),
    message: verified ? 'Restaurado al valor por defecto de Windows.' : 'No se pudo confirmar la restauracion en el registro.'
  }
}

export async function getWin32PriorityPreset(): Promise<string | null> {
  const decimal = await regQueryDword(KEY, VALUE)
  if (decimal === null) return null
  const hex = decimal.toString(16).toUpperCase()
  return WIN32_PRIORITY_PRESETS.find((p) => p === hex) ?? hex
}

export async function applyWin32PriorityPreset(preset: string): Promise<TweakResult> {
  const denied = await requireElevated()
  if (denied) return denied
  const write = await regSetVerbose(KEY, VALUE, 'REG_DWORD', `0x${preset}`)
  if (!write.ok) {
    console.error(`[win32Priority] fallo al escribir 0x${preset}: ${write.error}`)
    return {
      ok: false,
      verified: false,
      error: write.error ?? 'Error desconocido al escribir en el registro.',
      message: `No se pudo aplicar el preset (revisa permisos de administrador). ${write.error ?? ''}`.trim()
    }
  }

  const expected = parseInt(preset, 16)
  const verified = (await regQueryDword(KEY, VALUE)) === expected
  if (!verified) {
    console.error(`[win32Priority] no se pudo confirmar 0x${preset} tras escribirlo`)
  }

  return {
    ok: verified,
    verified,
    error: verified ? undefined : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado.',
    message: verified
      ? `Win32PrioritySeparation aplicado (0x${preset}). Reinicia sesion para notar el efecto completo.`
      : 'Se aplico el cambio pero no se pudo confirmar en el registro.'
  }
}
