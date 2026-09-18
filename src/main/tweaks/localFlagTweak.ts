import type { TweakResult } from '../../shared/types'

/**
 * Patron de corePin/autoCpuSet: no tocan el registro/servicios directamente,
 * solo persisten un flag propio (JsonStore) que otra parte de la app lee mas
 * tarde. La "verificacion post-aplicacion" aca es relectura del propio store
 * (para detectar, por ejemplo, que la escritura a disco fallo por permisos y
 * el flag no quedo realmente persistido) en vez de rechequear el registro.
 */
export async function applyLocalFlagToggle(
  setEnabled: (enabled: boolean) => void,
  getEnabled: () => boolean,
  enabled: boolean,
  messages: { enabledMessage: string; disabledMessage: string; logPrefix: string }
): Promise<TweakResult> {
  try {
    setEnabled(enabled)
  } catch (err) {
    console.error(`[${messages.logPrefix}] fallo al guardar la configuracion: ${String(err)}`)
    return {
      ok: false,
      verified: false,
      error: String(err),
      message: `No se pudo guardar la configuracion (revisa permisos de la carpeta de datos de la app). ${String(err)}`
    }
  }

  const verified = getEnabled() === enabled
  if (!verified) {
    console.error(`[${messages.logPrefix}] el valor releido no coincide con el aplicado (enabled=${enabled})`)
  }

  return {
    ok: verified,
    verified,
    error: verified ? undefined : 'El valor no se pudo confirmar tras guardarlo.',
    message: verified
      ? enabled
        ? messages.enabledMessage
        : messages.disabledMessage
      : 'Se aplico el cambio pero no se pudo confirmar.'
  }
}
