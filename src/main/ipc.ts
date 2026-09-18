import { app, ipcMain, BrowserWindow, shell } from 'electron'
import { getSnapshot, getLastSnapshot, getBiosInfo, getDiagnostics } from './monitor'
import { listTweaks, peekTweaksCache, listTweaksSkeleton, toggleTweak, applyRecommendedTweaks } from './tweaks/catalog'
import { getWin32PriorityPreset, applyWin32PriorityPreset, resetWin32PriorityToDefault } from './tweaks/win32Priority'
import { listDebloatable, removeDebloatable, listDebloatBackups } from './debloat'
import { listDrivers } from './drivers'
import { exportBiosInfo, openExportFolder, runAutoConfig, importTweakProfile, enterFirmware } from './biosTool'
import { listTopProcesses, setProcessTuning, getCpuTopology, runAutoAffinity } from './affinity'
import { activateLicense, getLicenseStatus, isLicensed } from './license'
import { getDiscordProfile, setDiscordLang, setDiscordPage } from './discordPresence'
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

function deny(): { ok: false; message: string } {
  return { ok: false, message: 'La app no esta desbloqueada.' }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('license:status', () => getLicenseStatus())
  ipcMain.handle('license:activate', (_e, key: string) => {
    const res = activateLicense(String(key ?? ''))
    if (res.ok) setDiscordPage('inicio')
    return res
  })
  ipcMain.handle('discord:setPage', (_e, page: string) => {
    setDiscordPage(String(page ?? 'inicio'))
  })
  ipcMain.handle('discord:setLang', (_e, lang: string) => {
    setDiscordLang(String(lang ?? 'es'))
  })
  ipcMain.handle('discord:profile', () => getDiscordProfile())

  ipcMain.handle('sysinfo:snapshot', () => getLastSnapshot() ?? getSnapshot())
  ipcMain.handle('sysinfo:bios', () => getBiosInfo())
  ipcMain.handle('sysinfo:diagnostics', () => getDiagnostics())

  ipcMain.handle('tweaks:list', () => {
    const cached = peekTweaksCache()
    if (cached) {
      void listTweaks()
      return { tweaks: cached, ready: true }
    }
    void listTweaks().then((tweaks) => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('tweaks:update', tweaks)
    })
    return { tweaks: listTweaksSkeleton(), ready: false }
  })
  ipcMain.handle('tweaks:toggle', (_e, id: string, enabled: boolean) => {
    if (!isLicensed()) return deny()
    return toggleTweak(id, enabled)
  })
  ipcMain.handle('tweaks:applyRecommended', () => {
    if (!isLicensed()) return { ok: false, log: [deny().message], enabled: [], failed: [] }
    return applyRecommendedTweaks()
  })
  ipcMain.handle('tweaks:win32PriorityGet', () => getWin32PriorityPreset())
  ipcMain.handle('tweaks:win32PrioritySet', (_e, preset: string) => {
    if (!isLicensed()) return deny()
    return applyWin32PriorityPreset(preset)
  })
  ipcMain.handle('tweaks:win32PriorityReset', () => {
    if (!isLicensed()) return deny()
    return resetWin32PriorityToDefault()
  })

  ipcMain.handle('debloat:list', () => listDebloatable())
  ipcMain.handle('debloat:remove', (_e, packageNames: string[]) => {
    if (!isLicensed()) return { ok: false, log: [deny().message] }
    return removeDebloatable(packageNames)
  })
  ipcMain.handle('debloat:listRemoved', () => listDebloatBackups())

  ipcMain.handle('drivers:list', () => listDrivers())

  ipcMain.handle('bios:export', () => exportBiosInfo())
  ipcMain.handle('bios:openFolder', () => openExportFolder())
  ipcMain.handle('bios:autoConfig', () => {
    if (!isLicensed()) return { ok: false, log: [deny().message] }
    return runAutoConfig()
  })
  ipcMain.handle('bios:import', () => {
    if (!isLicensed()) return { ok: false, log: [deny().message] }
    const win = getWindow()
    if (!win) return { ok: false, log: ['Ventana no disponible.'] }
    return importTweakProfile(win)
  })
  ipcMain.handle('bios:enterFirmware', () => {
    if (!isLicensed()) return { ok: false, message: deny().message }
    return enterFirmware()
  })

  ipcMain.handle('affinity:processes', () => listTopProcesses())
  ipcMain.handle(
    'affinity:setProcess',
    (_e, pid: number, opts: { priority?: string; affinityMask?: string }) => {
      if (!isLicensed()) return deny()
      return setProcessTuning(pid, opts)
    }
  )
  ipcMain.handle('affinity:cpuTopology', () => getCpuTopology())
  ipcMain.handle('affinity:autoRun', () => {
    if (!isLicensed()) return deny()
    return runAutoAffinity()
  })

  ipcMain.handle('games:list', () => listGames())
  ipcMain.handle('games:add', () => {
    if (!isLicensed()) return listGames()
    const win = getWindow()
    if (!win) return listGames()
    return addGame(win)
  })
  ipcMain.handle('games:remove', (_e, id: string) => {
    if (!isLicensed()) return listGames()
    return removeGame(id)
  })
  ipcMain.handle('games:setAutoWatch', (_e, id: string, enabled: boolean) => {
    if (!isLicensed()) return listGames()
    return setAutoWatch(id, enabled)
  })
  ipcMain.handle('games:setProfile', (_e, id: string, profile: string) => {
    if (!isLicensed()) return listGames()
    return setProfile(id, profile as never)
  })
  ipcMain.handle('games:applyNow', (_e, id: string) => {
    if (!isLicensed()) return deny()
    return applyProfileNow(id)
  })

  ipcMain.handle('installers:checkWinget', () => checkWinget())
  ipcMain.handle('installers:catalog', () => getCatalog())
  ipcMain.handle('installers:install', (event, wingetId: string) => {
    if (!isLicensed()) return Promise.resolve({ ok: false })
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

  ipcMain.handle('system:runCleanup', () => {
    if (!isLicensed()) return { ok: false, freedMB: 0, message: deny().message }
    return runQuickCleanup()
  })
  ipcMain.handle('system:scanDisk', () => {
    if (!isLicensed()) return deny()
    return scanDisk()
  })
  ipcMain.handle('system:optimizeDrive', () => {
    if (!isLicensed()) return deny()
    return optimizeDrive()
  })
  ipcMain.handle('system:isElevated', () => isElevated())
  ipcMain.handle('system:version', () => app.getVersion())
  ipcMain.handle('system:relaunchAsAdmin', () => relaunchAsAdmin())
  ipcMain.handle('system:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('system:openPath', (_e, path: string) => shell.openPath(path))
}
