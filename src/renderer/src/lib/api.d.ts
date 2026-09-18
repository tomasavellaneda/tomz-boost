import type {
  SysSnapshot,
  BiosInfo,
  TweakDef,
  TweakToggleResult,
  RecommendedTweaksResult,
  DebloatItem,
  DebloatBackupEntry,
  DriverInfo,
  ProcessInfo,
  CpuTopology,
  GamesOpResult,
  InstallerApp,
  InstallerProgressEvent,
  DiscordProfile
} from '../../../shared/types'

export interface TomzBoostApi {
  window: {
    painted: () => void
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
    list: () => Promise<{ tweaks: TweakDef[]; ready: boolean }>
    toggle: (id: string, enabled: boolean) => Promise<TweakToggleResult>
    applyRecommended: () => Promise<RecommendedTweaksResult>
    getWin32Priority: () => Promise<string | null>
    setWin32Priority: (preset: string) => Promise<{ ok: boolean; message: string }>
    resetWin32Priority: () => Promise<{ ok: boolean; message: string }>
    onUpdate: (cb: (tweaks: TweakDef[]) => void) => () => void
  }
  debloat: {
    list: () => Promise<DebloatItem[]>
    remove: (packageNames: string[]) => Promise<{ ok: boolean; log: string[] }>
    listRemoved: () => Promise<DebloatBackupEntry[]>
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
    list: () => Promise<GamesOpResult>
    add: () => Promise<GamesOpResult>
    remove: (id: string) => Promise<GamesOpResult>
    setAutoWatch: (id: string, enabled: boolean) => Promise<GamesOpResult>
    setProfile: (id: string, profile: string) => Promise<GamesOpResult>
    applyNow: (id: string) => Promise<{ ok: boolean; message: string; error?: string }>
    onNotification: (cb: (message: string) => void) => () => void
  }
  installers: {
    checkWinget: () => Promise<boolean>
    catalog: () => Promise<InstallerApp[]>
    install: (wingetId: string) => Promise<{ ok: boolean }>
    onProgress: (cb: (event: InstallerProgressEvent) => void) => () => void
  }
  license: {
    status: () => Promise<{ ok: boolean; key: string | null; hwid: string | null }>
    activate: (key: string) => Promise<{ ok: boolean; message: string }>
  }
  discord: {
    setPage: (page: string) => Promise<void>
    setLang: (lang: string) => Promise<void>
    profile: () => Promise<DiscordProfile | null>
    onProfile: (cb: (profile: DiscordProfile | null) => void) => () => void
  }
  system: {
    runCleanup: () => Promise<{ ok: boolean; freedMB: number; message: string }>
    scanDisk: () => Promise<{ ok: boolean; message: string }>
    optimizeDrive: () => Promise<{ ok: boolean; message: string }>
    isElevated: () => Promise<boolean>
    version: () => Promise<string>
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
