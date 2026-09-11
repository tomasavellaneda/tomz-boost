import { ipcMain, BrowserWindow, shell } from 'electron'
import { getSnapshot, getBiosInfo, getDiagnostics } from './monitor'
import { listTweaks, toggleTweak } from './tweaks/catalog'
import { getWin32PriorityPreset, applyWin32PriorityPreset } from './tweaks/win32Priority'
import { listDebloatable, removeDebloatable } from './debloat'
import { listDrivers } from './drivers'
import { exportBiosInfo, openExportFolder, runAutoConfig, importTweakProfile, enterFirmware } from './biosTool'
import { listTopProcesses, setProcessTuning, getCpuTopology, runAutoAffinity } from './affinity'
import {
  listGames,
  addGame,
  removeGame,
  setAutoWatch,
  setProfile,
  applyProfileNow
} from './games'
import { checkWinget, getCatalog, installApp } from './installers'
import { runQuickCleanup, scanDisk, optimizeDrive } from './cleanup'
import { isElevated, relaunchAsAdmin } from './utils/elevation'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('sysinfo:snapshot', () => getSnapshot())
  ipcMain.handle('sysinfo:bios', () => getBiosInfo())
  ipcMain.handle('sysinfo:diagnostics', () => getDiagnostics())

  ipcMain.handle('tweaks:list', () => listTweaks())
  ipcMain.handle('tweaks:toggle', (_e, id: string, enabled: boolean) => toggleTweak(id, enabled))
  ipcMain.handle('tweaks:win32PriorityGet', () => getWin32PriorityPreset())
  ipcMain.handle('tweaks:win32PrioritySet', (_e, preset: string) => applyWin32PriorityPreset(preset))

  ipcMain.handle('debloat:list', () => listDebloatable())
  ipcMain.handle('debloat:remove', (_e, packageNames: string[]) => removeDebloatable(packageNames))

  ipcMain.handle('drivers:list', () => listDrivers())

  ipcMain.handle('bios:export', () => exportBiosInfo())
  ipcMain.handle('bios:openFolder', () => openExportFolder())
  ipcMain.handle('bios:autoConfig', () => runAutoConfig())
  ipcMain.handle('bios:import', () => {
    const win = getWindow()
    if (!win) return { ok: false, log: ['Ventana no disponible.'] }
    return importTweakProfile(win)
  })
  ipcMain.handle('bios:enterFirmware', () => enterFirmware())

  ipcMain.handle('affinity:processes', () => listTopProcesses())
  ipcMain.handle(
    'affinity:setProcess',
    (_e, pid: number, opts: { priority?: string; affinityMask?: string }) => setProcessTuning(pid, opts)
  )
  ipcMain.handle('affinity:cpuTopology', () => getCpuTopology())
  ipcMain.handle('affinity:autoRun', () => runAutoAffinity())

  ipcMain.handle('games:list', () => listGames())
  ipcMain.handle('games:add', () => {
    const win = getWindow()
    if (!win) return listGames()
    return addGame(win)
  })
  ipcMain.handle('games:remove', (_e, id: string) => removeGame(id))
  ipcMain.handle('games:setAutoWatch', (_e, id: string, enabled: boolean) => setAutoWatch(id, enabled))
  ipcMain.handle('games:setProfile', (_e, id: string, profile: string) => setProfile(id, profile as never))
  ipcMain.handle('games:applyNow', (_e, id: string) => applyProfileNow(id))

  ipcMain.handle('installers:checkWinget', () => checkWinget())
  ipcMain.handle('installers:catalog', () => getCatalog())
  ipcMain.handle('installers:install', (event, wingetId: string) => {
    const sender = event.sender
    return new Promise((resolve) => {
      installApp(
        wingetId,
        (line) => {
          if (!sender.isDestroyed()) sender.send('installers:progress', { wingetId, line })
        },
        (ok) => resolve({ ok })
      )
    })
  })

  ipcMain.handle('system:runCleanup', () => runQuickCleanup())
  ipcMain.handle('system:scanDisk', () => scanDisk())
  ipcMain.handle('system:optimizeDrive', () => optimizeDrive())
  ipcMain.handle('system:isElevated', () => isElevated())
  ipcMain.handle('system:relaunchAsAdmin', () => relaunchAsAdmin())
  ipcMain.handle('system:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('system:openPath', (_e, path: string) => shell.openPath(path))
}
