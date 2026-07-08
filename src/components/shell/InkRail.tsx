// InkRail — the Flow C navy reference rail: r20, navy ink ground, caps section
// labels colored by gradient stop with an 8px swatch, hairline dividers at
// rgba(255,255,255,0.14), footer pinned with margin-top auto.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Gradient-stop accents for rail section labels */
export type RailAccent = "sky" | "blue" | "violet" | "purple" | "pink";

const ACCENT_HEX: Record<RailAccent, string> = {
  sky: "#8FD3F4",
  blue: "#6FA8FF",
  violet: "#A78BFA",
  purple: "#C084FC",
  pink: "#F472B6",
};

interface InkRailProps {
  children: ReactNode;
  /** Pinned to the bottom of the rail via margin-top auto */
  footer?: ReactNode;
  className?: string;
}

export function InkRail({ children, footer, className }: InkRailProps) {
  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col rounded-sheet bg-navy text-white lg:w-[372px]",
        className,
      )}
      style={{ padding: "26px 28px" }}
    >
      {children}
      {footer && (
        <div className="mt-auto border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          {footer}
        </div>
      )}
    </aside>
  );
}

interface RailSectionProps {
  label: string;
  accent?: RailAccent;
  children: ReactNode;
  className?: string;
  /** First section skips the top hairline */
  first?: boolean;
}

export function RailSection({ label, accent = "sky", children, className, first }: RailSectionProps) {
  return (
    <div
      className={cn("py-4", !first && "border-t", className)}
      style={!first ? { borderColor: "rgba(255,255,255,0.14)" } : undefined}
    >
      <p
        className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em]"
        style={{ color: ACCENT_HEX[accent] }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-[2px]"
          style={{ background: ACCENT_HEX[accent] }}
        />
        {label}
      </p>
      <div className="text-[13px] leading-[19px] text-white/85">{children}</div>
    </div>
  );
}
