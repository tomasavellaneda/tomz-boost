import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Titlebar from './components/Titlebar'
import Topbar from './components/Topbar'
import BootScreen from './components/BootScreen'
import { ALL_NAV, PageKey } from './lib/nav'
import { useI18n } from './lib/i18n'
import InicioPage from './pages/InicioPage'
import ActivatePage from './pages/ActivatePage'

const TweaksPage = lazy(() => import('./pages/TweaksPage'))
const InstaladoresPage = lazy(() => import('./pages/InstaladoresPage'))
const JuegosPage = lazy(() => import('./pages/JuegosPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const DebloatPage = lazy(() => import('./pages/DebloatPage'))
const BiosPage = lazy(() => import('./pages/BiosPage'))

type Phase = 'boot' | 'lock' | 'entry' | 'app'

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
  const [licensed, setLicensed] = useState<boolean | null>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  const [overlay, setOverlay] = useState<'boot' | 'entry' | null>('boot')
  const [hold, setHold] = useState(false)
  const { t, lang } = useI18n()
  const licensedRef = useRef(licensed)
  const overlayRef = useRef(overlay)
  licensedRef.current = licensed
  overlayRef.current = overlay

  useEffect(() => {
    window.api.system.isElevated().then(setIsAdmin)
    window.api.license.status().then((s) => setLicensed(s.ok))
  }, [])

  useEffect(() => {
    if (!hold || licensed === null) return
    setHold(false)
    setPhase(licensed ? 'app' : 'lock')
  }, [hold, licensed])

  useEffect(() => {
    void window.api.discord.setLang(lang)
  }, [lang])

  useEffect(() => {
    if (licensed) void window.api.discord.setPage(active)
    else if (licensed === false) void window.api.discord.setPage('lock')
  }, [active, licensed])

  useEffect(() => {
    if (!licensed) return
    const timer = window.setTimeout(() => {
      void import('./pages/TweaksPage')
      void import('./pages/InstaladoresPage')
      void import('./pages/JuegosPage')
      void import('./pages/ToolsPage')
      void import('./pages/DebloatPage')
      void import('./pages/BiosPage')
    }, 280)
    return () => window.clearTimeout(timer)
  }, [licensed])

  function onReveal(): void {
    if (overlayRef.current === 'entry') {
      setPhase('app')
      return
    }
    if (licensedRef.current === true) setPhase('app')
    else if (licensedRef.current === false) setPhase('lock')
    else setHold(true)
  }

  function onSplashDone(): void {
    setOverlay(null)
  }

  const navItem = ALL_NAV.find((n) => n.key === active) ?? ALL_NAV[0]
  const showSplash = overlay !== null
  const showLock = phase === 'lock' && overlay !== 'entry'
  const showApp = phase === 'app'

  return (
    <div className={`app-shell ${showApp ? '' : 'locked'}`}>
      <Titlebar />
      {showLock && (
        <ActivatePage
          onUnlocked={() => {
            setLicensed(true)
            setPhase('entry')
            setOverlay('entry')
          }}
        />
      )}
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
  )
}
