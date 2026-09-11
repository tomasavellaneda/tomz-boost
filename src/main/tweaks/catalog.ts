import si from 'systeminformation'
import { regQuery, regSet } from '../utils/registry'
import { runCmd, runPowerShell, runPowerShellJson } from '../utils/shell'
import { saveBackup, getBackup } from './backup'
import { findGpuAdapterKeys, setValueOnAdapters } from './gpuRegistry'
import { getMsiState, setMsiModeForGpuAndNic } from './msiMode'
import { isCorePinEnabled, setCorePinEnabled } from './corePin'
import { isAutoCpuSetEnabled, setAutoCpuSetEnabled } from './autoCpuSet'
import type { TweakCategory, TweakDef, TweakToggleResult } from '../../shared/types'

interface TweakRuntime {
  id: string
  category: TweakCategory
  label: string
  description: string
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

const START_TYPE_MAP: Record<string, number> = { Automatic: 2, Manual: 3, Disabled: 4 }

async function serviceStartType(name: string): Promise<number | null> {
  const res = await runPowerShell(`(Get-Service -Name '${name}' -ErrorAction SilentlyContinue).StartType`)
  if (!res.stdout) return null
  return START_TYPE_MAP[res.stdout.trim()] ?? null
}

interface ServiceRow {
  Name: string
  StartType: string
}

/** Consulta varios servicios en un solo proceso de PowerShell (evita N spawns). */
async function serviceStartTypeBatch(names: string[]): Promise<Record<string, number | null>> {
  const list = names.map((n) => `'${n}'`).join(',')
  const rows = await runPowerShellJson<ServiceRow[] | ServiceRow>(
    `Get-Service -Name ${list} -ErrorAction SilentlyContinue | Select-Object Name, StartType`
  )
  const out: Record<string, number | null> = {}
  const arr = rows ? (Array.isArray(rows) ? rows : [rows]) : []
  for (const n of names) out[n] = null
  for (const row of arr) out[row.Name] = START_TYPE_MAP[row.StartType] ?? null
  return out
}

async function setServiceStartType(name: string, type: 'Automatic' | 'Manual' | 'Disabled'): Promise<boolean> {
  const res = await runPowerShell(
    `Set-Service -Name '${name}' -StartupType ${type} -ErrorAction SilentlyContinue; Stop-Service -Name '${name}' -Force -ErrorAction SilentlyContinue`
  )
  return res.ok
}

async function detectVendor(): Promise<{ nvidia: boolean; amd: boolean }> {
  const graphics = await si.graphics()
  const text = graphics.controllers.map((c) => `${c.vendor} ${c.model}`).join(' ').toUpperCase()
  return { nvidia: text.includes('NVIDIA'), amd: text.includes('AMD') || text.includes('RADEON') }
}

let vendorCache: { nvidia: boolean; amd: boolean } | null = null
async function getVendor() {
  if (!vendorCache) vendorCache = await detectVendor()
  return vendorCache
}

const TWEAKS: TweakRuntime[] = [
  {
    id: 'visualEffects',
    category: 'general',
    label: 'Efectos Visuales',
    description: 'Desactiva transparencias y animaciones de Windows para reducir el uso de GPU/CPU.',
    async getState() {
      const v = await regQuery('HKCU\\Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek')
      return v === '0'
    },
    async apply(enabled) {
      const ok1 = await regSet(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
        'VisualFXSetting',
        'REG_DWORD',
        enabled ? '2' : '1'
      )
      const ok2 = await regSet(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
        'TaskbarAnimations',
        'REG_DWORD',
        enabled ? '0' : '1'
      )
      const ok3 = await regSet('HKCU\\Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek', 'REG_DWORD', enabled ? '0' : '1')
      return { ok: ok1 && ok2 && ok3, message: enabled ? 'Efectos visuales reducidos.' : 'Efectos visuales restaurados.' }
    }
  },
  {
    id: 'backgroundApps',
    category: 'general',
    label: 'Apps en Segundo Plano',
    description: 'Impide que las apps de la Microsoft Store sigan corriendo en segundo plano.',
    async getState() {
      const v = await regQuery(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications',
        'GlobalUserDisabled'
      )
      return v === '1'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications',
        'GlobalUserDisabled',
        'REG_DWORD',
        enabled ? '1' : '0'
      )
      return { ok, message: enabled ? 'Apps en segundo plano bloqueadas.' : 'Apps en segundo plano permitidas.' }
    }
  },
  {
    id: 'services',
    category: 'general',
    label: 'Servicios',
    description: 'Desactiva servicios de telemetria y no esenciales en segundo plano (DiagTrack, MapsBroker, etc).',
    async getState() {
      const states = await serviceStartTypeBatch(CURATED_SERVICES)
      return CURATED_SERVICES.every((s) => states[s] === 4 || states[s] === null)
    },
    async apply(enabled) {
      if (enabled) {
        const originals = await serviceStartTypeBatch(CURATED_SERVICES)
        saveBackup('services', originals)
        const results = await Promise.all(CURATED_SERVICES.map((s) => setServiceStartType(s, 'Disabled')))
        return { ok: results.every(Boolean), message: 'Servicios no esenciales desactivados.' }
      }
      const originals = getBackup<Record<string, number | null>>('services') || {}
      const reverse: Record<number, 'Automatic' | 'Manual' | 'Disabled'> = { 2: 'Automatic', 3: 'Manual', 4: 'Disabled' }
      const results = await Promise.all(
        CURATED_SERVICES.map((s) => setServiceStartType(s, reverse[originals[s] ?? 3] ?? 'Manual'))
      )
      return { ok: results.every(Boolean), message: 'Servicios restaurados a su estado original.' }
    }
  },
  {
    id: 'memoria',
    category: 'general',
    label: 'Memoria',
    description: 'Desactiva SysMain (Superfetch) para reducir el uso de disco/RAM en segundo plano.',
    async getState() {
      const t = await serviceStartType('SysMain')
      return t === 4
    },
    async apply(enabled) {
      const ok = await setServiceStartType('SysMain', enabled ? 'Disabled' : 'Automatic')
      return { ok, message: enabled ? 'SysMain desactivado.' : 'SysMain restaurado.' }
    }
  },
  {
    id: 'scheduledTasks',
    category: 'general',
    label: 'Tareas Agendadas',
    description: 'Desactiva tareas agendadas de telemetria/diagnostico que corren en segundo plano.',
    async getState() {
      // Un solo proceso de PowerShell consulta las 5 tareas (Get-ScheduledTask
      // es un cmdlet nativo, no spawnea schtasks.exe por cada llamada).
      const script = CURATED_TASKS.map(
        (t) => `Get-ScheduledTask -TaskPath "$(Split-Path '${t}')\\" -TaskName "$(Split-Path '${t}' -Leaf)" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty State`
      ).join('; ')
      const res = await runPowerShell(script)
      const lines = res.stdout.split(/\r?\n/).filter(Boolean)
      if (lines.length === 0) return false
      return lines.every((l) => l.trim() === 'Disabled')
    },
    async apply(enabled) {
      const verb = enabled ? 'Disable-ScheduledTask' : 'Enable-ScheduledTask'
      const script = CURATED_TASKS.map(
        (t) => `${verb} -TaskPath "$(Split-Path '${t}')\\" -TaskName "$(Split-Path '${t}' -Leaf)" -ErrorAction SilentlyContinue`
      ).join('; ')
      const res = await runPowerShell(script)
      return {
        ok: res.ok,
        message: enabled ? 'Tareas agendadas desactivadas.' : 'Tareas agendadas reactivadas.'
      }
    }
  },
  {
    id: 'diskWriteOptim',
    category: 'general',
    label: 'Write Cache',
    description: 'Desactiva la actualizacion de "ultimo acceso" NTFS para reducir escrituras a disco.',
    async getState() {
      const v = await regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', 'NtfsDisableLastAccessUpdate')
      return v === '1'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
        'NtfsDisableLastAccessUpdate',
        'REG_DWORD',
        enabled ? '1' : '0'
      )
      return { ok, message: enabled ? 'Escrituras de acceso a disco reducidas.' : 'Comportamiento NTFS por defecto restaurado.' }
    }
  },
  {
    id: 'rawInput',
    category: 'general',
    label: 'Raw Input',
    description: 'Desactiva la aceleracion del mouse para un input consistente en mouses de alta taza de polling.',
    async getState() {
      const v = await regQuery('HKCU\\Control Panel\\Mouse', 'MouseSpeed')
      return v === '0'
    },
    async apply(enabled) {
      const speed = enabled ? '0' : '1'
      const t1 = enabled ? '0' : '6'
      const t2 = enabled ? '0' : '10'
      const results = await Promise.all([
        regSet('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', speed),
        regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', t1),
        regSet('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', t2)
      ])
      return {
        ok: results.every(Boolean),
        message: enabled ? 'Aceleracion de mouse desactivada.' : 'Aceleracion de mouse restaurada.',
        requiresRestart: false
      }
    }
  },
  {
    id: 'internet',
    category: 'general',
    label: 'Internet',
    description: 'Optimiza el stack TCP (auto-tuning/ECN) para reducir ping en juegos online.',
    async getState() {
      const res = await runPowerShell('(Get-NetTCPSetting -SettingName Internet).AutoTuningLevelLocal')
      return res.stdout.trim().toLowerCase() === 'disabled'
    },
    async apply(enabled) {
      const results = await Promise.all([
        runCmd('netsh.exe', ['int', 'tcp', 'set', 'global', `autotuninglevel=${enabled ? 'disabled' : 'normal'}`]),
        runCmd('netsh.exe', ['int', 'tcp', 'set', 'global', `ecncapability=${enabled ? 'disabled' : 'enabled'}`])
      ])
      return { ok: results.every((r) => r.ok), message: enabled ? 'Stack TCP optimizado.' : 'Stack TCP restaurado.' }
    }
  },
  {
    id: 'powerPlan',
    category: 'general',
    label: 'Power Mod',
    description: 'Activa el plan de energia de maximo rendimiento y desactiva la hibernacion.',
    async getState() {
      const res = await runCmd('powercfg.exe', ['/getactivescheme'])
      return res.stdout.includes(HIGH_PERF_GUID)
    },
    async apply(enabled) {
      const r1 = await runCmd('powercfg.exe', ['/setactive', enabled ? HIGH_PERF_GUID : BALANCED_GUID])
      const r2 = await runCmd('powercfg.exe', ['/hibernate', enabled ? 'off' : 'on'])
      return {
        ok: r1.ok && r2.ok,
        message: enabled ? 'Maximo rendimiento activado, hibernacion desactivada.' : 'Plan balanceado restaurado.'
      }
    }
  },
  {
    id: 'usbDevices',
    category: 'general',
    label: 'Dispositivos USB',
    description: 'Impide que Windows suspenda perifericos USB para ahorrar energia (reduce input lag).',
    async getState() {
      const res = await runCmd('powercfg.exe', ['/q', 'SCHEME_CURRENT', 'SUB_USB', 'USBSELECTSUSPEND'])
      return /Current AC Power Setting Index:\s*0x0/i.test(res.stdout)
    },
    async apply(enabled) {
      const value = enabled ? '0' : '1'
      const r1 = await Promise.all([
        runCmd('powercfg.exe', ['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_USB', 'USBSELECTSUSPEND', value]),
        runCmd('powercfg.exe', ['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_USB', 'USBSELECTSUSPEND', value])
      ])
      const r2 = await runCmd('powercfg.exe', ['/setactive', 'SCHEME_CURRENT'])
      return {
        ok: r1.every((r) => r.ok) && r2.ok,
        message: enabled ? 'Suspension selectiva USB desactivada.' : 'Suspension selectiva USB restaurada.'
      }
    }
  },
  {
    id: 'dpc',
    category: 'general',
    label: 'DPC',
    description: 'Distribuye los timers del kernel entre nucleos para reducir latencia/audio glitches.',
    async getState() {
      const v = await regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'DistributeTimers')
      return v === '1'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel',
        'DistributeTimers',
        'REG_DWORD',
        enabled ? '1' : '0'
      )
      return { ok, message: enabled ? 'Timers distribuidos entre nucleos.' : 'Comportamiento por defecto restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'msiIrq',
    category: 'general',
    label: 'MSI/IRQ Features',
    description: 'Activa el modo MSI (interrupt-based) con prioridad alta para GPU y adaptador de red.',
    requiresRestart: true,
    async getState() {
      return getMsiState()
    },
    async apply(enabled) {
      const result = await setMsiModeForGpuAndNic(enabled)
      return { ok: result.ok, message: result.message, requiresRestart: true }
    }
  },
  {
    id: 'graphicsTweaks',
    category: 'general',
    label: 'Graphics Tweaks',
    description: 'Activa Hardware-accelerated GPU Scheduling para menos stutter en el pipeline de video.',
    requiresRestart: true,
    async getState() {
      const v = await regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode')
      return v === '2'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
        'HwSchMode',
        'REG_DWORD',
        enabled ? '2' : '1'
      )
      return { ok, message: enabled ? 'GPU Scheduling activado.' : 'GPU Scheduling restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'ifeo',
    category: 'general',
    label: 'IFEO',
    description: 'Ajusta la prioridad de procesos de sistema conocidos por consumir CPU en segundo plano.',
    async getState() {
      const v = await regQuery(
        'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\SearchIndexer.exe\\PerfOptions',
        'CpuPriorityClass'
      )
      return v === '1'
    },
    async apply(enabled) {
      const targets = ['SearchIndexer.exe', 'OneDrive.exe', 'WidgetService.exe']
      const results = await Promise.all(
        targets.map((exe) =>
          regSet(
            `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions`,
            'CpuPriorityClass',
            'REG_DWORD',
            enabled ? '1' : '3'
          )
        )
      )
      return { ok: results.every(Boolean), message: enabled ? 'Prioridad de procesos de fondo reducida.' : 'Prioridad de procesos de fondo restaurada.' }
    }
  },
  {
    id: 'winDefender',
    category: 'general',
    label: 'Win Defender',
    description: 'Pausa la proteccion en tiempo real mientras jugas (si Tamper Protection lo permite).',
    async getState() {
      const res = await runPowerShellJson<{ DisableRealtimeMonitoring: boolean }>('Get-MpPreference | Select-Object DisableRealtimeMonitoring')
      return res?.DisableRealtimeMonitoring === true
    },
    async apply(enabled) {
      const res = await runPowerShell(`Set-MpPreference -DisableRealtimeMonitoring ${enabled ? '$true' : '$false'}`)
      if (!res.ok) {
        return {
          ok: false,
          message:
            'No se pudo cambiar (Tamper Protection esta activo). Desactivalo manualmente en Seguridad de Windows > Proteccion contra virus para poder usar este tweak.'
        }
      }
      return { ok: true, message: enabled ? 'Proteccion en tiempo real pausada.' : 'Proteccion en tiempo real restaurada.' }
    }
  },
  {
    id: 'location',
    category: 'fixes',
    label: 'Localizacion',
    description: 'Algunos juegos/apps no abren sin el servicio de localizacion de Windows encendido.',
    async getState() {
      const res = await runPowerShell("(Get-Service -Name lfsvc).StartType")
      return res.stdout.trim() === 'Automatic'
    },
    async apply(enabled) {
      const ok1 = await setServiceStartType('lfsvc', enabled ? 'Automatic' : 'Manual')
      const ok2 = await regSet(
        'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
        'Value',
        'REG_SZ',
        enabled ? 'Allow' : 'Deny'
      )
      if (enabled) await runPowerShell("Start-Service -Name lfsvc -ErrorAction SilentlyContinue")
      return { ok: ok1 && ok2, message: enabled ? 'Servicio de localizacion activado.' : 'Servicio de localizacion desactivado.' }
    }
  },
  {
    id: 'notifications',
    category: 'fixes',
    label: 'Notificaciones',
    description: 'Restaura las notificaciones de Windows al comportamiento por defecto.',
    async getState() {
      const v = await regQuery(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
        'ToastEnabled'
      )
      return v !== '0'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
        'ToastEnabled',
        'REG_DWORD',
        enabled ? '1' : '0'
      )
      return { ok, message: enabled ? 'Notificaciones activadas.' : 'Notificaciones desactivadas.' }
    }
  },
  {
    id: 'hvci',
    category: 'fixes',
    label: 'Aislamiento de Nucleo y HVCI',
    description: 'Anticheats mas nuevos pueden exigir la integridad de memoria activada. Requiere reinicio.',
    requiresRestart: true,
    async getState() {
      const v = await regQuery(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
        'Enabled'
      )
      return v === '1'
    },
    async apply(enabled) {
      const ok = await regSet(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity',
        'Enabled',
        'REG_DWORD',
        enabled ? '1' : '0'
      )
      return {
        ok,
        message: enabled ? 'HVCI activado. Reinicia para aplicar.' : 'HVCI desactivado. Reinicia para aplicar.',
        requiresRestart: true
      }
    }
  },
  {
    id: 'nvidiaPowerSaving',
    category: 'nvidia',
    label: 'Economia de Energia',
    description: 'Desactiva el ahorro de energia de la GPU y ajusta PCIe/latencia al maximo.',
    gate: 'nvidia',
    async getState() {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'PowerMizerEnable')
      return v === '0'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU NVIDIA.' }
      const ok = await setValueOnAdapters(keys, 'PowerMizerEnable', 'REG_DWORD', enabled ? '0' : '1')
      return { ok, message: enabled ? 'Ahorro de energia de GPU desactivado.' : 'Ahorro de energia restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'nvidiaPowerGating',
    category: 'nvidia',
    label: 'Power Gating',
    description: 'Desactiva power gating de la GPU para reducir engaged/stutter.',
    gate: 'nvidia',
    async getState() {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'PowerMizerLevel')
      return v === '1'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU NVIDIA.' }
      const ok = await setValueOnAdapters(keys, 'PowerMizerLevel', 'REG_DWORD', enabled ? '1' : '3')
      return { ok, message: enabled ? 'Power gating desactivado.' : 'Power gating restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'nvidiaDriverPerf',
    category: 'nvidia',
    label: 'Driver Perf',
    description: 'Libera el clock y memoria maximos permitidos por el driver.',
    gate: 'nvidia',
    async getState() {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'PerfLevelSrc')
      return v === '2222'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('NVIDIA')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU NVIDIA.' }
      const ok = await setValueOnAdapters(keys, 'PerfLevelSrc', 'REG_DWORD', enabled ? '2222' : '1111')
      return { ok, message: enabled ? 'Clock/memoria maximos liberados.' : 'Valores por defecto restaurados.', requiresRestart: true }
    }
  },
  {
    id: 'amdBasic',
    category: 'amd',
    label: 'Ajustes Basicos',
    description: 'Ajustes de registro de la GPU AMD para mas respuesta.',
    gate: 'amd',
    async getState() {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'KMD_EnableInGameUI')
      return v === '0'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU AMD.' }
      const ok = await setValueOnAdapters(keys, 'KMD_EnableInGameUI', 'REG_DWORD', enabled ? '0' : '1')
      return { ok, message: enabled ? 'Overlay de AMD desactivado.' : 'Overlay de AMD restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'amdPowerGating',
    category: 'amd',
    label: 'Power Gating',
    description: 'Desactiva estados de baja energia para reducir engaged/stutter.',
    gate: 'amd',
    async getState() {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'PP_ThermalAutoThrottlingEnable')
      return v === '0'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU AMD.' }
      const ok = await setValueOnAdapters(keys, 'PP_ThermalAutoThrottlingEnable', 'REG_DWORD', enabled ? '0' : '1')
      return { ok, message: enabled ? 'Power gating desactivado.' : 'Power gating restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'amdUmd',
    category: 'amd',
    label: 'UMD Settings',
    description: 'Ajustes de visual y renderizado del driver.',
    gate: 'amd',
    async getState() {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return false
      const v = await regQuery(keys[0], 'DisableSAMUPowerGating')
      return v === '1'
    },
    async apply(enabled) {
      const keys = await findGpuAdapterKeys('AMD')
      if (keys.length === 0) return { ok: false, message: 'No se detecto una GPU AMD.' }
      const ok = await setValueOnAdapters(keys, 'DisableSAMUPowerGating', 'REG_DWORD', enabled ? '1' : '0')
      return { ok, message: enabled ? 'UMD ajustado para rendimiento.' : 'UMD restaurado.', requiresRestart: true }
    }
  },
  {
    id: 'gameMode',
    category: 'games',
    label: 'Game Mode',
    description: 'Activa el Modo de Juego de Windows automaticamente al detectar un juego.',
    async getState() {
      const v = await regQuery('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled')
      return v !== '0'
    },
    async apply(enabled) {
      const ok = await regSet('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', 'REG_DWORD', enabled ? '1' : '0')
      return { ok, message: enabled ? 'Game Mode activado.' : 'Game Mode desactivado.' }
    }
  },
  {
    id: 'gaming',
    category: 'games',
    label: 'Gaming',
    description: 'Prioridad maxima para el juego activo (perfil MMCSS "Games": GPU Priority 8, sin limite de CPU).',
    async getState() {
      const v = await regQuery(
        'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games',
        'GPU Priority'
      )
      return v === '8'
    },
    async apply(enabled) {
      const base = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games'
      const results = await Promise.all([
        regSet(base, 'GPU Priority', 'REG_DWORD', enabled ? '8' : '2'),
        regSet(base, 'Priority', 'REG_DWORD', enabled ? '6' : '2'),
        regSet(base, 'Scheduling Category', 'REG_SZ', enabled ? 'High' : 'Medium'),
        regSet(
          'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile',
          'SystemResponsiveness',
          'REG_DWORD',
          enabled ? '0' : '20'
        )
      ])
      return { ok: results.every(Boolean), message: enabled ? 'Prioridad maxima para el juego activo.' : 'Perfil MMCSS restaurado.' }
    }
  },
  {
    id: 'gameDvrFse',
    category: 'games',
    label: 'Game DVR & FSE',
    description: 'Desactiva la grabacion en segundo plano de Xbox Game Bar y ajusta el modo de pantalla completa.',
    async getState() {
      const v = await regQuery('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled')
      return v === '0'
    },
    async apply(enabled) {
      const results = await Promise.all([
        regSet('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', enabled ? '0' : '1'),
        regSet('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', enabled ? '2' : '0'),
        regSet('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR', 'AllowGameDVR', 'REG_DWORD', enabled ? '0' : '1')
      ])
      return { ok: results.every(Boolean), message: enabled ? 'Game DVR y optimizaciones de pantalla completa desactivadas.' : 'Game DVR restaurado.' }
    }
  },
  {
    id: 'corePin',
    category: 'games',
    label: 'CorePin',
    description: 'Prende un watcher que ata procesos de fondo conocidos (Discord, Steam, navegador) a los ultimos nucleos.',
    async getState() {
      return isCorePinEnabled()
    },
    async apply(enabled) {
      setCorePinEnabled(enabled)
      return { ok: true, message: enabled ? 'CorePin activado: revisando procesos de fondo cada 20s.' : 'CorePin desactivado.' }
    }
  },
  {
    id: 'autoCpuSet',
    category: 'games',
    label: 'Auto CPU Set',
    description: 'Permite que los perfiles automaticos de la pestana Juegos se apliquen solos cuando detectan el juego corriendo.',
    async getState() {
      return isAutoCpuSetEnabled()
    },
    async apply(enabled) {
      setAutoCpuSetEnabled(enabled)
      return { ok: true, message: enabled ? 'Auto CPU Set activado.' : 'Auto CPU Set desactivado (los perfiles solo se aplican manualmente).' }
    }
  }
]

export async function listTweaks(): Promise<TweakDef[]> {
  const vendor = await getVendor()
  // Todos los tweaks se consultan en paralelo: antes se esperaba uno por uno
  // (hasta ~19 spawns de proceso en serie), lo que hacia que la pantalla de
  // Tweaks tardara varios segundos en cargar.
  const results = await Promise.all(
    TWEAKS.map(async (t) => {
      const gateSatisfied = t.gate === 'nvidia' ? vendor.nvidia : t.gate === 'amd' ? vendor.amd : true
      let enabled = false
      try {
        enabled = gateSatisfied ? await t.getState() : false
      } catch {
        enabled = false
      }
      return {
        id: t.id,
        category: t.category,
        label: t.label,
        description: t.description,
        enabled,
        requiresRestart: t.requiresRestart ?? false,
        gate: t.gate ?? null,
        gateSatisfied
      }
    })
  )
  return results
}

export async function toggleTweak(id: string, enabled: boolean): Promise<TweakToggleResult> {
  const tweak = TWEAKS.find((t) => t.id === id)
  if (!tweak) return { ok: false, id, enabled: !enabled, message: 'Tweak desconocido.' }
  try {
    const result = await tweak.apply(enabled)
    return { ok: result.ok, id, enabled: result.ok ? enabled : !enabled, message: result.message, requiresRestart: tweak.requiresRestart }
  } catch (err) {
    return { ok: false, id, enabled: !enabled, message: `Error: ${String(err)}` }
  }
}