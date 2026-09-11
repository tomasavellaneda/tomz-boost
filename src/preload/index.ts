import { contextBridge, ipcRenderer } from 'electron'
import type {
  SysSnapshot,
  BiosInfo,
  TweakDef,
  TweakToggleResult,
  DebloatItem,
  DriverInfo,
  ProcessInfo,
  CpuTopology,
  GameEntry,
  InstallerApp,
  InstallerProgressEvent
} from '../shared/types'

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  sysinfo: {
    snapshot: (): Promise<SysSnapshot> => ipcRenderer.invoke('sysinfo:snapshot'),
    bios: (): Promise<BiosInfo> => ipcRenderer.invoke('sysinfo:bios'),
    diagnostics: (): Promise<unknown> => ipcRenderer.invoke('sysinfo:diagnostics'),
    onUpdate: (cb: (snapshot: SysSnapshot) => void) => {
      const listener = (_: unknown, data: SysSnapshot): void => cb(data)
      ipcRenderer.on('sysinfo:update', listener)
      return () => ipcRenderer.removeListener('sysinfo:update', listener)
    }
  },
  tweaks: {
    list: (): Promise<TweakDef[]> => ipcRenderer.invoke('tweaks:list'),
    toggle: (id: string, enabled: boolean): Promise<TweakToggleResult> =>
      ipcRenderer.invoke('tweaks:toggle', id, enabled)
  },
  debloat: {
    list: (): Promise<DebloatItem[]> => ipcRenderer.invoke('debloat:list'),
    remove: (packageNames: string[]): Promise<{ ok: boolean; log: string[] }> =>
      ipcRenderer.invoke('debloat:remove', packageNames)
  },
  drivers: {
    list: (): Promise<DriverInfo[]> => ipcRenderer.invoke('drivers:list')
  },
  bios: {
    export: (): Promise<{ ok: boolean; path?: string }> => ipcRenderer.invoke('bios:export'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('bios:openFolder'),
    autoConfig: (): Promise<{ ok: boolean; log: string[] }> => ipcRenderer.invoke('bios:autoConfig'),
    import: (): Promise<{ ok: boolean; log: string[] }> => ipcRenderer.invoke('bios:import'),
    enterFirmware: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('bios:enterFirmware')
  },
  affinity: {
    processes: (): Promise<ProcessInfo[]> => ipcRenderer.invoke('affinity:processes'),
    setProcess: (pid: number, opts: { priority?: string; affinityMask?: string }) =>
      ipcRenderer.invoke('affinity:setProcess', pid, opts),
    cpuTopology: (): Promise<CpuTopology> => ipcRenderer.invoke('affinity:cpuTopology'),
    autoRun: (): Promise<{ ok: boolean; message: string; target?: string }> =>
      ipcRenderer.invoke('affinity:autoRun')
  },
  games: {
    list: (): Promise<GameEntry[]> => ipcRenderer.invoke('games:list'),
    add: (): Promise<GameEntry[]> => ipcRenderer.invoke('games:add'),
    remove: (id: string): Promise<GameEntry[]> => ipcRenderer.invoke('games:remove', id),
    setAutoWatch: (id: string, enabled: boolean): Promise<GameEntry[]> =>
      ipcRenderer.invoke('games:setAutoWatch', id, enabled),
    setProfile: (id: string, profile: string): Promise<GameEntry[]> =>
      ipcRenderer.invoke('games:setProfile', id, profile),
    applyNow: (id: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('games:applyNow', id),
    onNotification: (cb: (message: string) => void) => {
      const listener = (_: unknown, message: string): void => cb(message)
      ipcRenderer.on('games:notification', listener)
      return () => ipcRenderer.removeListener('games:notification', listener)
    }
  },
  installers: {
    checkWinget: (): Promise<boolean> => ipcRenderer.invoke('installers:checkWinget'),
    catalog: (): Promise<InstallerApp[]> => ipcRenderer.invoke('installers:catalog'),
    install: (wingetId: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('installers:install', wingetId),
    onProgress: (cb: (event: InstallerProgressEvent) => void) => {
      const listener = (_: unknown, data: { wingetId: string; line: string }): void =>
        cb({ id: data.wingetId, status: 'running', line: data.line })
      ipcRenderer.on('installers:progress', listener)
      return () => ipcRenderer.removeListener('installers:progress', listener)
    }
  },
  system: {
    runCleanup: (): Promise<{ ok: boolean; freedMB: number; message: string }> =>
      ipcRenderer.invoke('system:runCleanup'),
    scanDisk: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('system:scanDisk'),
    optimizeDrive: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('system:optimizeDrive'),
    isElevated: (): Promise<boolean> => ipcRenderer.invoke('system:isElevated'),
    relaunchAsAdmin: (): Promise<void> => ipcRenderer.invoke('system:relaunchAsAdmin'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),
    openPath: (path: string): Promise<void> => ipcRenderer.invoke('system:openPath', path)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
