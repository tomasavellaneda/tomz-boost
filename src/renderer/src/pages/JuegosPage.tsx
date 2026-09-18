import { useEffect, useState } from 'react'
import Switch from '../components/Switch'
import { useI18n } from '../lib/i18n'
import type { GameEntry, GameProfileKey, GamesOpResult } from '../../../shared/types'

export default function JuegosPage(): JSX.Element {
  const { t } = useI18n()
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    load()
    const unsub = window.api.games.onNotification((msg) => setNotifications((prev) => [...prev.slice(-10), msg]))
    return unsub
  }, [])

  function applyList(res: GamesOpResult): void {
    setGames(res.games)
    if (!res.ok) setSaveError(res.message)
    else setSaveError(null)
  }

  async function load(): Promise<void> {
    setLoading(true)
    try {
      applyList(await window.api.games.list())
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function addGame(): Promise<void> {
    try {
      applyList(await window.api.games.add())
    } catch (err) {
      setSaveError(String(err))
    }
  }

  async function removeGame(id: string): Promise<void> {
    try {
      applyList(await window.api.games.remove(id))
    } catch (err) {
      setSaveError(String(err))
    }
  }

  async function setProfile(id: string, profile: GameProfileKey): Promise<void> {
    try {
      applyList(await window.api.games.setProfile(id, profile))
    } catch (err) {
      setSaveError(String(err))
    }
  }

  async function toggleAuto(id: string, enabled: boolean): Promise<void> {
    try {
      applyList(await window.api.games.setAutoWatch(id, enabled))
    } catch (err) {
      setSaveError(String(err))
    }
  }

  async function applyNow(id: string): Promise<void> {
    setBusyId(id)
    try {
      const res = await window.api.games.applyNow(id)
      setNotifications((prev) => [...prev.slice(-10), res.message])
      if (!res.ok) setSaveError(res.message)
      else setSaveError(null)
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn primary" onClick={addGame}>
          {t('games.add')}
        </button>
      </div>

      {saveError && <div className="banner">{saveError}</div>}

      {loading ? (
        <div className="empty-state">{t('games.loading')}</div>
      ) : games.length === 0 ? (
        <div className="empty-state">{t('games.empty')}</div>
      ) : (
        <div className="list">
          {games.map((g) => (
            <div className="list-row" key={g.id}>
              <div className="game-identity">
                {g.iconDataUrl ? (
                  <img className="game-logo" src={g.iconDataUrl} alt="" draggable={false} />
                ) : (
                  <div className="game-logo fallback" />
                )}
                <div className="main">
                  <b>{g.name}</b>
                  <span>{g.exePath}</span>
                </div>
              </div>
              <div className="actions">
                <select
                  className="select"
                  value={g.profile}
                  onChange={(e) => setProfile(g.id, e.target.value as GameProfileKey)}
                >
                  <option value="citizenPriv">{t('games.profile.net')}</option>
                  <option value="citizenFps">{t('games.profile.fps')}</option>
                  <option value="citizenClean">{t('games.profile.clean')}</option>
                </select>
                <button className="btn small" disabled={busyId === g.id} onClick={() => applyNow(g.id)}>
                  {busyId === g.id ? t('games.applying') : t('games.apply')}
                </button>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{t('games.auto')}</span>
                <Switch checked={g.autoWatch} onChange={(v) => toggleAuto(g.id, v)} />
                <button className="btn small danger" onClick={() => removeGame(g.id)}>
                  {t('games.remove')}
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
