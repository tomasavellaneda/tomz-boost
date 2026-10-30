import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../lib/i18n'

const SITE_URL = 'https://tomzboost.online'

interface LicenseStatus {
  ok: boolean
  key: string | null
  hwid: string | null
}

function maskKey(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length < 16) return value
  return `TOMZ-${compact.slice(4, 8)}-••••-••••-${compact.slice(-4)}`
}

export default function LicenciaPage(): JSX.Element {
  const { t } = useI18n()
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.api.license.status().then(setStatus)
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !key.trim()) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await window.api.license.activate(key)
      setFeedback({ ok: res.ok, text: res.ok ? t('lic.ok') : res.message })
      if (res.ok) {
        setKey('')
        setStatus(await window.api.license.status())
      }
    } catch (error) {
      setFeedback({ ok: false, text: String(error) })
    } finally {
      setBusy(false)
    }
  }

  async function copyHwid(): Promise<void> {
    if (!status?.hwid) return
    await navigator.clipboard.writeText(status.hwid)
    setCopied(true)
  }

  const licensed = status?.ok === true
  const hwid = status?.hwid || ''

  return (
    <div className="lic-page">
      <div className="lic-card">
        <header className="lic-head">
          <div>
            <h2>{t('lic.title')}</h2>
            <p className="lic-lead">{t('lic.body')}</p>
          </div>
          <span className={`lic-badge ${licensed ? 'is-on' : 'is-off'}`}>
            {licensed ? t('lic.active') : t('lic.inactive')}
          </span>
        </header>

        <div className="lic-hwid">
          <b>{t('lock.hwidTitle')}</b>
          <p>{t('lock.hwidBody')}</p>
          <div className="lic-hwid-row">
            <code>{hwid || '—'}</code>
            <button className="btn" type="button" onClick={() => void copyHwid()} disabled={!hwid}>
              {copied ? t('lock.copied') : t('lock.copy')}
            </button>
          </div>
        </div>

        {licensed && status?.key && (
          <div className="lic-active">
            <b>{t('lic.bound')}</b>
            <code>{maskKey(status.key)}</code>
          </div>
        )}

        {!licensed && (
          <form className="lic-form" onSubmit={submit}>
            <label>
              <span>{t('lic.key')}</span>
              <input
                value={key}
                onChange={(event) => setKey(event.target.value.toUpperCase())}
                placeholder="TOMZ-XXXX-XXXX-XXXX-XXXX"
                spellCheck={false}
                autoFocus
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy || key.trim().length < 8}>
              {busy ? t('lic.activating') : t('lic.activate')}
            </button>
          </form>
        )}

        {feedback && <p className={`lic-msg ${feedback.ok ? 'is-ok' : 'is-error'}`}>{feedback.text}</p>}

        <footer className="lic-foot">
          <span>{t('lic.need')}</span>
          <button className="btn small" type="button" onClick={() => void window.api.system.openExternal(SITE_URL)}>
            {t('lock.site')}
          </button>
        </footer>
      </div>
    </div>
  )
}
