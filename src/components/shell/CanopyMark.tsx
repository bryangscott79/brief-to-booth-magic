// CanopyMark — the CANOPY radial gradient mark as an inline SVG.
// Eight curved petals radiating from center, filled with the brand gradient
// (#8FD3F4 → #6FA8FF → #A78BFA → #C084FC → #F472B6), plus eight tip dots.
// Purely presentational; sized via the `size` prop (px).

interface CanopyMarkProps {
  size?: number;
  className?: string;
}

const PETAL_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function CanopyMark({ size = 28, className }: CanopyMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Canopy"
    >
      <defs>
        <linearGradient id="canopy-mark-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8FD3F4" />
          <stop offset="30%" stopColor="#6FA8FF" />
          <stop offset="55%" stopColor="#A78BFA" />
          <stop offset="75%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      {/* Eight curved petals */}
      {PETAL_ANGLES.map((angle) => (
        <path
          key={angle}
          d="M16 16 C 13.8 11.5, 13.8 7.5, 16 4.5 C 18.2 7.5, 18.2 11.5, 16 16 Z"
          fill="url(#canopy-mark-grad)"
          fillOpacity={0.9}
          transform={`rotate(${angle} 16 16)`}
        />
      ))}
      {/* Eight tip dots */}
      {PETAL_ANGLES.map((angle) => (
        <circle
          key={`dot-${angle}`}
          cx="16"
          cy="2.6"
          r="1.1"
          fill="url(#canopy-mark-grad)"
          transform={`rotate(${angle + 22.5} 16 16)`}
        />
      ))}
    </svg>
  );
}
