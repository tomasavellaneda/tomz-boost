import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Titlebar from './components/Titlebar'
import Topbar from './components/Topbar'
import { ALL_NAV, PageKey } from './lib/nav'
import InicioPage from './pages/InicioPage'
import DiagnosticoPage from './pages/DiagnosticoPage'
import TweaksPage from './pages/TweaksPage'
import InstaladoresPage from './pages/InstaladoresPage'
import JuegosPage from './pages/JuegosPage'
import ToolsPage from './pages/ToolsPage'
import FixesPage from './pages/FixesPage'
import DebloatPage from './pages/DebloatPage'
import DriversPage from './pages/DriversPage'
import BiosPage from './pages/BiosPage'

export default function App(): JSX.Element {
  const [active, setActive] = useState<PageKey>('inicio')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.system.isElevated().then(setIsAdmin)
  }, [])

  const navItem = ALL_NAV.find((n) => n.key === active) ?? ALL_NAV[0]

  return (
    <div className="app-shell">
      <Titlebar />
      <Sidebar active={active} onNavigate={setActive} adminMode={!!isAdmin} />
      <div className="main-area">
        <Topbar navItem={navItem} />
        <div className="content-scroll">
          {isAdmin === false && (
            <div className="admin-banner">
              <span>
                Algunas funciones (servicios, registro, tweaks de GPU) necesitan permisos de administrador para
                aplicarse de verdad.
              </span>
              <button className="btn small" onClick={() => window.api.system.relaunchAsAdmin()}>
                Reiniciar como administrador
              </button>
            </div>
          )}

          {active === 'inicio' && <InicioPage />}
          {active === 'diagnostico' && <DiagnosticoPage />}
          {active === 'tweaks' && <TweaksPage />}
          {active === 'instaladores' && <InstaladoresPage />}
          {active === 'juegos' && <JuegosPage />}
          {active === 'tools' && <ToolsPage />}
          {active === 'fixes' && <FixesPage />}
          {active === 'debloat' && <DebloatPage />}
          {active === 'drivers' && <DriversPage />}
          {active === 'bios' && <BiosPage />}
        </div>
      </div>
    </div>
  )
}
