import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import LineIcon from '../components/LineIcon'
import { APP_ICON } from '../lib/icons'
import { useI18n } from '../lib/i18n'
import { useLicense } from '../lib/licenseGate'
import type { InstallerApp } from '../../../shared/types'

export default function InstaladoresPage(): JSX.Element {
  const { t } = useI18n()
  const { ensureLicensed } = useLicense()
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
    if (!(await ensureLicensed())) return
    setInstallingId(app.id)
    setLogLines([t('install.installingName', { name: app.name })])
    await window.api.installers.install(app.wingetId)
    setInstallingId(null)
    load()
  }

  return (
    <>
      {wingetOk === false && (
        <div className="banner danger">
          {t('install.noWinget')}
        </div>
      )}

      {loading ? (
        <div className="empty-state">{t('install.loading')}</div>
      ) : (
        <div className="grid-auto installer-grid">
          {apps.map((app) => (
            <div className="tweak-card" key={app.id}>
              <div className="top-row">
                <div className="left">
                  <div className="ico-box">
                    {APP_ICON[app.id] ? (
                      <Icon src={APP_ICON[app.id]} alt={app.name} size={22} />
                    ) : (
                      <LineIcon name="package" size={18} />
                    )}
                  </div>
                  <div>
                    <b>{app.name}</b>
                    <span className={`pill ${app.installed ? '' : 'off'}`}>
                      {app.installed ? t('install.installed') : t('install.notInstalled')}
                    </span>
                  </div>
                </div>
              </div>
              <p>{app.description}</p>
              <button
                className="btn small"
                disabled={app.installed || installingId === app.id}
                onClick={() => install(app)}
              >
                {installingId === app.id ? t('install.installing') : app.installed ? t('install.already') : t('install.install')}
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
