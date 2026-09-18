import {
  regQuery,
  regQueryDword,
  regSet,
  regSetVerbose,
  regDelete,
  regDeleteVerbose,
  type RegType
} from '../utils/registry'
import { runCmd, runPowerShell, runPowerShellJson } from '../utils/shell'
import { saveBackup, getBackup } from './backup'
import { findGpuAdapterKeys } from './gpuRegistry'
import { getAdapterDwordTweakState, applyAdapterDwordTweak } from './gpuDwordTweak'
import { getRegistryDwordToggleState, applyRegistryDwordToggle, ntfsLastAccessUpdatesReduced } from './registryDwordToggle'
import { getRegistryValueToggleState, applyRegistryValueToggle, type RegistryValueTarget } from './registryValueToggle'
import { applyLocalFlagToggle } from './localFlagTweak'
import { getMsiState, setMsiModeForGpuAndNic, warmupMsiTargets } from './msiMode'
import { isCorePinEnabled, applyCorePin } from './corePin'
import { isAutoCpuSetEnabled, setAutoCpuSetEnabled } from './autoCpuSet'
import { NVIDIA_PROFILE_IDS, applyNvidiaProfile, isNvidiaProfileEnabled, type NvidiaProfileId } from './nvidiaProfiles'
import { requireElevated } from '../utils/elevation'
import type { RecommendedTweaksResult, TweakCategory, TweakDef, TweakResult, TweakToggleResult } from '../../shared/types'

interface TweakRuntime {
  id: string
  category: TweakCategory
  label: string
  requiresRestart?: boolean
  gate?: 'nvidia' | 'amd' | null
  getState: () => Promise<boolean>
  apply: (enabled: boolean) => Promise<{ ok: boolean; message: string }>
}

const CURATED_SERVICES = ['DiagTrack', 'dmwappushservice', 'MapsBroker', 'RetailDemo', 'WalletService']

const CURATED_TASKS = [
  '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
  '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
  '\\Microsoft\\Windows\\DiskDiagnostic\\Microsoft-Windows-DiskDiagnosticDataCollector'
]

const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
const BALANCED_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e'
const ULTIMATE_GUID = 'e9a42b02-d5df-448d-aa00-03f14749eb61'

/** Grupo seguro: no incluye HAGS, SysMain, MSI, IFEO, Defender, MMCSS ni NIC Nagle. */
const RECOMMENDED_IDS = [
  'visualEffects',
  'backgroundApps',
  'widgetsCopilot',
  'diskWriteOptim',
  'powerPlan',
  'usbDevices',
  'nicLatency',
  'gameDvrFse'
] as const

/**
 * Tweaks que escriben HKLM, tocan servicios, tareas del sistema, powercfg,
 * netsh o el registro de clase de GPU. Sin elevacion, Windows rechaza la
 * escritura (a veces con exit 0 + sin cambio). Se chequea en toggleTweak
 * ANTES de apply(), para devolver un TweakResult explicito en vez de un
 * error generico de reg.exe/PowerShell.
 *
 * No entran: visualEffects, backgroundApps, widgetsCopilot, rawInput,
 * notifications, gameMode, corePin, autoCpuSet (HKCU o flag local).
 */
const REQUIRES_ADMIN_IDS = new Set<string>([
  'services',
  'memoria',
  'scheduledTasks',
  'diskWriteOptim',
  'internet',
  'powerPlan',
  'usbDevices',
  'nicLatency',
  'msiIrq',
  'graphicsTweaks',
  'ifeo',
  'winDefender',
  'location',
  'hvci',
  ...NVIDIA_PROFILE_IDS,
  'amdBasic',
  'gaming',
  'gameDvrFse'
])

interface PowerScheme {
  guid: string
  name: string
  active: boolean
}

function parsePowerSchemes(stdout: string): PowerScheme[] {
  const re =
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+\(([^)]+)\)(\s*\*)?/g
  const out: PowerScheme[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(stdout))) {
    out.push({ guid: m[1].toLowerCase(), name: m[2].trim(), active: Boolean(m[3]) })
  }
  return out
}

function schemeLooksUltimate(s: PowerScheme): boolean {
  if (s.guid === ULTIMATE_GUID) return true
  const n = s.name.toLowerCase()
  return (
    n.includes('ultimate') ||
    n.includes('máximo rendimiento') ||
    n.includes('maximo rendimiento') ||
    n.includes('desempenho máximo') ||
    n.includes('desempenho maximo')
  )
}

function schemeLooksHighPerf(s: PowerScheme): boolean {
  if (s.guid === HIGH_PERF_GUID) return true
  if (schemeLooksUltimate(s)) return false
  const n = s.name.toLowerCase()
  return n.includes('high performance') || n.includes('alto rendimiento') || n.includes('alto desempenho')
}

async function listPowerSchemes(): Promise<PowerScheme[]> {
  const res = await runCmd('powercfg.exe', ['/list'])
  return parsePowerSchemes(res.stdout)
}

async function duplicateScheme(guid: string): Promise<string | null> {
  const res = await runCmd('powercfg.exe', ['/duplicatescheme', guid])
  return parsePowerSchemes(res.stdout)[0]?.guid ?? null
}

async function ensurePerformanceScheme(): Promise<string | null> {
  const schemes = await listPowerSchemes()
  const ultimate = schemes.find(schemeLooksUltimate)
  if (ultimate) return ultimate.guid
  const createdUltimate = await duplicateScheme(ULTIMATE_GUID)
  if (createdUltimate) return createdUltimate
  const high = schemes.find(schemeLooksHighPerf)
  if (high) return high.guid
  return (await duplicateScheme(HIGH_PERF_GUID)) ?? HIGH_PERF_GUID
}

async function ensureBalancedScheme(): Promise<string> {
  const schemes = await listPowerSchemes()
  const balanced = schemes.find(
    (s) => s.guid === BALANCED_GUID || /balanced|equilibrado|balanceado/i.test(s.name)
  )
  return balanced?.guid ?? BALANCED_GUID
}

function normalizeIfaceGuid(guid: string): string {
  const g = guid.replace(/[{}]/g, '').toLowerCase()
  return `{${g}}`
}

async function listUpInterfaceGuids(): Promise<string[]> {
  const rows = await runPowerShellJson<{ Guid: string }[] | { Guid: string }>(
    `Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Select-Object @{n='Guid';e={$_.InterfaceGuid}}`
  )
  const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
  return arr.map((r) => normalizeIfaceGuid(String(r.Guid ?? ''))).filter((g) => g.length > 3)
}

function tcpInterfaceKey(guid: string): string {
  return `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\${guid}`
}

/** 'internet' toca 2 valores por NIC activa, y la lista de NICs es dinamica (no entra en registryDwordToggle.ts, que asume rutas fijas). */
function internetInterfaceTargets(guids: string[]): { keyPath: string; valueName: string }[] {
  return guids.flatMap((g) => {
    const key = tcpInterfaceKey(g)
    return [
      { keyPath: key, valueName: 'TcpAckFrequency' },
      { keyPath: key, valueName: 'TCPNoDelay' }
    ]
  })
}

async function internetNagleEnabled(guids: string[]): Promise<boolean> {
  if (guids.length === 0) return false
  const targets = internetInterfaceTargets(guids)
  const values = await Promise.all(targets.map((t) => regQueryDword(t.keyPath, t.valueName)))
  return values.every((v) => v === 1)
}

async function internetNagleCleared(guids: string[]): Promise<boolean> {
  const targets = internetInterfaceTargets(guids)
  const values = await Promise.all(targets.map((t) => regQueryDword(t.keyPath, t.valueName)))
  return values.every((v) => v === null)
}

const INTERNET_THROTTLE_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'
const INTERNET_THROTTLE_VALUE = 'NetworkThrottlingIndex'
/** DWORD_MAX: Windows deja de limitar el envio multimedia (~10 paquetes/ms por default). */
const INTERNET_THROTTLE_ON = 0xffffffff
const INTERNET_THROTTLE_BACKUP_ID = `reg-original:${INTERNET_THROTTLE_KEY}\\${INTERNET_THROTTLE_VALUE}`

function internetThrottleSpec(enabledMessage: string, disabledMessage: string) {
  return {
    targets: [{ keyPath: INTERNET_THROTTLE_KEY, valueName: INTERNET_THROTTLE_VALUE }],
    enabledValue: INTERNET_THROTTLE_ON,
    // Fallback solo si se llamara al helper sin backup; apply() evita ese camino.
    disabledValue: 10,
    restoreOriginal: true as const,
    enabledMessage,
    disabledMessage
  }
}

async function internetThrottleEnabled(): Promise<boolean> {
  return getRegistryDwordToggleState({
    targets: [{ keyPath: INTERNET_THROTTLE_KEY, valueName: INTERNET_THROTTLE_VALUE }],
    enabledValue: INTERNET_THROTTLE_ON
  })
}

/** Confirma el esquema de energia activo releyendolo, no asumiendolo desde el exit code de powercfg. */
async function powerPlanActiveIsPerformance(): Promise<boolean> {
  const res = await runCmd('powercfg.exe', ['/getactivescheme'])
  const active = parsePowerSchemes(res.stdout)[0]
  if (!active) return false
  return schemeLooksUltimate(active) || schemeLooksHighPerf(active)
}

async function hibernateEnabledValue(): Promise<number | null> {
  return regQueryDword('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', 'HibernateEnabled')
}

/** powercfg /aliases no registra SUB_USB ni USBSELECTSUSPEND en muchas builds. */
const USB_SUBGROUP_GUID = '2a737441-1930-4402-8d77-b2bebba308a3'
const USB_SELECTIVE_SUSPEND_GUID = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'

/**
 * Primer `0x........` DESPUES del GUID del setting = indice AC actual.
 * Los "possible setting index" salen como 000/001 sin prefijo 0x, en cualquier
 * idioma. No buscar el texto ingles "Current AC Power Setting Index".
 */
function parsePowerCfgCurrentAcIndex(stdout: string, settingGuid: string): number | null {
  const guidIdx = stdout.toLowerCase().indexOf(settingGuid.toLowerCase())
  if (guidIdx === -1) return null
  const match = /0x[0-9a-fA-F]+/.exec(stdout.slice(guidIdx + settingGuid.length))
  if (!match) return null
  const n = parseInt(match[0], 16)
  return Number.isNaN(n) ? null : n
}

async function usbSelectiveSuspendAcIndex(): Promise<number | null> {
  const res = await runCmd('powercfg.exe', ['/q', 'SCHEME_CURRENT', USB_SUBGROUP_GUID, USB_SELECTIVE_SUSPEND_GUID])
  if (!res.ok) return null
  return parsePowerCfgCurrentAcIndex(res.stdout, USB_SELECTIVE_SUSPEND_GUID)
}

/** Misma consulta que getState(), extraida para poder reutilizarla como verificacion post-aplicacion en apply(). */
async function usbSelectiveSuspendOff(): Promise<boolean> {
  return (await usbSelectiveSuspendAcIndex()) === 0
}

interface NicLatencyNic {
  name: string
  desc: string
  pmSupported: boolean
  pmValue: string | null
  pmError: string | null
  pmErrorId: string | null
  imSupported: boolean
  imValue: string | null
  imError: string | null
}

interface NicLatencyReport {
  nics: NicLatencyNic[]
}

function isPmDriverUnsupported(error: string | null, errorId: string | null): boolean {
  const blob = `${error ?? ''} ${errorId ?? ''}`
  return /error 31|no funciona|not functioning|device attached to the system is not functioning/i.test(blob)
}

function isPmPowerSavingOn(value: string | null): boolean {
  if (value == null || value === '') return false
  const v = value.trim().toLowerCase()
  return v === 'enabled' || v === 'true' || v === 'habilitado' || v === '1'
}

function asNicArray(nics: NicLatencyNic | NicLatencyNic[] | undefined): NicLatencyNic[] {
  if (!nics) return []
  return Array.isArray(nics) ? nics : [nics]
}

function nicLatencyPs(apply: boolean, wantEnable: boolean): string {
  return `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
$apply = ${apply ? '$true' : '$false'}
$wantEnable = ${wantEnable ? '$true' : '$false'}
$nics = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' })
$rows = New-Object System.Collections.Generic.List[object]
foreach ($n in $nics) {
  $pmSupported = $true
  $pmValue = $null
  $pmError = $null
  $pmErrorId = $null
  try {
    if ($apply) {
      if ($wantEnable) { Disable-NetAdapterPowerManagement -Name $n.Name -NoRestart -ErrorAction Stop }
      else { Enable-NetAdapterPowerManagement -Name $n.Name -NoRestart -ErrorAction Stop }
    }
    $pm = Get-NetAdapterPowerManagement -Name $n.Name -ErrorAction Stop
    $pmValue = [string]$pm.AllowComputerToTurnOffDevice
  } catch {
    $pmError = [string]$_.Exception.Message
    $pmErrorId = [string]$_.FullyQualifiedErrorId
    $unsupported = ($pmErrorId -match 'Error 31') -or ($pmError -match 'no funciona|not functioning|device attached to the system is not functioning')
    $pmSupported = -not $unsupported
  }

  $imSupported = $true
  $imValue = $null
  $imError = $null
  try {
    if ($apply) {
      $imSet = $(if ($wantEnable) { '0' } else { '1' })
      Set-NetAdapterAdvancedProperty -Name $n.Name -RegistryKeyword '*InterruptModeration' -RegistryValue $imSet -NoRestart -ErrorAction Stop
    }
    $im = Get-NetAdapterAdvancedProperty -Name $n.Name -RegistryKeyword '*InterruptModeration' -ErrorAction Stop
    $imValue = [string](@($im.RegistryValue)[0])
  } catch {
    $imError = [string]$_.Exception.Message
    $im = Get-NetAdapterAdvancedProperty -Name $n.Name -RegistryKeyword '*InterruptModeration' -ErrorAction SilentlyContinue
    if ($im) {
      $imValue = [string](@($im.RegistryValue)[0])
      $imSupported = $true
    } else {
      $imSupported = $false
    }
  }

  $rows.Add([pscustomobject]@{
    name = [string]$n.Name
    desc = [string]$n.InterfaceDescription
    pmSupported = $pmSupported
    pmValue = $pmValue
    pmError = $pmError
    pmErrorId = $pmErrorId
    imSupported = $imSupported
    imValue = $imValue
    imError = $imError
  })
}
[pscustomobject]@{ nics = $rows.ToArray() } | ConvertTo-Json -Depth 6 -Compress
`.trim()
}

async function inspectNicLatency(apply: boolean, wantEnable: boolean): Promise<NicLatencyReport | { error: string }> {
  const res = await runPowerShell(nicLatencyPs(apply, wantEnable), 30000)
  if (!res.stdout) {
    return { error: res.stderr || 'PowerShell no devolvio salida al consultar la NIC.' }
  }
  try {
    const parsed = JSON.parse(res.stdout) as { nics?: NicLatencyNic | NicLatencyNic[] }
    return { nics: asNicArray(parsed.nics) }
  } catch {
    return { error: res.stderr || res.stdout }
  }
}

function nicPmIsNa(nic: NicLatencyNic): boolean {
  return !nic.pmSupported || isPmDriverUnsupported(nic.pmError, nic.pmErrorId)
}

function nicImMatches(nic: NicLatencyNic, wantEnable: boolean): boolean {
  if (!nic.imSupported) return false
  return wantEnable ? nic.imValue === '0' : nic.imValue === '1'
}

function nicPmMatches(nic: NicLatencyNic, wantEnable: boolean): boolean {
  if (nicPmIsNa(nic)) return false
  if (nic.pmValue == null || nic.pmValue === '') return false
  return wantEnable ? !isPmPowerSavingOn(nic.pmValue) : isPmPowerSavingOn(nic.pmValue)
}

/** Tweak ON = cada NIC tiene en estado deseado las partes que SI soporta, y hay al menos una parte soportada. */
function nicLatencyIsEnabled(report: NicLatencyReport): boolean {
  if (report.nics.length === 0) return false
  let anySupported = false
  for (const nic of report.nics) {
    const pmNa = nicPmIsNa(nic)
    const imNa = !nic.imSupported
    if (!pmNa) {
      anySupported = true
      if (isPmPowerSavingOn(nic.pmValue)) return false
    }
    if (!imNa) {
      anySupported = true
      if (nic.imValue !== '0') return false
    }
  }
  return anySupported
}

function describePm(nic: NicLatencyNic): string {
  if (nicPmIsNa(nic) && (nic.pmError || nic.pmErrorId)) {
    return `${nic.name}: el driver no soporta Power Management (${nic.desc || 'clase CIM no disponible'}).`
  }
  if (nic.pmError) return `${nic.name}: Power Management: ${nic.pmError}`
  return `${nic.name}: Power Management=${nic.pmValue ?? 'desconocido'}`
}

function nicLatencyTweakResult(report: NicLatencyReport, wantEnable: boolean): TweakResult {
  if (report.nics.length === 0) {
    return {
      ok: false,
      verified: false,
      error: 'No se encontro un adaptador de red fisico activo.',
      message: 'No se encontro un adaptador de red fisico activo.'
    }
  }

  const lines: string[] = []
  let supportedOk = 0
  let supportedFail = 0
  let unsupportedNotes = 0

  for (const nic of report.nics) {
    const pmNa = nicPmIsNa(nic)
    if (pmNa) {
      unsupportedNotes++
      lines.push(describePm(nic))
    } else if (nicPmMatches(nic, wantEnable)) {
      supportedOk++
    } else {
      supportedFail++
      lines.push(
        nic.pmError
          ? `${nic.name}: no se pudo cambiar Power Management (${nic.pmError}).`
          : `${nic.name}: Power Management sigue en ${nic.pmValue ?? 'desconocido'}.`
      )
    }

    if (!nic.imSupported) {
      unsupportedNotes++
      lines.push(`${nic.name}: Interrupt Moderation no esta disponible en este adaptador.`)
    } else if (nicImMatches(nic, wantEnable)) {
      supportedOk++
    } else {
      supportedFail++
      lines.push(
        nic.imError
          ? `${nic.name}: Interrupt Moderation: ${nic.imError}`
          : `${nic.name}: Interrupt Moderation quedo en ${nic.imValue ?? 'desconocido'} (se esperaba ${wantEnable ? '0' : '1'}).`
      )
    }
  }

  const detail = lines.join(' ')
  if (supportedOk === 0 && supportedFail === 0) {
    return {
      ok: false,
      verified: false,
      error: detail,
      message: `Ninguna NIC soporta Power Management ni Interrupt Moderation. ${detail}`.trim()
    }
  }
  if (supportedFail === 0) {
    const partial = unsupportedNotes > 0
    const core = wantEnable
      ? partial
        ? 'Aplicado parcialmente: moderacion de interrupciones desactivada.'
        : 'Ahorro de energia y moderacion de interrupciones de la NIC desactivados.'
      : partial
        ? 'Restaurado parcialmente: moderacion de interrupciones restaurada.'
        : 'Ahorro de energia de la NIC restaurado.'
    return { ok: true, verified: true, message: `${core} ${detail}`.trim() }
  }
  if (supportedOk > 0) {
    const core = wantEnable
      ? 'Aplicado parcialmente: se logro al menos una de las dos partes.'
      : 'Restaurado parcialmente: se logro al menos una de las dos partes.'
    return { ok: true, verified: false, error: detail, message: `${core} ${detail}`.trim() }
  }
  return {
    ok: false,
    verified: false,
    error: detail,
    message: `No se pudo aplicar. ${detail}`.trim()
  }
}

async function nicLatencyReady(): Promise<boolean> {
  const report = await inspectNicLatency(false, true)
  if ('error' in report) return false
  return nicLatencyIsEnabled(report)
}

const START_TYPE_MAP: Record<string, number> = { Automatic: 2, Manual: 3, Disabled: 4 }
const REVERSE_START_TYPE: Record<number, 'Automatic' | 'Manual' | 'Disabled'> = {
  2: 'Automatic',
  3: 'Manual',
  4: 'Disabled'
}

interface ServiceRow {
  Name: string
  StartType: string | number
}

/**
 * ConvertTo-Json de PS 5.1 serializa el enum ServiceStartMode como entero
 * (2/3/4), no como "Automatic"/"Manual"/"Disabled". Aceptar ambos: si solo
 * se mapea el string, StartType queda null y location falla la verificacion
 * aunque el servicio ya este en AUTO_START.
 */
function parseServiceStartType(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return raw === 2 || raw === 3 || raw === 4 ? raw : null
  }
  if (typeof raw === 'string') {
    const mapped = START_TYPE_MAP[raw]
    if (mapped !== undefined) return mapped
    const asNum = Number(raw)
    if (asNum === 2 || asNum === 3 || asNum === 4) return asNum
  }
  return null
}

let primedServices: Record<string, number | null> | null = null

/** Consulta varios servicios en un solo proceso de PowerShell (evita N spawns). */
async function serviceStartTypeBatch(names: string[]): Promise<Record<string, number | null>> {
  const primed = primedServices
  if (primed && names.every((n) => n in primed)) {
    const out: Record<string, number | null> = {}
    for (const n of names) out[n] = primed[n] ?? null
    return out
  }
  const list = names.map((n) => `'${n}'`).join(',')
  const rows = await runPowerShellJson<ServiceRow[] | ServiceRow>(
    `Get-Service -Name ${list} -ErrorAction SilentlyContinue | Select-Object Name, StartType`
  )
  const out: Record<string, number | null> = {}
  const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
  for (const n of names) out[n] = null
  for (const row of arr) {
    if (!row?.Name) continue
    out[row.Name] = parseServiceStartType(row.StartType)
  }
  return out
}

/** Targets de 'visualEffects': mezcla REG_DWORD y REG_SZ en 4 claves distintas. */
function visualEffectsTargets(): RegistryValueTarget[] {
  return [
    {
      keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
      valueName: 'VisualFXSetting',
      type: 'REG_DWORD',
      enabledValue: '2',
      disabledValue: '1'
    },
    {
      keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
      valueName: 'TaskbarAnimations',
      type: 'REG_DWORD',
      enabledValue: '0',
      disabledValue: '1'
    },
    {
      keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
      valueName: 'ListviewAlphaSelect',
      type: 'REG_DWORD',
      enabledValue: '0',
      disabledValue: '1'
    },
    {
      keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
      valueName: 'ListviewShadow',
      type: 'REG_DWORD',
      enabledValue: '0',
      disabledValue: '1'
    },
    { keyPath: 'HKCU\\Software\\Microsoft\\Windows\\DWM', valueName: 'EnableAeroPeek', type: 'REG_DWORD', enabledValue: '0', disabledValue: '1' },
    { keyPath: 'HKCU\\Software\\Microsoft\\Windows\\DWM', valueName: 'EnableAeroShake', type: 'REG_DWORD', enabledValue: '0', disabledValue: '1' },
    {
      keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
      valueName: 'EnableTransparency',
      type: 'REG_DWORD',
      enabledValue: '0',
      disabledValue: '1'
    },
    { keyPath: 'HKCU\\Control Panel\\Desktop\\WindowMetrics', valueName: 'MinAnimate', type: 'REG_SZ', enabledValue: '0', disabledValue: '1' },
    { keyPath: 'HKCU\\Control Panel\\Desktop', valueName: 'DragFullWindows', type: 'REG_SZ', enabledValue: '0', disabledValue: '1' },
    { keyPath: 'HKCU\\Control Panel\\Desktop', valueName: 'MenuShowDelay', type: 'REG_SZ', enabledValue: '0', disabledValue: '400' }
  ]
}

/** Targets de 'rawInput': las 3 claves de mouse son REG_SZ, no REG_DWORD. */
function rawInputTargets(): RegistryValueTarget[] {
  return [
    { keyPath: 'HKCU\\Control Panel\\Mouse', valueName: 'MouseSpeed', type: 'REG_SZ', enabledValue: '0', disabledValue: '1' },
    { keyPath: 'HKCU\\Control Panel\\Mouse', valueName: 'MouseThreshold1', type: 'REG_SZ', enabledValue: '0', disabledValue: '6' },
    { keyPath: 'HKCU\\Control Panel\\Mouse', valueName: 'MouseThreshold2', type: 'REG_SZ', enabledValue: '0', disabledValue: '10' }
  ]
}

const GAMING_TASKS_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
const GAMING_PROFILE_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile'

/**
 * 'gaming' mezcla REG_DWORD y REG_SZ en 2 claves distintas: mismo patron que
 * 'visualEffects' y 'rawInput', asi que usa registryValueToggle.ts en vez de
 * tener su propia logica ad-hoc de escritura/verificacion.
 */
function gamingProfileTargets(): RegistryValueTarget[] {
  return [
    { keyPath: GAMING_TASKS_KEY, valueName: 'GPU Priority', type: 'REG_DWORD', enabledValue: '8', disabledValue: '2' },
    { keyPath: GAMING_TASKS_KEY, valueName: 'Priority', type: 'REG_DWORD', enabledValue: '6', disabledValue: '2' },
    { keyPath: GAMING_TASKS_KEY, valueName: 'Scheduling Category', type: 'REG_SZ', enabledValue: 'High', disabledValue: 'Medium' },
    { keyPath: GAMING_PROFILE_KEY, valueName: 'SystemResponsiveness', type: 'REG_DWORD', enabledValue: '0', disabledValue: '20' }
  ]
}

/** Ejecutables cuya prioridad de CPU ajusta el tweak 'ifeo' via IFEO. */
function ifeoTargets(): { keyPath: string; valueName: string }[] {
  return ['SearchIndexer.exe', 'OneDrive.exe', 'WidgetService.exe', 'GameBar.exe'].map((exe) => ({
    keyPath: `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions`,
    valueName: 'CpuPriorityClass'
  }))
}

/**
 * 'widgetsCopilot' no usa los helpers genericos: al activar 3 DWORDs se
 * escriben y TurnOffWindowsCopilot se crea; al desactivar esa politica se
 * borra (no se escribe 0). Mismo criterio de backup real que
 * registryDwordToggle, pero via backup.ts directo.
 */
const WIDGETS_COPILOT_TARGETS: { keyPath: string; valueName: string; enabledValue: number }[] = [
  { keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', valueName: 'TaskbarDa', enabledValue: 0 },
  { keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', valueName: 'TaskbarMn', enabledValue: 0 },
  { keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', valueName: 'ShowCopilotButton', enabledValue: 0 },
  { keyPath: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', valueName: 'TurnOffWindowsCopilot', enabledValue: 1 }
]

function widgetsCopilotBackupId(keyPath: string, valueName: string): string {
  return `reg-original:${keyPath}\\${valueName}`
}

async function backupWidgetsCopilotOriginals(): Promise<{ ok: boolean; error?: string }> {
  for (const t of WIDGETS_COPILOT_TARGETS) {
    const id = widgetsCopilotBackupId(t.keyPath, t.valueName)
    if (getBackup<number | null>(id) !== undefined) continue
    const current = await regQueryDword(t.keyPath, t.valueName)
    const res = saveBackup(id, current)
    if (!res.ok) return res
  }
  return { ok: true }
}

/**
 * Al desactivar: restaurar el original real. Sin backup (nunca se activo por
 * esta app), fallback al comportamiento anterior: Taskbar* / ShowCopilotButton
 * en 1, y borrar TurnOffWindowsCopilot (la politica no existia por defecto).
 */
function widgetsCopilotDisableExpectation(target: (typeof WIDGETS_COPILOT_TARGETS)[number]): {
  absent: boolean
  value: number
} {
  const original = getBackup<number | null>(widgetsCopilotBackupId(target.keyPath, target.valueName))
  if (original !== undefined) {
    return original === null ? { absent: true, value: 0 } : { absent: false, value: original }
  }
  if (target.valueName === 'TurnOffWindowsCopilot') return { absent: true, value: 0 }
  return { absent: false, value: 1 }
}

interface ScheduledTaskRow {
  Path: string
  State: string
}

/**
 * Antes se detectaba el estado contando lineas de salida de PowerShell sin
 * asociarlas a una tarea puntual: si una tarea no existia en esta build de
 * Windows, `Get-ScheduledTask` no emitia linea (silenciada por
 * -ErrorAction SilentlyContinue) y el resto se corria, rompiendo la
 * correlacion indice-tarea. Esta version devuelve {Path, State} explicito
 * por tarea (State='Missing' si no existe) via JSON, sin ambiguedad.
 */
async function getScheduledTasksState(): Promise<Record<string, string>> {
  const list = CURATED_TASKS.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')
  const script = `$paths=@(${list}); foreach ($p in $paths) { $folder = Split-Path $p; $name = Split-Path $p -Leaf; $t = Get-ScheduledTask -TaskPath "$folder\\" -TaskName $name -ErrorAction SilentlyContinue; [pscustomobject]@{ Path = $p; State = $(if ($t) { [string]$t.State } else { 'Missing' }) } }`
  const rows = await runPowerShellJson<ScheduledTaskRow[] | ScheduledTaskRow>(script)
  const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
  const out: Record<string, string> = {}
  for (const t of CURATED_TASKS) out[t] = 'Missing'
  for (const row of arr) out[row.Path] = row.State
  return out
}

/** Una tarea que no existe en esta build de Windows se considera "ya satisfecha": no hay nada que tocar. */
function scheduledTasksSatisfied(states: Record<string, string>, wantDisabled: boolean): boolean {
  return CURATED_TASKS.every((t) => {
    const state = states[t]
    if (state === 'Missing') return true
    return wantDisabled ? state === 'Disabled' : state !== 'Disabled'
  })
}

async function setServiceStartType(name: string, type: 'Automatic' | 'Manual' | 'Disabled'): Promise<boolean> {
  const res = await runPowerShell(
    `Set-Service -Name '${name}' -StartupType ${type} -ErrorAction SilentlyContinue; Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue`
  )
  return res.ok
}

/**
 * Patron compartido por 'services' y 'memoria' (SysMain): activar el tweak
 * significa poner uno o mas servicios en `enabledType` (tipicamente
 * 'Disabled'), guardando ANTES el StartType real de cada uno via backup.ts
 * para poder restaurarlo tal cual estaba -- no un default inventado.
 * null (servicio ausente o StartType ilegible) NO cuenta como satisfecho:
 * location, services y memoria exigen el numero real (2/3/4).
 */
interface ServiceToggleSpec {
  services: string[]
  enabledType: 'Automatic' | 'Manual' | 'Disabled'
  /** Solo se usa si no hay backup (primera vez que se activa desde que esta app existe en la maquina). */
  fallbackDisabledType: 'Automatic' | 'Manual' | 'Disabled'
  backupId: string
  enabledMessage: string
  disabledMessage: string
}

function serviceStartTypeMatches(actual: number | null, expected: number): boolean {
  return actual === expected
}

async function getServiceToggleState(spec: Pick<ServiceToggleSpec, 'services' | 'enabledType'>): Promise<boolean> {
  const states = await serviceStartTypeBatch(spec.services)
  const expected = START_TYPE_MAP[spec.enabledType]
  return spec.services.every((s) => serviceStartTypeMatches(states[s], expected))
}

async function applyServiceToggle(spec: ServiceToggleSpec, enabled: boolean): Promise<TweakResult> {
  if (enabled) {
    const originals = await serviceStartTypeBatch(spec.services)
    const backup = saveBackup(spec.backupId, originals)
    if (!backup.ok) {
      console.error(`[tweaks] '${spec.backupId}': aborto sin aplicar porque el backup fallo: ${backup.error}`)
      return {
        ok: false,
        verified: false,
        error: backup.error,
        message: 'No se pudo guardar el backup; no se aplico el cambio por seguridad.'
      }
    }
    const results = await Promise.all(spec.services.map((s) => setServiceStartType(s, spec.enabledType)))
    if (!results.every(Boolean)) {
      console.error(`[tweaks] '${spec.backupId}': Set-Service reporto fallo en al menos un servicio al activar`)
    }
    const verified = await getServiceToggleState(spec)
    if (!verified) {
      console.error(`[tweaks] '${spec.backupId}': no se pudo confirmar el StartType tras activar`)
    }
    return {
      ok: verified,
      verified,
      error: verified ? undefined : 'Set-Service no reporto error pero la relectura no confirma el StartType esperado.',
      message: verified ? spec.enabledMessage : 'Se aplico el cambio pero no se pudo confirmar en los servicios.'
    }
  }

  const originals = getBackup<Record<string, number | null>>(spec.backupId)
  const restoreType = (name: string): 'Automatic' | 'Manual' | 'Disabled' => {
    const original = originals?.[name]
    return original != null ? REVERSE_START_TYPE[original] ?? spec.fallbackDisabledType : spec.fallbackDisabledType
  }
  const results = await Promise.all(spec.services.map((s) => setServiceStartType(s, restoreType(s))))
  if (!results.every(Boolean)) {
    console.error(`[tweaks] '${spec.backupId}': Set-Service reporto fallo en al menos un servicio al restaurar`)
  }
  const readBack = await serviceStartTypeBatch(spec.services)
  const verified = spec.services.every((s) => serviceStartTypeMatches(readBack[s], START_TYPE_MAP[restoreType(s)]))
  if (!verified) {
    console.error(`[tweaks] '${spec.backupId}': no se pudo confirmar la restauracion`)
  }
  return {
    ok: verified,
    verified,
    error: verified ? undefined : 'La restauracion no reporto error pero la relectura no confirma el StartType esperado.',
    message: verified ? spec.disabledMessage : 'Se restauro pero no se pudo confirmar en los servicios.'
  }
}

let vendorCache: { nvidia: boolean; amd: boolean } | null = null
async function getVendor() {
  if (vendorCache) return vendorCache
  const [nvidiaKeys, amdKeys] = await Promise.all([findGpuAdapterKeys('NVIDIA'), findGpuAdapterKeys('AMD')])
  const vendor = { nvidia: nvidiaKeys.length > 0, amd: amdKeys.length > 0 }
  // No congelar "sin GPU" si la enumeracion vino vacia en el primer arranque
  // post-reboot. Si hay NVIDIA/AMD, ahi si cacheamos.
  if (vendor.nvidia || vendor.amd) vendorCache = vendor
  return vendor
}

let tweaksCache: TweakDef[] | null = null
let tweaksCachedAt = 0
let tweaksInflight: Promise<TweakDef[]> | null = null
const TWEAKS_CACHE_MS = 30_000

function invalidateTweaksCache(): void {
  tweaksCache = null
  tweaksCachedAt = 0
}

const TWEAKS: TweakRuntime[] = [
  {
    id: 'visualEffects',
    category: 'general',
    label: 'Efectos Visuales',
    async getState() {
      // Antes solo confirmaba 3 de los 10 valores que apply() escribe
      // (peek/fx/transparencia): si alguno de los otros 7 fallaba en
      // silencio, el tweak igual se mostraba "activado".
      return getRegistryValueToggleState(visualEffectsTargets(), true)
    },
    async apply(enabled) {
      return applyRegistryValueToggle(
        {
          targets: visualEffectsTargets(),
          restoreOriginal: true,
          enabledMessage: 'Efectos visuales reducidos (mejor rendimiento).',
          disabledMessage: 'Efectos visuales restaurados.'
        },
        enabled
      )
    }
  },
  {
    id: 'backgroundApps',
    category: 'general',
    label: 'Apps en Segundo Plano',
    async getState() {
      return getRegistryDwordToggleState({
        targets: [
          {
            keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications',
            valueName: 'GlobalUserDisabled'
          }
        ],
        enabledValue: 1
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [
            {
              keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications',
              valueName: 'GlobalUserDisabled'
            }
          ],
          enabledValue: 1,
          disabledValue: 0,
          restoreOriginal: true,
          enabledMessage: 'Apps en segundo plano bloqueadas.',
          disabledMessage: 'Apps en segundo plano restauradas al valor original.'
        },
        enabled
      )
    }
  },
  {
    id: 'widgetsCopilot',
    category: 'general',
    label: 'Widgets y Copilot',
    async getState() {
      const values = await Promise.all(WIDGETS_COPILOT_TARGETS.map((t) => regQueryDword(t.keyPath, t.valueName)))
      return WIDGETS_COPILOT_TARGETS.every((t, i) => values[i] === t.enabledValue)
    },
    async apply(enabled) {
      if (enabled) {
        const backup = await backupWidgetsCopilotOriginals()
        if (!backup.ok) {
          console.error(`[widgetsCopilot] no se pudo guardar el backup: ${backup.error}`)
          return {
            ok: false,
            verified: false,
            error: backup.error ?? 'No se pudo guardar el backup.',
            message: 'No se pudo guardar el backup; no se aplico el cambio por seguridad'
          }
        }
      }

      const writes = await Promise.all(
        WIDGETS_COPILOT_TARGETS.map((t) => {
          if (enabled) {
            return regSetVerbose(t.keyPath, t.valueName, 'REG_DWORD', String(t.enabledValue))
          }
          const exp = widgetsCopilotDisableExpectation(t)
          return exp.absent
            ? regDeleteVerbose(t.keyPath, t.valueName)
            : regSetVerbose(t.keyPath, t.valueName, 'REG_DWORD', String(exp.value))
        })
      )
      const failed = writes.find((w) => !w.ok)
      if (failed) {
        console.error(`[widgetsCopilot] fallo al escribir: ${failed.error}`)
        return {
          ok: false,
          verified: false,
          error: failed.error ?? 'Error desconocido al escribir en el registro.',
          message: `No se pudo aplicar (revisa permisos de administrador). ${failed.error ?? ''}`.trim()
        }
      }

      const actuals = await Promise.all(WIDGETS_COPILOT_TARGETS.map((t) => regQueryDword(t.keyPath, t.valueName)))
      const verified = WIDGETS_COPILOT_TARGETS.every((t, i) => {
        if (enabled) return actuals[i] === t.enabledValue
        const exp = widgetsCopilotDisableExpectation(t)
        return exp.absent ? actuals[i] === null : actuals[i] === exp.value
      })

      if (!verified) {
        console.error(`[widgetsCopilot] no se pudo confirmar en el registro tras aplicar enabled=${enabled}`)
      }

      return {
        ok: verified,
        verified,
        error: verified ? undefined : 'La escritura no reporto error pero la relectura del registro no confirma el valor esperado.',
        message: verified
          ? enabled
            ? 'Widgets, Chat y Copilot ocultos y bloqueados por politica.'
            : 'Widgets, Chat y Copilot restaurados al valor original.'
          : 'Se aplico el cambio pero no se pudo confirmar en el registro.'
      }
    }
  },
  {
    id: 'services',
    category: 'general',
    label: 'Servicios',
    async getState() {
      return getServiceToggleState({ services: CURATED_SERVICES, enabledType: 'Disabled' })
    },
    async apply(enabled) {
      return applyServiceToggle(
        {
          services: CURATED_SERVICES,
          enabledType: 'Disabled',
          fallbackDisabledType: 'Manual',
          backupId: 'services',
          enabledMessage: 'Servicios no esenciales desactivados.',
          disabledMessage: 'Servicios restaurados a su estado original.'
        },
        enabled
      )
    }
  },
  {
    id: 'memoria',
    category: 'general',
    label: 'Memoria',
    async getState() {
      return getServiceToggleState({ services: ['SysMain'], enabledType: 'Disabled' })
    },
    async apply(enabled) {
      // Antes restauraba siempre a 'Automatic' hardcodeado (el default de
      // fabrica), sin importar si el usuario ya lo tenia en otro estado
      // antes de tocar este tweak. Ahora respalda el StartType real antes
      // de desactivar, igual que 'services'.
      return applyServiceToggle(
        {
          services: ['SysMain'],
          enabledType: 'Disabled',
          fallbackDisabledType: 'Automatic',
          backupId: 'sysmain',
          enabledMessage: 'SysMain desactivado.',
          disabledMessage: 'SysMain restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'scheduledTasks',
    category: 'general',
    label: 'Tareas Agendadas',
    async getState() {
      const states = await getScheduledTasksState()
      return scheduledTasksSatisfied(states, true)
    },
    async apply(enabled) {
      const verb = enabled ? 'Disable-ScheduledTask' : 'Enable-ScheduledTask'
      const script = CURATED_TASKS.map(
        (t) => `${verb} -TaskPath "$(Split-Path '${t}')\\" -TaskName "$(Split-Path '${t}' -Leaf)" -ErrorAction SilentlyContinue`
      ).join('; ')
      const res = await runPowerShell(script)
      if (!res.ok) {
        console.error(`[tweaks] 'scheduledTasks': ${verb} reporto fallo: ${res.stderr}`)
      }

      const states = await getScheduledTasksState()
      const verified = scheduledTasksSatisfied(states, enabled)
      if (!verified) {
        console.error(`[tweaks] 'scheduledTasks': no se pudo confirmar tras aplicar enabled=${enabled}: ${JSON.stringify(states)}`)
      }

      return {
        ok: verified,
        verified,
        error: verified ? undefined : (res.stderr || 'No se pudo confirmar el estado de las tareas tras aplicar.'),
        message: verified
          ? enabled
            ? 'Tareas agendadas desactivadas.'
            : 'Tareas agendadas reactivadas.'
          : 'Se aplico el cambio pero no se pudo confirmar en todas las tareas.'
      }
    }
  },
  {
    id: 'diskWriteOptim',
    category: 'general',
    label: 'Write Cache',
    async getState() {
      return getRegistryDwordToggleState({
        targets: [{ keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', valueName: 'NtfsDisableLastAccessUpdate' }],
        enabledValue: 1,
        isEnabledValue: ntfsLastAccessUpdatesReduced
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [{ keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', valueName: 'NtfsDisableLastAccessUpdate' }],
          enabledValue: 1,
          disabledValue: 0,
          restoreOriginal: true,
          isEnabledValue: ntfsLastAccessUpdatesReduced,
          enabledMessage: 'Escrituras de acceso a disco reducidas.',
          disabledMessage: 'Comportamiento NTFS por defecto restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'rawInput',
    category: 'general',
    label: 'Raw Input',
    async getState() {
      // Antes solo confirmaba MouseSpeed; los otros 2 thresholds podian
      // quedar sin aplicar y el tweak igual se mostraba "activado".
      return getRegistryValueToggleState(rawInputTargets(), true)
    },
    async apply(enabled) {
      return applyRegistryValueToggle(
        {
          targets: rawInputTargets(),
          restoreOriginal: true,
          enabledMessage: 'Aceleracion de mouse desactivada.',
          disabledMessage: 'Aceleracion de mouse restaurada.'
        },
        enabled
      )
    }
  },
  {
    id: 'internet',
    category: 'general',
    label: 'Internet',
    async getState() {
      // Activado = Nagle en TODAS las NICs activas (no .some() sobre una) Y
      // NetworkThrottlingIndex en DWORD_MAX. Si falta cualquiera, el switch
      // queda apagado: no hay falso positivo parcial.
      const guids = await listUpInterfaceGuids()
      const [nagle, throttle] = await Promise.all([internetNagleEnabled(guids), internetThrottleEnabled()])
      return nagle && throttle
    },
    async apply(enabled) {
      const tune = await runCmd('netsh.exe', ['int', 'tcp', 'set', 'global', 'autotuninglevel=normal'])
      const throttleSpec = internetThrottleSpec(
        'NetworkThrottlingIndex sin limite.',
        'NetworkThrottlingIndex restaurado al valor original.'
      )
      // Sin backup (nunca se activo por esta app) no se toca la clave al
      // desactivar: escribir un 10 fijo inventaria un default.
      const shouldTouchThrottle = enabled || getBackup<number | null>(INTERNET_THROTTLE_BACKUP_ID) !== undefined
      let throttleRes: TweakResult | null = null
      if (shouldTouchThrottle) {
        throttleRes = await applyRegistryDwordToggle(throttleSpec, enabled)
        if (enabled && !throttleRes.ok) {
          return {
            ok: false,
            verified: false,
            error: throttleRes.error,
            message: throttleRes.message
          }
        }
      }

      const guids = await listUpInterfaceGuids()
      if (guids.length === 0) {
        const throttleOk = throttleRes ? throttleRes.verified : true
        const verified = tune.ok && throttleOk
        return {
          ok: verified,
          verified,
          error: verified ? undefined : throttleRes?.error || tune.stderr || 'No se pudo configurar el auto-tuning TCP.',
          message: verified
            ? enabled
              ? 'Sin NIC activa; auto-tuning en normal y NetworkThrottlingIndex sin limite.'
              : 'Sin NIC activa; auto-tuning en normal y NetworkThrottlingIndex restaurado.'
            : 'Se aplico el cambio pero no se pudo confirmar.'
        }
      }

      const targets = internetInterfaceTargets(guids)
      const writes = await Promise.all(
        targets.map((t) =>
          enabled ? regSetVerbose(t.keyPath, t.valueName, 'REG_DWORD', '1') : regDeleteVerbose(t.keyPath, t.valueName)
        )
      )
      const failed = writes.find((w) => !w.ok)
      if (failed) {
        if (enabled) {
          console.error(`[tweaks] 'internet': fallo al escribir Nagle: ${failed.error}`)
          return {
            ok: false,
            verified: false,
            error: failed.error ?? 'Error desconocido al escribir en el registro.',
            message: `No se pudo aplicar (revisa permisos de administrador). ${failed.error ?? ''}`.trim()
          }
        }
        console.warn(`[tweaks] 'internet': aviso al restaurar Nagle: ${failed.error}`)
      }

      const nagleOk = enabled ? await internetNagleEnabled(guids) : await internetNagleCleared(guids)
      const throttleOk = throttleRes ? throttleRes.verified : true
      const verified = tune.ok && nagleOk && throttleOk
      if (!verified) {
        console.error(`[tweaks] 'internet': no se pudo confirmar tras aplicar enabled=${enabled}`)
      }
      return {
        ok: verified,
        verified,
        error: verified
          ? undefined
          : 'La escritura no reporto error pero la relectura del registro (Nagle y/o NetworkThrottlingIndex) o el auto-tuning no confirma el valor esperado.',
        message: verified
          ? enabled
            ? 'Nagle desactivado en la NIC activa. NetworkThrottlingIndex sin limite. Auto-tuning en normal.'
            : 'Nagle y NetworkThrottlingIndex restaurados. Auto-tuning en normal.'
          : 'Se aplico el cambio pero no se pudo confirmar.'
      }
    }
  },
  {
    id: 'powerPlan',
    category: 'general',
    label: 'Power Mod',
    async getState() {
      return powerPlanActiveIsPerformance()
    },
    async apply(enabled) {
      if (enabled) {
        const guid = await ensurePerformanceScheme()
        if (!guid) {
          return {
            ok: false,
            verified: false,
            error: 'No se pudo crear/encontrar el plan de maximo rendimiento.',
            message: 'No se pudo crear el plan de maximo rendimiento.'
          }
        }
        const r1 = await runCmd('powercfg.exe', ['/setactive', guid])
        const r2 = await runCmd('powercfg.exe', ['/hibernate', 'off'])
        if (!r1.ok || !r2.ok) {
          const error = r1.stderr || r2.stderr || 'powercfg.exe fallo.'
          console.error(`[tweaks] 'powerPlan': fallo al activar: ${error}`)
          return {
            ok: false,
            verified: false,
            error,
            message: `No se pudo aplicar (revisa permisos de administrador). ${error}`.trim()
          }
        }
        // powercfg puede devolver exit code 0 aunque el esquema no haya
        // quedado activo o la hibernacion no se haya podido apagar (ej. por
        // BitLocker con hibernacion requerida); relee ambos.
        const verified = (await powerPlanActiveIsPerformance()) && (await hibernateEnabledValue()) === 0
        if (!verified) {
          console.error(`[tweaks] 'powerPlan': no se pudo confirmar tras activar`)
        }
        return {
          ok: verified,
          verified,
          error: verified
            ? undefined
            : 'powercfg no reporto error pero el esquema activo o el estado de hibernacion no coincide con lo esperado.',
          message: verified
            ? 'Plan de maximo rendimiento activo, hibernacion desactivada.'
            : 'Se aplico el cambio pero no se pudo confirmar.'
        }
      }

      const balanced = await ensureBalancedScheme()
      const r1 = await runCmd('powercfg.exe', ['/setactive', balanced])
      const r2 = await runCmd('powercfg.exe', ['/hibernate', 'on'])
      if (!r1.ok || !r2.ok) {
        const error = r1.stderr || r2.stderr || 'powercfg.exe fallo.'
        console.error(`[tweaks] 'powerPlan': fallo al restaurar: ${error}`)
        return {
          ok: false,
          verified: false,
          error,
          message: `No se pudo restaurar (revisa permisos de administrador). ${error}`.trim()
        }
      }
      const verified = !(await powerPlanActiveIsPerformance()) && (await hibernateEnabledValue()) === 1
      if (!verified) {
        console.error(`[tweaks] 'powerPlan': no se pudo confirmar tras restaurar`)
      }
      return {
        ok: verified,
        verified,
        error: verified
          ? undefined
          : 'powercfg no reporto error pero el esquema activo o el estado de hibernacion no coincide con lo esperado.',
        message: verified ? 'Plan balanceado restaurado.' : 'Se aplico el cambio pero no se pudo confirmar.'
      }
    }
  },
  {
    id: 'usbDevices',
    category: 'general',
    label: 'Dispositivos USB',
    async getState() {
      // Ojo: "0x00000001" tambien empieza con "0x0", asi que un match parcial
      // siempre daba true sin importar el valor real. Hay que parsear el
      // numero completo y compararlo con 0.
      return usbSelectiveSuspendOff()
    },
    async apply(enabled) {
      const value = enabled ? '0' : '1'
      const writes = await Promise.all([
        runCmd('powercfg.exe', ['/setacvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP_GUID, USB_SELECTIVE_SUSPEND_GUID, value]),
        runCmd('powercfg.exe', ['/setdcvalueindex', 'SCHEME_CURRENT', USB_SUBGROUP_GUID, USB_SELECTIVE_SUSPEND_GUID, value])
      ])
      const failedWrite = writes.find((w) => !w.ok)
      const activate = await runCmd('powercfg.exe', ['/setactive', 'SCHEME_CURRENT'])
      if (failedWrite || !activate.ok) {
        const error = failedWrite?.stderr || activate.stderr || 'powercfg.exe fallo.'
        console.error(`[tweaks] 'usbDevices': fallo al aplicar: ${error}`)
        return {
          ok: false,
          verified: false,
          error,
          message: `No se pudo aplicar (revisa permisos de administrador). ${error}`.trim()
        }
      }

      const ac = await usbSelectiveSuspendAcIndex()
      const expected = enabled ? 0 : 1
      const verified = ac === expected
      if (!verified) {
        console.error(`[tweaks] 'usbDevices': no se pudo confirmar tras aplicar enabled=${enabled} (AC=${ac})`)
      }
      return {
        ok: verified,
        verified,
        error: verified
          ? undefined
          : 'powercfg no reporto error pero la relectura del plan de energia no confirma el valor esperado.',
        message: verified
          ? enabled
            ? 'Suspension selectiva USB desactivada.'
            : 'Suspension selectiva USB restaurada.'
          : 'Se aplico el cambio pero no se pudo confirmar.'
      }
    }
  },
  {
    id: 'nicLatency',
    category: 'general',
    label: 'NIC Latency',
    async getState() {
      return nicLatencyReady()
    },
    async apply(enabled) {
      const report = await inspectNicLatency(true, enabled)
      if ('error' in report) {
        console.error(`[tweaks] 'nicLatency': ${report.error}`)
        return {
          ok: false,
          verified: false,
          error: report.error,
          message: `No se pudo consultar/aplicar en la NIC. ${report.error}`
        }
      }
      const result = nicLatencyTweakResult(report, enabled)
      if (!result.ok) {
        console.error(`[tweaks] 'nicLatency': ${result.error ?? result.message}`)
      } else if (!result.verified) {
        console.warn(`[tweaks] 'nicLatency': parcial: ${result.message}`)
      } else if (/no soporta Power Management/i.test(result.message)) {
        console.warn(`[tweaks] 'nicLatency': ${result.message}`)
      }
      return result
    }
  },
  {
    id: 'msiIrq',
    category: 'general',
    label: 'MSI/IRQ Features',
    requiresRestart: true,
    async getState() {
      return getMsiState()
    },
    async apply(enabled) {
      return setMsiModeForGpuAndNic(enabled)
    }
  },
  {
    id: 'graphicsTweaks',
    category: 'general',
    label: 'Graphics Tweaks (experimental)',
    requiresRestart: true,
    async getState() {
      return getRegistryDwordToggleState({
        targets: [{ keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', valueName: 'HwSchMode' }],
        enabledValue: 2
      })
    },
    async apply(enabled) {
      // requiresRestart ya esta declarado a nivel del tweak (arriba); no
      // hace falta (ni sirve, toggleTweak() lo ignora) repetirlo aca.
      return applyRegistryDwordToggle(
        {
          targets: [{ keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', valueName: 'HwSchMode' }],
          enabledValue: 2,
          disabledValue: 1,
          restoreOriginal: true,
          enabledMessage: 'GPU Scheduling activado.',
          disabledMessage: 'GPU Scheduling restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'ifeo',
    category: 'general',
    label: 'IFEO',
    async getState() {
      // Confirma los 4 ejecutables, no solo SearchIndexer.exe: antes, si el
      // resto fallaba en silencio, el tweak igual se mostraba "activado".
      return getRegistryDwordToggleState({ targets: ifeoTargets(), enabledValue: 1 })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: ifeoTargets(),
          enabledValue: 1,
          disabledValue: 3,
          restoreOriginal: true,
          enabledMessage: 'Prioridad de procesos de fondo reducida.',
          disabledMessage: 'Prioridad de procesos de fondo restaurada.'
        },
        enabled
      )
    }
  },
  {
    id: 'winDefender',
    category: 'general',
    label: 'Win Defender',
    async getState() {
      const res = await runPowerShellJson<{ DisableRealtimeMonitoring: boolean }>('Get-MpPreference | Select-Object DisableRealtimeMonitoring')
      return res?.DisableRealtimeMonitoring === true
    },
    async apply(enabled) {
      const res = await runPowerShell(`Set-MpPreference -DisableRealtimeMonitoring ${enabled ? '$true' : '$false'}`)
      if (!res.ok) {
        console.error(`[tweaks] 'winDefender': Set-MpPreference fallo: ${res.stderr || res.stdout}`)
        return {
          ok: false,
          verified: false,
          error: res.stderr || res.stdout || 'Set-MpPreference fallo.',
          message:
            'No se pudo cambiar (Tamper Protection esta activo). Desactivalo manualmente en Seguridad de Windows > Proteccion contra virus para poder usar este tweak.'
        }
      }

      // Verificacion post-aplicacion real: Tamper Protection puede bloquear el
      // cambio silenciosamente (Set-MpPreference devuelve exit code 0 igual).
      // No alcanza con confiar en res.ok.
      const check = await runPowerShellJson<{ DisableRealtimeMonitoring: boolean }>(
        'Get-MpPreference | Select-Object DisableRealtimeMonitoring'
      )
      const verified = check?.DisableRealtimeMonitoring === enabled
      if (!verified) {
        console.error(
          `[tweaks] 'winDefender': no se pudo confirmar tras aplicar enabled=${enabled} (posible Tamper Protection revirtiendolo en silencio)`
        )
      }

      return {
        ok: verified,
        verified,
        error: verified
          ? undefined
          : 'El comando no reporto error pero Windows Defender no confirma el cambio (revisa Tamper Protection en Seguridad de Windows).',
        message: verified
          ? enabled
            ? 'PROTECCION EN TIEMPO REAL PAUSADA: el antivirus no esta escaneando ni bloqueando malware ahora mismo. Reactivala apenas termines de jugar.'
            : 'Proteccion en tiempo real de Windows Defender restaurada: el antivirus vuelve a escanear en tiempo real.'
          : 'Se envio el comando pero no se pudo confirmar el estado real (revisa Tamper Protection en Seguridad de Windows).'
      }
    }
  },
  {
    id: 'location',
    category: 'fixes',
    label: 'Localizacion',
    async getState() {
      const [states, consent] = await Promise.all([
        serviceStartTypeBatch(['lfsvc']),
        regQuery(
          'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
          'Value'
        )
      ])
      return serviceStartTypeMatches(states.lfsvc, START_TYPE_MAP.Automatic) && consent === 'Allow'
    },
    async apply(enabled) {
      // 'Manual' (no 'Disabled') es el StartType por defecto real de lfsvc
      // en Windows 10/11 (trigger-start): no hace falta backup, restaurar a
      // 'Manual' ya es volver al default documentado, no un valor inventado.
      const svcOk = await setServiceStartType('lfsvc', enabled ? 'Automatic' : 'Manual')
      if (!svcOk) {
        console.error("[tweaks] 'location': Set-Service reporto fallo al ajustar lfsvc")
      }
      const write = await regSetVerbose(
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
        'Value',
        'REG_SZ',
        enabled ? 'Allow' : 'Deny'
      )
      if (!write.ok) {
        console.error(`[tweaks] 'location': fallo al escribir el consent store: ${write.error}`)
      }
      if (enabled) await runPowerShell('Start-Service -Name lfsvc -ErrorAction SilentlyContinue')

      const [states, consent] = await Promise.all([
        serviceStartTypeBatch(['lfsvc']),
        regQuery(
          'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
          'Value'
        )
      ])
      const expectedStart = START_TYPE_MAP[enabled ? 'Automatic' : 'Manual']
      const expectedConsent = enabled ? 'Allow' : 'Deny'
      const verified = serviceStartTypeMatches(states.lfsvc, expectedStart) && consent === expectedConsent
      if (!verified) {
        console.error(
          `[tweaks] 'location': no se pudo confirmar tras aplicar enabled=${enabled} (StartType=${states.lfsvc}, consent=${consent})`
        )
      }
      return {
        ok: verified,
        verified,
        error: verified ? undefined : (write.error ?? 'No se pudo confirmar el servicio/consent store tras aplicar.'),
        message: verified
          ? enabled
            ? 'Servicio de localizacion activado.'
            : 'Servicio de localizacion desactivado.'
          : 'Se aplico el cambio pero no se pudo confirmar (servicio y/o consent store).'
      }
    }
  },
  {
    id: 'notifications',
    category: 'fixes',
    label: 'Notificaciones',
    async getState() {
      // ToastEnabled ausente equivale al default de Windows (notificaciones
      // activas), no a "no confirmado".
      return getRegistryDwordToggleState({
        targets: [{ keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', valueName: 'ToastEnabled' }],
        enabledValue: 1,
        treatMissingAsEnabled: true
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [{ keyPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications', valueName: 'ToastEnabled' }],
          enabledValue: 1,
          disabledValue: 0,
          restoreOriginal: true,
          enabledMessage: 'Notificaciones activadas.',
          disabledMessage: 'Notificaciones desactivadas.'
        },
        enabled
      )
    }
  },
  {
    id: 'hvci',
    category: 'fixes',
    label: 'Aislamiento de Nucleo y HVCI',
    requiresRestart: true,
    async getState() {
      return getRegistryDwordToggleState({
        targets: [
          {
            keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
            valueName: 'Enabled'
          }
        ],
        enabledValue: 1
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [
            {
              keyPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
              valueName: 'Enabled'
            }
          ],
          enabledValue: 1,
          disabledValue: 0,
          restoreOriginal: true,
          enabledMessage: 'HVCI activado. Reinicia para aplicar. La proteccion de Integridad de Memoria queda activa.',
          disabledMessage:
            'ATENCION: HVCI (Aislamiento de Nucleo / Integridad de Memoria) DESACTIVADO. Reinicia para aplicar. Perdes la proteccion contra exploits/rootkits a nivel kernel hasta que lo reactives.'
        },
        enabled
      )
    }
  },
  ...NVIDIA_PROFILE_IDS.map((id) => ({
    id,
    category: 'nvidia' as const,
    label: id,
    gate: 'nvidia' as const,
    requiresRestart: true,
    async getState() {
      return isNvidiaProfileEnabled(id)
    },
    async apply(enabled: boolean) {
      return applyNvidiaProfile(enabled ? (id as NvidiaProfileId) : null)
    }
  })),
  {
    id: 'amdBasic',
    category: 'amd',
    label: 'Ajustes Basicos',
    gate: 'amd',
    requiresRestart: true,
    async getState() {
      return getAdapterDwordTweakState({ vendor: 'AMD', valueName: 'KMD_EnableInGameUI', enabledValue: 0 })
    },
    async apply(enabled) {
      return applyAdapterDwordTweak(
        {
          vendor: 'AMD',
          valueName: 'KMD_EnableInGameUI',
          enabledValue: 0,
          notFoundMessage: 'No se detecto una GPU AMD.',
          enabledMessage: 'Overlay de AMD desactivado.',
          disabledMessage: 'Valor por defecto del driver restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'gameMode',
    category: 'games',
    label: 'Game Mode',
    async getState() {
      // AutoGameModeEnabled ausente equivale al default de Windows (Game
      // Mode automatico activo), no a "no confirmado".
      return getRegistryDwordToggleState({
        targets: [{ keyPath: 'HKCU\\Software\\Microsoft\\GameBar', valueName: 'AutoGameModeEnabled' }],
        enabledValue: 1,
        treatMissingAsEnabled: true
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [{ keyPath: 'HKCU\\Software\\Microsoft\\GameBar', valueName: 'AutoGameModeEnabled' }],
          enabledValue: 1,
          disabledValue: 0,
          restoreOriginal: true,
          enabledMessage: 'Game Mode activado.',
          disabledMessage: 'Game Mode desactivado.'
        },
        enabled
      )
    }
  },
  {
    id: 'gaming',
    category: 'games',
    label: 'Gaming',
    async getState() {
      return getRegistryValueToggleState(gamingProfileTargets(), true)
    },
    async apply(enabled) {
      return applyRegistryValueToggle(
        {
          targets: gamingProfileTargets(),
          restoreOriginal: true,
          enabledMessage: 'Prioridad maxima para el juego activo.',
          disabledMessage: 'Perfil MMCSS restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'gameDvrFse',
    category: 'games',
    label: 'Game DVR & FSE',
    async getState() {
      return getRegistryDwordToggleState({
        targets: [
          { keyPath: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_Enabled' },
          { keyPath: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_FSEBehaviorMode', enabledValue: 2, disabledValue: 0 },
          { keyPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR', valueName: 'AllowGameDVR' }
        ],
        enabledValue: 0
      })
    },
    async apply(enabled) {
      return applyRegistryDwordToggle(
        {
          targets: [
            { keyPath: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_Enabled' },
            { keyPath: 'HKCU\\System\\GameConfigStore', valueName: 'GameDVR_FSEBehaviorMode', enabledValue: 2, disabledValue: 0 },
            { keyPath: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR', valueName: 'AllowGameDVR' }
          ],
          enabledValue: 0,
          disabledValue: 1,
          restoreOriginal: true,
          enabledMessage: 'Game DVR y optimizaciones de pantalla completa desactivadas.',
          disabledMessage: 'Game DVR restaurado.'
        },
        enabled
      )
    }
  },
  {
    id: 'corePin',
    category: 'games',
    label: 'CorePin',
    async getState() {
      return isCorePinEnabled()
    },
    async apply(enabled) {
      return applyCorePin(enabled)
    }
  },
  {
    id: 'autoCpuSet',
    category: 'games',
    label: 'Auto CPU Set',
    async getState() {
      return isAutoCpuSetEnabled()
    },
    async apply(enabled) {
      return applyLocalFlagToggle(setAutoCpuSetEnabled, isAutoCpuSetEnabled, enabled, {
        enabledMessage: 'Auto CPU Set activado.',
        disabledMessage: 'Auto CPU Set desactivado (los perfiles solo se aplican manualmente).',
        logPrefix: 'autoCpuSet'
      })
    }
  }
]

function toTweakDef(
  t: TweakRuntime,
  vendor: { nvidia: boolean; amd: boolean },
  enabled = false
): TweakDef {
  const gateSatisfied = t.gate === 'nvidia' ? vendor.nvidia : t.gate === 'amd' ? vendor.amd : true
  return {
    id: t.id,
    category: t.category,
    label: t.label,
    enabled,
    requiresRestart: t.requiresRestart ?? false,
    gate: t.gate ?? null,
    gateSatisfied
  }
}

export function peekTweaksCache(): TweakDef[] | null {
  return tweaksCache
}

export function listTweaksSkeleton(): TweakDef[] {
  const vendor = vendorCache ?? { nvidia: true, amd: true }
  return TWEAKS.map((t) => toTweakDef(t, vendor, false))
}

async function primeTweakReads(): Promise<void> {
  const [, services] = await Promise.all([
    Promise.all([getVendor(), warmupMsiTargets()]),
    serviceStartTypeBatch([...CURATED_SERVICES, 'SysMain', 'lfsvc'])
  ])
  primedServices = services
}

async function listTweaksFresh(): Promise<TweakDef[]> {
  try {
    await primeTweakReads()
    const vendor = await getVendor()
    const results = await Promise.all(
      TWEAKS.map(async (t) => {
        const gateSatisfied = t.gate === 'nvidia' ? vendor.nvidia : t.gate === 'amd' ? vendor.amd : true
        let enabled = false
        try {
          enabled = gateSatisfied ? await t.getState() : false
        } catch (err) {
          console.error(`[tweaks] getState '${t.id}' no pudo leer el sistema: ${String(err)}`)
          enabled = false
        }
        return toTweakDef(t, vendor, enabled)
      })
    )
    tweaksCache = results
    tweaksCachedAt = Date.now()
    return results
  } finally {
    primedServices = null
  }
}

function refreshTweaksInBackground(): void {
  if (tweaksInflight) return
  tweaksInflight = listTweaksFresh().finally(() => {
    tweaksInflight = null
  })
}

export async function listTweaks(): Promise<TweakDef[]> {
  if (tweaksCache && Date.now() - tweaksCachedAt < TWEAKS_CACHE_MS) return tweaksCache
  if (tweaksCache) {
    refreshTweaksInBackground()
    return tweaksCache
  }
  if (tweaksInflight) return tweaksInflight
  tweaksInflight = listTweaksFresh().finally(() => {
    tweaksInflight = null
  })
  return tweaksInflight
}

export async function warmupTweaks(): Promise<void> {
  await listTweaks()
}

export async function applyRecommendedTweaks(): Promise<RecommendedTweaksResult> {
  const log: string[] = []
  const enabled: string[] = []
  const failed: string[] = []
  const denied = await requireElevated()
  if (denied) {
    log.push(`${denied.message} (TCP auto-tuning).`)
  } else {
    const tune = await runCmd('netsh.exe', ['int', 'tcp', 'set', 'global', 'autotuninglevel=normal'])
    log.push(tune.ok ? 'TCP auto-tuning: normal.' : 'TCP auto-tuning: no se pudo dejar en normal.')
  }
  for (const id of RECOMMENDED_IDS) {
    const tweak = TWEAKS.find((t) => t.id === id)
    if (!tweak) {
      failed.push(id)
      log.push(`${id}: tweak desconocido.`)
      continue
    }
    let already = false
    try {
      already = await tweak.getState()
    } catch {
      already = false
    }
    if (already) {
      enabled.push(id)
      log.push(`${id}: ya activo.`)
      continue
    }
    const res = await toggleTweak(id, true)
    log.push(`${id}: ${res.ok ? res.message : `ERROR ${res.message}`}`)
    if (res.ok) enabled.push(id)
    else failed.push(id)
  }
  return { ok: failed.length === 0, log, enabled, failed }
}

export async function toggleTweak(id: string, enabled: boolean): Promise<TweakToggleResult> {
  const tweak = TWEAKS.find((t) => t.id === id)
  if (!tweak) return { ok: false, id, enabled: !enabled, message: 'Tweak desconocido.' }
  try {
    if (REQUIRES_ADMIN_IDS.has(id)) {
      const denied = await requireElevated()
      if (denied) {
        return {
          ok: false,
          id,
          enabled: !enabled,
          message: denied.message,
          verified: false,
          error: denied.error
        }
      }
    }
    const result = await tweak.apply(enabled)
    // `verified` solo esta presente en los tweaks ya migrados al patron
    // TweakResult (ver shared/types.ts). Para el resto (todavia no migrados
    // en fases posteriores) se mantiene el comportamiento previo: `ok` solo
    // refleja si la escritura no reporto error.
    const verified = (result as { verified?: boolean }).verified
    const succeeded = result.ok && verified !== false
    if (succeeded && tweaksCache) {
      const profileIds = NVIDIA_PROFILE_IDS as readonly string[]
      tweaksCache = tweaksCache.map((t) => {
        if (profileIds.includes(id) && profileIds.includes(t.id)) return { ...t, enabled: enabled && t.id === id }
        if (t.id === id) return { ...t, enabled }
        return t
      })
      tweaksCachedAt = Date.now()
    } else {
      invalidateTweaksCache()
    }
    return {
      ok: succeeded,
      id,
      enabled: succeeded ? enabled : !enabled,
      message: result.message,
      requiresRestart: tweak.requiresRestart,
      verified,
      error: (result as { error?: string }).error
    }
  } catch (err) {
    console.error(`[tweaks] excepcion no capturada al aplicar '${id}':`, err)
    return { ok: false, id, enabled: !enabled, message: `Error: ${String(err)}`, error: String(err) }
  }
}