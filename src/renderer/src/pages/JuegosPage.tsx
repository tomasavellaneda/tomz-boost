import { useEffect, useState } from 'react'
import Switch from '../components/Switch'
import type { GameEntry, GameProfileKey, TweakDef } from '../../../shared/types'

const PROFILE_LABELS: Record<GameProfileKey, string> = {
  citizenPriv: 'Prioridad de Red',
  citizenFps: 'Foco en FPS',
  citizenClean: 'Config. Limpia'
}

const GAME_ICONS: Record<string, string> = {
  gameMode: '🎮',
  gaming: '🕹️',
  gameDvrFse: '🖥️',
  corePin: '📌',
  autoCpuSet: '⚡'
}

export default function JuegosPage(): JSX.Element {
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [globalTweaks, setGlobalTweaks] = useState<TweakDef[]>([])
  const [pendingTweak, setPendingTweak] = useState<string | null>(null)

  useEffect(() => {
    load()
    window.api.tweaks.list().then((list) => setGlobalTweaks(list.filter((t) => t.category === 'games')))
    const unsub = window.api.games.onNotification((msg) => setNotifications((prev) => [...prev.slice(-10), msg]))
    return unsub
  }, [])

  async function toggleGlobalTweak(id: string, next: boolean): Promise<void> {
    setPendingTweak(id)
    const res = await window.api.tweaks.toggle(id, next)
    setGlobalTweaks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: res.enabled } : t)))
    setPendingTweak(null)
  }

  async function load(): Promise<void> {
    setLoading(true)
    setGames(await window.api.games.list())
    setLoading(false)
  }

  async function addGame(): Promise<void> {
    setGames(await window.api.games.add())
  }

  async function removeGame(id: string): Promise<void> {
    setGames(await window.api.games.remove(id))
  }

  async function setProfile(id: string, profile: GameProfileKey): Promise<void> {
    setGames(await window.api.games.setProfile(id, profile))
  }

  async function toggleAuto(id: string, enabled: boolean): Promise<void> {
    setGames(await window.api.games.setAutoWatch(id, enabled))
  }

  async function applyNow(id: string): Promise<void> {
    setBusyId(id)
    const res = await window.api.games.applyNow(id)
    setNotifications((prev) => [...prev.slice(-10), res.message])
    setBusyId(null)
  }

  return (
    <>
      <div className="grid-auto" style={{ marginBottom: 22 }}>
        {globalTweaks.map((t) => (
          <div className="tweak-card" key={t.id}>
            <div className="top-row">
              <div className="left">
                <div className="ico-box">{GAME_ICONS[t.id] ?? '🎮'}</div>
                <div>
                  <b>{t.label}</b>
                  <span className={`pill ${t.enabled ? '' : 'off'}`}>{t.enabled ? 'Activado' : 'Desactivado'}</span>
                </div>
              </div>
              <Switch checked={t.enabled} disabled={pendingTweak === t.id} onChange={(v) => toggleGlobalTweak(t.id, v)} />
            </div>
            <p>{t.description}</p>
          </div>
        ))}
      </div>

      <div className="section-label">Tus juegos</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn primary" onClick={addGame}>
          + Agregar Juego
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Cargando juegos…</div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          Todavia no agregaste ningun juego. Usa "Agregar Juego" y elegi el .exe.
        </div>
      ) : (
        <div className="list">
          {games.map((g) => (
            <div className="list-row" key={g.id}>
              <div className="main">
                <b>{g.name}</b>
                <span>{g.exePath}</span>
              </div>
              <div className="actions">
                <select
                  className="select"
                  value={g.profile}
                  onChange={(e) => setProfile(g.id, e.target.value as GameProfileKey)}
                >
                  {Object.entries(PROFILE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button className="btn small" disabled={busyId === g.id} onClick={() => applyNow(g.id)}>
                  {busyId === g.id ? 'Aplicando…' : 'Aplicar'}
                </button>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>Auto</span>
                <Switch checked={g.autoWatch} onChange={(v) => toggleAuto(g.id, v)} />
                <button className="btn small danger" onClick={() => removeGame(g.id)}>
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="log-box" style={{ marginTop: 18 }}>
          {notifications.join('\n')}
        </div>
      )}
    </>
  )
}
