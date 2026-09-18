import { createHash } from 'crypto'
import { runPowerShellJson } from './utils/shell'

interface SmbiosIds {
  uuid?: string
  board?: string
  bios?: string
  cpu?: string
}

let cached: string | null = null

const JUNK = new Set(['', 'NONE', 'N/A', 'NA', 'TO BE FILLED BY O.E.M.', 'DEFAULT STRING', 'UNKNOWN'])

function clean(raw: string | undefined): string {
  const v = (raw ?? '').trim().toUpperCase()
  const compact = v.replace(/[^A-Z0-9]/g, '')
  if (JUNK.has(v) || JUNK.has(compact) || compact.length < 4) return ''
  if (/^0+$/.test(compact) || /^F+$/.test(compact)) return ''
  return v
}

export function normalizeHwid(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatHwid(compact: string): string {
  const body = normalizeHwid(compact)
  const chunks = body.match(/.{1,4}/g) ?? [body]
  return chunks.join('-')
}

/** SMBIOS (placa / BIOS / CPU). Sobrevive a un format; cambia si cambia el equipo. */
export async function getMachineHwid(): Promise<string> {
  if (cached) return cached
  const row = await runPowerShellJson<SmbiosIds>(
    `$p = Get-CimInstance Win32_ComputerSystemProduct; $b = Get-CimInstance Win32_BaseBoard; $bios = Get-CimInstance Win32_BIOS; $c = Get-CimInstance Win32_Processor | Select-Object -First 1; [pscustomobject]@{ uuid = $p.UUID; board = $b.SerialNumber; bios = $bios.SerialNumber; cpu = $c.ProcessorId }`
  )
  const parts = [clean(row?.uuid), clean(row?.board), clean(row?.bios), clean(row?.cpu)].filter(Boolean)
  if (parts.length === 0) {
    cached = ''
    return cached
  }
  cached = formatHwid(createHash('sha256').update(parts.join('|')).digest('hex').toUpperCase().slice(0, 16))
  return cached
}
