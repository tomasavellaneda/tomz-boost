interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export default function Switch({ checked, onChange, disabled }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      className={`switch ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    />
  )
}
