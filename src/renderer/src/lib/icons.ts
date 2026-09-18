import flagUs from '../assets/emoji/flag-us.png'
import flagEs from '../assets/emoji/flag-es.png'
import flagBr from '../assets/emoji/flag-br.png'
import nvidia from '../assets/brands/nvidia.svg'
import amd from '../assets/brands/amd.svg'
import intel from '../assets/brands/intel.svg'
import steam from '../assets/apps/steam.svg'
import discord from '../assets/apps/discord.svg'
import epicgames from '../assets/apps/epicgames.svg'
import nvidiaApp from '../assets/apps/nvidia.svg'
import msi from '../assets/apps/msi.svg'
import windows from '../assets/apps/windows.svg'
import visualstudio from '../assets/apps/visualstudio.svg'

export const EMOJI = {
  flagUs,
  flagEs,
  flagBr
} as const

export const BRAND = {
  nvidia,
  amd,
  intel
} as const

export const APP_ICON: Record<string, string> = {
  steam,
  discord,
  epicgames,
  geforce: nvidiaApp,
  msiafterburner: msi,
  directx: windows,
  vcredist: visualstudio
}

export function brandFromText(text: string): 'nvidia' | 'amd' | 'intel' | null {
  const t = text.toUpperCase()
  if (t.includes('NVIDIA') || t.includes('GEFORCE') || t.includes('RTX') || t.includes('GTX')) return 'nvidia'
  if (t.includes('AMD') || t.includes('RADEON') || t.includes('RYZEN')) return 'amd'
  if (t.includes('INTEL')) return 'intel'
  return null
}
