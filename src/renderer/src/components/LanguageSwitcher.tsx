import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { LANGS, useI18n } from '../lib/i18n'

export default function LanguageSwitcher(): JSX.Element {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[1]

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="lang-switcher" ref={ref}>
      <button type="button" className="lang-button" onClick={() => setOpen((v) => !v)}>
        <Icon className="flag" src={current.flag} alt={current.label} size={18} />
        <span>{current.label}</span>
        <span className="lang-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="lang-menu">
          {LANGS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lang-option ${item.id === lang ? 'active' : ''}`}
              onClick={() => {
                setLang(item.id)
                setOpen(false)
              }}
            >
              <Icon className="flag" src={item.flag} alt={item.label} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
