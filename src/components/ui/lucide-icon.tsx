/**
 * LucideIcon — render a lucide-react icon by string name.
 *
 * Replaces emoji icons stored as strings in data sources (project types,
 * activation types, video presets, etc.) with flat, single-color line icons.
 *
 * Usage:
 *   <LucideIcon name="Lightbulb" className="h-5 w-5 text-primary" />
 *
 * If `name` is missing, unknown, or accidentally still an emoji, falls back
 * to the configured fallback icon (default: Sparkles) so layout stays stable.
 */

import * as Icons from "lucide-react";
import { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

interface LucideIconProps extends Omit<LucideProps, "ref"> {
  /** PascalCase lucide icon name (e.g. "Lightbulb", "Target", "Zap") */
  name?: string | null;
  /** Fallback icon name if `name` is missing/unknown. Default: "Sparkles" */
  fallback?: string;
}

export function LucideIcon({
  name,
  fallback = "Sparkles",
  className,
  ...props
}: LucideIconProps) {
  const registry = Icons as unknown as Record<string, React.ComponentType<LucideProps>>;
  const Resolved =
    (name && registry[name]) ||
    registry[fallback] ||
    Icons.Sparkles;

  return (
    <Resolved
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}
