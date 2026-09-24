import { useState } from 'react'
import Gauge from '../components/Gauge'
import LineChart from '../components/LineChart'
import Icon from '../components/Icon'
import { BRAND, brandFromText } from '../lib/icons'
import { useI18n } from '../lib/i18n'
import { useLicense } from '../lib/licenseGate'
import { useSysInfo } from '../lib/useSysInfo'

type Metric = 'temp' | 'cpu' | 'gpu' | 'ram'
type Range = '1min' | '5min' | '15min' | '1h'

const RANGE_POINTS: Record<Range, number> = { '1min': 40, '5min': 60, '15min': 60, '1h': 60 }

export default function InicioPage(): JSX.Element {
  const { t } = useI18n()
  const { ensureLicensed } = useLicense()
  const { snapshot, history } = useSysInfo()
  const [metric, setMetric] = useState<Metric>('temp')
  const [range, setRange] = useState<Range>('1min')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  if (!snapshot) {
    return (
      <div className="loading-screen" style={{ height: 'auto', padding: 60 }}>
        <div className="spinner" />
        {t('inicio.loading')}
      </div>
    )
  }

  const disk = snapshot.disks[0]
  const sliced = history.slice(-RANGE_POINTS[range])
  const series = sliced.map((p) => p[metric])
  const latest = series[series.length - 1] ?? 0
  const ramPercent = snapshot.ram.totalGB > 0 ? (snapshot.ram.usedGB / snapshot.ram.totalGB) * 100 : 0
  const gpuBrand = brandFromText(`${snapshot.gpu.vendor} ${snapshot.gpu.model}`)
  const cpuBrand = brandFromText(`${snapshot.cpu.manufacturer} ${snapshot.cpu.brand}`)

  async function runAction(key: string, fn: () => Promise<{ message: string }>): Promise<void> {
    if (!(await ensureLicensed())) return
    setBusyAction(key)
    setActionMessage(null)
    try {
      const res = await fn()
      setActionMessage(res.message)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="setting-row">
          <div className="meta">
            <b>{t('inicio.live')}</b>
            <span>
              {snapshot.cpu.brand} · {snapshot.gpu.model || snapshot.gpu.vendor}
            </span>
          </div>
          <div className="control">
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{snapshot.os.distro}</span>
          </div>
        </div>
        <div className="amd-gauges">
          <Gauge title={t('inicio.cpuUsage')} value={snapshot.cpu.loadPercent} />
          <Gauge
            title={t('inicio.gpuUsage')}
            value={snapshot.gpu.loadPercent ?? 0}
            label={snapshot.gpu.loadPercent === null ? 'N/D' : undefined}
          />
          <Gauge title={t('inicio.ramUsage')} value={ramPercent} />
          <Gauge title={t('inicio.disk')} value={disk?.usedPercent ?? 0} label={disk ? undefined : 'N/D'} />
          <Gauge
            title={t('inicio.cpuTemp')}
            value={snapshot.cpu.temperatureC ?? 0}
            max={100}
            label={snapshot.cpu.temperatureC === null ? 'N/D' : `${Math.round(snapshot.cpu.temperatureC)}°C`}
          />
          <Gauge
            title={t('inicio.gpuTemp')}
            value={snapshot.gpu.temperatureC ?? 0}
            max={100}
            label={snapshot.gpu.temperatureC === null ? 'N/D' : `${Math.round(snapshot.gpu.temperatureC)}°C`}
          />
        </div>
      </div>

      <div className="amd-cols" style={{ marginBottom: 12 }}>
        <div className="panel">
          <div className="panel-head">
            <b>{t('inicio.system')}</b>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{snapshot.os.release}</span>
          </div>
          <div className="setting-row">
            <div className="meta">
              <b>{t('inicio.machine')}</b>
              <span>{snapshot.os.hostname}</span>
            </div>
            <div className="control">
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{snapshot.os.arch}</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="meta">
              <b>{t('inicio.processor')}</b>
              <span>
                {t('inicio.coresThreads', { cores: snapshot.cpu.physicalCores, threads: snapshot.cpu.cores })}
              </span>
            </div>
            <div className="control">
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{snapshot.cpu.speedGHz} GHz</span>
            </div>
          </div>
          <div className="setting-row">
            <div className="meta">
              <b>{t('inicio.network')}</b>
              <span>
                {snapshot.network.interfaceName || t('inicio.noInterface')} · DNS {snapshot.network.dns || 'N/D'}
              </span>
            </div>
            <div className="control">
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {snapshot.network.latencyMs !== null ? `${snapshot.network.latencyMs} ms` : 'N/D'}
              </span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <b>{t('inicio.hardware')}</b>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('inicio.details')}</span>
          </div>
          <div className="hw-grid">
            <div className="hw-cell">
              <div className="label">
                {gpuBrand && <Icon src={BRAND[gpuBrand]} alt={gpuBrand} size={16} />}
                GPU
              </div>
              <div className="value">{snapshot.gpu.model || 'N/D'}</div>
              <div className="sub">{snapshot.gpu.clockMHz ? `${snapshot.gpu.clockMHz} MHz` : snapshot.gpu.vendor}</div>
            </div>
            <div className="hw-cell">
              <div className="label">VRAM</div>
              <div className="value">
                {Math.round(snapshot.gpu.vramUsedMB)} / {Math.round(snapshot.gpu.vramTotalMB)} MB
              </div>
              <div className="sub">
                {snapshot.gpu.vramTotalMB ? t('inicio.vramTotal', { gb: (snapshot.gpu.vramTotalMB / 1024).toFixed(1) }) : ''}
              </div>
            </div>
            <div className="hw-cell">
              <div className="label">
                {cpuBrand && <Icon src={BRAND[cpuBrand]} alt={cpuBrand} size={16} />}
                CPU
              </div>
              <div className="value">{snapshot.cpu.brand}</div>
              <div className="sub">
                {t('inicio.cpuSub', { cores: snapshot.cpu.physicalCores, ghz: snapshot.cpu.speedGHz })}
              </div>
            </div>
            <div className="hw-cell">
              <div className="label">RAM</div>
              <div className="value">{snapshot.ram.totalGB} GB</div>
              <div className="sub">
                {t('inicio.ramUsed', { used: snapshot.ram.usedGB })}
                {snapshot.ram.speedMHz ? ` · ${snapshot.ram.speedMHz} MHz` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="amd-cols">
        <div className="panel">
          <div className="panel-head">
            <b>{t('inicio.monitor')}</b>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {metric === 'temp' ? `${Math.round(latest)}°C` : `${Math.round(latest)}%`}
            </span>
          </div>
          <div className="card-body">
            <div className="toolbar-row">
              <div className="tabs">
                {(['temp', 'cpu', 'gpu', 'ram'] as Metric[]).map((m) => (
                  <div key={m} className={`tab ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)}>
                    {m === 'temp' ? t('inicio.temp') : m.toUpperCase()}
                  </div>
                ))}
              </div>
              <div className="tabs right">
                {(['1min', '5min', '15min', '1h'] as Range[]).map((r) => (
                  <div key={r} className={`tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
                    {r === '1min' ? '1 min' : r === '5min' ? '5 min' : r === '15min' ? '15 min' : '1 h'}
                  </div>
                ))}
              </div>
            </div>
            <LineChart data={series} max={100} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <b>{t('inicio.storage')}</b>
            {disk && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('inicio.localDisk', { mount: disk.mount })}</span>}
          </div>
          {disk ? (
            <>
              <div className="setting-row">
                <div className="meta">
                  <b>{t('inicio.used')}</b>
                  <span>{t('inicio.occupied', { pct: disk.usedPercent })}</span>
                </div>
                <div className="control">
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{disk.usedGB} GB</span>
                </div>
              </div>
              <div className="setting-row">
                <div className="meta">
                  <b>{t('inicio.free')}</b>
                  <span>{t('inicio.totalGb', { gb: disk.totalGB })}</span>
                </div>
                <div className="control">
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{disk.freeGB} GB</span>
                </div>
              </div>
              <div className="card-body" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn small ghost full"
                  disabled={busyAction === 'scan'}
                  onClick={() => runAction('scan', () => window.api.system.scanDisk())}
                >
                  {t('inicio.scan')}
                </button>
                <button
                  className="btn small ghost full"
                  disabled={busyAction === 'optimize'}
                  onClick={() => runAction('optimize', () => window.api.system.optimizeDrive())}
                >
                  {t('inicio.optimize')}
                </button>
                <button className="btn small ghost full" onClick={() => window.api.system.openPath(disk.mount)}>
                  {t('inicio.manage')}
                </button>
              </div>
              {actionMessage && (
                <div className="setting-row">
                  <div className="meta">
                    <span>{actionMessage}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state" style={{ border: 'none' }}>
              {t('inicio.noDisks')}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
