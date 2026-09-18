export type PageKey = 'inicio' | 'tweaks' | 'instaladores' | 'juegos' | 'affinity' | 'debloat' | 'bios'

export interface NavItem {
  key: PageKey
  label: string
  title: string
  subtitle: string
}

export const GENERAL_NAV: NavItem[] = [
  { key: 'inicio', label: 'Inicio', title: 'Vista General del Sistema', subtitle: 'Monitorea y optimiza el rendimiento de tu PC en tiempo real' },
  { key: 'tweaks', label: 'Tweaks', title: 'Tweaks de Rendimiento', subtitle: 'Ajustes reales de sistema, GPU, red, seguridad y juegos' },
  { key: 'instaladores', label: 'Instaladores', title: 'Instaladores', subtitle: 'Instala herramientas esenciales con un click (via winget)' },
  { key: 'juegos', label: 'Juegos', title: 'Juegos', subtitle: 'Agrega el .exe y aplica perfil/afinidad propio de cada juego' }
]

export const AJUSTES_NAV: NavItem[] = [
  { key: 'affinity', label: 'Affinity', title: 'Affinity', subtitle: 'Afinidad de nucleos y prioridad de procesos en vivo' },
  { key: 'debloat', label: 'Debloat', title: 'Debloat', subtitle: 'Desinstala aplicaciones preinstaladas que no usas' },
  { key: 'bios', label: 'Bios', title: 'Bios', subtitle: 'Informacion de placa/CPU y acceso al firmware UEFI' }
]

export const ALL_NAV = [...GENERAL_NAV, ...AJUSTES_NAV]
