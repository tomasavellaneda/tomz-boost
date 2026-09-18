import { app } from 'electron'
import { Client, Presence, User } from 'discord-rpc'
import type { DiscordProfile } from '../shared/types'

const DISCORD_CLIENT_ID = process.env.TOMZ_DISCORD_CLIENT_ID || '1548162530260684810'
const WRENCH_IMAGE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f527.png'

const PRESENCE_COPY = {
  es: {
    details: 'Optimizando PC',
    state: (version: string) => `Usando Tomz Boost v${version}`
  },
  en: {
    details: 'Optimizing PC',
    state: (version: string) => `Using Tomz Boost v${version}`
  },
  pt: {
    details: 'Otimizando o PC',
    state: (version: string) => `Usando Tomz Boost v${version}`
  }
} as const

type PresenceLang = keyof typeof PRESENCE_COPY

let rpc: Client | null = null
let startedAt = 0
let ready = false
let largeImageKey = 'logo'
let currentLang: PresenceLang = 'es'
let retryTimer: NodeJS.Timeout | null = null
let currentProfile: DiscordProfile | null = null
let profileListener: ((profile: DiscordProfile | null) => void) | null = null

function avatarUrl(user: User): string {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
  const index = Number(BigInt(user.id) >> 22n) % 6
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

function readProfile(user: User | undefined): DiscordProfile | null {
  if (!user?.id) return null
  const extra = user as User & { global_name?: string; globalName?: string }
  return {
    id: user.id,
    username: extra.globalName || extra.global_name || user.username || 'Discord',
    handle: user.username || '',
    avatarUrl: avatarUrl(user)
  }
}

function setProfile(profile: DiscordProfile | null): void {
  currentProfile = profile
  profileListener?.(profile)
}

export function getDiscordProfile(): DiscordProfile | null {
  return currentProfile
}

export function onDiscordProfile(cb: (profile: DiscordProfile | null) => void): void {
  profileListener = cb
}

async function resolveLargeImage(): Promise<string> {
  try {
    const res = await fetch(`https://discord.com/api/v10/oauth2/applications/${DISCORD_CLIENT_ID}/rpc`)
    if (!res.ok) return 'logo'
    const data = (await res.json()) as { icon?: string }
    if (!data.icon) return 'logo'
    return `https://cdn.discordapp.com/app-icons/${DISCORD_CLIENT_ID}/${data.icon}.png?size=512`
  } catch {
    return 'logo'
  }
}

function activity(): Presence {
  const version = app.getVersion()
  const copy = PRESENCE_COPY[currentLang]
  return {
    details: copy.details,
    state: copy.state(version),
    startTimestamp: startedAt,
    largeImageKey,
    largeImageText: 'Tomz Boost',
    smallImageKey: WRENCH_IMAGE,
    smallImageText: '🔧',
    instance: false
  }
}

function applyActivity(): void {
  if (rpc && ready) void rpc.setActivity(activity()).catch(() => undefined)
}

export function startDiscordPresence(): void {
  if (!DISCORD_CLIENT_ID || rpc) return
  startedAt = Date.now()
  void resolveLargeImage().then((key) => {
    largeImageKey = key
    applyActivity()
  })

  const client = new Client({ transport: 'ipc' })
  rpc = client
  client.on('ready', () => {
    ready = true
    setProfile(readProfile(client.user))
    applyActivity()
    setTimeout(applyActivity, 2000)
  })
  client.on('disconnected', () => {
    ready = false
    rpc = null
    setProfile(null)
    scheduleRetry()
  })
  client.login({ clientId: DISCORD_CLIENT_ID }).catch(() => {
    rpc = null
    ready = false
    setProfile(null)
    scheduleRetry()
  })
}

function scheduleRetry(): void {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    startDiscordPresence()
  }, 12_000)
}

export function setDiscordPage(_page: string): void {
  applyActivity()
}

export function setDiscordLang(lang: string): void {
  currentLang = lang === 'en' || lang === 'pt' ? lang : 'es'
  applyActivity()
}

export function stopDiscordPresence(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (!rpc) return
  try {
    void rpc.clearActivity()
    void rpc.destroy()
  } catch {
    // Discord no esta abierto
  }
  rpc = null
  ready = false
  setProfile(null)
}
