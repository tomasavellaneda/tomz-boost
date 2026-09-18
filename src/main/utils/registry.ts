import { runCmd } from './shell'

export type RegType = 'REG_DWORD' | 'REG_SZ' | 'REG_QWORD' | 'REG_BINARY'

/** Lee un valor de registro usando reg.exe. Devuelve null si no existe. */
export async function regQuery(keyPath: string, valueName: string): Promise<string | null> {
  const args = ['query', keyPath, '/v', valueName]
  const res = await runCmd('reg.exe', args)
  if (!res.ok) return null
  const lines = res.stdout.split(/\r?\n/).map((l) => l.trim())
  const line = lines.find((l) => l.startsWith(valueName))
  if (!line) return null
  const parts = line.split(/\s+/).filter(Boolean)
  // formato: <Nombre> <Tipo> <Valor...>
  const idx = parts.findIndex((p) => p.startsWith('REG_'))
  if (idx === -1) return null
  return parts.slice(idx + 1).join(' ')
}

/**
 * Lee un valor REG_DWORD como numero.
 *
 * IMPORTANTE: reg.exe siempre muestra los REG_DWORD en hexadecimal con
 * prefijo "0x" (ej. "0x2"), sin importar en que formato se hayan escrito.
 * Compararlos como string decimal (ej. v === '2') nunca da true: era la
 * causa de que casi todos los tweaks numericos se vieran "desactivados"
 * aunque se hubiesen aplicado correctamente. Usar siempre esta funcion (y no
 * regQuery) para valores REG_DWORD.
 */
export async function regQueryDword(keyPath: string, valueName: string): Promise<number | null> {
  const raw = await regQuery(keyPath, valueName)
  if (raw === null) return null
  const cleaned = raw.trim()
  const num = cleaned.toLowerCase().startsWith('0x') ? parseInt(cleaned, 16) : parseInt(cleaned, 10)
  if (Number.isNaN(num)) return null
  // REG_DWORD es unsigned 32-bit. Algunas fuentes serializan 0xffffffff como
  // "-1"; reg.exe lo muestra como 0xffffffff. Sin este coerce,
  // NetworkThrottlingIndex no coincidia con DWORD_MAX.
  return num < 0 ? num >>> 0 : num
}

export interface RegOpResult {
  ok: boolean
  error?: string
}

/**
 * Igual que regSet, pero devuelve el stderr real de reg.exe en vez de tragarlo.
 * Usar esta version (o regDeleteVerbose) en cualquier tweak nuevo que necesite
 * loggear/mostrar la causa real de un fallo en vez de un booleano ciego.
 */
export async function regSetVerbose(
  keyPath: string,
  valueName: string,
  type: RegType,
  data: string
): Promise<RegOpResult> {
  const args = ['add', keyPath, '/v', valueName, '/t', type, '/d', data, '/f']
  const res = await runCmd('reg.exe', args)
  if (!res.ok) {
    const error = res.stderr || `reg.exe salio con codigo ${res.code}`
    console.error(`[registry] reg add fallo en ${keyPath}\\${valueName}: ${error}`)
    return { ok: false, error }
  }
  return { ok: true }
}

export async function regDeleteVerbose(keyPath: string, valueName: string): Promise<RegOpResult> {
  const args = ['delete', keyPath, '/v', valueName, '/f']
  const res = await runCmd('reg.exe', args)
  if (!res.ok) {
    const error = res.stderr || `reg.exe salio con codigo ${res.code}`
    console.error(`[registry] reg delete fallo en ${keyPath}\\${valueName}: ${error}`)
    return { ok: false, error }
  }
  return { ok: true }
}

export async function regSet(
  keyPath: string,
  valueName: string,
  type: RegType,
  data: string
): Promise<boolean> {
  return (await regSetVerbose(keyPath, valueName, type, data)).ok
}

export async function regDelete(keyPath: string, valueName: string): Promise<boolean> {
  return (await regDeleteVerbose(keyPath, valueName)).ok
}

const HIVE_ABBREVIATIONS: Record<string, string> = {
  HKLM: 'HKEY_LOCAL_MACHINE',
  HKCU: 'HKEY_CURRENT_USER',
  HKCR: 'HKEY_CLASSES_ROOT',
  HKU: 'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG'
}

/**
 * reg.exe siempre devuelve el nombre completo del hive (ej. HKEY_LOCAL_MACHINE)
 * en su salida, sin importar si se le paso la abreviatura (ej. HKLM) como
 * entrada. Comparar la salida contra el string de entrada sin normalizar
 * nunca da match: era la causa de que findGpuAdapterKeys nunca encontrara
 * ninguna subclave (todos los tweaks de NVIDIA/AMD basados en esto quedaban
 * rotos en silencio).
 */
function normalizeHive(path: string): string {
  const idx = path.indexOf('\\')
  if (idx === -1) return path
  const hive = path.slice(0, idx)
  const rest = path.slice(idx)
  return (HIVE_ABBREVIATIONS[hive] ?? hive) + rest
}

/** Lista las subclaves directas de una clave (usado para enumerar instancias de GPU). */
export async function regListSubkeys(keyPath: string): Promise<string[]> {
  const res = await runCmd('reg.exe', ['query', keyPath])
  if (!res.ok) return []
  const normalizedKeyPath = normalizeHive(keyPath)
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(normalizedKeyPath) && l.length > normalizedKeyPath.length)
}
