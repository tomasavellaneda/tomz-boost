interface IconProps {
  src: string
  alt?: string
  size?: number
  className?: string
}

export default function Icon({ src, alt = '', size = 18, className }: IconProps): JSX.Element {
  return (
    <img
      className={`app-icon${className ? ` ${className}` : ''}`}
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
    />
  )
}
