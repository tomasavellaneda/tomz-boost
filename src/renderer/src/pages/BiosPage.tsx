import { useEffect, useState } from 'react'
import LineIcon from '../components/LineIcon'
import { useI18n } from '../lib/i18n'
import type { BiosInfo } from '../../../shared/types'

export default function BiosPage(): JSX.Element {
  const { t } = useI18n()
  const [info, setInfo] = useState<BiosInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [confirmFirmware, setConfirmFirmware] = useState(false)

  useEffect(() => {
    window.api.sysinfo.bios().then(setInfo)
  }, [])

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string; log?: string[]; path?: string }>): Promise<void> {
    setBusy(key)
    try {
      const res = await fn()
      const lines = res.log ?? [res.message ?? (res.path ? `Guardado en ${res.path}` : res.ok ? 'Listo.' : 'Fallo.')]
      setLog(lines)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="cpu" size={16} />
            </div>
            <div>
              <b>{t('bios.board')}</b>
            </div>
          </div>
        </div>
        {info ? (
          <div className="stat-lines">
            <div className="row">
              CPU <b>{info.cpuModel}</b>
            </div>
            <div className="row">
              {t('bios.coresThreads')}{' '}
              <b>
                {info.cpuCores} Cores / {info.cpuThreads} Threads
              </b>
            </div>
            <div className="row">
              {t('bios.motherboard')} <b>{info.boardVendor}</b>
            </div>
            <div className="row">
              {t('bios.model')} <b>{info.boardModel}</b>
            </div>
            <div className="row">
              {t('bios.vendor')} <b>{info.vendor}</b>
            </div>
            <div className="row">
              {t('bios.version')} <b>{info.version}</b>
            </div>
            <div className="row">
              {t('bios.date')} <b>{info.releaseDate}</b>
            </div>
          </div>
        ) : (
          <div className="empty-state">{t('bios.reading')}</div>
        )}

        {log.length > 0 && <div className="log-box" style={{ marginTop: 14 }}>{log.join('\n')}</div>}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="download" size={16} />
            </div>
            <div>
              <b>{t('bios.export')}</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <button className="btn primary full" disabled={busy === 'export'} onClick={() => run('export', () => window.api.bios.export())}>
            {t('bios.export')}
          </button>
          <button className="btn full" onClick={() => window.api.sysinfo.bios().then(setInfo)}>
            {t('bios.view')}
          </button>
          <button className="btn full" onClick={() => window.api.bios.openFolder()}>
            {t('bios.openFolder')}
          </button>
        </div>

        <div className="card-head">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="upload" size={16} />
            </div>
            <div>
              <b>{t('bios.apply')}</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn full" disabled={busy === 'auto'} onClick={() => run('auto', () => window.api.bios.autoConfig())}>
            {busy === 'auto' ? t('bios.applying') : t('bios.auto')}
          </button>
          <button className="btn full" disabled={busy === 'import'} onClick={() => run('import', () => window.api.bios.import())}>
            {t('bios.import')}
          </button>

          {!confirmFirmware ? (
            <button className="btn danger full" onClick={() => setConfirmFirmware(true)}>
              {t('bios.enter')}
            </button>
          ) : (
            <div className="banner danger">
              {t('bios.warn')}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn danger"
                  disabled={busy === 'firmware'}
                  onClick={() => run('firmware', () => window.api.bios.enterFirmware())}
                >
                  {t('bios.confirm')}
                </button>
                <button className="btn" onClick={() => setConfirmFirmware(false)}>
                  {t('bios.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
