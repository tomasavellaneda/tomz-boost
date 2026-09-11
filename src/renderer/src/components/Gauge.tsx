interface GaugeProps {
  value: number
  max?: number
  size?: number
  color?: string
  label?: string
}

export default function Gauge({ value, max = 100, size = 76, color = 'var(--accent)', label }: GaugeProps): JSX.Element {
  const radius = size / 2 - 6
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(1, Math.max(0, value / max))
  const dash = circumference * pct

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={6}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div className="gauge-value">{label ?? `${Math.round(value)}%`}</div>
    </div>
  )
}
