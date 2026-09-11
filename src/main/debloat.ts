import { runPowerShell, runPowerShellJson } from './utils/shell'
import type { DebloatItem } from '../shared/types'

interface Curated {
  packageName: string
  label: string
  description: string
}

// Lista curada de apps preinstaladas seguras de remover (no afecta el funcionamiento del sistema).
const CURATED: Curated[] = [
  { packageName: 'Microsoft.3DBuilder', label: '3D Builder', description: 'Editor de modelos 3D, rara vez usado.' },
  { packageName: 'Microsoft.BingWeather', label: 'Clima (MSN)', description: 'App de clima de Microsoft.' },
  { packageName: 'Microsoft.GetHelp', label: 'Obtener Ayuda', description: 'App de soporte de Microsoft.' },
  { packageName: 'Microsoft.Getstarted', label: 'Sugerencias', description: 'Tips de Windows.' },
  { packageName: 'Microsoft.MicrosoftOfficeHub', label: 'Office Hub', description: 'Accesos a Office 365.' },
  { packageName: 'Microsoft.MicrosoftSolitaireCollection', label: 'Solitaire Collection', description: 'Coleccion de juegos de cartas.' },
  { packageName: 'Microsoft.People', label: 'Personas', description: 'Agenda de contactos integrada.' },
  { packageName: 'Microsoft.PowerAutomateDesktop', label: 'Power Automate', description: 'Automatizacion de escritorio.' },
  { packageName: 'Microsoft.Todos', label: 'Microsoft To Do', description: 'Lista de tareas.' },
  { packageName: 'Microsoft.WindowsFeedbackHub', label: 'Hub de Comentarios', description: 'Envio de feedback a Microsoft.' },
  { packageName: 'Microsoft.WindowsMaps', label: 'Mapas', description: 'App de mapas offline.' },
  { packageName: 'Microsoft.WindowsSoundRecorder', label: 'Grabadora de Sonidos', description: 'Grabadora de audio basica.' },
  { packageName: 'Microsoft.Xbox.TCUI', label: 'Xbox TCUI', description: 'Componentes de UI de Xbox.' },
  { packageName: 'Microsoft.XboxGameOverlay', label: 'Xbox Game Overlay', description: 'Overlay de Xbox Game Bar.' },
  { packageName: 'Microsoft.XboxSpeechToTextOverlay', label: 'Xbox Speech Overlay', description: 'Subtitulos de voz de Xbox.' },
  { packageName: 'Microsoft.YourPhone', label: 'Tu Telefono / Enlace con Windows', description: 'Vinculacion con el celular.' },
  { packageName: 'Microsoft.ZuneMusic', label: 'Musica de Groove', description: 'Reproductor de musica de Microsoft.' },
  { packageName: 'Microsoft.ZuneVideo', label: 'Peliculas y TV', description: 'Reproductor de video de Microsoft.' }
]

interface AppxRow {
  Name: string
}

export async function listDebloatable(): Promise<DebloatItem[]> {
  const installed = await runPowerShellJson<AppxRow[] | AppxRow>(
    'Get-AppxPackage -AllUsers | Select-Object Name'
  )
  const names = new Set<string>()
  if (installed) {
    const arr = Array.isArray(installed) ? installed : [installed]
    for (const row of arr) if (row?.Name) names.add(row.Name)
  }
  return CURATED.map((c, idx) => ({
    id: `debloat-${idx}`,
    packageName: c.packageName,
    label: c.label,
    description: c.description,
    installed: names.has(c.packageName)
  }))
}

export async function removeDebloatable(packageNames: string[]): Promise<{ ok: boolean; log: string[] }> {
  const log: string[] = []
  let allOk = true
  for (const pkg of packageNames) {
    const res = await runPowerShell(
      `Get-AppxPackage -AllUsers -Name '${pkg}' | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue; Get-AppxProvisionedPackage -Online | Where-Object {$_.PackageName -like '${pkg}*'} | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue`
    )
    log.push(`${pkg}: ${res.ok ? 'removido' : 'no se pudo remover (' + res.stderr.slice(0, 120) + ')'}`)
    if (!res.ok) allOk = false
  }
  return { ok: allOk, log }
}
