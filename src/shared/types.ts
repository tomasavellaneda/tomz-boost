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
  enabled: boolean
  requiresRestart?: boolean
  gate?: 'nvidia' | 'amd' | null
  gateSatisfied?: boolean
}

/**
 * Resultado tipado de una operacion que modifica el sistema real (registro,
 * servicio, powercfg, etc). Reemplaza el patron de devolver un mensaje de
 * "exito" fijo sin relacion con lo que realmente paso.
 *
 * - ok: la operacion (y su verificacion, cuando existe) se considera exitosa.
 * - verified: se releyo el valor directo del sistema (NUNCA un JSON/estado
 *   local) despues de escribir, y coincide con lo esperado. Si `ok` es true
 *   pero `verified` es false, la escritura no reporto error pero no se pudo
 *   confirmar que el sistema quedo en el estado esperado.
 * - error: mensaje de error real (stderr/excepcion), presente cuando algo
 *   fallo. Nunca debe quedar vacio si ok/verified son false por un error real.
 * - message: texto legible para la UI, siempre coherente con ok/verified.
 */
export interface TweakResult {
  ok: boolean
  verified: boolean
  error?: string
  message: string
}

export interface TweakToggleResult {
  ok: boolean
  id: string
  enabled: boolean
  message: string
  requiresRestart?: boolean
  /** Presente cuando el tweak ya migro al patron TweakResult (ver arriba). */
  verified?: boolean
  error?: string
}

export interface RecommendedTweaksResult {
  ok: boolean
  log: string[]
  enabled: string[]
  failed: string[]
}

export interface DebloatItem {
  id: string
  packageName: string
  label: string
  description: string
  installed: boolean
}

/**
 * Registro real de una app removida por Debloat, guardado via backup.ts.
 * `packageFamilyName` se captura ANTES de remover porque es el dato que
 * permite despues abrir la ficha exacta de la app en la Microsoft Store
 * (no hay forma de reinstalar en el sistema sin volver a descargarla).
 */
export interface DebloatBackupEntry {
  packageName: string
  label: string
  packageFamilyName: string | null
  removedAt: string
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
  iconDataUrl?: string | null
}

/**
 * Resultado de una operacion que persiste games.json. Si `ok` es false, `games`
 * es el ultimo estado realmente grabado en disco (no el que se intento guardar).
 */
export interface GamesOpResult {
  ok: boolean
  games: GameEntry[]
  error?: string
  message: string
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

export interface DiscordProfile {
  id: string
  username: string
  handle: string
  avatarUrl: string | null
}
