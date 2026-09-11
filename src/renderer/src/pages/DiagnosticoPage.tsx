import { useEffect, useState } from 'react'

interface DiagShape {
  system: { manufacturer: string; model: string; version: string }
  osInfo: { distro: string; release: string; arch: string; build: string; hostname: string }
  cpu: { manufacturer: string; brand: string; cores: number; physicalCores: number; speed: number }
  mem: { total: number; free: number }
  graphics: { controllers: { vendor: string; model: string; vram: number }[] }
  fsSize: { mount: string; size: number; used: number; use: number }[]
  networkInterfaces: { iface: string; ip4: string; mac: string; speed: number | null }[]
  battery: { hasBattery: boolean; percent: number; isCharging: boolean }
}

export default function DiagnosticoPage(): JSX.Element {
  const [data, setData] = useState<DiagShape | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.sysinfo.diagnostics().then((d) => {
      setData(d as DiagShape)
      setLoading(false)
    })
  }, [])

  if (loading || !data) {
    return (
      <div className="loading-screen" style={{ height: 'auto', padding: 60 }}>
        <div className="spinner" />
        Generando diagnostico completo…
      </div>
    )
  }

  return (
    <>
      <div className="grid-3">
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">🖥️</div>
              <div>
                <b>Equipo</b>
              </div>
            </div>
          </div>
          <div className="stat-lines">
            <div className="row">
              Fabricante <b>{data.system.manufacturer}</b>
            </div>
            <div className="row">
              Modelo <b>{data.system.model}</b>
            </div>
            <div className="row">
              Hostname <b>{data.osInfo.hostname}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">🪟</div>
              <div>
                <b>Sistema Operativo</b>
              </div>
            </div>
          </div>
          <div className="stat-lines">
            <div className="row">
              Distro <b>{data.osInfo.distro}</b>
            </div>
            <div className="row">
              Build <b>{data.osInfo.release}</b>
            </div>
            <div className="row">
              Arquitectura <b>{data.osInfo.arch}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <div className="ico-box">🔋</div>
              <div>
                <b>Bateria</b>
              </div>
            </div>
          </div>
          <div className="stat-lines">
            {data.battery.hasBattery ? (
              <>
                <div className="row">
                  Carga <b>{data.battery.percent}%</b>
                </div>
                <div className="row">
                  Estado <b>{data.battery.isCharging ? 'Cargando' : 'Descargando'}</b>
                </div>
              </>
            ) : (
              <div className="row">Sin bateria (equipo de escritorio)</div>
            )}
          </div>
        </div>
      </div>

      <div className="section-label">Discos</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Unidad</th>
            <th>Usado</th>
            <th>Total</th>
            <th>% Uso</th>
          </tr>
        </thead>
        <tbody>
          {data.fsSize.map((d) => (
            <tr key={d.mount}>
              <td>
                <b>{d.mount}</b>
              </td>
              <td>{(d.used / 1024 ** 3).toFixed(1)} GB</td>
              <td>{(d.size / 1024 ** 3).toFixed(1)} GB</td>
              <td>{Math.round(d.use)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="section-label">Red</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Interfaz</th>
            <th>IP</th>
            <th>MAC</th>
            <th>Velocidad</th>
          </tr>
        </thead>
        <tbody>
          {data.networkInterfaces
            .filter((n) => n.ip4)
            .map((n) => (
              <tr key={n.iface}>
                <td>
                  <b>{n.iface}</b>
                </td>
                <td>{n.ip4}</td>
                <td>{n.mac}</td>
                <td>{n.speed ? `${n.speed} Mbps` : 'N/D'}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="section-label">Graficos</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Modelo</th>
            <th>VRAM</th>
          </tr>
        </thead>
        <tbody>
          {data.graphics.controllers.map((c, i) => (
            <tr key={i}>
              <td>
                <b>{c.vendor}</b>
              </td>
              <td>{c.model}</td>
              <td>{c.vram ? `${c.vram} MB` : 'N/D'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
