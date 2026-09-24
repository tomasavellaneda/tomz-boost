import { useState } from 'react'
import type { NavItem } from '../lib/nav'
import { useI18n } from '../lib/i18n'
import { useLicense } from '../lib/licenseGate'
import LanguageSwitcher from './LanguageSwitcher'

interface TopbarProps {
  navItem: NavItem
}

export default function Topbar({ navItem }: TopbarProps): JSX.Element {
  const { t } = useI18n()
  const { ensureLicensed } = useLicense()
  const [running, setRunning] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  async function handleCleanup(): Promise<void> {
    if (!(await ensureLicensed())) return
    setRunning(true)
    setLastMessage(null)
    try {
      const res = await window.api.system.runCleanup()
      setLastMessage(res.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="topbar">
      <div className="topbar-copy" key={navItem.key}>
        <h1>{t(`title.${navItem.key}`)}</h1>
        <div className="subtitle">{lastMessage ?? t(`sub.${navItem.key}`)}</div>
      </div>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <button className="btn primary" onClick={handleCleanup} disabled={running}>
          {running ? t('top.cleaning') : t('top.cleanup')}
        </button>
      </div>
    </div>
  )
}
