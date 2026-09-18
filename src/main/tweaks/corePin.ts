import { runPowerShellJson } from '../utils/shell'
import { setProcessTuning, getCpuTopology } from '../affinity'
import { getBackup, saveBackup, clearBackup } from './backup'
import { JsonStore } from '../utils/store'
import type { TweakResult } from '../../shared/types'

const store = new JsonStore<{ enabled: boolean }>('corepin.json', { enabled: false })

const BACKUP_ID = 'corepin-originals'
const TICK_MS = 20_000

// Apps conocidas que no son criticas para el sistema: se les puede pinear a
// los nucleos "lentos" para liberar los rapidos para el juego/foreground.
const BACKGROUND_TARGETS = ['Discord', 'Spotify', 'chrome', 'msedge', 'Steam', 'EpicGamesLauncher', 'OneDrive']

interface ProcRow {
  Id?: number
  ProcessName?: string
  ProcessorAffinity?: number | null
}

interface CorePinOriginal {
  name: string
  affinity: number
}

type CorePinOriginals = Record<string, CorePinOriginal>

interface PinNowResult {
  ok: boolean
  verified: boolean
  pinned: number
  /** true si se aborto ANTES de tocar afinidad (backup o mascara invalida). */
  aborted?: boolean
  error?: string
}

let handle: NodeJS.Timeout | null = null
let inflight: Promise<PinNowResult> | null = null

export function isCorePinEnabled(): boolean {
  return store.get().enabled
}

function numberToMask(n: number): string {
  return '0x' + Math.trunc(n).toString(16).toUpperCase()
}

function parseMask(mask: string): number {
  const cleaned = mask.startsWith('0x') || mask.startsWith('0X') ? mask.slice(2) : mask
  return parseInt(cleaned, 16)
}

function listQuery(): string {
  const names = BACKGROUND_TARGETS.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  // ProcessorAffinity es IntPtr: sin casteo, ConvertTo-Json lo serializa como
  // objeto vacio y perdemos el valor original que hay que respaldar.
  return `Get-Process | Where-Object { $_.ProcessName -in @(${names}) } | Select-Object Id, ProcessName, @{N='ProcessorAffinity';E={ [int64]$_.ProcessorAffinity }}`
}

async function listTargets(): Promise<ProcRow[]> {
  const rows = await runPowerShellJson<ProcRow[] | ProcRow>(listQuery())
  if (!rows) return []
  return Array.isArray(rows) ? rows : [rows]
}

async function readProcess(pid: number): Promise<ProcRow | null> {
  const row = await runPowerShellJson<ProcRow>(
    `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, @{N='ProcessorAffinity';E={ [int64]$_.ProcessorAffinity }}`
  )
  if (!row || row.Id == null) return null
  return row
}

function originalsFromBackup(): CorePinOriginals {
  return { ...(getBackup<CorePinOriginals>(BACKUP_ID) ?? {}) }
}

/**
 * Aplica la afinidad e-core a los procesos de fondo, respaldando ANTES el
 * ProcessorAffinity real de cada PID (via backup.ts). Un proceso sin backup
 * persistido no se toca: sin original no hay rollback honesto.
 */
async function pinNowInner(): Promise<PinNowResult> {
  const topology = await getCpuTopology()
  const expected = parseMask(topology.eCoreMask)
  if (!Number.isFinite(expected) || expected === 0) {
    const error = `Mascara de e-cores invalida (${topology.eCoreMask}).`
    console.error(`[corePin] ${error}`)
    return { ok: false, verified: false, pinned: 0, aborted: true, error }
  }

  const rows = await listTargets()
  const live = rows.filter((r) => typeof r.Id === 'number' && r.ProcessName)
  const originals = originalsFromBackup()
  const pending = { ...originals }

  for (const row of live) {
    const key = String(row.Id)
    if (pending[key] !== undefined) continue
    const affinity = row.ProcessorAffinity
    if (affinity == null || !Number.isFinite(Number(affinity))) {
      console.error(`[corePin] no se pudo leer ProcessorAffinity de ${row.ProcessName} (${row.Id}); se omite`)
      continue
    }
    pending[key] = { name: row.ProcessName as string, affinity: Number(affinity) }
  }

  const added = Object.keys(pending).length !== Object.keys(originals).length
  if (added) {
    const saved = saveBackup(BACKUP_ID, pending)
    if (!saved.ok) {
      console.error(`[corePin] no se pudo guardar el backup de afinidad original: ${saved.error}`)
      return {
        ok: false,
        verified: false,
        pinned: 0,
        aborted: true,
        error: saved.error ?? 'No se pudo guardar el backup.'
      }
    }
  }

  const backed = getBackup<CorePinOriginals>(BACKUP_ID) ?? pending
  const toPin = live.filter((r) => backed[String(r.Id)])
  if (toPin.length === 0) {
    return { ok: true, verified: true, pinned: 0 }
  }

  let pinned = 0
  let verifiedCount = 0
  for (const row of toPin) {
    const pid = row.Id as number
    const res = await setProcessTuning(pid, { affinityMask: topology.eCoreMask })
    if (!res.ok) {
      console.error(`[corePin] no se pudo pinear ${row.ProcessName} (${pid}): ${res.message}`)
      continue
    }
    pinned++
    const after = await readProcess(pid)
    if (after?.ProcessorAffinity === expected) verifiedCount++
    else {
      console.error(
        `[corePin] relectura de afinidad de ${row.ProcessName} (${pid}) no confirma ${topology.eCoreMask} (got=${after?.ProcessorAffinity ?? 'null'})`
      )
    }
  }

  const verified = verifiedCount === toPin.length
  return {
    ok: verified,
    verified,
    pinned,
    error: verified ? undefined : 'No se pudo confirmar la afinidad en todos los procesos objetivo.'
  }
}

async function pinNow(): Promise<PinNowResult> {
  if (inflight) return inflight
  inflight = pinNowInner().finally(() => {
    inflight = null
  })
  return inflight
}

function startWatcher(): void {
  if (handle) return
  handle = setInterval(() => {
    void pinNow()
  }, TICK_MS)
}

function stopWatcher(): void {
  if (handle) {
    clearInterval(handle)
    handle = null
  }
}

async function restoreOriginals(): Promise<TweakResult> {
  const originals = originalsFromBackup()
  const entries = Object.entries(originals)
  if (entries.length === 0) {
    return { ok: true, verified: true, message: 'CorePin desactivado (no habia procesos pineados).' }
  }

  const remaining: CorePinOriginals = {}
  let restored = 0
  let failed = 0

  for (const [pidStr, info] of entries) {
    const pid = Number(pidStr)
    const current = await readProcess(pid)
    if (!current || current.ProcessName !== info.name) {
      // Proceso ya no existe, o el PID fue reutilizado: no tocar.
      continue
    }
    const mask = numberToMask(info.affinity)
    const res = await setProcessTuning(pid, { affinityMask: mask })
    if (!res.ok) {
      failed++
      remaining[pidStr] = info
      console.error(`[corePin] no se pudo restaurar ${info.name} (${pid}): ${res.message}`)
      continue
    }
    const after = await readProcess(pid)
    if (after?.ProcessorAffinity !== info.affinity) {
      failed++
      remaining[pidStr] = info
      console.error(
        `[corePin] relectura de ${info.name} (${pid}) no confirma afinidad original ${mask} (got=${after?.ProcessorAffinity ?? 'null'})`
      )
      continue
    }
    restored++
  }

  if (Object.keys(remaining).length === 0) {
    const cleared = clearBackup(BACKUP_ID)
    if (!cleared.ok) {
      console.error(`[corePin] se restauro la afinidad pero no se pudo borrar el backup: ${cleared.error}`)
    }
  } else {
    saveBackup(BACKUP_ID, remaining)
  }

  const verified = failed === 0
  return {
    ok: verified,
    verified,
    error: verified ? undefined : `No se pudo restaurar la afinidad de ${failed} proceso(s).`,
    message: verified
      ? `CorePin desactivado. Afinidad original restaurada en ${restored} proceso(s).`
      : `CorePin desactivado pero no se pudo restaurar la afinidad de ${failed} proceso(s).`
  }
}

export async function applyCorePin(enabled: boolean): Promise<TweakResult> {
  if (enabled) {
    const result = await pinNow()
    if (result.aborted) {
      // Backup fallo (o mascara invalida): no persistir el flag ni arrancar
      // el watcher, mismo criterio que registryDwordToggle.
      return {
        ok: false,
        verified: false,
        error: result.error,
        message: result.error?.includes('backup')
          ? 'No se pudo guardar el backup; no se aplico el cambio por seguridad'
          : result.error ?? 'No se pudo aplicar CorePin.'
      }
    }

    try {
      store.set({ enabled: true })
    } catch (err) {
      console.error(`[corePin] fallo al persistir el flag enabled=true: ${String(err)}`)
      return {
        ok: false,
        verified: false,
        error: String(err),
        message: `Se aplico la afinidad pero no se pudo guardar la configuracion. ${String(err)}`
      }
    }

    startWatcher()

    if (store.get().enabled !== true) {
      return {
        ok: false,
        verified: false,
        error: 'El flag CorePin no quedo persistido.',
        message: 'Se aplico la afinidad pero no se pudo confirmar la configuracion.'
      }
    }

    return {
      ok: result.verified,
      verified: result.verified,
      error: result.error,
      message: result.verified
        ? result.pinned > 0
          ? `CorePin activado. Afinidad aplicada ahora en ${result.pinned} proceso(s); se mantiene cada 20s.`
          : 'CorePin activado. No habia procesos de fondo para pinear ahora; se aplicara apenas aparezcan (y cada 20s).'
        : result.error ?? 'Se aplico CorePin pero no se pudo confirmar la afinidad en todos los procesos.'
    }
  }

  stopWatcher()
  if (inflight) await inflight
  const restored = await restoreOriginals()

  try {
    store.set({ enabled: false })
  } catch (err) {
    console.error(`[corePin] fallo al persistir el flag enabled=false: ${String(err)}`)
    return {
      ok: false,
      verified: false,
      error: String(err),
      message: `${restored.message} No se pudo guardar la configuracion. ${String(err)}`
    }
  }

  return restored
}

/** Arranca el watcher al iniciar la app si ya estaba activado en una sesion anterior. */
export function initCorePinWatcher(): void {
  if (!store.get().enabled) return
  void pinNow()
  startWatcher()
}
