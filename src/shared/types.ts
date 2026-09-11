// Tipos compartidos entre main, preload y renderer.

export interface CpuSnapshot {
  manufacturer: string
  brand: string
  cores: number
  physicalCores: number
  speedGHz: number
  speedMinGHz: number
  speedMaxGHz: number
  loadPercent: number
  perCoreLoad: number[]
  temperatureC: number | null
}

export interface GpuSnapshot {
  vendor: string
  model: string
  vramTotalMB: number
  vramUsedMB: number
  loadPercent: number | null
  temperatureC: number | null
  clockMHz: number | null
}

export interface RamSnapshot {
  totalGB: number
  usedGB: number
  speedMHz: number | null
  latencyNs: number | null
}

export interface DiskSnapshot {
  mount: string
  name: string
  totalGB: number
  usedGB: number
  freeGB: number
  usedPercent: number
}

export interface NetworkSnapshot {
  interfaceName: string
  latencyMs: number | null
  dns: string
}

export interface OsSnapshot {
  distro: string
  release: string
  arch: string
  hostname: string
}

export interface SysSnapshot {
  timestamp: number
  cpu: CpuSnapshot
  gpu: GpuSnapshot
  ram: RamSnapshot
  disks: DiskSnapshot[]
  network: NetworkSnapshot
  os: OsSnapshot
}

export type TweakCategory = 'general' | 'nvidia' | 'amd' | 'fixes' | 'games'

export interface TweakDef {
  id: string
  category: TweakCategory
  label: string
  description: string
  enabled: boolean
  requiresRestart?: boolean
  gate?: 'nvidia' | 'amd' | null
  gateSatisfied?: boolean
}

export interface TweakToggleResult {
  ok: boolean
  id: string
  enabled: boolean
  message: string
  requiresRestart?: boolean
}

export interface DebloatItem {
  id: string
  packageName: string
  label: string
  description: string
  installed: boolean
}

export interface DriverInfo {
  device: string
  provider: string
  version: string
  date: string
  category: string
}

export interface BiosInfo {
  vendor: string
  version: string
  releaseDate: string
  boardVendor: string
  boardModel: string
  cpuModel: string
  cpuCores: number
  cpuThreads: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpuPercent: number
  memoryMB: number
  priority: string
  affinityMask: string
}

export interface CpuTopology {
  logicalCores: number
  physicalCores: number
  ghz: number
  pCoreMask: string
  eCoreMask: string
  gpuCores: number
}

export type GameProfileKey = 'citizenPriv' | 'citizenFps' | 'citizenClean'

export interface GameEntry {
  id: string
  name: string
  exePath: string
  exeName: string
  profile: GameProfileKey
  autoWatch: boolean
  lastAppliedAt: number | null
  running?: boolean
}

export interface InstallerApp {
  id: string
  name: string
  description: string
  wingetId: string
  installed: boolean
}

export interface InstallerProgressEvent {
  id: string
  status: 'starting' | 'running' | 'done' | 'error'
  line?: string
}

export interface ElevationInfo {
  isAdmin: boolean
}
