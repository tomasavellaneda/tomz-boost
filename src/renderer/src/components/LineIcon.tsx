import type { PageKey } from '../lib/nav'

export type LineIconName =
  | 'inicio'
  | 'tweaks'
  | 'instaladores'
  | 'juegos'
  | 'affinity'
  | 'debloat'
  | 'bios'
  | 'fixes'
  | 'package'
  | 'cpu'
  | 'threads'
  | 'clock'
  | 'gpu'
  | 'network'
  | 'download'
  | 'upload'

interface LineIconProps {
  name: LineIconName
  size?: number
}

const PATHS: Record<LineIconName, JSX.Element> = {
  inicio: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </>
  ),
  tweaks: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="9" cy="7" r="2.2" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="15" cy="17" r="2.2" />
    </>
  ),
  instaladores: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M5 16v3h14v-3" />
    </>
  ),
  juegos: (
    <>
      <rect x="3" y="8" width="18" height="10" rx="3" />
      <path d="M8 13h4M10 11v4" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  affinity: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16M12 4v16" />
    </>
  ),
  debloat: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  bios: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  fixes: (
    <>
      <path d="M14.5 6.5a4 4 0 0 1-5.6 5.6L4 17v3h3l4.9-4.9a4 4 0 0 1 5.6-5.6z" />
    </>
  ),
  package: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
    </>
  ),
  threads: (
    <>
      <path d="M8 4v16M12 4v16M16 4v16" />
      <path d="M5 8h14M5 16h14" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2l2.8 1.6" />
    </>
  ),
  gpu: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <circle cx="8.5" cy="12" r="2" />
      <path d="M13 10h5M13 14h3" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M5 16v3h14v-3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V11" />
      <path d="M8 15l4-4 4 4" />
      <path d="M5 8V5h14v3" />
    </>
  )
}

export default function LineIcon({ name, size = 18 }: LineIconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

export const PAGE_ICON: Record<PageKey, LineIconName> = {
  inicio: 'inicio',
  tweaks: 'tweaks',
  instaladores: 'instaladores',
  juegos: 'juegos',
  affinity: 'affinity',
  debloat: 'debloat',
  bios: 'bios'
}
