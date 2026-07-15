// SectionLabel — caps-mono section heading for in-page sections on white
// or cloud grounds ("PROJECTS WITH A BILL OF MATERIALS", "COMING SOON").
// Replaces default 18–20px semibold gray headings.
//
// Flow C color grammar: each label carries an 8px rounded swatch in a
// brand-gradient stop, with the label text in that stop's darker
// text-safe equivalent (the bright stops fail contrast on white).

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Gradient-stop accents (same family as the ink rail sections). */
export type SectionAccent = "sky" | "blue" | "violet" | "purple" | "pink" | "slate";

/** Bright stop for the swatch · darker text-safe hex for the label. */
const ACCENTS: Record<SectionAccent, { swatch: string; text: string }> = {
  sky: { swatch: "#8FD3F4", text: "#22729C" },
  blue: { swatch: "#6FA8FF", text: "#4F6BE8" },
  violet: { swatch: "#A78BFA", text: "#6D4BC7" },
  purple: { swatch: "#C084FC", text: "#8B34D3" },
  pink: { swatch: "#F472B6", text: "#DB2777" },
  slate: { swatch: "#CBD5E1", text: "#64748B" },
};

export function SectionLabel({
  children,
  accent = "slate",
  className,
}: {
  children: ReactNode;
  accent?: SectionAccent;
  className?: string;
}) {
  const a = ACCENTS[accent];
  return (
    <h2
      className={cn(
        "flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
        className,
      )}
      style={{ color: a.text }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: a.swatch }}
      />
      {children}
    </h2>
  );
}
