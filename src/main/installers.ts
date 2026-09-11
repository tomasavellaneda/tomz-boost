import { spawn } from 'child_process'
import { runCmd, runPowerShellJson } from './utils/shell'
import type { InstallerApp } from '../shared/types'

interface Curated {
  id: string
  name: string
  description: string
  wingetId: string
}

const CATALOG: Curated[] = [
  { id: 'steam', name: 'Steam', description: 'Cliente de juegos de Valve.', wingetId: 'Valve.Steam' },
  { id: 'discord', name: 'Discord', description: 'Chat de voz/texto para gamers.', wingetId: 'Discord.Discord' },
  { id: 'msiafterburner', name: 'MSI Afterburner', description: 'Overclock y monitoreo de GPU.', wingetId: 'Guru3D.Afterburner' },
  { id: 'hwinfo', name: 'HWiNFO', description: 'Diagnostico detallado de hardware.', wingetId: 'REALiX.HWiNFO' },
  { id: 'directx', name: 'DirectX End-User Runtime', description: 'Runtimes clasicos requeridos por muchos juegos.', wingetId: 'Microsoft.DirectX' },
  { id: 'vcredist', name: 'Visual C++ Redistributables', description: 'Runtimes de C++ requeridos por juegos y apps.', wingetId: 'Microsoft.VCRedist.2015+.x64' },
  { id: 'geforce', name: 'NVIDIA App', description: 'Panel de control y drivers NVIDIA.', wingetId: 'Nvidia.NVIDIAApp' },
  { id: 'epicgames', name: 'Epic Games Launcher', description: 'Launcher de Epic Games Store.', wingetId: 'EpicGames.EpicGamesLauncher' }
]

export async function checkWinget(): Promise<boolean> {
  const res = await runCmd('winget.exe', ['--version'])
  return res.ok
}

interface WingetListRow {
  Id?: string
}

export async function getCatalog(): Promise<InstallerApp[]> {
  const rows = await runPowerShellJson<WingetListRow[] | WingetListRow>(
    'winget list --accept-source-agreements | Out-String'
  )
  const text = typeof rows === 'string' ? rows : ''
  return CATALOG.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    wingetId: c.wingetId,
    installed: text.includes(c.wingetId)
  }))
}

export function installApp(
  wingetId: string,
  onLine: (line: string) => void,
  onDone: (ok: boolean) => void
): void {
  const child = spawn(
    'winget.exe',
    ['install', '--id', wingetId, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements'],
    { windowsHide: true }
  )
  child.stdout.on('data', (d) => onLine(d.toString()))
  child.stderr.on('data', (d) => onLine(d.toString()))
  child.on('close', (code) => onDone(code === 0))
  child.on('error', (err) => {
    onLine(String(err))
    onDone(false)
  })
}
