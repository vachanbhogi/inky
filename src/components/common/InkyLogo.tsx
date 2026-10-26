interface InkyLogoProps {
  className?: string
  size?: number
}

/**
 * Playful, friendly mascot/pictorial mark for Inky:
 * An expressive ink blob character with big curious eyes and a warm little smile,
 * designed in a pure, iconic vector silhouette that scales crisply to any size.
 */
export function InkyLogo({ className = '', size = 28 }: InkyLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Inky Logo"
    >
      {/* Friendly, bouncy ink droplet body */}
      <path
        d="M18 3.5C18 3.5 8 15 8 22C8 27.52 12.48 32 18 32C23.52 32 28 27.52 28 22C28 15 18 3.5 18 3.5Z"
        fill="#111111"
      />

      {/* Glossy droplet top-left highlight */}
      <path
        d="M14 9C12 12 11 15 11 18"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Left expressive eye */}
      <circle cx="14.5" cy="21" r="2.2" fill="#FFFFFF" />
      <circle cx="15.2" cy="20.4" r="0.8" fill="#111111" />

      {/* Right expressive eye (slightly larger / curious wink) */}
      <circle cx="21.5" cy="21" r="2.2" fill="#FFFFFF" />
      <circle cx="22.2" cy="20.4" r="0.8" fill="#111111" />

      {/* Cute happy smile */}
      <path
        d="M16.5 25C17.2 25.7 18.8 25.7 19.5 25"
        stroke="#FFFFFF"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
