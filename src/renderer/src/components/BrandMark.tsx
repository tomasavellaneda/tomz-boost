import logo from '../assets/logo.png'

export type BrandMarkSize = 'splash' | 'lock' | 'sidebar'

interface BrandMarkProps {
  size?: BrandMarkSize
}

export default function BrandMark({ size = 'splash' }: BrandMarkProps): JSX.Element {
  return (
    <div className={`brand-mark brand-mark-${size}`}>
      <img className="boot-logo" src={logo} alt="TOMZ BOOST" draggable={false} />
    </div>
  )
}
