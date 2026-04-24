// CanopyAmbientGlow — a blurred gradient orb that lives in section backgrounds.
// Adds depth and motion to hero areas without being distracting.

import { cn } from "@/lib/utils";

interface CanopyAmbientGlowProps {
  /** Tailwind position classes like "top-1/4 -left-32" */
  position?: string;
  /** Size in pixels — wraps in inline style */
  size?: number;
  /** Hue variant */
  tone?: "violet" | "pink" | "sky" | "full";
  /** Opacity 0-1 */
  opacity?: number;
  /** Animate the glow subtly */
  animate?: boolean;
  className?: string;
}

export function CanopyAmbientGlow({
  position = "top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2",
  size = 600,
  tone = "full",
  opacity = 0.25,
  animate = false,
  className,
}: CanopyAmbientGlowProps) {
  const bg =
    tone === "violet"
      ? "radial-gradient(circle at center, rgba(167,139,250,0.9), transparent 70%)"
      : tone === "pink"
      ? "radial-gradient(circle at center, rgba(244,114,182,0.9), transparent 65%)"
      : tone === "sky"
      ? "radial-gradient(circle at center, rgba(111,168,255,0.9), transparent 65%)"
      : "linear-gradient(135deg,#8FD3F4 0%,#6FA8FF 25%,#A78BFA 50%,#C084FC 75%,#F472B6 100%)";

  return (
    <div
      aria-hidden
      className={cn(
        "absolute pointer-events-none rounded-full",
        position,
        animate && "animate-canopy-glow",
        className,
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: bg,
        filter: "blur(120px)",
        opacity,
      }}
    />
  );
}
