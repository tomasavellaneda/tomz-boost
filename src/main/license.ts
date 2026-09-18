import { app } from 'electron'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getMachineHwid, normalizeHwid } from './hwid'

/** Mantener igual que scripts/generate-key.cjs */
const LICENSE_SECRET = 'tomz-boost-license-v1-7f3c9a1e4b8d2065'

export interface LicenseStatus {
  ok: boolean
  key: string | null
  hwid: string | null
}

interface LicenseFile {
  key: string
  hwid: string
  activatedAt: number
}

let machineHwid = ''
let cached: LicenseStatus | null = null

function normalizeKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function formatKey(body: string): string {
  const chunks = body.match(/.{1,4}/g) ?? [body]
  return `TOMZ-${chunks.join('-')}`
}

const UNBOUND = 'UNBOUND'

function sign(id: Buffer, tag: string): Buffer {
  return createHmac('sha256', LICENSE_SECRET)
    .update(Buffer.concat([id, Buffer.from(`|${tag}`, 'utf8')]))
    .digest()
    .subarray(0, 3)
}

function sameSig(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

export function generateLicenseKey(hwid?: string): string {
  const id = randomBytes(5)
  const tag = normalizeHwid(hwid || '') || UNBOUND
  const body = Buffer.concat([id, sign(id, tag)]).toString('hex').toUpperCase()
  return formatKey(body)
}

export function isValidLicenseKey(raw: string, hwid?: string): boolean {
  const compact = normalizeKey(raw)
  if (!compact.startsWith('TOMZ')) return false
  const hex = compact.slice(4)
  if (!/^[0-9A-F]{16}$/.test(hex)) return false
  const bytes = Buffer.from(hex, 'hex')
  const id = bytes.subarray(0, 5)
  const sig = bytes.subarray(5, 8)
  if (sameSig(sig, sign(id, UNBOUND))) return true
  const bound = normalizeHwid(hwid || '')
  return Boolean(bound) && sameSig(sig, sign(id, bound))
}

function licensePath(): string {
  return join(app.getPath('userData'), 'license.json')
}

function readStatus(): LicenseStatus {
  // Solo `npm run dev` (app.isPackaged === false). En el .exe empaquetado
  // esta rama no existe como bypass: aunque el usuario ponga TOMZ_DEV_UNLOCK=1
  // en las variables de entorno de Windows, se ignora.
  if (!app.isPackaged && process.env.TOMZ_DEV_UNLOCK === '1') {
    return { ok: true, key: 'DEV', hwid: machineHwid || null }
  }
  try {
    if (!existsSync(licensePath())) return { ok: false, key: null, hwid: machineHwid || null }
    const data = JSON.parse(readFileSync(licensePath(), 'utf8')) as LicenseFile
    if (data?.key && isValidLicenseKey(data.key, machineHwid || undefined)) {
      const bound = normalizeHwid(data.hwid || '')
      const current = normalizeHwid(machineHwid || '')
      if (bound && current && bound !== current) {
        return { ok: false, key: data.key, hwid: machineHwid || null }
      }
      return { ok: true, key: data.key, hwid: machineHwid || data.hwid || null }
    }
  } catch {
    // ignore
  }
  return { ok: false, key: null, hwid: machineHwid || null }
}

export async function initLicense(): Promise<void> {
  machineHwid = await getMachineHwid()
  cached = readStatus()
}

export function getLicenseStatus(): LicenseStatus {
  if (cached) return cached
  cached = readStatus()
  return cached
}

export function isLicensed(): boolean {
  return getLicenseStatus().ok
}

export function activateLicense(raw: string): { ok: boolean; message: string } {
  if (!isValidLicenseKey(raw, machineHwid || undefined)) {
    return { ok: false, message: 'Clave invalida.' }
  }
  const compact = normalizeKey(raw)
  const key = formatKey(compact.slice(4))
  const payload: LicenseFile = { key, hwid: machineHwid, activatedAt: Date.now() }
  writeFileSync(licensePath(), JSON.stringify(payload, null, 2), 'utf8')
  cached = { ok: true, key, hwid: machineHwid }
  return { ok: true, message: 'App desbloqueada.' }
}

