import { useEffect, useState, type CSSProperties } from 'react'
import { AJUSTES_NAV, GENERAL_NAV, PageKey } from '../lib/nav'
import LineIcon, { PAGE_ICON } from './LineIcon'
import BrandMark from './BrandMark'
import { useI18n } from '../lib/i18n'
import type { DiscordProfile } from '../../../shared/types'

interface SidebarProps {
  active: PageKey
  onNavigate: (key: PageKey) => void
  adminMode: boolean
}

export default function Sidebar({ active, onNavigate, adminMode }: SidebarProps): JSX.Element {
  const { t } = useI18n()
  const [profile, setProfile] = useState<DiscordProfile | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.discord.profile().then(setProfile)
    void window.api.system.version().then(setVersion)
    return window.api.discord.onProfile(setProfile)
  }, [])

  const displayName = profile?.username || 'Tomz'
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-glow">
          <BrandMark size="sidebar" />
        </span>
      </div>

      <div className="nav-group-label" style={{ '--stagger': 0 } as CSSProperties}>
        {t('nav.group.general')}
      </div>
      {GENERAL_NAV.map((item, i) => (
        <div
          key={item.key}
          className={`nav-item ${active === item.key ? 'active' : ''}`}
          style={{ '--stagger': i + 1 } as CSSProperties}
          onClick={() => onNavigate(item.key)}
        >
          <span className="ico">
            <LineIcon name={PAGE_ICON[item.key]} size={18} />
          </span>
          <span className="nav-label">{t(`nav.${item.key}`)}</span>
        </div>
      ))}

      <div
        className="nav-group-label"
        style={{ '--stagger': GENERAL_NAV.length + 1 } as CSSProperties}
      >
        {t('nav.group.settings')}
      </div>
      {AJUSTES_NAV.map((item, i) => (
        <div
          key={item.key}
          className={`nav-item ${active === item.key ? 'active' : ''}`}
          style={{ '--stagger': GENERAL_NAV.length + i + 2 } as CSSProperties}
          onClick={() => onNavigate(item.key)}
        >
          <span className="ico">
            <LineIcon name={PAGE_ICON[item.key]} size={18} />
          </span>
          {t(`nav.${item.key}`)}
        </div>
      ))}

      <div className="sidebar-footer" title={adminMode ? t('sidebar.admin') : undefined}>
        <div className="avatar-wrap">
          <div className="avatar">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" draggable={false} />
            ) : (
              <span className="avatar-fallback">{initial}</span>
            )}
          </div>
          <span className="led" aria-hidden="true" />
        </div>
        <div className="who">
          <div className="who-top">
            <b>{displayName}</b>
            {version ? <span className="who-ver">v{version}</span> : null}
          </div>
          <span className="who-sub">{t('sidebar.welcome')}</span>
        </div>
      </div>
    </aside>
  )
}
