import { useEffect, useState } from 'react'
import type { DriverInfo } from '../../../shared/types'

export default function DriversPage(): JSX.Element {
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    setDrivers(await window.api.drivers.list())
    setLoading(false)
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {loading ? (
        <div className="empty-state">Leyendo controladores instalados…</div>
      ) : (
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Categoria</th>
              <th>Proveedor</th>
              <th>Version</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr key={i}>
                <td>
                  <b>{d.device}</b>
                </td>
                <td>{d.category}</td>
                <td>{d.provider}</td>
                <td>{d.version}</td>
                <td>{d.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  )
}
