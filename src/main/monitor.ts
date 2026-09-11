import si from 'systeminformation'
import type { SysSnapshot } from '../shared/types'

// ---------------------------------------------------------------------------
// Datos estaticos: no cambian mientras la app esta abierta (modelo de CPU,
// cantidad de nucleos, nombre del sistema operativo, velocidad nominal de la
// RAM, etc). Antes se volvian a pedir en CADA tick del polling (cada 1.5s),
// lo que disparaba llamadas caras a WMI/PowerShell sin necesidad y era la
// causa principal de que la pantalla de Inicio se sintiera lenta/con lag.
// Se resuelven una sola vez y se cachean en memoria.
// ---------------------------------------------------------------------------
interface StaticInfo {
  cpuManufacturer: string
  cpuBrand: string
  cpuCores: number
  cpuPhysicalCores: number
  gpuVendor: string
  gpuModel: string
  gpuVramTotalMB: number
  ramTotalGB: number
  ramSpeedMHz: number | null
  osDistro: string
  osRelease: string
  osArch: string
  osHostname: string
}

let staticInfo: StaticInfo | null = null

async function loadStaticInfo(): Promise<StaticInfo> {
  if (staticInfo) return staticInfo
  const [cpu, mem, memLayout, graphics, osInfo] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.memLayout(),
    si.graphics(),
    si.osInfo()
  ])
  const gpu = graphics.controllers[0]
  staticInfo = {
    cpuManufacturer: cpu.manufacturer,
    cpuBrand: cpu.brand,
    cpuCores: cpu.cores,
    cpuPhysicalCores: cpu.physicalCores,
    gpuVendor: gpu?.vendor ?? 'N/D',
    gpuModel: gpu?.model ?? 'N/D',
    gpuVramTotalMB: gpu?.vram ?? 0,
    ramTotalGB: round(mem.total / 1024 ** 3, 1),
    ramSpeedMHz: memLayout.find((m) => m.clockSpeed)?.clockSpeed || null,
    osDistro: osInfo.distro,
    osRelease: osInfo.release,
    osArch: osInfo.arch,
    osHostname: osInfo.hostname
  }
  return staticInfo
}

// La latencia de red se mide con un ping real: es lenta (~1s) y no aporta
// nada refrescarla cada 1.5s. Se cachea y solo se vuelve a medir cada 10s.
let lastNetworkLatency: number | null = null
let lastNetworkCheck = 0
const NETWORK_CHECK_INTERVAL_MS = 10_000

async function getNetworkLatency(): Promise<number | null> {
  const now = Date.now()
  if (now - lastNetworkCheck < NETWORK_CHECK_INTERVAL_MS) return lastNetworkLatency
  lastNetworkCheck = now
  try {
    const res = await si.inetLatency('1.1.1.1')
    if (typeof res === 'number' && res >= 0) lastNetworkLatency = Math.round(res)
  } catch {
    // se ignora, se conserva el ultimo valor conocido
  }
  return lastNetworkLatency
}

let defaultIfaceCache: string | null = null
let defaultIfaceCheckedAt = 0

async function getDefaultInterface(): Promise<string> {
  const now = Date.now()
  if (defaultIfaceCache && now - defaultIfaceCheckedAt < 30_000) return defaultIfaceCache
  try {
    defaultIfaceCache = await si.networkInterfaceDefault()
  } catch {
    defaultIfaceCache = defaultIfaceCache ?? 'N/D'
  }
  defaultIfaceCheckedAt = now
  return defaultIfaceCache
}

export async function getSnapshot(): Promise<SysSnapshot> {
  const info = await loadStaticInfo()

  // Solo se piden los valores realmente dinamicos en cada tick.
  const [cpuSpeed, cpuLoad, cpuTemp, mem, graphics, fsSize] = await Promise.all([
    si.cpuCurrentSpeed(),
    si.currentLoad(),
    si.cpuTemperature(),
    si.mem(),
    si.graphics(),
    si.fsSize()
  ])

  const gpu = graphics.controllers[0]
  const gpuLoadRaw = (gpu as unknown as { utilizationGpu?: number })?.utilizationGpu
  const gpuTempRaw = (gpu as unknown as { temperatureGpu?: number })?.temperatureGpu

  const disks = fsSize
    .filter((d) => d.size > 0)
    .map((d) => ({
      mount: d.mount,
      name: d.mount,
      totalGB: round(d.size / 1024 ** 3),
      usedGB: round(d.used / 1024 ** 3),
      freeGB: round((d.size - d.used) / 1024 ** 3),
      usedPercent: round(d.use ?? (d.used / d.size) * 100)
    }))

  const [networkLatency, defaultIface] = await Promise.all([getNetworkLatency(), getDefaultInterface()])

  return {
    timestamp: Date.now(),
    cpu: {
      manufacturer: info.cpuManufacturer,
      brand: info.cpuBrand,
      cores: info.cpuCores,
      physicalCores: info.cpuPhysicalCores,
      speedGHz: round(cpuSpeed.avg, 2),
      speedMinGHz: round(cpuSpeed.min ?? 0, 2),
      speedMaxGHz: round(cpuSpeed.max ?? 0, 2),
      loadPercent: round(cpuLoad.currentLoad),
      perCoreLoad: cpuLoad.cpus.map((c) => round(c.load)),
      temperatureC: cpuTemp.main && cpuTemp.main > 0 ? round(cpuTemp.main) : null
    },
    gpu: {
      vendor: info.gpuVendor,
      model: info.gpuModel,
      vramTotalMB: info.gpuVramTotalMB,
      vramUsedMB: gpu?.memoryUsed ?? 0,
      loadPercent: typeof gpuLoadRaw === 'number' ? round(gpuLoadRaw) : null,
      temperatureC: typeof gpuTempRaw === 'number' && gpuTempRaw > 0 ? round(gpuTempRaw) : null,
      clockMHz: gpu?.clockCore ?? null
    },
    ram: {
      totalGB: info.ramTotalGB,
      usedGB: round((mem.total - mem.available) / 1024 ** 3, 1),
      speedMHz: info.ramSpeedMHz,
      latencyNs: null
    },
    disks,
    network: {
      interfaceName: defaultIface || 'N/D',
      latencyMs: networkLatency,
      dns: '1.1.1.1'
    },
    os: {
      distro: info.osDistro,
      release: info.osRelease,
      arch: info.osArch,
      hostname: info.osHostname
    }
  }
}

export async function getBiosInfo() {
  const [bios, baseboard, cpu] = await Promise.all([si.bios(), si.baseboard(), si.cpu()])
  return {
    vendor: bios.vendor || 'N/D',
    version: bios.version || 'N/D',
    releaseDate: bios.releaseDate || 'N/D',
    boardVendor: baseboard.manufacturer || 'N/D',
    boardModel: baseboard.model || 'N/D',
    cpuModel: cpu.brand,
    cpuCores: cpu.physicalCores,
    cpuThreads: cpu.cores
  }
}

let diagnosticsCache: Awaited<ReturnType<typeof buildDiagnostics>> | null = null
let diagnosticsCachedAt = 0

async function buildDiagnostics() {
  const [system, osInfo, cpu, mem, graphics, fsSize, networkInterfaces, battery] = await Promise.all([
    si.system(),
    si.osInfo(),
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.fsSize(),
    si.networkInterfaces(),
    si.battery()
  ])
  return { system, osInfo, cpu, mem, graphics, fsSize, networkInterfaces, battery }
}

export async function getDiagnostics() {
  const now = Date.now()
  if (diagnosticsCache && now - diagnosticsCachedAt < 15_000) return diagnosticsCache
  diagnosticsCache = await buildDiagnostics()
  diagnosticsCachedAt = now
  return diagnosticsCache
}

function round(value: number | undefined | null, decimals = 0): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
