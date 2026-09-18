import {
  regListSubkeys,
  regQuery,
  regSet,
  regDelete,
  regSetVerbose,
  regDeleteVerbose,
  type RegType,
  type RegOpResult
} from '../utils/registry'

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
    const listed = await getAllAdapterKeysWithDesc()
    // No cachear una enumeracion vacia: en el primer arranque post-reboot
    // reg.exe puede fallar y dejar NVIDIA/AMD como "no detectado" toda la sesion.
    if (listed.length > 0) resolvedAdapters = listed
    return listed.filter((a) => a.desc.toUpperCase().includes(vendorMatch.toUpperCase())).map((a) => a.key)
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

/**
 * Borra el valor en vez de escribir un "alternativo" hardcodeado. Es el
 * revert mas seguro para estos hacks de registro legacy de GPU: al no existir
 * la clave, el driver vuelve a manejar el estado con su propio default en vez
 * de quedar atado a un valor que nosotros inventamos.
 */
export async function deleteValueOnAdapters(adapterKeys: string[], valueName: string): Promise<boolean> {
  if (adapterKeys.length === 0) return false
  const results = await Promise.all(adapterKeys.map((k) => regDelete(k, valueName)))
  return results.every(Boolean)
}

/**
 * Igual que setValueOnAdapters, pero devuelve el error real (stderr de
 * reg.exe) del primer adaptador que fallo en vez de un booleano ciego.
 */
export async function setValueOnAdaptersVerbose(
  adapterKeys: string[],
  valueName: string,
  type: RegType,
  data: string
): Promise<RegOpResult> {
  if (adapterKeys.length === 0) return { ok: false, error: 'No hay adaptadores de GPU detectados.' }
  const results = await Promise.all(adapterKeys.map((k) => regSetVerbose(k, valueName, type, data)))
  const failed = results.find((r) => !r.ok)
  return failed ? { ok: false, error: failed.error } : { ok: true }
}

/** Igual que deleteValueOnAdapters, pero devuelve el error real por adaptador. */
export async function deleteValueOnAdaptersVerbose(
  adapterKeys: string[],
  valueName: string
): Promise<RegOpResult> {
  if (adapterKeys.length === 0) return { ok: false, error: 'No hay adaptadores de GPU detectados.' }
  const results = await Promise.all(adapterKeys.map((k) => regDeleteVerbose(k, valueName)))
  const failed = results.find((r) => !r.ok)
  return failed ? { ok: false, error: failed.error } : { ok: true }
}
