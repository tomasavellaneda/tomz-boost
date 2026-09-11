import { JsonStore } from '../utils/store'

type BackupMap = Record<string, unknown>

const store = new JsonStore<BackupMap>('tweak-backups.json', {})

export function saveBackup(id: string, value: unknown): void {
  const all = store.get()
  all[id] = value
  store.set(all)
}

export function getBackup<T>(id: string): T | undefined {
  return store.get()[id] as T | undefined
}

export function clearBackup(id: string): void {
  const all = store.get()
  delete all[id]
  store.set(all)
}
