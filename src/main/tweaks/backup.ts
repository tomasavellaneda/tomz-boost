import { JsonStore } from '../utils/store'

type BackupMap = Record<string, unknown>

const store = new JsonStore<BackupMap>('tweak-backups.json', {})

export interface BackupOpResult {
  ok: boolean
  error?: string
}

/**
 * Debe chequearse el `ok` ANTES de aplicar el cambio destructivo que este
 * backup respalda: si falla (ej. permisos/disco lleno en userData), no hay
 * forma de revertir despues, asi que el llamador tiene que abortar en vez de
 * seguir. Antes esta funcion era `void` y una falla de escritura solo se
 * notaba por accidente (via el catch generico de toggleTweak, cuando la
 * excepcion sin capturar abortaba todo `apply()`), sin log especifico ni
 * mensaje claro para el usuario.
 */
export function saveBackup(id: string, value: unknown): BackupOpResult {
  try {
    const all = store.get()
    all[id] = value
    store.set(all)
    return { ok: true }
  } catch (err) {
    console.error(`[backup] fallo al guardar backup '${id}': ${String(err)}`)
    return { ok: false, error: String(err) }
  }
}

export function getBackup<T>(id: string): T | undefined {
  return store.get()[id] as T | undefined
}

export function clearBackup(id: string): BackupOpResult {
  try {
    const all = store.get()
    delete all[id]
    store.set(all)
    return { ok: true }
  } catch (err) {
    console.error(`[backup] fallo al borrar backup '${id}': ${String(err)}`)
    return { ok: false, error: String(err) }
  }
}
