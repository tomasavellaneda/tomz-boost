import { TweakMsg, type TweakMsgKey } from '../../../shared/tweakMessages'

type TFn = (key: string, vars?: Record<string, string | number>) => string

/** Prefijos ES conocidos → clave i18n (fallback si el main aun no manda messageKey). */
const ES_PREFIXES: Array<{ prefix: string; key: TweakMsgKey }> = [
  { prefix: 'Este cambio requiere ejecutar la app como administrador', key: TweakMsg.adminRequired },
  { prefix: 'La app no esta desbloqueada.', key: TweakMsg.notLicensed },
  { prefix: 'Tweak desconocido.', key: TweakMsg.unknownTweak },
  { prefix: 'No se pudo guardar el backup; no se aplico el cambio por seguridad', key: TweakMsg.backupAborted },
  { prefix: 'No se pudo aplicar (revisa permisos de administrador).', key: TweakMsg.applyAdmin },
  { prefix: 'No se pudo restaurar (revisa permisos de administrador).', key: TweakMsg.restoreAdmin },
  { prefix: 'Se aplico el cambio pero no se pudo confirmar en el registro.', key: TweakMsg.unverifiedRegistry },
  { prefix: 'Se aplico el cambio pero no se pudo confirmar en los servicios.', key: TweakMsg.unverifiedServices },
  { prefix: 'Se restauro pero no se pudo confirmar en los servicios.', key: TweakMsg.unverifiedServicesRestore },
  { prefix: 'Se aplico el cambio pero no se pudo confirmar en todas las tareas.', key: TweakMsg.unverifiedTasks },
  { prefix: 'Se aplico el cambio pero no se pudo confirmar (servicio y/o consent store).', key: TweakMsg.unverifiedConsent },
  { prefix: 'Se aplico el cambio pero no se pudo confirmar.', key: TweakMsg.unverifiedGeneric },
  { prefix: 'No se pudo crear el plan de maximo rendimiento.', key: TweakMsg.powerPlanCreate },
  { prefix: 'No se encontro un adaptador de red fisico activo.', key: TweakMsg.noPhysicalNic },
  { prefix: 'Ninguna NIC soporta Power Management ni Interrupt Moderation.', key: TweakMsg.nicUnsupported },
  { prefix: 'No se pudo consultar/aplicar en la NIC.', key: TweakMsg.nicQueryFailed },
  { prefix: 'Aplicado parcialmente: moderacion de interrupciones desactivada.', key: TweakMsg.partialNicImOff },
  { prefix: 'Restaurado parcialmente: moderacion de interrupciones restaurada.', key: TweakMsg.partialNicImRestore },
  { prefix: 'Aplicado parcialmente: se logro al menos una de las dos partes.', key: TweakMsg.partialNicOneOfTwo },
  { prefix: 'Restaurado parcialmente: se logro al menos una de las dos partes.', key: TweakMsg.partialNicOneOfTwoRestore },
  { prefix: 'No se pudo aplicar.', key: TweakMsg.applyFailed },
  { prefix: 'No se detecto una GPU NVIDIA.', key: TweakMsg.noNvidia },
  { prefix: 'No se detecto una GPU AMD.', key: TweakMsg.noAmd },
  { prefix: 'No se encontraron dispositivos con soporte MSI.', key: TweakMsg.noMsiDevices },
  { prefix: 'No se encontraron dispositivos de GPU/red compatibles.', key: TweakMsg.noMsiDevices },
  { prefix: 'No se pudo aplicar el perfil (revisa permisos de administrador).', key: TweakMsg.nvidiaApplyAdmin },
  {
    prefix: 'Se intento restaurar el perfil pero no se pudo confirmar en el registro',
    key: TweakMsg.nvidiaRestoreUnverified
  },
  {
    prefix: 'Se escribio el perfil pero no se pudo confirmar en el registro.',
    key: TweakMsg.nvidiaUnverified
  },
  { prefix: 'Windows Defender bloqueo el cambio (Tamper Protection)', key: TweakMsg.defenderTamper },
  {
    prefix: 'Se envio el comando pero no se pudo confirmar el estado real',
    key: TweakMsg.defenderUnverified
  },
  { prefix: 'CorePin desactivado pero no se pudo restaurar la afinidad', key: TweakMsg.corePinRestorePartial },
  { prefix: 'No se pudo guardar el backup de afinidad', key: TweakMsg.corePinBackupAborted },
  { prefix: 'No se pudo confirmar CorePin', key: TweakMsg.corePinUnverified },
  { prefix: 'No se pudo guardar la configuracion', key: TweakMsg.configSaveFailed },
  { prefix: 'TCP auto-tuning: no se pudo dejar en normal.', key: TweakMsg.autotuneFailed },
  { prefix: 'Error:', key: TweakMsg.genericError }
]

/** Errores tipicos de Windows/reg.exe en ES → clave i18n. */
const SYSTEM_DETAIL_KEYS: Array<{ match: RegExp; key: string }> = [
  { match: /acceso denegado/i, key: 'tweaks.err.accessDenied' },
  { match: /access is denied/i, key: 'tweaks.err.accessDenied' },
  { match: /acceso\s+negado/i, key: 'tweaks.err.accessDenied' }
]

function translateDetail(t: TFn, detail: string): string {
  const trimmed = detail.trim()
  if (!trimmed) return ''
  for (const { match, key } of SYSTEM_DETAIL_KEYS) {
    if (match.test(trimmed)) {
      const label = t(key)
      if (label !== key) return label
    }
  }
  // "ERROR: Acceso denegado." → keep ERROR prefix localized if possible
  const errMatch = trimmed.match(/^ERROR:\s*(.+)$/i)
  if (errMatch) {
    const inner = translateDetail(t, errMatch[1])
    if (inner !== errMatch[1]) return `${t('tweaks.err.errorPrefix')} ${inner}`.trim()
  }
  return trimmed
}

export function translateTweakAlert(
  t: TFn,
  opts: { message: string; messageKey?: string; messageParams?: Record<string, string | number> }
): string {
  const detailRaw = opts.messageParams?.detail != null ? String(opts.messageParams.detail) : ''
  const detail = translateDetail(t, detailRaw)

  if (opts.messageKey) {
    const translated = t(opts.messageKey, detail ? { detail } : opts.messageParams)
    if (translated !== opts.messageKey) {
      if (detail && !translated.includes(detail)) return `${translated} ${detail}`.trim()
      return translated
    }
  }

  const raw = opts.message.trim()
  for (const { prefix, key } of ES_PREFIXES) {
    if (raw === prefix || raw.startsWith(prefix)) {
      const rest = translateDetail(t, raw.slice(prefix.length).trim())
      const translated = t(key, rest ? { detail: rest } : undefined)
      if (translated === key) break
      if (rest && !translated.includes(rest)) return `${translated} ${rest}`.trim()
      return translated
    }
  }
  return translateDetail(t, raw) || raw
}
