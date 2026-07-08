// SpecMono — IBM Plex Mono treatment for dimensions, costs, counts, and IDs.
// Flow C rule: every spec-like string renders in the mono face.

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SpecMonoProps {
  children: ReactNode;
  className?: string;
}

export function SpecMono({ children, className }: SpecMonoProps) {
  return (
    <span className={cn("font-mono text-[13px] font-medium tracking-tight", className)}>
      {children}
    </span>
  );
}
