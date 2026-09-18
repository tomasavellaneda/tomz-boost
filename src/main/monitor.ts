import os from 'os'
import si from 'systeminformation'
import { runCmd } from './utils/shell'
import type { SysSnapshot } from '../shared/types'

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
let staticLoading: Promise<StaticInfo> | null = null
let lastSnapshot: SysSnapshot | null = null

function staticFromOs(): StaticInfo {
  const cpus = os.cpus()
  return {
    cpuManufacturer: '',
    cpuBrand: cpus[0]?.model?.trim() || 'CPU',
    cpuCores: cpus.length,
    cpuPhysicalCores: Math.max(1, Math.round(cpus.length / 2)),
    gpuVendor: 'N/D',
    gpuModel: 'N/D',
    gpuVramTotalMB: 0,
    ramTotalGB: round(os.totalmem() / 1024 ** 3, 1),
    ramSpeedMHz: null,
    osDistro: 'Windows',
    osRelease: os.release(),
    osArch: os.arch(),
    osHostname: os.hostname()
  }
}

async function gpuFromNvidiaSmi(): Promise<{ vendor: string; model: string; vramTotalMB: number } | null> {
  const smi = await runCmd(
    'nvidia-smi',
    ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
    2500
  )
  if (!smi.ok || !smi.stdout) return null
  const [name, mem] = smi.stdout.split(',').map((p) => p.trim())
  if (!name) return null
  const vram = Number(mem)
  return {
    vendor: 'NVIDIA',
    model: name,
    vramTotalMB: Number.isFinite(vram) ? round(vram) : 0
  }
}

export async function loadStaticInfo(): Promise<StaticInfo> {
  if (!staticInfo) staticInfo = staticFromOs()
  if (staticInfo.gpuModel !== 'N/D' && staticInfo.cpuManufacturer) return staticInfo
  if (staticLoading) return staticLoading
  staticLoading = (async () => {
    const base = staticInfo ?? staticFromOs()
    try {
      const [cpu, memLayout, osInfo, nvidia] = await Promise.all([
        si.cpu().catch(() => null),
        si.memLayout().catch(() => []),
        si.osInfo().catch(() => null),
        gpuFromNvidiaSmi()
      ])
      let gpuVendor = nvidia?.vendor ?? base.gpuVendor
      let gpuModel = nvidia?.model ?? base.gpuModel
      let gpuVramTotalMB = nvidia?.vramTotalMB ?? base.gpuVramTotalMB
      if (gpuModel === 'N/D') {
        try {
          const graphics = await si.graphics()
          const gpu =
            graphics.controllers.find((c) => /nvidia|amd|radeon/i.test(`${c.vendor} ${c.model}`)) ??
            graphics.controllers[0]
          gpuVendor = gpu?.vendor ?? gpuVendor
          gpuModel = gpu?.model ?? gpuModel
          gpuVramTotalMB = gpu?.vram ?? gpuVramTotalMB
        } catch {
          // keep last
        }
      }
      staticInfo = {
        cpuManufacturer: cpu?.manufacturer ?? base.cpuManufacturer,
        cpuBrand: cpu?.brand ?? base.cpuBrand,
        cpuCores: cpu?.cores ?? base.cpuCores,
        cpuPhysicalCores: cpu?.physicalCores ?? base.cpuPhysicalCores,
        gpuVendor,
        gpuModel,
        gpuVramTotalMB,
        ramTotalGB: round(os.totalmem() / 1024 ** 3, 1),
        ramSpeedMHz: memLayout.find((m) => m.clockSpeed)?.clockSpeed || base.ramSpeedMHz,
        osDistro: osInfo?.distro ?? base.osDistro,
        osRelease: osInfo?.release ?? base.osRelease,
        osArch: osInfo?.arch ?? base.osArch,
        osHostname: osInfo?.hostname ?? base.osHostname
      }
    } catch {
      staticInfo = staticInfo ?? staticFromOs()
    }
    return staticInfo
  })()
  try {
    return await staticLoading
  } finally {
    staticLoading = null
  }
}

interface CpuTimes {
  idle: number
  total: number
}

let prevCpu: CpuTimes | null = null

function readCpuTimes(): CpuTimes {
  let idle = 0
  let total = 0
  for (const c of os.cpus()) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

function cpuLoadPercent(): number {
  const now = readCpuTimes()
  if (!prevCpu) {
    prevCpu = now
    return lastSnapshot?.cpu.loadPercent ?? 0
  }
  const idle = now.idle - prevCpu.idle
  const total = now.total - prevCpu.total
  prevCpu = now
  if (total <= 0) return lastSnapshot?.cpu.loadPercent ?? 0
  return round((1 - idle / total) * 100)
}

let lastNetworkLatency: number | null = null
let lastNetworkCheck = 0
const NETWORK_CHECK_INTERVAL_MS = 15_000

async function getNetworkLatency(): Promise<number | null> {
  const now = Date.now()
  if (now - lastNetworkCheck < NETWORK_CHECK_INTERVAL_MS) return lastNetworkLatency
  lastNetworkCheck = now
  try {
    const res = await si.inetLatency('1.1.1.1')
    if (typeof res === 'number' && res >= 0) lastNetworkLatency = Math.round(res)
  } catch {
    // keep last
  }
  return lastNetworkLatency
}

let defaultIfaceCache = 'N/D'
let defaultIfaceCheckedAt = 0

async function getDefaultInterface(): Promise<string> {
  const now = Date.now()
  if (now - defaultIfaceCheckedAt < 60_000) return defaultIfaceCache
  try {
    defaultIfaceCache = (await si.networkInterfaceDefault()) || defaultIfaceCache
  } catch {
    // keep last
  }
  defaultIfaceCheckedAt = now
  return defaultIfaceCache
}

interface GpuDynamic {
  loadPercent: number | null
  temperatureC: number | null
  vramUsedMB: number
  clockMHz: number | null
}

let gpuDynamic: GpuDynamic = { loadPercent: null, temperatureC: null, vramUsedMB: 0, clockMHz: null }
let gpuCheckedAt = 0
let gpuInflight: Promise<void> | null = null

async function refreshGpuDynamic(): Promise<void> {
  const now = Date.now()
  if (now - gpuCheckedAt < 2000) return
  if (gpuInflight) return gpuInflight
  gpuInflight = (async () => {
    const smi = await runCmd(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,temperature.gpu,memory.used,clocks.current.graphics',
        '--format=csv,noheader,nounits'
      ],
      2500
    )
    if (smi.ok && smi.stdout) {
      const parts = smi.stdout.split(',').map((p) => p.trim())
      const load = Number(parts[0])
      const temp = Number(parts[1])
      const vram = Number(parts[2])
      const clock = Number(parts[3])
      gpuDynamic = {
        loadPercent: Number.isFinite(load) ? round(load) : null,
        temperatureC: Number.isFinite(temp) && temp > 0 ? round(temp) : null,
        vramUsedMB: Number.isFinite(vram) ? round(vram) : 0,
        clockMHz: Number.isFinite(clock) ? round(clock) : null
      }
      gpuCheckedAt = Date.now()
      return
    }
    try {
      const graphics = await si.graphics()
      const gpu = graphics.controllers[0]
      const gpuLoadRaw = (gpu as unknown as { utilizationGpu?: number })?.utilizationGpu
      const gpuTempRaw = (gpu as unknown as { temperatureGpu?: number })?.temperatureGpu
      gpuDynamic = {
        loadPercent: typeof gpuLoadRaw === 'number' ? round(gpuLoadRaw) : null,
        temperatureC: typeof gpuTempRaw === 'number' && gpuTempRaw > 0 ? round(gpuTempRaw) : null,
        vramUsedMB: gpu?.memoryUsed ?? 0,
        clockMHz: gpu?.clockCore ?? null
      }
    } catch {
      // keep last
    }
    gpuCheckedAt = Date.now()
  })().finally(() => {
    gpuInflight = null
  })
  return gpuInflight
}

let disksCache: SysSnapshot['disks'] = []
let disksCheckedAt = 0
let disksInflight: Promise<void> | null = null

async function refreshDisks(): Promise<void> {
  const now = Date.now()
  if (now - disksCheckedAt < 15_000 && disksCache.length > 0) return
  if (disksInflight) return disksInflight
  disksInflight = (async () => {
    try {
      const fsSize = await si.fsSize()
      disksCache = fsSize
        .filter((d) => d.size > 0)
        .map((d) => ({
          mount: d.mount,
          name: d.mount,
          totalGB: round(d.size / 1024 ** 3),
          usedGB: round(d.used / 1024 ** 3),
          freeGB: round((d.size - d.used) / 1024 ** 3),
          usedPercent: round(d.use ?? (d.used / d.size) * 100)
        }))
    } catch {
      // keep last
    }
    disksCheckedAt = Date.now()
  })().finally(() => {
    disksInflight = null
  })
  return disksInflight
}

let cpuTemp: number | null = null
let cpuTempCheckedAt = 0
let cpuTempInflight: Promise<void> | null = null

async function refreshCpuTemp(): Promise<void> {
  const now = Date.now()
  if (now - cpuTempCheckedAt < 4000) return
  if (cpuTempInflight) return cpuTempInflight
  cpuTempInflight = (async () => {
    try {
      const t = await si.cpuTemperature()
      cpuTemp = t.main && t.main > 0 ? round(t.main) : null
    } catch {
      // keep last
    }
    cpuTempCheckedAt = Date.now()
  })().finally(() => {
    cpuTempInflight = null
  })
  return cpuTempInflight
}

function buildSnapshot(info: StaticInfo): SysSnapshot {
  const usedBytes = os.totalmem() - os.freemem()
  const speedGHz = round((os.cpus()[0]?.speed ?? 0) / 1000, 2)
  return {
    timestamp: Date.now(),
    cpu: {
      manufacturer: info.cpuManufacturer,
      brand: info.cpuBrand,
      cores: info.cpuCores,
      physicalCores: info.cpuPhysicalCores,
      speedGHz,
      speedMinGHz: speedGHz,
      speedMaxGHz: speedGHz,
      loadPercent: cpuLoadPercent(),
      perCoreLoad: [],
      temperatureC: cpuTemp
    },
    gpu: {
      vendor: info.gpuVendor,
      model: info.gpuModel,
      vramTotalMB: info.gpuVramTotalMB,
      vramUsedMB: gpuDynamic.vramUsedMB,
      loadPercent: gpuDynamic.loadPercent,
      temperatureC: gpuDynamic.temperatureC,
      clockMHz: gpuDynamic.clockMHz
    },
    ram: {
      totalGB: info.ramTotalGB,
      usedGB: round(usedBytes / 1024 ** 3, 1),
      speedMHz: info.ramSpeedMHz,
      latencyNs: null
    },
    disks: disksCache,
    network: {
      interfaceName: defaultIfaceCache || 'N/D',
      latencyMs: lastNetworkLatency,
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

export function getLastSnapshot(): SysSnapshot | null {
  return lastSnapshot
}

export async function getSnapshot(): Promise<SysSnapshot> {
  const info = staticInfo ?? staticFromOs()
  if (!staticInfo) void loadStaticInfo()

  void refreshGpuDynamic()
  void refreshDisks()
  void refreshCpuTemp()
  void getNetworkLatency()
  void getDefaultInterface()

  lastSnapshot = buildSnapshot(info)
  return lastSnapshot
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
