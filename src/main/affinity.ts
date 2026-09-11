import si from 'systeminformation'
import { runPowerShell, runPowerShellJson } from './utils/shell'
import type { CpuTopology, ProcessInfo } from '../shared/types'

interface ProcRow {
  Id: number
  ProcessName: string
  CPU?: number
  WorkingSet64?: number
  PriorityClass?: number
  ProcessorAffinity?: number
}

const PRIORITY_NAMES: Record<number, string> = {
  64: 'Baja',
  16384: 'Por debajo de lo normal',
  32: 'Normal',
  32768: 'Por encima de lo normal',
  128: 'Alta',
  256: 'Tiempo real'
}

function maskToHex(mask?: number): string {
  if (mask === undefined || mask === null) return 'N/D'
  return '0x' + mask.toString(16).toUpperCase()
}

export async function listTopProcesses(limit = 40): Promise<ProcessInfo[]> {
  const rows = await runPowerShellJson<ProcRow[]>(
    `Get-Process | Where-Object { $_.MainWindowTitle -ne '' -or $_.WorkingSet64 -gt 50MB } | Sort-Object WorkingSet64 -Descending | Select-Object -First ${limit} Id, ProcessName, CPU, WorkingSet64, PriorityClass, ProcessorAffinity`
  )
  if (!rows) return []
  const arr = Array.isArray(rows) ? rows : [rows]
  return arr.map((r) => ({
    pid: r.Id,
    name: r.ProcessName,
    cpuPercent: Math.round((r.CPU || 0) * 10) / 10,
    memoryMB: Math.round((r.WorkingSet64 || 0) / 1024 / 1024),
    priority: PRIORITY_NAMES[r.PriorityClass ?? 32] ?? 'Normal',
    affinityMask: maskToHex(r.ProcessorAffinity)
  }))
}

export async function setProcessTuning(
  pid: number,
  opts: { priority?: string; affinityMask?: string }
): Promise<{ ok: boolean; message: string }> {
  const parts: string[] = []
  if (opts.priority) {
    const priorityMap: Record<string, string> = {
      Baja: 'Idle',
      'Por debajo de lo normal': 'BelowNormal',
      Normal: 'Normal',
      'Por encima de lo normal': 'AboveNormal',
      Alta: 'High',
      'Tiempo real': 'RealTime'
    }
    const val = priorityMap[opts.priority] ?? 'Normal'
    parts.push(`(Get-Process -Id ${pid}).PriorityClass = '${val}'`)
  }
  if (opts.affinityMask) {
    const mask = opts.affinityMask.startsWith('0x') ? opts.affinityMask : `0x${opts.affinityMask}`
    parts.push(`(Get-Process -Id ${pid}).ProcessorAffinity = [System.IntPtr]${mask}`)
  }
  if (parts.length === 0) return { ok: false, message: 'Nada para aplicar.' }
  const res = await runPowerShell(parts.join('; '))
  return { ok: res.ok, message: res.ok ? 'Proceso actualizado.' : `No se pudo actualizar: ${res.stderr.slice(0, 160)}` }
}

export async function getCpuTopology(): Promise<CpuTopology> {
  const [cpu, cpuSpeed, graphics] = await Promise.all([si.cpu(), si.cpuCurrentSpeed(), si.graphics()])
  const logical = cpu.cores
  const physical = cpu.physicalCores
  // Heuristica simplificada: los primeros nucleos fisicos (con sus hilos) se
  // consideran "rapidos" (P-cores en Intel hibrido, o simplemente la primera
  // mitad en CPUs simetricas). No usa GetSystemCpuSetInformation nativo.
  const fastLogical = Math.max(2, Math.round((physical / logical) * logical) || Math.ceil(logical / 2))
  const half = logical > physical ? Math.ceil(logical * (physical / logical) * 1.0) : Math.ceil(logical / 2)
  const fastCount = Math.min(logical, half || fastLogical)
  const pMask = (2 ** fastCount - 1) >>> 0
  const eMask = (2 ** logical - 1) & ~pMask
  return {
    logicalCores: logical,
    physicalCores: physical,
    ghz: cpuSpeed.avg,
    pCoreMask: '0x' + pMask.toString(16).toUpperCase(),
    eCoreMask: '0x' + (eMask >>> 0).toString(16).toUpperCase(),
    gpuCores: graphics.controllers[0]?.cores ?? 0
  }
}

/** Aplica afinidad "P-cores" + prioridad alta al proceso con mas uso de CPU (heuristica Auto Affinity). */
export async function runAutoAffinity(): Promise<{ ok: boolean; message: string; target?: string }> {
  const topology = await getCpuTopology()
  const rows = await runPowerShellJson<ProcRow[]>(
    "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.Id -ne $PID } | Sort-Object CPU -Descending | Select-Object -First 1 Id, ProcessName"
  )
  const target = Array.isArray(rows) ? rows[0] : rows
  if (!target) return { ok: false, message: 'No se encontro un proceso en primer plano para optimizar.' }
  const result = await setProcessTuning(target.Id, { priority: 'Alta', affinityMask: topology.pCoreMask })
  return { ok: result.ok, message: `${target.ProcessName}: ${result.message}`, target: target.ProcessName }
}
