import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { getSnapshot } from './monitor'
import { startGameWatcher } from './games'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#0a0e18',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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
  const startPolling = (): void => {
    if (pollTimer) return
    pollTimer = setInterval(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        const snapshot = await getSnapshot()
        mainWindow.webContents.send('sysinfo:update', snapshot)
      } catch {
        // se ignora un fallo puntual de lectura de sensores
      }
    }, 1500)
  }
  mainWindow.webContents.on('did-finish-load', startPolling)

  mainWindow.on('closed', () => {
    if (pollTimer) clearInterval(pollTimer)
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow)
  createWindow()
  startGameWatcher((message) => {
    mainWindow?.webContents.send('games:notification', message)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
