/**
 * Claves i18n para alertas de tweaks (fallo / parcial / sin verificar).
 * El main emite `messageKey` (+ params) y el renderer traduce con t().
 * `message` en español queda como fallback/log.
 */
export const TweakMsg = {
  adminRequired: 'tweaks.err.adminRequired',
  notLicensed: 'tweaks.err.notLicensed',
  unknownTweak: 'tweaks.err.unknownTweak',
  backupAborted: 'tweaks.err.backupAborted',
  applyAdmin: 'tweaks.err.applyAdmin',
  restoreAdmin: 'tweaks.err.restoreAdmin',
  unverifiedRegistry: 'tweaks.err.unverifiedRegistry',
  unverifiedServices: 'tweaks.err.unverifiedServices',
  unverifiedServicesRestore: 'tweaks.err.unverifiedServicesRestore',
  unverifiedTasks: 'tweaks.err.unverifiedTasks',
  unverifiedGeneric: 'tweaks.err.unverifiedGeneric',
  unverifiedConsent: 'tweaks.err.unverifiedConsent',
  powerPlanCreate: 'tweaks.err.powerPlanCreate',
  noPhysicalNic: 'tweaks.err.noPhysicalNic',
  nicUnsupported: 'tweaks.err.nicUnsupported',
  nicQueryFailed: 'tweaks.err.nicQueryFailed',
  partialNicImOff: 'tweaks.err.partialNicImOff',
  partialNicImRestore: 'tweaks.err.partialNicImRestore',
  partialNicOneOfTwo: 'tweaks.err.partialNicOneOfTwo',
  partialNicOneOfTwoRestore: 'tweaks.err.partialNicOneOfTwoRestore',
  applyFailed: 'tweaks.err.applyFailed',
  noNvidia: 'tweaks.err.noNvidia',
  noAmd: 'tweaks.err.noAmd',
  noMsiDevices: 'tweaks.err.noMsiDevices',
  nvidiaApplyAdmin: 'tweaks.err.nvidiaApplyAdmin',
  nvidiaUnverified: 'tweaks.err.nvidiaUnverified',
  nvidiaRestoreUnverified: 'tweaks.err.nvidiaRestoreUnverified',
  defenderTamper: 'tweaks.err.defenderTamper',
  defenderUnverified: 'tweaks.err.defenderUnverified',
  corePinRestorePartial: 'tweaks.err.corePinRestorePartial',
  corePinBackupAborted: 'tweaks.err.corePinBackupAborted',
  corePinUnverified: 'tweaks.err.corePinUnverified',
  configSaveFailed: 'tweaks.err.configSaveFailed',
  genericError: 'tweaks.err.genericError',
  autotuneFailed: 'tweaks.err.autotuneFailed'
} as const

export type TweakMsgKey = (typeof TweakMsg)[keyof typeof TweakMsg]

/** Textos ES de respaldo (logs / UI si falta i18n). */
export const TweakMsgEs: Record<TweakMsgKey, string> = {
  [TweakMsg.adminRequired]: 'Este cambio requiere ejecutar la app como administrador',
  [TweakMsg.notLicensed]: 'La app no esta desbloqueada.',
  [TweakMsg.unknownTweak]: 'Tweak desconocido.',
  [TweakMsg.backupAborted]: 'No se pudo guardar el backup; no se aplico el cambio por seguridad',
  [TweakMsg.applyAdmin]: 'No se pudo aplicar (revisa permisos de administrador).',
  [TweakMsg.restoreAdmin]: 'No se pudo restaurar (revisa permisos de administrador).',
  [TweakMsg.unverifiedRegistry]: 'Se aplico el cambio pero no se pudo confirmar en el registro.',
  [TweakMsg.unverifiedServices]: 'Se aplico el cambio pero no se pudo confirmar en los servicios.',
  [TweakMsg.unverifiedServicesRestore]: 'Se restauro pero no se pudo confirmar en los servicios.',
  [TweakMsg.unverifiedTasks]: 'Se aplico el cambio pero no se pudo confirmar en todas las tareas.',
  [TweakMsg.unverifiedGeneric]: 'Se aplico el cambio pero no se pudo confirmar el estado real.',
  [TweakMsg.unverifiedConsent]: 'Se aplico el cambio pero no se pudo confirmar (servicio y/o consent store).',
  [TweakMsg.powerPlanCreate]: 'No se pudo crear el plan de maximo rendimiento.',
  [TweakMsg.noPhysicalNic]: 'No se encontro un adaptador de red fisico activo.',
  [TweakMsg.nicUnsupported]: 'Ninguna NIC soporta Power Management ni Interrupt Moderation.',
  [TweakMsg.nicQueryFailed]: 'No se pudo consultar/aplicar en la NIC.',
  [TweakMsg.partialNicImOff]: 'Aplicado parcialmente: moderacion de interrupciones desactivada.',
  [TweakMsg.partialNicImRestore]: 'Restaurado parcialmente: moderacion de interrupciones restaurada.',
  [TweakMsg.partialNicOneOfTwo]: 'Aplicado parcialmente: se logro al menos una de las dos partes.',
  [TweakMsg.partialNicOneOfTwoRestore]: 'Restaurado parcialmente: se logro al menos una de las dos partes.',
  [TweakMsg.applyFailed]: 'No se pudo aplicar.',
  [TweakMsg.noNvidia]: 'No se detecto una GPU NVIDIA.',
  [TweakMsg.noAmd]: 'No se detecto una GPU AMD.',
  [TweakMsg.noMsiDevices]: 'No se encontraron dispositivos con soporte MSI.',
  [TweakMsg.nvidiaApplyAdmin]: 'No se pudo aplicar el perfil (revisa permisos de administrador).',
  [TweakMsg.nvidiaUnverified]: 'Se escribio el perfil pero no se pudo confirmar en el registro.',
  [TweakMsg.nvidiaRestoreUnverified]: 'Se restauro el perfil pero no se pudo confirmar en el registro.',
  [TweakMsg.defenderTamper]: 'Windows Defender bloqueo el cambio (Tamper Protection). Desactivala temporalmente en Seguridad de Windows.',
  [TweakMsg.defenderUnverified]: 'Se envio el comando pero no se pudo confirmar el estado real (revisa Tamper Protection).',
  [TweakMsg.corePinRestorePartial]: 'CorePin desactivado pero no se pudo restaurar la afinidad de algunos procesos.',
  [TweakMsg.corePinBackupAborted]: 'No se pudo guardar el backup de afinidad; no se activo CorePin.',
  [TweakMsg.corePinUnverified]: 'No se pudo confirmar CorePin en los procesos.',
  [TweakMsg.configSaveFailed]: 'No se pudo guardar la configuracion local.',
  [TweakMsg.genericError]: 'Error al aplicar el tweak.',
  [TweakMsg.autotuneFailed]: 'TCP auto-tuning: no se pudo dejar en normal.'
}

export function tweakMessage(key: TweakMsgKey, detail?: string): { message: string; messageKey: TweakMsgKey; messageParams?: Record<string, string> } {
  const base = TweakMsgEs[key]
  if (detail && detail.trim()) {
    return {
      message: `${base} ${detail.trim()}`.trim(),
      messageKey: key,
      messageParams: { detail: detail.trim() }
    }
  }
  return { message: base, messageKey: key }
}
