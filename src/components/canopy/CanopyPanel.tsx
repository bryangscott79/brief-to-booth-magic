// CanopyPanel — glass surface. Semantic wrapper for the `canopy-panel` CSS class.
// Variants tune border behavior and hover interactivity.

import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CanopyPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds gradient-border accent */
  bordered?: boolean;
  /** Adds hover glow */
  interactive?: boolean;
  /** Tight padding preset */
  padded?: boolean;
}

export const CanopyPanel = forwardRef<HTMLDivElement, CanopyPanelProps>(
  ({ bordered = false, interactive = false, padded = false, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "canopy-panel",
          interactive && "canopy-panel-hover cursor-pointer",
          bordered && "canopy-gradient-border",
          padded && "p-6",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

CanopyPanel.displayName = "CanopyPanel";
