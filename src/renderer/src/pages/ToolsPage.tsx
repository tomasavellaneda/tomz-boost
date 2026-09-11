import { useEffect, useState } from 'react'
import { useSysInfo } from '../lib/useSysInfo'
import type { CpuTopology, ProcessInfo } from '../../../shared/types'

const PRIORITIES = ['Baja', 'Por debajo de lo normal', 'Normal', 'Por encima de lo normal', 'Alta', 'Tiempo real']

export default function ToolsPage(): JSX.Element {
  const { snapshot } = useSysInfo()
  const [topology, setTopology] = useState<CpuTopology | null>(null)
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoMessage, setAutoMessage] = useState<string | null>(null)
  const [pendingPid, setPendingPid] = useState<number | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load(): Promise<void> {
    setLoading(true)
    const [topo, procs] = await Promise.all([window.api.affinity.cpuTopology(), window.api.affinity.processes()])
    setTopology(topo)
    setProcesses(procs)
    setLoading(false)
  }

  async function runAutoAffinity(): Promise<void> {
    setAutoRunning(true)
    const res = await window.api.affinity.autoRun()
    setAutoMessage(res.message)
    setAutoRunning(false)
    load()
  }

  async function updatePriority(pid: number, priority: string): Promise<void> {
    setPendingPid(pid)
    await window.api.affinity.setProcess(pid, { priority })
    await load()
    setPendingPid(null)
  }

  async function applyPCores(pid: number): Promise<void> {
    if (!topology) return
    setPendingPid(pid)
    await window.api.affinity.setProcess(pid, { affinityMask: topology.pCoreMask })
    await load()
    setPendingPid(null)
  }

  return (
    <>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">🧠</div>
            <div>
              <b>CPU</b>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{snapshot?.cpu.loadPercent ?? 0}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>usage</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">🧵</div>
            <div>
              <b>Threads</b>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{topology?.logicalCores ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>active</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">⏱️</div>
            <div>
              <b>GHz</b>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{topology?.ghz ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>frecuencia</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">🎮</div>
            <div>
              <b>GPU</b>
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10 }}>{topology?.gpuCores ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>cores</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <b>Auto Affinity</b>
          <p style={{ margin: '4px 0 0' }}>
            Detecta el proceso en primer plano y le asigna prioridad alta + los nucleos "rapidos" ({topology?.pCoreMask ?? '—'}).
          </p>
          {autoMessage && <div style={{ fontSize: 11.5, color: 'var(--accent-2)', marginTop: 6 }}>{autoMessage}</div>}
        </div>
        <button className="btn primary" disabled={autoRunning} onClick={runAutoAffinity}>
          {autoRunning ? 'Ejecutando…' : 'Ejecutar'}
        </button>
      </div>

      <div className="section-label">Procesos activos</div>
      {loading ? (
        <div className="empty-state">Listando procesos…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Proceso</th>
              <th>PID</th>
              <th>RAM</th>
              <th>Prioridad</th>
              <th>Afinidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {processes.map((p) => (
              <tr key={p.pid}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>{p.pid}</td>
                <td>{p.memoryMB} MB</td>
                <td>
                  <select
                    className="select"
                    value={p.priority}
                    disabled={pendingPid === p.pid}
                    onChange={(e) => updatePriority(p.pid, e.target.value)}
                  >
                    {PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>
                        {pr}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{p.affinityMask}</td>
                <td>
                  <button className="btn small" disabled={pendingPid === p.pid} onClick={() => applyPCores(p.pid)}>
                    P-cores
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
