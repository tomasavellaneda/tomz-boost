import { runPowerShell } from './utils/shell'

export async function runQuickCleanup(): Promise<{ ok: boolean; freedMB: number; message: string }> {
  const before = await getFreeSpace()
  const res = await runPowerShell(
    `Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; ` +
      `Remove-Item -Path "$env:WINDIR\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; ` +
      `Clear-RecycleBin -Force -ErrorAction SilentlyContinue`,
    60000
  )
  const after = await getFreeSpace()
  const freedMB = Math.max(0, Math.round(after - before))
  return { ok: res.ok, freedMB, message: res.ok ? `Limpieza completa. ${freedMB} MB liberados.` : 'La limpieza termino con algunas advertencias.' }
}

async function getFreeSpace(): Promise<number> {
  const res = await runPowerShell(
    "(Get-PSDrive -Name ($env:SystemDrive.TrimEnd(':'))).Free / 1MB"
  )
  const val = parseFloat(res.stdout)
  return Number.isNaN(val) ? 0 : val
}

export async function scanDisk(): Promise<{ ok: boolean; message: string }> {
  const res = await runPowerShell(
    "Get-ChildItem -Path \"$env:TEMP\" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Sum"
  )
  const bytes = parseFloat(res.stdout) || 0
  const mb = Math.round(bytes / 1024 / 1024)
  return { ok: true, message: `Se encontraron ${mb} MB de archivos temporales para limpiar.` }
}

export async function optimizeDrive(): Promise<{ ok: boolean; message: string }> {
  const res = await runPowerShell(
    `Optimize-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) -ReTrim -ErrorAction SilentlyContinue`,
    120000
  )
  return { ok: res.ok, message: res.ok ? 'Optimizacion de disco completada.' : 'No se pudo optimizar (puede requerir admin).' }
}
