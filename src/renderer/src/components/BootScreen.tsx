import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import BrandMark from './BrandMark'
import { BOOT_FADE_MS, BOOT_GROW_MS } from '../lib/bootTiming'
import { useI18n } from '../lib/i18n'

interface BootScreenProps {
  onDone: () => void
  onReveal?: () => void
}

function waitUntilVisible(): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      document.removeEventListener('visibilitychange', onChange)
      window.clearTimeout(timer)
      resolve()
    }
    const onChange = (): void => {
      if (document.visibilityState === 'visible') done()
    }
    document.addEventListener('visibilitychange', onChange)
    const timer = window.setTimeout(done, 3000)
  })
}

export default function BootScreen({ onDone, onReveal }: BootScreenProps): JSX.Element {
  const { t } = useI18n()
  const [exiting, setExiting] = useState(false)
  const fillRef = useRef<HTMLDivElement>(null)
  const onDoneRef = useRef(onDone)
  const onRevealRef = useRef(onReveal)
  onDoneRef.current = onDone
  onRevealRef.current = onReveal

  useLayoutEffect(() => {
    try {
      window.api.window.painted()
    } catch {
      /* preload viejo o IPC no listo: ready-to-show igual abre la ventana */
    }
  }, [])

  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return

    let cancelled = false
    let raf = 0
    let fadeTimer: number | null = null

    const fadeOut = (): void => {
      if (cancelled) return
      onRevealRef.current?.()
      setExiting(true)
      fadeTimer = window.setTimeout(() => {
        if (!cancelled) onDoneRef.current()
      }, BOOT_FADE_MS)
    }

    const startGrow = (): void => {
      if (cancelled) return
      fill.style.transform = 'scaleX(0)'
      const origin = performance.now()
      const tick = (now: number): void => {
        if (cancelled) return
        const progress = Math.min(1, (now - origin) / BOOT_GROW_MS)
        fill.style.transform = `scaleX(${progress})`
        if (progress < 1) {
          raf = requestAnimationFrame(tick)
          return
        }
        fadeOut()
      }
      raf = requestAnimationFrame(tick)
    }

    void waitUntilVisible().then(startGrow)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (fadeTimer !== null) window.clearTimeout(fadeTimer)
    }
  }, [])

  return (
    <div className={`boot-screen${exiting ? ' is-out' : ''}`}>
      <BrandMark size="splash" />
      <div className="boot-track" aria-hidden="true">
        <div ref={fillRef} className="boot-fill" />
      </div>
      <div className="boot-label">{t('boot.loading')}</div>
    </div>
  )
}
