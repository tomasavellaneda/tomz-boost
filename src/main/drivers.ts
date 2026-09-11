import { runPowerShellJson } from './utils/shell'
import type { DriverInfo } from '../shared/types'

interface DriverRow {
  DeviceName?: string
  DeviceClass?: string
  DriverProviderName?: string
  DriverVersion?: string
  DriverDate?: string
}

export async function listDrivers(): Promise<DriverInfo[]> {
  const rows = await runPowerShellJson<DriverRow[] | DriverRow>(
    "Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -in @('DISPLAY','NET','HDC','SCSIADAPTER','MEDIA','MONITOR','SYSTEM') } | Select-Object DeviceName, DeviceClass, DriverProviderName, DriverVersion, DriverDate"
  )
  if (!rows) return []
  const arr = Array.isArray(rows) ? rows : [rows]
  return arr
    .filter((r) => r.DeviceName)
    .map((r) => ({
      device: r.DeviceName || 'N/D',
      provider: r.DriverProviderName || 'N/D',
      version: r.DriverVersion || 'N/D',
      date: formatWmiDate(r.DriverDate),
      category: r.DeviceClass || 'N/D'
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

function formatWmiDate(raw?: string): string {
  if (!raw) return 'N/D'
  const match = /\/Date\((\d+)\)\//.exec(raw)
  if (match) {
    return new Date(Number(match[1])).toLocaleDateString('es-AR')
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('es-AR')
}
