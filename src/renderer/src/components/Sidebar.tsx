import { AJUSTES_NAV, GENERAL_NAV, PageKey } from '../lib/nav'

interface SidebarProps {
  active: PageKey
  onNavigate: (key: PageKey) => void
  adminMode: boolean
}

export default function Sidebar({ active, onNavigate, adminMode }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">TB</div>
        <div className="brand-text">
          <b>TOMZ</b>
          <span>BOOST</span>
        </div>
      </div>

      <div className="nav-group-label">General</div>
      {GENERAL_NAV.map((item) => (
        <div
          key={item.key}
          className={`nav-item ${active === item.key ? 'active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          <span className="ico">{item.icon}</span>
          {item.label}
        </div>
      ))}

      <div className="nav-group-label">Ajustes</div>
      {AJUSTES_NAV.map((item) => (
        <div
          key={item.key}
          className={`nav-item ${active === item.key ? 'active' : ''}`}
          onClick={() => onNavigate(item.key)}
        >
          <span className="ico">{item.icon}</span>
          {item.label}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="avatar" />
        <div className="who">
          <b>tomz</b>
          <span>{adminMode ? 'Administrador' : 'Online'}</span>
        </div>
      </div>
    </aside>
  )
}
