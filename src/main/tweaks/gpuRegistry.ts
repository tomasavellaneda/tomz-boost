import { regListSubkeys, regQuery, regSet, RegType } from '../utils/registry'

const DISPLAY_CLASS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'

/** Devuelve las claves de registro (una por adaptador) cuyo DriverDesc contiene el fabricante dado. */
export async function findGpuAdapterKeys(vendorMatch: string): Promise<string[]> {
  const subkeys = await regListSubkeys(DISPLAY_CLASS_KEY)
  const matches: string[] = []
  for (const key of subkeys) {
    const desc = await regQuery(key, 'DriverDesc')
    if (desc && desc.toUpperCase().includes(vendorMatch.toUpperCase())) {
      matches.push(key)
    }
  }
  return matches
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
