import { useState } from 'react'
import Gauge from '../components/Gauge'
import LineChart from '../components/LineChart'
import { useSysInfo } from '../lib/useSysInfo'

type Metric = 'temp' | 'cpu' | 'gpu' | 'ram'
type Range = '1min' | '5min' | '15min' | '1h'

const RANGE_POINTS: Record<Range, number> = { '1min': 40, '5min': 60, '15min': 60, '1h': 60 }

export default function InicioPage(): JSX.Element {
  const { snapshot, history } = useSysInfo()
  const [metric, setMetric] = useState<Metric>('temp')
  const [range, setRange] = useState<Range>('1min')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  if (!snapshot) {
    return (
      <div className="loading-screen" style={{ height: 'auto', padding: 60 }}>
        <div className="spinner" />
        Leyendo sensores del sistema…
      </div>
    )
  }

  const disk = snapshot.disks[0]
  const sliced = history.slice(-RANGE_POINTS[range])
  const series = sliced.map((p) => p[metric])
  const latest = series[series.length - 1] ?? 0

  async function runAction(key: string, fn: () => Promise<{ message: string }>): Promise<void> {
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
      <div className="grid-3">
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">🧠</div>
              <div>
                <b>CPU</b>
                <small>PROCESADOR</small>
              </div>
            </div>
            <button className="btn small">Detalles</button>
          </div>
          <div className="gauge-row">
            <Gauge value={snapshot.cpu.loadPercent} color="var(--accent)" />
            <div className="stat-lines">
              <div className="row">
                FRECUENCIA <b>{snapshot.cpu.speedGHz} GHz</b>
              </div>
              <div className="row">
                NUCLEOS{' '}
                <b>
                  {snapshot.cpu.physicalCores}/{snapshot.cpu.cores}
                </b>
              </div>
              <div className="row">
                TEMPERATURA <b>{snapshot.cpu.temperatureC ?? 'N/D'}{snapshot.cpu.temperatureC !== null ? '°C' : ''}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">🖥️</div>
              <div>
                <b>GPU</b>
                <small>GRAFICOS</small>
              </div>
            </div>
            <button className="btn small">Detalles</button>
          </div>
          <div className="gauge-row">
            <Gauge value={snapshot.gpu.loadPercent ?? 0} color="var(--accent-2)" label={snapshot.gpu.loadPercent === null ? 'N/D' : undefined} />
            <div className="stat-lines">
              <div className="row">
                FRECUENCIA <b>{snapshot.gpu.clockMHz ? `${snapshot.gpu.clockMHz} MHz` : 'N/D'}</b>
              </div>
              <div className="row">
                VRAM{' '}
                <b>
                  {Math.round(snapshot.gpu.vramUsedMB / 1024)}/{Math.round(snapshot.gpu.vramTotalMB / 1024)} GB
                </b>
              </div>
              <div className="row">
                TEMPERATURA <b>{snapshot.gpu.temperatureC ?? 'N/D'}{snapshot.gpu.temperatureC !== null ? '°C' : ''}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">▤</div>
              <div>
                <b>RAM</b>
                <small>MEMORIA</small>
              </div>
            </div>
            <button className="btn small">Detalles</button>
          </div>
          <div className="gauge-row">
            <Gauge
              value={snapshot.ram.usedGB}
              max={snapshot.ram.totalGB}
              color="#c76bff"
              label={`${Math.round((snapshot.ram.usedGB / snapshot.ram.totalGB) * 100)}%`}
            />
            <div className="stat-lines">
              <div className="row">
                USADO{' '}
                <b>
                  {snapshot.ram.usedGB}/{snapshot.ram.totalGB} GB
                </b>
              </div>
              <div className="row">
                VELOCIDAD <b>{snapshot.ram.speedMHz ? `${snapshot.ram.speedMHz} MHz` : 'N/D'}</b>
              </div>
              <div className="row">
                LATENCIA <b>N/D</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">📈</div>
              <div>
                <b>Monitor de Rendimiento</b>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="tabs">
              {(['temp', 'cpu', 'gpu', 'ram'] as Metric[]).map((m) => (
                <div key={m} className={`tab ${metric === m ? 'active' : ''}`} onClick={() => setMetric(m)}>
                  {m === 'temp' ? 'Temp' : m.toUpperCase()}
                </div>
              ))}
            </div>
            <div className="tabs">
              {(['1min', '5min', '15min', '1h'] as Range[]).map((r) => (
                <div key={r} className={`tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
                  {r === '1min' ? '1 min' : r === '5min' ? '5 min' : r === '15min' ? '15 min' : '1 h'}
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <LineChart data={series} max={metric === 'temp' ? 100 : 100} />
            <div
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                background: 'var(--panel-strong)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700
              }}
            >
              {metric === 'temp' ? `${Math.round(latest)}°C` : `${Math.round(latest)}%`}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">💽</div>
              <div>
                <b>Almacenamiento</b>
              </div>
            </div>
            <button className="btn small">Detalles</button>
          </div>
          {disk ? (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>Disco Local ({disk.mount})</div>
              <div className="gauge-row" style={{ marginBottom: 14 }}>
                <Gauge value={disk.usedPercent} size={90} color="var(--accent)" />
                <div className="stat-lines">
                  <div className="row">
                    USADO <b>{disk.usedGB} GB</b>
                  </div>
                  <div className="row">
                    LIBRE <b>{disk.freeGB} GB</b>
                  </div>
                  <div className="row">
                    TOTAL <b>{disk.totalGB} GB</b>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="btn small full"
                  disabled={busyAction === 'scan'}
                  onClick={() => runAction('scan', () => window.api.system.scanDisk())}
                >
                  Escanear
                </button>
                <button
                  className="btn small full"
                  disabled={busyAction === 'optimize'}
                  onClick={() => runAction('optimize', () => window.api.system.optimizeDrive())}
                >
                  Optimizar
                </button>
              </div>
              <button className="btn full" onClick={() => window.api.system.openPath(disk.mount)}>
                Administrar Almacenamiento
              </button>
              {actionMessage && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>{actionMessage}</div>}
            </>
          ) : (
            <div className="empty-state">No se detectaron discos.</div>
          )}
        </div>
      </div>
    </>
  )
}
