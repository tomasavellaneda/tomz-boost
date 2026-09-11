import { useState } from 'react'
import type { NavItem } from '../lib/nav'

interface TopbarProps {
  navItem: NavItem
}

export default function Topbar({ navItem }: TopbarProps): JSX.Element {
  const [running, setRunning] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  async function handleCleanup(): Promise<void> {
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
      <div>
        <div className="breadcrumb">
          <span>⌂</span>
          <span>›</span>
          <span>{navItem.label}</span>
        </div>
        <h1>{navItem.title}</h1>
        <div className="subtitle">{lastMessage ?? navItem.subtitle}</div>
      </div>
      <div className="topbar-actions">
        <button className="btn primary" onClick={handleCleanup} disabled={running}>
          {running ? 'Limpiando…' : 'Ejecutar limpieza'}
        </button>
      </div>
    </div>
  )
}
