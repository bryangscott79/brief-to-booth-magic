// PageHeader — the Flow C site-level page header.
//
// Anatomy (top to bottom):
//   1. Eyebrow  — caps-mono contextual line (IBM Plex Mono, 10px, +0.08em,
//                 slate, uppercase) e.g. "EXHIBITUS · 15 ACTIVE PROJECTS".
//   2. Title    — 28px/34 Inter 700 navy, -0.015em.
//   3. Subtitle — 13px slate, ONE tight line (long explainers belong in
//                 the page body, not here).
// Plus a right-side actions slot and an optional leading visual (logo,
// icon well) before the text block. Pure presentation.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Caps-mono contextual line above the title */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Chips rendered inline after the title (BETA tag, status) */
  titleAside?: ReactNode;
  /** One tight line, 13px slate — not a paragraph */
  subtitle?: ReactNode;
  /** Right-side actions slot (buttons, search, selects) */
  actions?: ReactNode;
  /** Optional visual before the text block (client logo, icon well) */
  leading?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  titleAside,
  subtitle,
  actions,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-4">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
              {eyebrow}
            </p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="min-w-0 truncate text-[28px] font-bold leading-[34px] tracking-[-0.015em] text-navy">
              {title}
            </h1>
            {titleAside}
          </div>
          {subtitle && (
            <p className="mt-1 text-[13px] leading-[19px] text-slate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
