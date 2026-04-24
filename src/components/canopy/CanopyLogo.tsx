// CanopyLogo — the radial canopy mark: 8 gradient nodes + spokes + center.
// Used in the header, auth page, and anywhere the brand mark appears.
//
// Variants:
//   - "icon"         Just the radial geometry
//   - "horizontal"   Icon + wordmark CANOPY side-by-side
//   - "stacked"      Icon above wordmark

import { cn } from "@/lib/utils";

interface CanopyLogoProps {
  variant?: "icon" | "horizontal" | "stacked";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Show "By Exhibitus" underline */
  showByline?: boolean;
  /** Animate the nodes on mount */
  animate?: boolean;
}

const SIZES = {
  sm: { icon: 24, text: "text-sm", gap: "gap-2" },
  md: { icon: 32, text: "text-base", gap: "gap-2.5" },
  lg: { icon: 44, text: "text-xl", gap: "gap-3" },
  xl: { icon: 64, text: "text-3xl", gap: "gap-4" },
};

export function CanopyLogo({
  variant = "horizontal",
  size = "md",
  className,
  showByline = false,
  animate = false,
}: CanopyLogoProps) {
  const dims = SIZES[size];

  const icon = (
    <svg
      width={dims.icon}
      height={dims.icon}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", animate && "animate-canopy-spin-slow")}
      aria-hidden
    >
      <defs>
        <linearGradient id="canopy-mark-gradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8FD3F4" />
          <stop offset="25%" stopColor="#6FA8FF" />
          <stop offset="50%" stopColor="#A78BFA" />
          <stop offset="75%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#F472B6" />
        </linearGradient>
        <radialGradient id="canopy-mark-fill" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#C084FC" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F472B6" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* 8-pointed canopy: gradient-filled polygon with center node */}
      <polygon
        points="32,6 47.5,12.5 54,28 54,36 47.5,51.5 32,58 16.5,51.5 10,36 10,28 16.5,12.5"
        fill="url(#canopy-mark-fill)"
        stroke="url(#canopy-mark-gradient)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* Spokes from center */}
      <g stroke="url(#canopy-mark-gradient)" strokeWidth="0.6" opacity="0.5">
        <line x1="32" y1="32" x2="32" y2="6" />
        <line x1="32" y1="32" x2="47.5" y2="12.5" />
        <line x1="32" y1="32" x2="54" y2="28" />
        <line x1="32" y1="32" x2="54" y2="36" />
        <line x1="32" y1="32" x2="47.5" y2="51.5" />
        <line x1="32" y1="32" x2="32" y2="58" />
        <line x1="32" y1="32" x2="16.5" y2="51.5" />
        <line x1="32" y1="32" x2="10" y2="36" />
        <line x1="32" y1="32" x2="10" y2="28" />
        <line x1="32" y1="32" x2="16.5" y2="12.5" />
      </g>

      {/* Outer nodes at each vertex */}
      <g fill="url(#canopy-mark-gradient)">
        <circle cx="32" cy="6" r="2" />
        <circle cx="47.5" cy="12.5" r="2" />
        <circle cx="54" cy="28" r="2" />
        <circle cx="54" cy="36" r="2" />
        <circle cx="47.5" cy="51.5" r="2" />
        <circle cx="32" cy="58" r="2" />
        <circle cx="16.5" cy="51.5" r="2" />
        <circle cx="10" cy="36" r="2" />
        <circle cx="10" cy="28" r="2" />
        <circle cx="16.5" cy="12.5" r="2" />
      </g>

      {/* Center node (brightest) */}
      <circle cx="32" cy="32" r="3" fill="white" />
      <circle cx="32" cy="32" r="6" fill="white" opacity="0.15" />
    </svg>
  );

  if (variant === "icon") {
    return <div className={cn("inline-flex", className)}>{icon}</div>;
  }

  if (variant === "stacked") {
    return (
      <div className={cn("inline-flex flex-col items-center", dims.gap, className)}>
        {icon}
        <div className="text-center">
          <div className={cn("font-semibold tracking-[0.15em] text-foreground", dims.text)}>CANOPY</div>
          {showByline && (
            <div className="text-[10px] text-muted-foreground tracking-widest mt-0.5">BY EXHIBITUS</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center", dims.gap, className)}>
      {icon}
      <div className="leading-none">
        <div className={cn("font-semibold tracking-[0.15em] text-foreground", dims.text)}>CANOPY</div>
        {showByline && (
          <div className="text-[10px] text-muted-foreground tracking-widest mt-1">BY EXHIBITUS</div>
        )}
      </div>
    </div>
  );
}
