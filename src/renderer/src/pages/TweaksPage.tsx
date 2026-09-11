import { useEffect, useState } from 'react'
import Switch from '../components/Switch'
import type { TweakDef } from '../../../shared/types'

type Tab = 'general' | 'nvidia' | 'amd'

export default function TweaksPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const [tweaks, setTweaks] = useState<TweakDef[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    const list = await window.api.tweaks.list()
    setTweaks(list)
    setLoading(false)
  }

  async function handleToggle(id: string, next: boolean): Promise<void> {
    setPending(id)
    const res = await window.api.tweaks.toggle(id, next)
    setTweaks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: res.enabled } : t)))
    setPending(null)
  }

  const visible = tweaks.filter((t) => t.category === tab)
  const gateBlocked = tab !== 'general' && visible.length > 0 && !visible[0].gateSatisfied

  return (
    <>
      <div className="tabs" style={{ marginBottom: 20 }}>
        {(['general', 'nvidia', 'amd'] as Tab[]).map((t) => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'general' ? 'General' : t.toUpperCase()}
          </div>
        ))}
      </div>

      {gateBlocked && (
        <div className="banner">Estos ajustes exigen una GPU {tab === 'nvidia' ? 'NVIDIA' : 'AMD'}.</div>
      )}

      {loading ? (
        <div className="empty-state">Leyendo estado actual de cada tweak…</div>
      ) : (
        <div className="grid-auto">
          {visible.map((t) => (
            <div className="tweak-card" key={t.id}>
              <div className="top-row">
                <div className="left">
                  <div className="ico-box">⚙️</div>
                  <div>
                    <b>{t.label}</b>
                    <span className={`pill ${t.enabled ? '' : 'off'}`}>{t.enabled ? 'Activado' : 'Desactivado'}</span>
                  </div>
                </div>
                <Switch
                  checked={t.enabled}
                  disabled={pending === t.id || !t.gateSatisfied}
                  onChange={(v) => handleToggle(t.id, v)}
                />
              </div>
              <p>{t.description}</p>
              {t.requiresRestart && <span className="warn">Requiere reiniciar para aplicarse por completo.</span>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
