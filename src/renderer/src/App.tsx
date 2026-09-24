import { lazy, Suspense, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Titlebar from './components/Titlebar'
import Topbar from './components/Topbar'
import BootScreen from './components/BootScreen'
import { ALL_NAV, PageKey } from './lib/nav'
import { useI18n } from './lib/i18n'
import { LicenseProvider } from './lib/licenseGate'
import InicioPage from './pages/InicioPage'

const TweaksPage = lazy(() => import('./pages/TweaksPage'))
const InstaladoresPage = lazy(() => import('./pages/InstaladoresPage'))
const JuegosPage = lazy(() => import('./pages/JuegosPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const DebloatPage = lazy(() => import('./pages/DebloatPage'))
const BiosPage = lazy(() => import('./pages/BiosPage'))

type Phase = 'boot' | 'app'

function PageFallback(): JSX.Element {
  return (
    <div className="page-fallback">
      <div className="spinner" />
    </div>
  )
}

export default function App(): JSX.Element {
  const [active, setActive] = useState<PageKey>('inicio')
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  const [overlay, setOverlay] = useState<'boot' | null>('boot')
  const { t, lang } = useI18n()

  useEffect(() => {
    window.api.system.isElevated().then(setIsAdmin)
  }, [])

  useEffect(() => {
    void window.api.discord.setLang(lang)
  }, [lang])

  useEffect(() => {
    void window.api.discord.setPage(active)
  }, [active])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('./pages/TweaksPage')
      void import('./pages/InstaladoresPage')
      void import('./pages/JuegosPage')
      void import('./pages/ToolsPage')
      void import('./pages/DebloatPage')
      void import('./pages/BiosPage')
    }, 280)
    return () => window.clearTimeout(timer)
  }, [])

  function onReveal(): void {
    setPhase('app')
  }

  function onSplashDone(): void {
    setOverlay(null)
  }

  const navItem = ALL_NAV.find((n) => n.key === active) ?? ALL_NAV[0]
  const showSplash = overlay !== null
  const showApp = phase === 'app'

  return (
    <LicenseProvider>
    <div className={`app-shell ${showApp ? '' : 'locked'}`}>
      <Titlebar />
      {showApp && (
        <>
          <Sidebar active={active} onNavigate={setActive} adminMode={!!isAdmin} />
          <div className="main-area">
            <Topbar navItem={navItem} />
            <div className="content-scroll">
              {isAdmin === false && (
                <div className="admin-banner">
                  <span>{t('admin.banner')}</span>
                  <button className="btn small" onClick={() => window.api.system.relaunchAsAdmin()}>
                    {t('admin.relaunch')}
                  </button>
                </div>
              )}

              <div className="page-enter" key={active}>
                <Suspense fallback={<PageFallback />}>
                  {active === 'inicio' && <InicioPage />}
                  {active === 'tweaks' && <TweaksPage />}
                  {active === 'instaladores' && <InstaladoresPage />}
                  {active === 'juegos' && <JuegosPage />}
                  {active === 'affinity' && <ToolsPage />}
                  {active === 'debloat' && <DebloatPage />}
                  {active === 'bios' && <BiosPage />}
                </Suspense>
              </div>
            </div>
          </div>
        </>
      )}
      {showSplash && <BootScreen key={overlay} onReveal={onReveal} onDone={onSplashDone} />}
    </div>
    </LicenseProvider>
  )
}
