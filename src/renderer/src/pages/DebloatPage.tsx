import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useLicense } from '../lib/licenseGate'
import type { DebloatBackupEntry, DebloatItem } from '../../../shared/types'

export default function DebloatPage(): JSX.Element {
  const { t, lang } = useI18n()
  const { ensureLicensed } = useLicense()
  const [items, setItems] = useState<DebloatItem[]>([])
  const [removed, setRemoved] = useState<DebloatBackupEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    const [list, removedList] = await Promise.all([window.api.debloat.list(), window.api.debloat.listRemoved()])
    setItems(list)
    setRemoved(removedList)
    setLoading(false)
  }

  function openInStore(entry: DebloatBackupEntry): void {
    if (!entry.packageFamilyName) return
    window.api.system.openExternal(`ms-windows-store://pdp/?PFN=${entry.packageFamilyName}`)
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function removeSelected(): Promise<void> {
    if (!(await ensureLicensed())) return
    const targets = items.filter((i) => selected.has(i.id) && i.installed)
    if (targets.length === 0) return
    setRunning(true)
    setLog([])
    const res = await window.api.debloat.remove(targets.map((t) => t.packageName))
    setLog(res.log)
    setSelected(new Set())
    setRunning(false)
    load()
  }

  const installedCount = items.filter((i) => i.installed).length

  return (
    <>
      <div className="banner info">
        {t('debloat.banner', { count: installedCount })}
      </div>

      {loading ? (
        <div className="empty-state">{t('debloat.loading')}</div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-row" key={item.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  disabled={!item.installed}
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <div className="main">
                  <b>{item.label}</b>
                  <span>{item.description}</span>
                </div>
              </div>
              <span className={`pill ${item.installed ? '' : 'off'}`}>
                {item.installed ? t('debloat.installed') : t('debloat.missing')}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <button className="btn danger" disabled={selected.size === 0 || running} onClick={removeSelected}>
          {running ? t('debloat.removing') : t('debloat.remove', { count: selected.size })}
        </button>
        <button className="btn" onClick={load} disabled={running}>
          {t('debloat.refresh')}
        </button>
      </div>

      {log.length > 0 && (
        <div className="log-box" style={{ marginTop: 16 }}>
          {log.join('\n')}
        </div>
      )}

      {removed.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ marginBottom: 4 }}>{t('debloat.removedTitle')}</h3>
          <p style={{ opacity: 0.7, marginTop: 0, marginBottom: 12 }}>{t('debloat.removedNote')}</p>
          <div className="list">
            {removed.map((entry) => (
              <div className="list-row" key={entry.packageName}>
                <div className="main">
                  <b>{entry.label}</b>
                  <span>{t('debloat.removedAt', { date: new Date(entry.removedAt).toLocaleString(lang) })}</span>
                </div>
                <button
                  className="btn"
                  disabled={!entry.packageFamilyName}
                  title={entry.packageFamilyName ? undefined : t('debloat.removedNoPfn')}
                  onClick={() => openInStore(entry)}
                >
                  {t('debloat.openStore')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
