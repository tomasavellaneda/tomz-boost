import { runPowerShell, runPowerShellJson } from './utils/shell'
import { getBackup, saveBackup } from './tweaks/backup'
import { requireElevated } from './utils/elevation'
import type { DebloatItem, DebloatBackupEntry } from '../shared/types'

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

interface AppxFamilyRow {
  PackageFamilyName?: string
}

const DEBLOAT_BACKUP_ID = 'debloat'

function getDebloatBackups(): DebloatBackupEntry[] {
  return getBackup<DebloatBackupEntry[]>(DEBLOAT_BACKUP_ID) ?? []
}

function persistDebloatBackups(entries: DebloatBackupEntry[]): void {
  const res = saveBackup(DEBLOAT_BACKUP_ID, entries)
  if (!res.ok) {
    console.error(`[debloat] no se pudo guardar el historial de apps removidas: ${res.error}`)
  }
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

  // Reconciliacion real: si una app del historial de "removidas" volvio a
  // aparecer instalada (reinstalada manualmente desde la Store, o restaurada
  // por Windows Update), la sacamos del historial releyendo el estado actual
  // en vez de asumir que sigue removida para siempre.
  const backups = getDebloatBackups()
  const stillRemoved = backups.filter((b) => !names.has(b.packageName))
  if (stillRemoved.length !== backups.length) persistDebloatBackups(stillRemoved)

  return CURATED.map((c, idx) => ({
    id: `debloat-${idx}`,
    packageName: c.packageName,
    label: c.label,
    description: c.description,
    installed: names.has(c.packageName)
  }))
}

/**
 * Historial real de apps removidas (con el dato necesario para intentar
 * reinstalarlas). No hay forma de reinstalar automaticamente: Remove-AppxPackage
 * + Remove-AppxProvisionedPackage borran el paquete del disco, asi que la unica
 * via realista es abrir la ficha de la app en la Microsoft Store (si Microsoft
 * todavia la lista ahi) para que el usuario la instale de nuevo manualmente.
 */
export function listDebloatBackups(): DebloatBackupEntry[] {
  return getDebloatBackups()
}

export async function removeDebloatable(packageNames: string[]): Promise<{ ok: boolean; log: string[] }> {
  const denied = await requireElevated()
  if (denied) {
    return { ok: false, log: [denied.message] }
  }
  const log: string[] = []
  let allOk = true
  let backups = getDebloatBackups()

  for (const pkg of packageNames) {
    const curated = CURATED.find((c) => c.packageName === pkg)
    const label = curated?.label ?? pkg

    // Capturamos el PackageFamilyName ANTES de remover: es el unico dato que
    // despues permite abrir la ficha exacta de la app en la Store para
    // reinstalarla a mano. Una vez removido el paquete ya no se puede leer.
    const before = await runPowerShellJson<AppxFamilyRow[] | AppxFamilyRow>(
      `Get-AppxPackage -AllUsers -Name '${pkg}' | Select-Object -First 1 PackageFamilyName`
    )
    const beforeRow = Array.isArray(before) ? before[0] : before
    const packageFamilyName = beforeRow?.PackageFamilyName ?? null

    // Mismo criterio que services/memoria: el backup tiene que quedar
    // persistido ANTES del cambio destructivo. Si no se puede guardar, no
    // se remueve la app.
    const entry: DebloatBackupEntry = {
      packageName: pkg,
      label,
      packageFamilyName,
      removedAt: new Date().toISOString()
    }
    const next = [...backups.filter((b) => b.packageName !== pkg), entry]
    const saved = saveBackup(DEBLOAT_BACKUP_ID, next)
    if (!saved.ok) {
      allOk = false
      console.error(`[debloat] no se pudo guardar el backup de ${pkg}: ${saved.error}`)
      log.push(`${pkg}: no se pudo guardar el backup; no se aplico el cambio por seguridad`)
      continue
    }
    backups = next

    const res = await runPowerShell(
      `Get-AppxPackage -AllUsers -Name '${pkg}' | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue; Get-AppxProvisionedPackage -Online | Where-Object {$_.PackageName -like '${pkg}*'} | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue`
    )

    // Verificacion post-aplicacion: releemos si el paquete sigue instalado en
    // vez de confiar en el exit code de PowerShell (que puede ser 0 aunque
    // Remove-AppxPackage no haya encontrado nada para remover).
    const after = await runPowerShellJson<AppxRow[] | AppxRow>(
      `Get-AppxPackage -AllUsers -Name '${pkg}' | Select-Object -First 1 Name`
    )
    const afterRow = Array.isArray(after) ? after[0] : after
    const removed = !afterRow?.Name

    if (!removed) {
      allOk = false
      const rolled = backups.filter((b) => b.packageName !== pkg)
      persistDebloatBackups(rolled)
      backups = rolled
      const detail = res.ok ? '' : ` (${res.stderr.slice(0, 120)})`
      log.push(`${pkg}: no se pudo confirmar la remocion, puede seguir instalado${detail}`)
      continue
    }

    log.push(`${pkg}: removido`)
  }

  return { ok: allOk, log }
}
