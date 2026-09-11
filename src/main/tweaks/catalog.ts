import si from 'systeminformation'
import { regQuery, regSet } from '../utils/registry'
import { runCmd, runPowerShell } from '../utils/shell'
import { saveBackup, getBackup } from './backup'
import { findGpuAdapterKeys, setValueOnAdapters } from './gpuRegistry'
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

async function serviceStartType(name: string): Promise<number | null> {
  const res = await runPowerShell(`(Get-Service -Name '${name}' -ErrorAction SilentlyContinue).StartType`)
  if (!res.stdout) return null
  const map: Record<string, number> = { Automatic: 2, Manual: 3, Disabled: 4 }
  return map[res.stdout.trim()] ?? null
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
      const states = await Promise.all(CURATED_SERVICES.map((s) => serviceStartType(s)))
      return states.every((s) => s === 4 || s === null)
    },
    async apply(enabled) {
      if (enabled) {
        const originals: Record<string, number | null> = {}
        for (const s of CURATED_SERVICES) originals[s] = await serviceStartType(s)
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
      const results = await Promise.all(
        CURATED_TASKS.map((t) => runCmd('schtasks.exe', ['/query', '/tn', t, '/fo', 'LIST']))
      )
      return results.every((r) => !r.ok || r.stdout.toLowerCase().includes('deshabilitada') || r.stdout.toLowerCase().includes('disabled'))
    },
    async apply(enabled) {
      const flag = enabled ? '/disable' : '/enable'
      const results = await Promise.all(CURATED_TASKS.map((t) => runCmd('schtasks.exe', ['/change', '/tn', t, flag])))
      return {
        ok: results.some((r) => r.ok),
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
      const res = await runPowerShell(
        `netsh int tcp set global autotuninglevel=${enabled ? 'disabled' : 'normal'}; netsh int tcp set global ecncapability=${
          enabled ? 'disabled' : 'enabled'
        }`
      )
      return { ok: res.ok, message: enabled ? 'Stack TCP optimizado.' : 'Stack TCP restaurado.' }
    }
  },
  {
    id: 'powerPlan',
    category: 'general',
    label: 'Power Mod',
    description: 'Activa el plan de energia de maximo rendimiento y desactiva la hibernacion.',
    async getState() {
      const res = await runPowerShell('(powercfg /getactivescheme)')
      return res.stdout.includes(HIGH_PERF_GUID)
    },
    async apply(enabled) {
      const res = await runPowerShell(
        enabled
          ? `powercfg /setactive ${HIGH_PERF_GUID}; powercfg /hibernate off`
          : `powercfg /setactive ${BALANCED_GUID}; powercfg /hibernate on`
      )
      return { ok: res.ok, message: enabled ? 'Maximo rendimiento activado, hibernacion desactivada.' : 'Plan balanceado restaurado.' }
    }
  },
  {
    id: 'usbDevices',
    category: 'general',
    label: 'Dispositivos USB',
    description: 'Impide que Windows suspenda perifericos USB para ahorrar energia (reduce input lag).',
    async getState() {
      const res = await runPowerShell(
        'powercfg /q SCHEME_CURRENT SUB_USB USBSELECTSUSPEND'
      )
      return /Current AC Power Setting Index:\s*0x0/i.test(res.stdout)
    },
    async apply(enabled) {
      const value = enabled ? '0' : '1'
      const res = await runPowerShell(
        `powercfg /setacvalueindex SCHEME_CURRENT SUB_USB USBSELECTSUSPEND ${value}; powercfg /setdcvalueindex SCHEME_CURRENT SUB_USB USBSELECTSUSPEND ${value}; powercfg /setactive SCHEME_CURRENT`
      )
      return { ok: res.ok, message: enabled ? 'Suspension selectiva USB desactivada.' : 'Suspension selectiva USB restaurada.' }
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
  }
]

export async function listTweaks(): Promise<TweakDef[]> {
  const vendor = await getVendor()
  const out: TweakDef[] = []
  for (const t of TWEAKS) {
    const gateSatisfied = t.gate === 'nvidia' ? vendor.nvidia : t.gate === 'amd' ? vendor.amd : true
    let enabled = false
    try {
      enabled = gateSatisfied ? await t.getState() : false
    } catch {
      enabled = false
    }
    out.push({
      id: t.id,
      category: t.category,
      label: t.label,
      description: t.description,
      enabled,
      requiresRestart: t.requiresRestart ?? false,
      gate: t.gate ?? null,
      gateSatisfied
    })
  }
  return out
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