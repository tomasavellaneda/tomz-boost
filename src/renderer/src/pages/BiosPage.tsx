import { useEffect, useState } from 'react'
import type { BiosInfo } from '../../../shared/types'

export default function BiosPage(): JSX.Element {
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
            <div className="ico-box">🧩</div>
            <div>
              <b>CPU / Placa Base</b>
            </div>
          </div>
        </div>
        {info ? (
          <div className="stat-lines">
            <div className="row">
              CPU <b>{info.cpuModel}</b>
            </div>
            <div className="row">
              Nucleos/Hilos{' '}
              <b>
                {info.cpuCores} Cores / {info.cpuThreads} Threads
              </b>
            </div>
            <div className="row">
              Placa Madre <b>{info.boardVendor}</b>
            </div>
            <div className="row">
              Modelo <b>{info.boardModel}</b>
            </div>
            <div className="row">
              Vendor BIOS <b>{info.vendor}</b>
            </div>
            <div className="row">
              Version <b>{info.version}</b>
            </div>
            <div className="row">
              Fecha <b>{info.releaseDate}</b>
            </div>
          </div>
        ) : (
          <div className="empty-state">Leyendo informacion via WMI…</div>
        )}

        {log.length > 0 && <div className="log-box" style={{ marginTop: 14 }}>{log.join('\n')}</div>}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">
            <div className="ico-box">⇩</div>
            <div>
              <b>Exportar</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <button className="btn primary full" disabled={busy === 'export'} onClick={() => run('export', () => window.api.bios.export())}>
            Exportar
          </button>
          <button className="btn full" onClick={() => window.api.sysinfo.bios().then(setInfo)}>
            Ver Config
          </button>
          <button className="btn full" onClick={() => window.api.bios.openFolder()}>
            Abrir Carpeta
          </button>
        </div>

        <div className="card-head">
          <div className="card-title">
            <div className="ico-box">⇧</div>
            <div>
              <b>Aplicar</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn full" disabled={busy === 'auto'} onClick={() => run('auto', () => window.api.bios.autoConfig())}>
            {busy === 'auto' ? 'Aplicando…' : 'Auto Config'}
          </button>
          <button className="btn full" disabled={busy === 'import'} onClick={() => run('import', () => window.api.bios.import())}>
            Importar
          </button>

          {!confirmFirmware ? (
            <button className="btn danger full" onClick={() => setConfirmFirmware(true)}>
              Entrar BIOS
            </button>
          ) : (
            <div className="banner danger">
              El equipo se reiniciara ahora mismo directo al firmware UEFI. Guarda tu trabajo antes de continuar.
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn danger"
                  disabled={busy === 'firmware'}
                  onClick={() => run('firmware', () => window.api.bios.enterFirmware())}
                >
                  Confirmar y reiniciar
                </button>
                <button className="btn" onClick={() => setConfirmFirmware(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
