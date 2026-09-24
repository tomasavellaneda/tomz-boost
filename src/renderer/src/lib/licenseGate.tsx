import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import BrandMark from '../components/BrandMark'
import { useI18n } from './i18n'

const SITE_URL = 'https://tomzboost-site-tomasavellaneda.vercel.app'

interface LicenseCtx {
  licensed: boolean
  ensureLicensed: () => Promise<boolean>
}

const LicenseContext = createContext<LicenseCtx | null>(null)

export function useLicense(): LicenseCtx {
  const ctx = useContext(LicenseContext)
  if (!ctx) throw new Error('useLicense must be used inside LicenseProvider')
  return ctx
}

type Step = 'notice' | 'key'

export function LicenseProvider({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useI18n()
  const [licensed, setLicensed] = useState<boolean | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const licensedRef = useRef<boolean | null>(null)
  const waiters = useRef<Array<(ok: boolean) => void>>([])
  licensedRef.current = licensed

  useEffect(() => {
    let alive = true
    window.api.license.status().then((status) => {
      if (!alive) return
      setLicensed(status.ok)
    })
    return () => {
      alive = false
    }
  }, [])

  function settle(ok: boolean): void {
    const pending = waiters.current
    waiters.current = []
    setStep(null)
    setError(null)
    setBusy(false)
    for (const resolve of pending) resolve(ok)
  }

  function openPrompt(): Promise<boolean> {
    return new Promise((resolve) => {
      waiters.current.push(resolve)
      setStep((current) => current ?? 'notice')
    })
  }

  function ensureLicensed(): Promise<boolean> {
    if (licensedRef.current === true) return Promise.resolve(true)
    if (licensedRef.current === false) return openPrompt()
    return window.api.license.status().then((status) => {
      licensedRef.current = status.ok
      setLicensed(status.ok)
      if (status.ok) return true
      return openPrompt()
    })
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.license.activate(key)
      if (!res.ok) {
        setError(t('lock.invalid'))
        return
      }
      setLicensed(true)
      licensedRef.current = true
      setKey('')
      settle(true)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <LicenseContext.Provider value={{ licensed: licensed === true, ensureLicensed }}>
      {children}
      {step && (
        <div className="license-overlay" role="presentation" onMouseDown={() => settle(false)}>
          <div
            className="license-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {step === 'notice' ? (
              <>
                <div className="license-head">
                  <span className="license-badge" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <div>
                    <h2 id="license-title">{t('auth.title')}</h2>
                    <p>{t('auth.subtitle')}</p>
                  </div>
                </div>
                <div className="license-callout">
                  <b>{t('auth.resource', { action: t('auth.action') })}</b>
                  <p>{t('auth.body')}</p>
                </div>
                <div className="license-perks">
                  <b>{t('auth.perks')}</b>
                  <ul>
                    <li>{t('auth.perk1')}</li>
                    <li>{t('auth.perk2')}</li>
                    <li>{t('auth.perk3')}</li>
                  </ul>
                </div>
                <div className="license-actions">
                  <button className="btn ghost" type="button" onClick={() => settle(false)}>
                    {t('auth.cancel')}
                  </button>
                  <button className="btn primary" type="button" onClick={() => setStep('key')}>
                    {t('auth.continue')}
                  </button>
                </div>
              </>
            ) : (
              <form className="license-key-form" onSubmit={submit}>
                <span className="brand-glow">
                  <BrandMark size="lock" />
                </span>
                <h2 id="license-title">{t('lock.title')}</h2>
                <p className="license-lead">{t('lock.subtitle')}</p>
                <label className="license-field">
                  <span>{t('lock.label')}</span>
                  <input
                    className="lock-input"
                    value={key}
                    onChange={(e) => setKey(e.target.value.toUpperCase())}
                    placeholder="TOMZ-XXXX-XXXX-XXXX-XXXX"
                    spellCheck={false}
                    autoFocus
                  />
                </label>
                {error && <div className="lock-error">{error}</div>}
                <button className="btn primary" type="submit" disabled={busy || key.trim().length < 8}>
                  {busy ? t('lock.unlocking') : t('lock.unlock')}
                </button>
                <div className="license-need">
                  <b>{t('lock.needTitle')}</b>
                  <p>{t('lock.needBody')}</p>
                  <button className="license-site" type="button" onClick={() => void window.api.system.openExternal(SITE_URL)}>
                    {t('lock.site')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </LicenseContext.Provider>
  )
}

function LockIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
