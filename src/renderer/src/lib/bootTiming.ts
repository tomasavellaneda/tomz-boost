/** Unica fuente de verdad para el splash de carga. */
export const BOOT_GROW_MS = 5500
export const BOOT_FADE_MS = 1500
export const BOOT_PULSE_MS = 6400

export function applyBootCssVars(): void {
  const root = document.documentElement.style
  root.setProperty('--boot-grow-ms', `${BOOT_GROW_MS}ms`)
  root.setProperty('--boot-fade-ms', `${BOOT_FADE_MS}ms`)
  root.setProperty('--boot-pulse-ms', `${BOOT_PULSE_MS}ms`)
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

applyBootCssVars()
