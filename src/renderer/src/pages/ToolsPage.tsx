import { useEffect, useState } from 'react'
import LineIcon from '../components/LineIcon'
import { useI18n } from '../lib/i18n'
import { useLicense } from '../lib/licenseGate'
import { useSysInfo } from '../lib/useSysInfo'
import type { CpuTopology, ProcessInfo } from '../../../shared/types'

const PRIORITIES: { value: string; key: string }[] = [
  { value: 'Baja', key: 'aff.prio.idle' },
  { value: 'Por debajo de lo normal', key: 'aff.prio.below' },
  { value: 'Normal', key: 'aff.prio.normal' },
  { value: 'Por encima de lo normal', key: 'aff.prio.above' },
  { value: 'Alta', key: 'aff.prio.high' },
  { value: 'Tiempo real', key: 'aff.prio.realtime' }
]

export default function ToolsPage(): JSX.Element {
  const { t } = useI18n()
  const { ensureLicensed } = useLicense()
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
    if (!(await ensureLicensed())) return
    setAutoRunning(true)
    const res = await window.api.affinity.autoRun()
    setAutoMessage(res.message)
    setAutoRunning(false)
    load()
  }

  async function updatePriority(pid: number, priority: string): Promise<void> {
    if (!(await ensureLicensed())) return
    setPendingPid(pid)
    await window.api.affinity.setProcess(pid, { priority })
    await load()
    setPendingPid(null)
  }

  async function applyPCores(pid: number): Promise<void> {
    if (!topology) return
    if (!(await ensureLicensed())) return
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
            <div className="ico-box">
              <LineIcon name="cpu" size={16} />
            </div>
            <div>
              <b>CPU</b>
            </div>
          </div>
          <div className="metric">{snapshot?.cpu.loadPercent ?? 0}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('aff.usage')}</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="threads" size={16} />
            </div>
            <div>
              <b>Threads</b>
            </div>
          </div>
          <div className="metric">{topology?.logicalCores ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('aff.active')}</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="clock" size={16} />
            </div>
            <div>
              <b>GHz</b>
            </div>
          </div>
          <div className="metric">{topology?.ghz ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('aff.frequency')}</div>
        </div>
        <div className="card">
          <div className="card-title">
            <div className="ico-box">
              <LineIcon name="gpu" size={16} />
            </div>
            <div>
              <b>GPU</b>
            </div>
          </div>
          <div className="metric">{topology?.gpuCores ?? 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('aff.cores')}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <b>{t('aff.auto')}</b>
          <p style={{ margin: '4px 0 0' }}>{t('aff.autoDesc', { mask: topology?.pCoreMask ?? '—' })}</p>
          {autoMessage && <div style={{ fontSize: 11.5, color: 'var(--accent-2)', marginTop: 6 }}>{autoMessage}</div>}
        </div>
        <button className="btn primary" disabled={autoRunning} onClick={runAutoAffinity}>
          {autoRunning ? t('aff.running') : t('aff.run')}
        </button>
      </div>

      <div className="section-label">{t('aff.processes')}</div>
      {loading ? (
        <div className="empty-state">{t('aff.listing')}</div>
      ) : (
        <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('aff.process')}</th>
              <th>PID</th>
              <th>RAM</th>
              <th>{t('aff.priority')}</th>
              <th>{t('aff.affinity')}</th>
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
                      <option key={pr.value} value={pr.value}>
                        {t(pr.key)}
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
        </div>
      )}
    </>
  )
}
