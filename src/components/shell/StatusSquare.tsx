// StatusSquare — an r8 status tile for icon-led state (checks, counters).
// Same grammar as StatusChip, in square form.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusChipVariant } from "./StatusChip";

const VARIANT_CLASSES: Record<StatusChipVariant, string> = {
  blocking: "bg-blocking text-white",
  warning: "bg-amber-soft text-warn",
  attention: "bg-pink-soft text-pink-deep",
  pass: "bg-green-soft text-pass",
  generating: "bg-violet-soft text-[#7C3AED]",
  neutral: "bg-cloud text-slate",
};

interface StatusSquareProps {
  variant?: StatusChipVariant;
  children?: ReactNode;
  className?: string;
  /** Square edge length in px (default 28) */
  size?: number;
}

export function StatusSquare({ variant = "neutral", children, className, size = 28 }: StatusSquareProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-square text-xs font-semibold",
        VARIANT_CLASSES[variant],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
