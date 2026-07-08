// StepPillNav — the Flow C project step navigation: a white pill rail on the
// cloud ground (1px cloud-line border, 4px pad). Pills:
//   active    = navy, white label, step number in sky (#8FD3F4)
//   complete  = green check + navy label
//   blocked   = 6px red dot next to the label
//   pending   = slate label
// Presentation only — targets and step semantics come from the caller.

import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "complete" | "active" | "pending" | "blocked";

export interface StepPill {
  key: string;
  label: string;
  number: number;
  status: StepStatus;
  to: string;
}

interface StepPillNavProps {
  steps: StepPill[];
  className?: string;
}

export function StepPillNav({ steps, className }: StepPillNavProps) {
  return (
    <nav
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-cloud-line bg-card p-1 scrollbar-none",
        className,
      )}
      aria-label="Project steps"
    >
      {steps.map((step) => {
        const isActive = step.status === "active";
        const isComplete = step.status === "complete";
        const isBlocked = step.status === "blocked";

        return (
          <Link
            key={step.key}
            to={step.to}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? "bg-navy text-white"
                : isComplete
                ? "text-navy hover:bg-cloud"
                : "text-slate hover:bg-cloud hover:text-navy",
            )}
          >
            {isComplete ? (
              <Check className="h-3 w-3 shrink-0 text-pass" strokeWidth={3} />
            ) : (
              <span
                className={cn(
                  "font-mono text-[10px] font-semibold leading-none",
                  isActive ? "text-[#8FD3F4]" : "text-slate-faint",
                )}
              >
                {step.number}
              </span>
            )}
            <span>{step.label}</span>
            {isBlocked && (
              <span
                aria-label="Blocked"
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blocking"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
