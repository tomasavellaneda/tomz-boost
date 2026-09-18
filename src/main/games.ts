import { app, dialog, BrowserWindow } from 'electron'
import { basename } from 'path'
import { randomUUID } from 'crypto'
import { JsonStore } from './utils/store'
import { runPowerShellJson } from './utils/shell'
import { setProcessTuning, getCpuTopology } from './affinity'
import { isAutoCpuSetEnabled } from './tweaks/autoCpuSet'
import type { GameEntry, GameProfileKey, GamesOpResult } from '../shared/types'

const store = new JsonStore<GameEntry[]>('games.json', [])

async function extractExeIcon(exePath: string): Promise<string | null> {
  try {
    const image = await app.getFileIcon(exePath, { size: 'large' })
    return image.toDataURL()
  } catch {
    return null
  }
}

/**
 * Persiste games.json. Si writeFileSync falla, el cache de JsonStore no se
 * pisa: devolvemos el ultimo estado realmente en disco, no el que se intento guardar.
 */
function saveGames(next: GameEntry[]): GamesOpResult {
  try {
    store.set(next)
    return { ok: true, games: next, message: 'Lista de juegos guardada.' }
  } catch (err) {
    console.error(`[games] fallo al guardar games.json: ${String(err)}`)
    return {
      ok: false,
      games: store.get(),
      error: String(err),
      message: `No se pudo guardar la lista de juegos. ${String(err)}`
    }
  }
}

function failGames(op: string, err: unknown): GamesOpResult {
  console.error(`[games] fallo en ${op}: ${String(err)}`)
  return {
    ok: false,
    games: store.get(),
    error: String(err),
    message: `No se pudo completar ${op}. ${String(err)}`
  }
}

export async function listGames(): Promise<GamesOpResult> {
  try {
    const all = store.get()
    let changed = false
    const next = await Promise.all(
      all.map(async (g) => {
        if (g.iconDataUrl) return g
        const icon = await extractExeIcon(g.exePath)
        if (!icon) return g
        changed = true
        return { ...g, iconDataUrl: icon }
      })
    )
    if (changed) return saveGames(next)
    return { ok: true, games: next, message: 'Lista de juegos cargada.' }
  } catch (err) {
    return failGames('listGames', err)
  }
}

export async function addGame(win: BrowserWindow): Promise<GamesOpResult> {
  try {
    const res = await dialog.showOpenDialog(win, {
      title: 'Elegi el ejecutable del juego',
      filters: [{ name: 'Ejecutables', extensions: ['exe'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return listGames()
    const exePath = res.filePaths[0]
    const exeName = basename(exePath)
    const entry: GameEntry = {
      id: randomUUID(),
      name: exeName.replace(/\.exe$/i, ''),
      exePath,
      exeName,
      profile: 'citizenClean',
      autoWatch: false,
      lastAppliedAt: null,
      iconDataUrl: await extractExeIcon(exePath)
    }
    return saveGames([...store.get(), entry])
  } catch (err) {
    return failGames('addGame', err)
  }
}

export function removeGame(id: string): GamesOpResult {
  try {
    return saveGames(store.get().filter((g) => g.id !== id))
  } catch (err) {
    return failGames('removeGame', err)
  }
}

export function setAutoWatch(id: string, enabled: boolean): GamesOpResult {
  try {
    return saveGames(store.get().map((g) => (g.id === id ? { ...g, autoWatch: enabled } : g)))
  } catch (err) {
    return failGames('setAutoWatch', err)
  }
}

export function setProfile(id: string, profile: GameProfileKey): GamesOpResult {
  try {
    return saveGames(store.get().map((g) => (g.id === id ? { ...g, profile } : g)))
  } catch (err) {
    return failGames('setProfile', err)
  }
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

export async function applyProfileNow(id: string): Promise<{ ok: boolean; message: string; error?: string }> {
  try {
    const game = store.get().find((g) => g.id === id)
    if (!game) return { ok: false, message: 'Juego no encontrado.' }
    const pid = await findRunningPid(game.exeName)
    if (!pid) return { ok: false, message: `${game.name} no esta corriendo ahora mismo.` }

    const spec = PROFILES[game.profile]
    const affinityMask = spec.useTopCores ? (await getCpuTopology()).pCoreMask : undefined
    const result = await setProcessTuning(pid, { priority: spec.priority, affinityMask })

    const all = store.get().map((g) => (g.id === id ? { ...g, lastAppliedAt: Date.now() } : g))
    try {
      store.set(all)
    } catch (err) {
      console.error(`[games] fallo al guardar lastAppliedAt de '${id}': ${String(err)}`)
      return {
        ok: false,
        error: String(err),
        message: `${game.name}: ${result.message} (no se pudo guardar el estado: ${String(err)})`
      }
    }

    return { ok: result.ok, message: `${game.name}: ${result.message}` }
  } catch (err) {
    console.error(`[games] fallo al aplicar perfil '${id}': ${String(err)}`)
    return { ok: false, error: String(err), message: `No se pudo aplicar el perfil. ${String(err)}` }
  }
}

let watcherHandle: NodeJS.Timeout | null = null

export function startGameWatcher(onEvent: (message: string) => void): void {
  if (watcherHandle) return
  watcherHandle = setInterval(async () => {
    if (!isAutoCpuSetEnabled()) return
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
