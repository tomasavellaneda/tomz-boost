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
} from '../../../shared/types'

export interface TomzBoostApi {
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
  sysinfo: {
    snapshot: () => Promise<SysSnapshot>
    bios: () => Promise<BiosInfo>
    diagnostics: () => Promise<unknown>
    onUpdate: (cb: (snapshot: SysSnapshot) => void) => () => void
  }
  tweaks: {
    list: () => Promise<TweakDef[]>
    toggle: (id: string, enabled: boolean) => Promise<TweakToggleResult>
  }
  debloat: {
    list: () => Promise<DebloatItem[]>
    remove: (packageNames: string[]) => Promise<{ ok: boolean; log: string[] }>
  }
  drivers: {
    list: () => Promise<DriverInfo[]>
  }
  bios: {
    export: () => Promise<{ ok: boolean; path?: string }>
    openFolder: () => Promise<void>
    autoConfig: () => Promise<{ ok: boolean; log: string[] }>
    import: () => Promise<{ ok: boolean; log: string[] }>
    enterFirmware: () => Promise<{ ok: boolean; message: string }>
  }
  affinity: {
    processes: () => Promise<ProcessInfo[]>
    setProcess: (pid: number, opts: { priority?: string; affinityMask?: string }) => Promise<{ ok: boolean; message: string }>
    cpuTopology: () => Promise<CpuTopology>
    autoRun: () => Promise<{ ok: boolean; message: string; target?: string }>
  }
  games: {
    list: () => Promise<GameEntry[]>
    add: () => Promise<GameEntry[]>
    remove: (id: string) => Promise<GameEntry[]>
    setAutoWatch: (id: string, enabled: boolean) => Promise<GameEntry[]>
    setProfile: (id: string, profile: string) => Promise<GameEntry[]>
    applyNow: (id: string) => Promise<{ ok: boolean; message: string }>
    onNotification: (cb: (message: string) => void) => () => void
  }
  installers: {
    checkWinget: () => Promise<boolean>
    catalog: () => Promise<InstallerApp[]>
    install: (wingetId: string) => Promise<{ ok: boolean }>
    onProgress: (cb: (event: InstallerProgressEvent) => void) => () => void
  }
  system: {
    runCleanup: () => Promise<{ ok: boolean; freedMB: number; message: string }>
    scanDisk: () => Promise<{ ok: boolean; message: string }>
    optimizeDrive: () => Promise<{ ok: boolean; message: string }>
    isElevated: () => Promise<boolean>
    relaunchAsAdmin: () => Promise<void>
    openExternal: (url: string) => Promise<void>
    openPath: (path: string) => Promise<void>
  }
}

declare global {
  interface Window {
    api: TomzBoostApi
  }
}
