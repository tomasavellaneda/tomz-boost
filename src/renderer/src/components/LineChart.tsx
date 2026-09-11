interface LineChartProps {
  data: number[]
  max?: number
  color?: string
  height?: number
}

export default function LineChart({ data, max = 100, color = 'var(--accent)', height = 160 }: LineChartProps): JSX.Element {
  const width = 600
  const padded = data.length > 1 ? data : [0, 0]
  const step = width / (padded.length - 1 || 1)
  const points = padded.map((v, i) => {
    const x = i * step
    const y = height - (Math.min(v, max) / max) * height
    return `${x},${y}`
  })
  const linePath = `M${points.join(' L')}`
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      <path d={areaPath} fill="url(#areaFill)" stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
    </svg>
  )
}
