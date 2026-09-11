import { useEffect, useState } from 'react'
import type { InstallerApp } from '../../../shared/types'

export default function InstaladoresPage(): JSX.Element {
  const [wingetOk, setWingetOk] = useState<boolean | null>(null)
  const [apps, setApps] = useState<InstallerApp[]>([])
  const [loading, setLoading] = useState(true)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])

  useEffect(() => {
    load()
    const unsub = window.api.installers.onProgress((evt) => {
      if (evt.line) setLogLines((prev) => [...prev.slice(-40), evt.line as string])
    })
    return unsub
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    const ok = await window.api.installers.checkWinget()
    setWingetOk(ok)
    if (ok) setApps(await window.api.installers.catalog())
    setLoading(false)
  }

  async function install(app: InstallerApp): Promise<void> {
    setInstallingId(app.id)
    setLogLines([`Instalando ${app.name}…`])
    await window.api.installers.install(app.wingetId)
    setInstallingId(null)
    load()
  }

  return (
    <>
      {wingetOk === false && (
        <div className="banner danger">
          No se detecto <b>winget</b> (App Installer) en este equipo. Instalalo desde la Microsoft Store para poder
          usar esta seccion.
        </div>
      )}

      {loading ? (
        <div className="empty-state">Consultando catalogo…</div>
      ) : (
        <div className="grid-auto">
          {apps.map((app) => (
            <div className="tweak-card" key={app.id}>
              <div className="top-row">
                <div className="left">
                  <div className="ico-box">📦</div>
                  <div>
                    <b>{app.name}</b>
                    <span className={`pill ${app.installed ? '' : 'off'}`}>{app.installed ? 'Instalado' : 'No instalado'}</span>
                  </div>
                </div>
              </div>
              <p>{app.description}</p>
              <button
                className="btn small"
                disabled={app.installed || installingId === app.id}
                onClick={() => install(app)}
              >
                {installingId === app.id ? 'Instalando…' : app.installed ? 'Ya instalado' : 'Instalar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {logLines.length > 0 && (
        <div className="log-box" style={{ marginTop: 18 }}>
          {logLines.join('\n')}
        </div>
      )}
    </>
  )
}
