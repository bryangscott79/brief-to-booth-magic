// InkRail — the Flow C navy reference rail: r20, navy ink ground, caps section
// labels colored by gradient stop with an 8px swatch, hairline dividers at
// rgba(255,255,255,0.14), footer pinned with margin-top auto.
//
// The rail is a collapsible drawer: a chevron in its top-right corner
// collapses it to a slim navy tab on the right edge ("REFERENCE"), and the
// work sheet (flex-1) flexes into the reclaimed width. Open/closed persists
// in localStorage (canopy.inkrail.open); default open.

import { ReactNode, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const OPEN_KEY = "canopy.inkrail.open";

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
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(OPEN_KEY) !== "false";
  });

  const setOpenPersisted = (v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(OPEN_KEY, String(v));
    } catch {
      /* private mode — session-only */
    }
  };

  if (!open) {
    // Collapsed: slim navy tab on the right edge that reopens the rail.
    return (
      <button
        type="button"
        onClick={() => setOpenPersisted(true)}
        aria-label="Open reference rail"
        title="Open reference rail"
        className={cn(
          "flex h-fit shrink-0 items-center gap-2 self-start rounded-full bg-navy px-3 py-2 text-white/80 transition-colors animate-fade-in hover:text-white",
          "lg:min-h-[148px] lg:w-10 lg:flex-col lg:items-center lg:rounded-sheet lg:px-0 lg:py-4",
          className,
        )}
      >
        <PanelRightOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em] lg:[writing-mode:vertical-rl]"
          aria-hidden="true"
        >
          Reference
        </span>
      </button>
    );
  }

  return (
    <aside
      className={cn(
        "relative flex h-fit w-full shrink-0 flex-col self-start rounded-sheet bg-navy text-white transition-[width] duration-300 animate-fade-in lg:w-[372px]",
        className,
      )}
      style={{ padding: "26px 28px" }}
    >
      <button
        type="button"
        onClick={() => setOpenPersisted(false)}
        aria-label="Collapse reference rail"
        title="Collapse reference rail"
        className="absolute right-4 top-5 rounded-btn p-1 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
      >
        <PanelRightClose className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      {children}
      {footer && (
        <div className="mt-auto border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          {footer}
        </div>
      )}
    </aside>
  );
}

/** Rail title block — the rail's caps identity ("FROM THE BRIEF") + hint. */
interface RailTitleProps {
  label: string;
  hint?: ReactNode;
  className?: string;
}

export function RailTitle({ label, hint, className }: RailTitleProps) {
  return (
    <div className={cn("pb-2", className)}>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">{label}</h3>
      {hint && (
        <p className="mt-1 text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          {hint}
        </p>
      )}
    </div>
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

/** Semantic on-ink value tones (Flow C on-navy grammar). */
export type RailTone = "default" | "pass" | "warn" | "attention";

const TONE_HEX: Record<Exclude<RailTone, "default">, string> = {
  pass: "#34D399",
  warn: "#F5B266",
  attention: "#F472B6",
};

interface RailRowProps {
  label: ReactNode;
  /** Right-aligned value. Falls back to a graceful "—" when absent. */
  value?: ReactNode;
  /** Render the value in the mono spec face (dimensions, counts, costs). */
  mono?: boolean;
  tone?: RailTone;
  className?: string;
}

/** Label/value row on navy: 72%-white label, white value, mono option. */
export function RailRow({ label, value, mono, tone = "default", className }: RailRowProps) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-[3px]", className)}>
      <span
        className="shrink-0 text-[13px] leading-[19px]"
        style={{ color: "rgba(255,255,255,0.72)" }}
      >
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words text-right text-[13px] font-medium leading-[19px] text-white",
          mono && "font-mono tracking-tight",
        )}
        style={
          tone !== "default" && hasValue ? { color: TONE_HEX[tone] } : hasValue ? undefined : { color: "rgba(255,255,255,0.45)" }
        }
      >
        {hasValue ? value : "—"}
      </span>
    </div>
  );
}
