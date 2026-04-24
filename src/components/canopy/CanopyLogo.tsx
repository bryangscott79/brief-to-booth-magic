// CanopyLogo — the official Canopy brand logo.
// The PNG already contains the wordmark, so we just render the image.
//
// Variants are kept for backward compatibility but all render the full lockup.
//   - "icon"         Square crop of the radial mark only
//   - "horizontal"   Full lockup (mark + wordmark)
//   - "stacked"      Full lockup centered

import { cn } from "@/lib/utils";
import canopyLogo from "@/assets/canopy-logo.png";

// Logo dimensions: 345 × 329 (mark only, ≈ 1.05:1)
const LOGO_ASPECT = 345 / 329;

interface CanopyLogoProps {
  variant?: "icon" | "horizontal" | "stacked";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Kept for API compatibility — wordmark is part of the image */
  showByline?: boolean;
  /** Animate the mark on mount */
  animate?: boolean;
}

// Heights in px for each size
const SIZES = {
  sm: 24,
  md: 32,
  lg: 44,
  xl: 56,
};

export function CanopyLogo({
  variant = "horizontal",
  size = "md",
  className,
  animate = false,
}: CanopyLogoProps) {
  const height = SIZES[size];

  // For the icon variant, crop the image to its left square (the mark).
  if (variant === "icon") {
    return (
      <div
        className={cn("inline-flex shrink-0 select-none", className)}
        style={{
          width: height,
          height: height,
          backgroundImage: `url(${canopyLogo})`,
          backgroundSize: `${height * LOGO_ASPECT}px ${height}px`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "left center",
        }}
        role="img"
        aria-label="Canopy"
      >
        {animate && (
          <span className="block w-full h-full animate-canopy-spin-slow" />
        )}
      </div>
    );
  }

  // horizontal & stacked both render the full lockup PNG.
  return (
    <img
      src={canopyLogo}
      alt="Canopy"
      height={height}
      style={{ height, width: "auto" }}
      className={cn(
        "shrink-0 select-none object-contain",
        animate && "animate-canopy-spin-slow",
        className
      )}
      draggable={false}
    />
  );
}
