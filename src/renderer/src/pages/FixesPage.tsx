import { useEffect, useState } from 'react'
import Switch from '../components/Switch'
import type { TweakDef } from '../../../shared/types'

export default function FixesPage(): JSX.Element {
  const [tweaks, setTweaks] = useState<TweakDef[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    window.api.tweaks.list().then((list) => {
      setTweaks(list.filter((t) => t.category === 'fixes'))
      setLoading(false)
    })
  }, [])

  async function handleToggle(id: string, next: boolean): Promise<void> {
    setPending(id)
    const res = await window.api.tweaks.toggle(id, next)
    setTweaks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: res.enabled } : t)))
    setPending(null)
  }

  if (loading) return <div className="empty-state">Cargando correcciones…</div>

  return (
    <div className="grid-auto">
      {tweaks.map((t) => (
        <div className="tweak-card" key={t.id}>
          <div className="top-row">
            <div className="left">
              <div className="ico-box">{t.id === 'location' ? '📍' : t.id === 'notifications' ? '🔔' : '🛡️'}</div>
              <div>
                <b>{t.label}</b>
                <span className={`pill ${t.enabled ? '' : 'off'}`}>{t.enabled ? 'Activado' : 'Desactivado'}</span>
              </div>
            </div>
            <Switch checked={t.enabled} disabled={pending === t.id} onChange={(v) => handleToggle(t.id, v)} />
          </div>
          <p>{t.description}</p>
          {t.requiresRestart && <span className="warn">Requiere reiniciar Windows para aplicarse por completo.</span>}
        </div>
      ))}
    </div>
  )
}
