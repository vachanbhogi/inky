interface InkyLogoProps {
  className?: string
  size?: number
}

/**
 * Playful, friendly ink drop mark with an organic curve and curious eye sparkle.
 * Crafted according to senior identity design principles: simple, memorable, vector-pure.
 */
export function InkyLogo({ className = '', size = 26 }: InkyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Inky Logo"
    >
      {/* Friendly, bouncy ink creature / droplet */}
      <path
        d="M16 2.5C16 2.5 7.5 13.2 7.5 19.5C7.5 24.5 11.3 28.5 16 28.5C20.7 28.5 24.5 24.5 24.5 19.5C24.5 13.2 16 2.5 16 2.5Z"
        fill="#111111"
      />
      {/* Playful shine/sparkle on the droplet */}
      <ellipse
        cx="13.2"
        cy="15"
        rx="2.2"
        ry="3.5"
        transform="rotate(-22 13.2 15)"
        fill="#FFFFFF"
      />
      {/* Friendly little twinkle dot */}
      <circle cx="19.5" cy="20.5" r="1.3" fill="#FFFFFF" />
    </svg>
  )
}
