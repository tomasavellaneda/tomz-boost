import { FormEvent, useState } from 'react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import BrandMark from '../components/BrandMark'
import { useI18n } from '../lib/i18n'

interface ActivatePageProps {
  onUnlocked: () => void
}

export default function ActivatePage({ onUnlocked }: ActivatePageProps): JSX.Element {
  const { t } = useI18n()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.license.activate(key)
      if (res.ok) onUnlocked()
      else setError(res.message)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lock-screen">
      <div className="lock-lang">
        <LanguageSwitcher />
      </div>
      <form className="lock-card" onSubmit={submit}>
        <span className="brand-glow">
          <BrandMark size="lock" />
        </span>
        <h1>{t('lock.title')}</h1>
        <p>{t('lock.subtitle')}</p>
        <input
          className="lock-input"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="TOMZ-XXXX-XXXX-XXXX-XXXX"
          spellCheck={false}
          autoFocus
        />
        {error && <div className="lock-error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || key.trim().length < 8}>
          {busy ? t('lock.unlocking') : t('lock.unlock')}
        </button>
      </form>
    </div>
  )
}
