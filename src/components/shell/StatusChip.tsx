// StatusChip — the Flow C color grammar as a small caps chip.
//   blocking   = solid red, white text (something MUST be resolved)
//   warning    = amber on amber-soft (heads up, not fatal)
//   attention  = pink-deep on pink-soft (urgent action / needs a decision)
//   pass       = green on green-soft (validated / complete)
//   generating = violet on violet-soft (AI is working)
//   neutral    = slate on cloud (informational)

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusChipVariant =
  | "blocking"
  | "warning"
  | "attention"
  | "pass"
  | "generating"
  | "neutral";

const VARIANT_CLASSES: Record<StatusChipVariant, string> = {
  blocking: "bg-blocking text-white",
  warning: "bg-amber-soft text-warn",
  attention: "bg-pink-soft text-pink-deep",
  pass: "bg-green-soft text-pass",
  generating: "bg-violet-soft text-[#7C3AED]",
  neutral: "bg-cloud text-slate",
};

interface StatusChipProps {
  variant?: StatusChipVariant;
  children: ReactNode;
  className?: string;
}

export function StatusChip({ variant = "neutral", children, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
