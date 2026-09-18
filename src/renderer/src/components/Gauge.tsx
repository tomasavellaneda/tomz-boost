interface GaugeProps {
  value: number
  max?: number
  size?: number
  color?: string
  /** Texto en el centro. Si no se pasa, se muestra el valor redondeado + unit. */
  label?: string
  title?: string
  unit?: string
}

export default function Gauge({
  value,
  max = 100,
  size = 88,
  color = 'var(--accent)',
  label,
  title,
  unit
}: GaugeProps): JSX.Element {
  const radius = size / 2 - 5
  const circumference = 2 * Math.PI * radius
  const pct = Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0
  const dash = circumference * pct
  const center = label ?? `${Math.round(Number.isFinite(value) ? value : 0)}${unit ? ` ${unit}` : '%'}`

  return (
    <div className="amd-gauge">
      {title && <div className="amd-gauge-title">{title}</div>}
      <div className="gauge" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#2a2a2a" strokeWidth={3.5} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={3.5}
            fill="none"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.55s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <div className="gauge-value">{center}</div>
      </div>
    </div>
  )
}
