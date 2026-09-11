import { regListSubkeys, regQuery, regSet, RegType } from '../utils/registry'

const DISPLAY_CLASS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'

// La estructura de subclaves de la GPU no cambia durante la sesion, asi que
// cachear evita decenas de spawns de reg.exe repetidos (era el mayor cuello
// de botella de la pantalla de Tweaks).
async function getAllAdapterKeysWithDesc(): Promise<{ key: string; desc: string }[]> {
  const subkeys = await regListSubkeys(DISPLAY_CLASS_KEY)
  const descs = await Promise.all(subkeys.map((k) => regQuery(k, 'DriverDesc')))
  return subkeys.map((key, i) => ({ key, desc: descs[i] || '' }))
}

let resolvedAdapters: { key: string; desc: string }[] | null = null

/** Devuelve las claves de registro (una por adaptador) cuyo DriverDesc contiene el fabricante dado. */
export async function findGpuAdapterKeys(vendorMatch: string): Promise<string[]> {
  if (!resolvedAdapters) {
    resolvedAdapters = await getAllAdapterKeysWithDesc()
  }
  return resolvedAdapters.filter((a) => a.desc.toUpperCase().includes(vendorMatch.toUpperCase())).map((a) => a.key)
}

export async function setValueOnAdapters(
  adapterKeys: string[],
  valueName: string,
  type: RegType,
  data: string
): Promise<boolean> {
  if (adapterKeys.length === 0) return false
  const results = await Promise.all(adapterKeys.map((k) => regSet(k, valueName, type, data)))
  return results.every(Boolean)
}
