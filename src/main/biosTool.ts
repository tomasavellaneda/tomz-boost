import { dialog, shell, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getBiosInfo } from './monitor'
import { runCmd } from './utils/shell'
import { toggleTweak } from './tweaks/catalog'

function getExportDir(): string {
  const dir = join(app.getPath('documents'), 'TomzBoost', 'bios-exports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export async function exportBiosInfo(): Promise<{ ok: boolean; path?: string }> {
  const info = await getBiosInfo()
  const dir = getExportDir()
  const fileName = `bios-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filePath = join(dir, fileName)
  writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf-8')
  return { ok: true, path: filePath }
}

export function openExportFolder(): void {
  shell.openPath(getExportDir())
}

/** Aplica un paquete de tweaks seguros "de fabrica" recomendados para la mayoria de equipos. */
export async function runAutoConfig(): Promise<{ ok: boolean; log: string[] }> {
  const ids = ['visualEffects', 'backgroundApps', 'services', 'memoria', 'diskWriteOptim', 'internet', 'powerPlan']
  const log: string[] = []
  let ok = true
  for (const id of ids) {
    const res = await toggleTweak(id, true)
    log.push(`${id}: ${res.message}`)
    if (!res.ok) ok = false
  }
  return { ok, log }
}

export async function importTweakProfile(win: BrowserWindow): Promise<{ ok: boolean; log: string[] }> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Importar perfil de tweaks',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (res.canceled || res.filePaths.length === 0) return { ok: false, log: ['Importacion cancelada.'] }
  try {
    const raw = readFileSync(res.filePaths[0], 'utf-8')
    const data = JSON.parse(raw) as Record<string, boolean>
    const log: string[] = []
    let ok = true
    for (const [id, enabled] of Object.entries(data)) {
      const r = await toggleTweak(id, Boolean(enabled))
      log.push(`${id}: ${r.message}`)
      if (!r.ok) ok = false
    }
    return { ok, log }
  } catch (err) {
    return { ok: false, log: [`No se pudo importar: ${String(err)}`] }
  }
}

/** Reinicia la maquina directo a la configuracion de firmware UEFI (equivalente a "Entrar BIOS"). */
export async function enterFirmware(): Promise<{ ok: boolean; message: string }> {
  const res = await runCmd('shutdown.exe', ['/r', '/fw', '/t', '5'])
  return {
    ok: res.ok,
    message: res.ok
      ? 'El equipo se reiniciara en 5 segundos directo al firmware UEFI/BIOS.'
      : `No se pudo programar el reinicio: ${res.stderr}`
  }
}
