import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { getSnapshot, getLastSnapshot, loadStaticInfo } from './monitor'
import { startGameWatcher } from './games'
import { initCorePinWatcher } from './tweaks/corePin'
import { warmupTweaks } from './tweaks/catalog'
import { retireLegacyTweaks } from './tweaks/retireLegacyTweaks'
import { findGpuAdapterKeys } from './tweaks/gpuRegistry'
import { onDiscordProfile, startDiscordPresence, stopDiscordPresence } from './discordPresence'
import { initLicense } from './license'

const APP_NAME = 'Tomz Boost'
const APP_USER_MODEL_ID = 'com.tomzboost.app'

let mainWindow: BrowserWindow | null = null

function resolveAppIcon(): string | undefined {
  const candidates = [
    join(__dirname, '../../build/icon.ico'),
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'build', 'icon.ico')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    show: false,
    frame: false,
    title: APP_NAME,
    backgroundColor: '#111111',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.setTitle(APP_NAME)

  const reveal = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.show()
  }
  mainWindow.once('ready-to-show', reveal)
  const onPainted = (): void => reveal()
  ipcMain.on('boot:painted', onPainted)
  const revealFallback = setTimeout(reveal, 2500)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())

  let pollTimer: NodeJS.Timeout | null = null
  let polling = false
  const pushSnapshot = async (): Promise<void> => {
    if (!mainWindow || mainWindow.isDestroyed() || polling) return
    polling = true
    try {
      const snapshot = await getSnapshot()
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('sysinfo:update', snapshot)
    } catch {
      // se ignora un fallo puntual de lectura de sensores
    } finally {
      polling = false
    }
  }
  const startPolling = (): void => {
    if (pollTimer) return
    void pushSnapshot()
    pollTimer = setInterval(() => {
      void pushSnapshot()
    }, 2000)
  }
  mainWindow.webContents.on('did-finish-load', startPolling)

  mainWindow.on('closed', () => {
    ipcMain.removeListener('boot:painted', onPainted)
    clearTimeout(revealFallback)
    if (pollTimer) clearInterval(pollTimer)
    mainWindow = null
  })
}

app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

app.whenReady().then(async () => {
  await initLicense()
  registerIpcHandlers(() => mainWindow)
  void retireLegacyTweaks()
    .then(() => Promise.all([loadStaticInfo().then(() => getSnapshot()), findGpuAdapterKeys('NVIDIA'), warmupTweaks()]))
    .then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const snapshot = getLastSnapshot()
        if (snapshot) mainWindow.webContents.send('sysinfo:update', snapshot)
      }
    })
    .catch(() => undefined)
  createWindow()
  onDiscordProfile((profile) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('discord:profile', profile)
  })
  startDiscordPresence()
  startGameWatcher((message) => {
    mainWindow?.webContents.send('games:notification', message)
  })
  initCorePinWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDiscordPresence()
  if (process.platform !== 'darwin') app.quit()
})
