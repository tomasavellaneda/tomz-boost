import { useEffect, useState } from 'react'
import type { DebloatItem } from '../../../shared/types'

export default function DebloatPage(): JSX.Element {
  const [items, setItems] = useState<DebloatItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    const list = await window.api.debloat.list()
    setItems(list)
    setLoading(false)
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
        Se detectaron {installedCount} apps preinstaladas de la lista curada. Desinstalarlas es reversible reinstalando desde la Microsoft Store.
      </div>

      {loading ? (
        <div className="empty-state">Revisando apps instaladas…</div>
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
              <span className={`pill ${item.installed ? '' : 'off'}`}>{item.installed ? 'Instalado' : 'No presente'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <button className="btn danger" disabled={selected.size === 0 || running} onClick={removeSelected}>
          {running ? 'Desinstalando…' : `Desinstalar seleccionados (${selected.size})`}
        </button>
        <button className="btn" onClick={load} disabled={running}>
          Actualizar lista
        </button>
      </div>

      {log.length > 0 && (
        <div className="log-box" style={{ marginTop: 16 }}>
          {log.join('\n')}
        </div>
      )}
    </>
  )
}
