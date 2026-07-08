// CanopyMark — the CANOPY radial gradient mark as an inline SVG.
// Eight canopy segments (straight spokes, concave outer edges) radiating
// from center, filled with the brand gradient (#8FD3F4 → #6FA8FF →
// #A78BFA → #C084FC → #F472B6), plus eight tip dots at the spoke ends
// colored by their nearest gradient stop. Geometry matches the brand
// guide / Paper design-system mark exactly.

import { useId } from "react";

interface CanopyMarkProps {
  size?: number;
  className?: string;
}

const TIP_DOTS: Array<[number, number, string]> = [
  [98, 50, "#F472B6"],
  [84, 84, "#F472B6"],
  [50, 98, "#C084FC"],
  [16, 84, "#A78BFA"],
  [2, 50, "#8FD3F4"],
  [16, 16, "#8FD3F4"],
  [50, 2, "#6FA8FF"],
  [84, 16, "#6FA8FF"],
];

export function CanopyMark({ size = 28, className }: CanopyMarkProps) {
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Canopy"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8FD3F4" />
          <stop offset="30%" stopColor="#6FA8FF" />
          <stop offset="55%" stopColor="#A78BFA" />
          <stop offset="75%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#F472B6" />
        </linearGradient>
      </defs>
      <path
        d="M50,50 L93.9,52.3 Q83,66 82.7,79.4 Z M50,50 L79.4,82.7 Q66,83 52.3,93.9 Z M50,50 L47.7,93.9 Q34,83 20.6,82.7 Z M50,50 L17.3,79.4 Q17,66 6.1,52.3 Z M50,50 L6.1,47.7 Q17,34 17.3,20.6 Z M50,50 L20.6,17.3 Q34,17 47.7,6.1 Z M50,50 L52.3,6.1 Q66,17 79.4,17.3 Z M50,50 L82.7,20.6 Q83,34 93.9,47.7 Z"
        fill={`url(#${gradId})`}
      />
      {TIP_DOTS.map(([cx, cy, fill]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill={fill} />
      ))}
    </svg>
  );
}
