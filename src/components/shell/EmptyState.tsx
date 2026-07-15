// EmptyState — the Flow C empty-state grammar: a cloud icon well (r8,
// navy 1.3px-stroke icon), 16/600 navy title, one 13px slate line, and
// a primary action. Pure presentation.

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  /** One or two short slate lines max */
  body?: ReactNode;
  /** Primary action — navy Button (or generative ✦ variant) */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-square bg-cloud">
        <Icon className="h-5 w-5 text-navy" strokeWidth={1.3} />
      </div>
      <h3 className="text-base font-semibold text-navy">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-[13px] leading-[19px] text-slate">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** IconWell — cloud ground, r8, navy stroke icon. The Flow C icon container.
 *  `generative` flips it to the action-gradient square with a white glyph —
 *  reserved for AI/generation contexts. */
export function IconWell({
  icon: Icon,
  size = 36,
  generative = false,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  generative?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-square",
        generative ? "bg-gradient-action" : "bg-cloud",
        className,
      )}
      style={{ height: size, width: size }}
    >
      <Icon
        className={generative ? "text-white" : "text-navy"}
        style={{ height: size * 0.44, width: size * 0.44 }}
        strokeWidth={1.3}
      />
    </div>
  );
}
