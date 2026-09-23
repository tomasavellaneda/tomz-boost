import { useEffect, useState } from 'react'
import Switch from '../components/Switch'
import { useI18n } from '../lib/i18n'
import type { TweakDef } from '../../../shared/types'

export default function FixesPage(): JSX.Element {
  const { t } = useI18n()
  const [tweaks, setTweaks] = useState<TweakDef[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    window.api.tweaks.list().then(({ tweaks: list }) => {
      setTweaks(list.filter((row) => row.category === 'fixes'))
      setLoading(false)
    })
  }, [])

  async function handleToggle(id: string, next: boolean): Promise<void> {
    setPending(id)
    const res = await window.api.tweaks.toggle(id, next)
    setTweaks((prev) => prev.map((row) => (row.id === id ? { ...row, enabled: res.enabled } : row)))
    setPending(null)
  }

  if (loading) return <div className="empty-state">{t('tweaks.loading')}</div>

  return (
    <div className="grid-auto">
      {tweaks.map((row) => (
        <div className="tweak-card" key={row.id}>
          <div className="top-row">
            <div className="left">
              <div className="ico-box">{row.id === 'location' ? '📍' : row.id === 'notifications' ? '🔔' : '🛡️'}</div>
              <div>
                <b>{row.label}</b>
                <span className={`pill ${row.enabled ? '' : 'off'}`}>{row.enabled ? t('nvidia.on') : t('nvidia.off')}</span>
              </div>
            </div>
            <Switch checked={row.enabled} disabled={pending === row.id} onChange={(v) => handleToggle(row.id, v)} />
          </div>
          {row.requiresRestart && <span className="warn">{t('tweaks.restart')}</span>}
        </div>
      ))}
    </div>
  )
}
