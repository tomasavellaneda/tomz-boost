import { regQuery, regSet } from '../utils/registry'

const KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl'
const VALUE = 'Win32PrioritySeparation'

export const WIN32_PRIORITY_PRESETS = ['1A', '2A', '26', '28', 'FFFF311'] as const
export type Win32PriorityPreset = (typeof WIN32_PRIORITY_PRESETS)[number]

export async function getWin32PriorityPreset(): Promise<string | null> {
  const raw = await regQuery(KEY, VALUE)
  if (!raw) return null
  const decimal = parseInt(raw, 10)
  if (Number.isNaN(decimal)) return null
  const hex = decimal.toString(16).toUpperCase()
  return WIN32_PRIORITY_PRESETS.find((p) => p === hex) ?? hex
}

export async function applyWin32PriorityPreset(preset: string): Promise<{ ok: boolean; message: string }> {
  const ok = await regSet(KEY, VALUE, 'REG_DWORD', `0x${preset}`)
  return {
    ok,
    message: ok
      ? `Win32PrioritySeparation aplicado (0x${preset}). Reinicia sesion para notar el efecto completo.`
      : 'No se pudo aplicar el preset.'
  }
}
