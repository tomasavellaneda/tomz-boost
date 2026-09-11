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

export async function regSet(
  keyPath: string,
  valueName: string,
  type: RegType,
  data: string
): Promise<boolean> {
  const args = ['add', keyPath, '/v', valueName, '/t', type, '/d', data, '/f']
  const res = await runCmd('reg.exe', args)
  return res.ok
}

export async function regDelete(keyPath: string, valueName: string): Promise<boolean> {
  const args = ['delete', keyPath, '/v', valueName, '/f']
  const res = await runCmd('reg.exe', args)
  return res.ok
}

/** Lista las subclaves directas de una clave (usado para enumerar instancias de GPU). */
export async function regListSubkeys(keyPath: string): Promise<string[]> {
  const res = await runCmd('reg.exe', ['query', keyPath])
  if (!res.ok) return []
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(keyPath))
}
