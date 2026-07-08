// WorkSheet — the Flow C white work sheet: r20 card on the cloud ground with
// an optional cloud header band (title / subtitle / right-side chips) and a
// 1px hairline under the band. Pure presentation.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkSheetProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the header band — chips, counts, small actions */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra classes for the body wrapper */
  bodyClassName?: string;
}

export function WorkSheet({
  title,
  subtitle,
  headerRight,
  children,
  className,
  bodyClassName,
}: WorkSheetProps) {
  const hasHeader = Boolean(title || subtitle || headerRight);

  return (
    <section className={cn("rounded-sheet border border-cloud-line bg-card", className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-sheet border-b border-cloud-line bg-cloud px-6 py-5 md:px-8">
          <div className="min-w-0">
            {title && (
              <h2 className="text-xl font-bold leading-[26px] tracking-[-0.01em] text-navy">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] leading-[19px] text-slate">{subtitle}</p>}
          </div>
          {headerRight && <div className="flex shrink-0 items-center gap-2">{headerRight}</div>}
        </div>
      )}
      <div className={cn("px-6 py-6 md:px-8", bodyClassName)}>{children}</div>
    </section>
  );
}
