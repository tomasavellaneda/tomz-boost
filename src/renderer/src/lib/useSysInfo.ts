import { useEffect, useRef, useState } from 'react'
import type { SysSnapshot } from '../../../shared/types'

const HISTORY_LIMIT = 60

export interface HistoryPoint {
  t: number
  cpu: number
  gpu: number
  ram: number
  temp: number
}

export function useSysInfo(): { snapshot: SysSnapshot | null; history: HistoryPoint[] } {
  const [snapshot, setSnapshot] = useState<SysSnapshot | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const historyRef = useRef<HistoryPoint[]>([])

  useEffect(() => {
    let cancelled = false
    window.api.sysinfo.snapshot().then((s) => !cancelled && setSnapshot(s))

    const unsubscribe = window.api.sysinfo.onUpdate((s) => {
      setSnapshot(s)
      const point: HistoryPoint = {
        t: s.timestamp,
        cpu: s.cpu.loadPercent,
        gpu: s.gpu.loadPercent ?? 0,
        ram: Math.round((s.ram.usedGB / Math.max(s.ram.totalGB, 1)) * 100),
        temp: s.cpu.temperatureC ?? 0
      }
      const next = [...historyRef.current, point].slice(-HISTORY_LIMIT)
      historyRef.current = next
      setHistory(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { snapshot, history }
}
