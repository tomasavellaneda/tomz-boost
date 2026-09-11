import { dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { randomUUID } from 'crypto'
import { JsonStore } from './utils/store'
import { runPowerShellJson } from './utils/shell'
import { setProcessTuning, getCpuTopology } from './affinity'
import type { GameEntry, GameProfileKey } from '../shared/types'

const store = new JsonStore<GameEntry[]>('games.json', [])

export function listGames(): GameEntry[] {
  return store.get()
}

export async function addGame(win: BrowserWindow): Promise<GameEntry[]> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Elegi el ejecutable del juego',
    filters: [{ name: 'Ejecutables', extensions: ['exe'] }],
    properties: ['openFile']
  })
  if (res.canceled || res.filePaths.length === 0) return store.get()
  const exePath = res.filePaths[0]
  const exeName = basename(exePath)
  const entry: GameEntry = {
    id: randomUUID(),
    name: exeName.replace(/\.exe$/i, ''),
    exePath,
    exeName,
    profile: 'citizenClean',
    autoWatch: false,
    lastAppliedAt: null
  }
  const all = [...store.get(), entry]
  store.set(all)
  return all
}

export function removeGame(id: string): GameEntry[] {
  const all = store.get().filter((g) => g.id !== id)
  store.set(all)
  return all
}

export function setAutoWatch(id: string, enabled: boolean): GameEntry[] {
  const all = store.get().map((g) => (g.id === id ? { ...g, autoWatch: enabled } : g))
  store.set(all)
  return all
}

export function setProfile(id: string, profile: GameProfileKey): GameEntry[] {
  const all = store.get().map((g) => (g.id === id ? { ...g, profile } : g))
  store.set(all)
  return all
}

interface ProfileSpec {
  priority: string
  useTopCores: boolean
}

const PROFILES: Record<GameProfileKey, ProfileSpec> = {
  citizenPriv: { priority: 'Por encima de lo normal', useTopCores: false },
  citizenFps: { priority: 'Alta', useTopCores: true },
  citizenClean: { priority: 'Normal', useTopCores: false }
}

async function findRunningPid(exeName: string): Promise<number | null> {
  const name = exeName.replace(/\.exe$/i, '')
  const row = await runPowerShellJson<{ Id: number } | { Id: number }[]>(
    `Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Select-Object -First 1 Id`
  )
  if (!row) return null
  const single = Array.isArray(row) ? row[0] : row
  return single?.Id ?? null
}

export async function applyProfileNow(id: string): Promise<{ ok: boolean; message: string }> {
  const game = store.get().find((g) => g.id === id)
  if (!game) return { ok: false, message: 'Juego no encontrado.' }
  const pid = await findRunningPid(game.exeName)
  if (!pid) return { ok: false, message: `${game.name} no esta corriendo ahora mismo.` }

  const spec = PROFILES[game.profile]
  const affinityMask = spec.useTopCores ? (await getCpuTopology()).pCoreMask : undefined
  const result = await setProcessTuning(pid, { priority: spec.priority, affinityMask })

  const all = store.get().map((g) => (g.id === id ? { ...g, lastAppliedAt: Date.now() } : g))
  store.set(all)

  return { ok: result.ok, message: `${game.name}: ${result.message}` }
}

let watcherHandle: NodeJS.Timeout | null = null

export function startGameWatcher(onEvent: (message: string) => void): void {
  if (watcherHandle) return
  watcherHandle = setInterval(async () => {
    const games = store.get().filter((g) => g.autoWatch)
    for (const game of games) {
      const pid = await findRunningPid(game.exeName)
      if (!pid) continue
      const recentlyApplied = game.lastAppliedAt && Date.now() - game.lastAppliedAt < 60_000
      if (recentlyApplied) continue
      const result = await applyProfileNow(game.id)
      onEvent(result.message)
    }
  }, 15_000)
}

export function stopGameWatcher(): void {
  if (watcherHandle) {
    clearInterval(watcherHandle)
    watcherHandle = null
  }
}

export async function isGameRunning(exeName: string): Promise<boolean> {
  return (await findRunningPid(exeName)) !== null
}