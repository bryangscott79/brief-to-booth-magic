// CanopyLogo — the official Canopy brand mark (radial 8-point canopy).
// Renders the uploaded brand PNG so the same logo appears everywhere:
// header/sidebar, auth page, landing page, footer, etc.
//
// Variants:
//   - "icon"         Just the mark
//   - "horizontal"   Mark + CANOPY wordmark side-by-side
//   - "stacked"      Mark above wordmark

import { cn } from "@/lib/utils";
import canopyMark from "@/assets/canopy-mark.png";

interface CanopyLogoProps {
  variant?: "icon" | "horizontal" | "stacked";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Show "By Exhibitus" underline */
  showByline?: boolean;
  /** Animate the mark on mount */
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
    <img
      src={canopyMark}
      alt="Canopy"
      width={dims.icon}
      height={dims.icon}
      className={cn(
        "shrink-0 select-none object-contain",
        animate && "animate-canopy-spin-slow"
      )}
      style={{ width: dims.icon, height: dims.icon }}
      draggable={false}
    />
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

