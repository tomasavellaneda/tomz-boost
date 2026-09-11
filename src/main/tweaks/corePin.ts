import { runPowerShellJson } from '../utils/shell'
import { setProcessTuning, getCpuTopology } from '../affinity'
import { JsonStore } from '../utils/store'

const store = new JsonStore<{ enabled: boolean }>('corepin.json', { enabled: false })

// Apps conocidas que no son criticas para el sistema: se les puede pinear a
// los nucleos "lentos" para liberar los rapidos para el juego/foreground.
const BACKGROUND_TARGETS = ['Discord', 'Spotify', 'chrome', 'msedge', 'Steam', 'EpicGamesLauncher', 'OneDrive']

interface ProcRow {
  Id: number
  ProcessName: string
}

let handle: NodeJS.Timeout | null = null

export function isCorePinEnabled(): boolean {
  return store.get().enabled
}

export function setCorePinEnabled(enabled: boolean): void {
  store.set({ enabled })
  if (enabled) start()
  else stop()
}

function start(): void {
  if (handle) return
  handle = setInterval(async () => {
    try {
      const topology = await getCpuTopology()
      const rows = await runPowerShellJson<ProcRow[]>(
        `Get-Process | Where-Object { $_.ProcessName -in @('${BACKGROUND_TARGETS.join("','")}') } | Select-Object Id, ProcessName`
      )
      const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
      for (const row of arr) {
        await setProcessTuning(row.Id, { affinityMask: topology.eCoreMask })
      }
    } catch {
      // se ignora un fallo puntual del watcher
    }
  }, 20_000)
}

function stop(): void {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
}

/** Arranca el watcher al iniciar la app si ya estaba activado en una sesion anterior. */
export function initCorePinWatcher(): void {
  if (store.get().enabled) start()
}
