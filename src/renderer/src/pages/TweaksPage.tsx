import { useEffect, useRef, useState } from 'react'
import Switch from '../components/Switch'
import LineIcon, { type LineIconName } from '../components/LineIcon'
import { useI18n } from '../lib/i18n'
import type { TweakDef } from '../../../shared/types'

type Tab = 'general' | 'gpu' | 'network' | 'security' | 'games'

const TABS: { id: Tab; icon: LineIconName }[] = [
  { id: 'general', icon: 'tweaks' },
  { id: 'gpu', icon: 'gpu' },
  { id: 'network', icon: 'network' },
  { id: 'security', icon: 'fixes' },
  { id: 'games', icon: 'juegos' }
]

const WIN32_PRESETS = ['18', '1A', '26', '28', '2A']

const NVIDIA_PROFILES = ['nvidiaProfileBalanced', 'nvidiaProfileMaxPerformance'] as const

function isNvidiaProfile(id: string): boolean {
  return (NVIDIA_PROFILES as readonly string[]).includes(id)
}

const TAB_IDS: Record<Tab, readonly string[]> = {
  general: [
    'visualEffects',
    'backgroundApps',
    'widgetsCopilot',
    'services',
    'memoria',
    'scheduledTasks',
    'diskWriteOptim',
    'rawInput',
    'powerPlan',
    'usbDevices',
    'ifeo'
  ],
  gpu: ['nvidiaProfileBalanced', 'nvidiaProfileMaxPerformance', 'amdBasic', 'graphicsTweaks', 'msiIrq'],
  network: ['internet', 'nicLatency'],
  security: ['winDefender', 'hvci', 'location', 'notifications'],
  games: ['gameMode', 'gaming', 'gameDvrFse', 'corePin', 'autoCpuSet']
}

const GPU_SWITCH_IDS = ['amdBasic', 'graphicsTweaks', 'msiIrq']

const EMPTY_SECTION_REFS: Record<Tab, HTMLElement | null> = {
  general: null,
  gpu: null,
  network: null,
  security: null,
  games: null
}

export default function TweaksPage(): JSX.Element {
  const { t } = useI18n()
  const [active, setActive] = useState<Tab>('general')
  const [tweaks, setTweaks] = useState<TweakDef[]>([])
  const [loading, setLoading] = useState(true)
  const [statesReady, setStatesReady] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [win32Preset, setWin32Preset] = useState<string | null>(null)
  const [win32Busy, setWin32Busy] = useState(false)
  const [recBusy, setRecBusy] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const pageRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const sectionRefs = useRef<Record<Tab, HTMLElement | null>>({ ...EMPTY_SECTION_REFS })
  const clickLock = useRef(false)
  const unlockTimer = useRef<number | null>(null)

  useEffect(() => {
    load()
    window.api.tweaks.getWin32Priority().then(setWin32Preset)
    return window.api.tweaks.onUpdate((list) => {
      setTweaks(list)
      setStatesReady(true)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    return () => {
      if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current)
    }
  }, [])

  useEffect(() => {
    const root = pageRef.current?.closest('.content-scroll')
    if (!root) return

    const syncActive = (): void => {
      if (clickLock.current) return
      const marker = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 8
      let current: Tab = TABS[0].id
      for (const { id } of TABS) {
        const el = sectionRefs.current[id]
        if (!el) continue
        if (el.getBoundingClientRect().top <= marker) current = id
      }
      setActive((prev) => (prev === current ? prev : current))
    }

    root.addEventListener('scroll', syncActive, { passive: true })
    syncActive()
    return () => root.removeEventListener('scroll', syncActive)
  }, [loading])

  async function applyWin32(preset: string): Promise<void> {
    setWin32Busy(true)
    const res = await window.api.tweaks.setWin32Priority(preset)
    if (res.ok) setWin32Preset(preset)
    setWin32Busy(false)
  }

  async function resetWin32(): Promise<void> {
    setWin32Busy(true)
    const res = await window.api.tweaks.resetWin32Priority()
    if (res.ok) setWin32Preset(null)
    setWin32Busy(false)
  }

  async function load(): Promise<void> {
    const { tweaks: list, ready } = await window.api.tweaks.list()
    setTweaks(list)
    setStatesReady(ready)
    setLoading(false)
  }

  async function handleRecommended(): Promise<void> {
    setRecBusy(true)
    try {
      const res = await window.api.tweaks.applyRecommended()
      setTweaks((prev) => prev.map((row) => (res.enabled.includes(row.id) ? { ...row, enabled: true } : row)))
      if (!res.ok) setToggleError(res.failed.map((id) => `${id}: ${res.log.find((l) => l.startsWith(id)) ?? 'error'}`).join(' · '))
      else setToggleError(null)
    } catch (err) {
      setToggleError(String(err))
    } finally {
      setRecBusy(false)
    }
  }

  async function handleToggle(id: string, next: boolean): Promise<void> {
    setPending(id)
    try {
      const res = await window.api.tweaks.toggle(id, next)
      setTweaks((prev) =>
        prev.map((row) => {
          if (isNvidiaProfile(id) && isNvidiaProfile(row.id)) {
            return { ...row, enabled: res.enabled && row.id === id }
          }
          return row.id === id ? { ...row, enabled: res.enabled } : row
        })
      )
      if (!res.ok) setToggleError(`${id}: ${res.message}`)
      else setToggleError(null)
    } catch (err) {
      setToggleError(`${id}: ${String(err)}`)
    } finally {
      setPending(null)
    }
  }

  function scrollToSection(id: Tab): void {
    const el = sectionRefs.current[id]
    if (!el) return
    setActive(id)
    clickLock.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const root = pageRef.current?.closest('.content-scroll')
    const unlock = (): void => {
      clickLock.current = false
      if (unlockTimer.current !== null) {
        window.clearTimeout(unlockTimer.current)
        unlockTimer.current = null
      }
      root?.removeEventListener('scrollend', unlock)
    }
    root?.addEventListener('scrollend', unlock, { once: true })
    if (unlockTimer.current !== null) window.clearTimeout(unlockTimer.current)
    unlockTimer.current = window.setTimeout(unlock, 1000)
  }

  function renderRows(items: TweakDef[]): JSX.Element {
    return (
      <div className="panel">
        {items.map((item) => (
          <div className="setting-row" key={item.id}>
            <div className="meta">
              <b>{t(`tweak.${item.id}.label`)}</b>
              <span>{t(`tweak.${item.id}.desc`)}</span>
              {item.requiresRestart && <span className="warn">{t('tweaks.restart')}</span>}
            </div>
            <div className="control">
              <Switch
                checked={item.enabled}
                disabled={!statesReady || recBusy || pending === item.id}
                onChange={(v) => handleToggle(item.id, v)}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderCols(items: TweakDef[]): JSX.Element {
    if (items.length === 0) {
      return <div className="empty-state">{t('tweaks.empty')}</div>
    }
    const mid = Math.ceil(items.length / 2)
    const left = items.slice(0, mid)
    const right = items.slice(mid)
    return (
      <div className="amd-cols">
        {renderRows(left)}
        {right.length > 0 ? renderRows(right) : <div />}
      </div>
    )
  }

  function renderGpu(): JSX.Element {
    const profiles = tweaks.filter((row) => isNvidiaProfile(row.id) && statesReady && row.gateSatisfied)
    const switches = tweaks.filter(
      (row) => GPU_SWITCH_IDS.includes(row.id) && (!row.gate || statesReady) && row.gateSatisfied !== false
    )
    const selected = profiles.find((row) => row.enabled)?.id ?? ''
    const selectedProfile = profiles.find((row) => row.id === selected)
    const profileBusy = pending !== null && isNvidiaProfile(pending)

    if (profiles.length === 0 && switches.length === 0) {
      return <div className="empty-state">{t('tweaks.empty')}</div>
    }

    const switchMid = Math.ceil(switches.length / 2)
    const switchLeft = switches.slice(0, switchMid)
    const switchRight = switches.slice(switchMid)

    return (
      <>
        {profiles.length > 0 && (
          <div className="panel" style={{ marginBottom: 10 }}>
            <div className="setting-row">
              <div className="meta">
                <b>{t('nvidia.profileLabel')}</b>
                <span>
                  {selectedProfile ? t(`tweak.${selectedProfile.id}.desc`) : t('nvidia.profileNoneHint')}
                </span>
                {selectedProfile?.requiresRestart && <span className="warn">{t('tweaks.restart')}</span>}
              </div>
              <div className="control">
                <select
                  className="select"
                  value={selected}
                  disabled={!statesReady || recBusy || profileBusy}
                  onChange={(e) => {
                    const id = e.target.value
                    if (id) void handleToggle(id, true)
                  }}
                >
                  <option value="">{t('nvidia.profileNone')}</option>
                  {profiles.map((row) => (
                    <option key={row.id} value={row.id}>
                      {t(`tweak.${row.id}.label`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        {switches.length > 0 && (
          <div className="amd-cols">
            {renderRows(switchLeft)}
            {switchRight.length > 0 ? renderRows(switchRight) : <div />}
          </div>
        )}
      </>
    )
  }

  function renderSectionBody(id: Tab): JSX.Element {
    if (id === 'gpu') return renderGpu()
    return renderCols(tweaks.filter((row) => TAB_IDS[id].includes(row.id) && row.gateSatisfied !== false))
  }

  return (
    <div className="tweaks-page" ref={pageRef}>
      <nav className="tweaks-nav" ref={navRef}>
        <div className="tabs">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              className={`tab ${active === tabItem.id ? 'active' : ''}`}
              onClick={() => scrollToSection(tabItem.id)}
            >
              <LineIcon name={tabItem.icon} size={16} />
              {t(`tweaks.${tabItem.id}`)}
            </button>
          ))}
        </div>
      </nav>

      {toggleError && <div className="banner">{toggleError}</div>}

      <div className="panel" style={{ marginBottom: 10 }}>
        <div className="setting-row">
          <div className="meta">
            <b>{t('tweaks.recommended')}</b>
            <span>{t('tweaks.recommendedDesc')}</span>
          </div>
          <div className="control">
            <button
              className="btn small primary"
              disabled={!statesReady || recBusy || pending !== null}
              onClick={() => void handleRecommended()}
            >
              {recBusy ? t('tweaks.recommendedBusy') : t('tweaks.recommendedApply')}
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div className="meta">
            <b>Win32Priority</b>
            <span>{t('tweaks.win32Desc')}</span>
          </div>
          <div className="control">
            {WIN32_PRESETS.map((p) => (
              <button
                key={p}
                className={`btn small ${win32Preset === p ? 'primary' : 'ghost'}`}
                disabled={win32Busy || recBusy}
                onClick={() => applyWin32(p)}
              >
                {p}
              </button>
            ))}
            <button className="btn small ghost" disabled={win32Busy || recBusy} onClick={resetWin32}>
              {t('tweaks.restore')}
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="empty-state">{t('tweaks.loading')}</div>}

      {TABS.map((tabItem) => (
        <section
          key={tabItem.id}
          id={`tweaks-${tabItem.id}`}
          className="tweaks-section"
          ref={(el) => {
            sectionRefs.current[tabItem.id] = el
          }}
        >
          <div className="tweaks-section-head">
            <LineIcon name={tabItem.icon} size={16} />
            <h2>{t(`tweaks.${tabItem.id}`)}</h2>
          </div>
          {!loading && renderSectionBody(tabItem.id)}
        </section>
      ))}
    </div>
  )
}
