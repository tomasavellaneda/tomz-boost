export type PageKey =
  | 'inicio'
  | 'diagnostico'
  | 'tweaks'
  | 'instaladores'
  | 'juegos'
  | 'tools'
  | 'fixes'
  | 'debloat'
  | 'drivers'
  | 'bios'

export interface NavItem {
  key: PageKey
  label: string
  icon: string
  title: string
  subtitle: string
}

export const GENERAL_NAV: NavItem[] = [
  { key: 'inicio', label: 'Inicio', icon: '⌂', title: 'Vista General del Sistema', subtitle: 'Monitorea y optimiza el rendimiento de tu PC en tiempo real' },
  { key: 'diagnostico', label: 'Diagnostico', icon: '◎', title: 'Diagnostico del Sistema', subtitle: 'Informacion detallada de hardware y sistema operativo' },
  { key: 'tweaks', label: 'Tweaks', icon: '≡', title: 'Tweaks de Rendimiento', subtitle: 'Ajustes reales de sistema, red y GPU aplicados en el acto' },
  { key: 'instaladores', label: 'Instaladores', icon: '⬇', title: 'Instaladores', subtitle: 'Instala herramientas esenciales con un click (via winget)' },
  { key: 'juegos', label: 'Juegos', icon: '▣', title: 'Juegos', subtitle: 'Perfiles de prioridad y afinidad por juego, con auto-aplicado' }
]

export const AJUSTES_NAV: NavItem[] = [
  { key: 'tools', label: 'Tools', icon: '✦', title: 'Affinity', subtitle: 'Afinidad de nucleos y prioridad de procesos en vivo' },
  { key: 'fixes', label: 'Fixes', icon: '✓', title: 'Correcciones', subtitle: 'Arreglos rapidos para problemas comunes de Windows' },
  { key: 'debloat', label: 'Debloat', icon: '⊗', title: 'Debloat', subtitle: 'Desinstala aplicaciones preinstaladas que no usas' },
  { key: 'drivers', label: 'Drivers', icon: '⇕', title: 'Drivers', subtitle: 'Controladores instalados en tu equipo' },
  { key: 'bios', label: 'Bios', icon: '▤', title: 'Bios', subtitle: 'Informacion de placa/CPU y acceso al firmware UEFI' }
]

export const ALL_NAV = [...GENERAL_NAV, ...AJUSTES_NAV]
