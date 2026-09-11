import si from 'systeminformation'
import type { SysSnapshot } from '../shared/types'

let lastNetworkLatency: number | null = null

async function measureLatency(): Promise<number | null> {
  try {
    const res = await si.inetLatency('1.1.1.1')
    if (typeof res === 'number' && res >= 0) {
      lastNetworkLatency = Math.round(res)
    }
  } catch {
    // se ignora, se conserva el ultimo valor conocido
  }
  return lastNetworkLatency
}

export async function getSnapshot(): Promise<SysSnapshot> {
  const [cpuData, cpuSpeed, cpuLoad, cpuTemp, mem, memLayout, graphics, fsSize, osInfo, defaultIface] =
    await Promise.all([
      si.cpu(),
      si.cpuCurrentSpeed(),
      si.currentLoad(),
      si.cpuTemperature(),
      si.mem(),
      si.memLayout(),
      si.graphics(),
      si.fsSize(),
      si.osInfo(),
      si.networkInterfaceDefault()
    ])

  const gpu = graphics.controllers[0]
  const gpuLoadRaw = (gpu as unknown as { utilizationGpu?: number })?.utilizationGpu
  const gpuTempRaw = (gpu as unknown as { temperatureGpu?: number })?.temperatureGpu
  const memSpeed = memLayout.find((m) => m.clockSpeed)?.clockSpeed ?? null

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

  return {
    timestamp: Date.now(),
    cpu: {
      manufacturer: cpuData.manufacturer,
      brand: cpuData.brand,
      cores: cpuData.cores,
      physicalCores: cpuData.physicalCores,
      speedGHz: round(cpuSpeed.avg, 2),
      speedMinGHz: round(cpuSpeed.min ?? cpuData.speedMin ?? 0, 2),
      speedMaxGHz: round(cpuSpeed.max ?? cpuData.speedMax ?? 0, 2),
      loadPercent: round(cpuLoad.currentLoad),
      perCoreLoad: cpuLoad.cpus.map((c) => round(c.load)),
      temperatureC: cpuTemp.main && cpuTemp.main > 0 ? round(cpuTemp.main) : null
    },
    gpu: {
      vendor: gpu?.vendor ?? 'N/D',
      model: gpu?.model ?? 'N/D',
      vramTotalMB: gpu?.vram ?? 0,
      vramUsedMB: gpu?.memoryUsed ?? 0,
      loadPercent: typeof gpuLoadRaw === 'number' ? round(gpuLoadRaw) : null,
      temperatureC: typeof gpuTempRaw === 'number' && gpuTempRaw > 0 ? round(gpuTempRaw) : null,
      clockMHz: gpu?.clockCore ?? null
    },
    ram: {
      totalGB: round(mem.total / 1024 ** 3, 1),
      usedGB: round((mem.total - mem.available) / 1024 ** 3, 1),
      speedMHz: memSpeed && memSpeed > 0 ? memSpeed : null,
      latencyNs: null
    },
    disks,
    network: {
      interfaceName: defaultIface || 'N/D',
      latencyMs: await measureLatency(),
      dns: '1.1.1.1'
    },
    os: {
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      hostname: osInfo.hostname
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

export async function getDiagnostics() {
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

function round(value: number | undefined | null, decimals = 0): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 0
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
