interface InkyLogoProps {
  className?: string
  size?: number
}

/**
 * Concept A: The Droplet "i"
 * A distinctive, playful monogram where the tittle (dot) is a suspended organic ink drop
 * paired with a friendly rounded stroke. Ultra-pure vector, scales down to 16px cleanly.
 */
export function InkyLogo({ className = '', size = 26 }: InkyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Inky Logo"
    >
      <title>Inky</title>
      <path
        d="M128 32 C148 32 164 48 164 68 C164 88 128 116 128 116 C128 116 92 88 92 68 C92 48 108 32 128 32 Z"
        fill="#111111"
      />
      <rect x="110" y="132" width="36" height="92" rx="18" fill="#111111" />
    </svg>
  )
}
