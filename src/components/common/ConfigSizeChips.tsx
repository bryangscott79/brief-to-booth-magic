// ConfigSizeChips — the booth-size (footprint config) selector chip row.
// Shared between the Spatial step and the Prompts step so switching sizes
// in either place drives the same persisted selection
// (spatial_strategy.activeConfigKey via useActiveSpatialConfig).
// Renders nothing for single-config projects — they behave exactly as
// before multi-config support existed.

import { cn } from "@/lib/utils";
import { calculateBoothDimensions } from "@/lib/spatialUtils";
import type { SpatialFootprintConfig } from "@/hooks/useActiveSpatialConfig";

interface ConfigSizeChipsProps {
  configs: SpatialFootprintConfig[];
  activeIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
  className?: string;
}

export function ConfigSizeChips({
  configs,
  activeIndex,
  onSelect,
  disabled,
  className,
}: ConfigSizeChipsProps) {
  if (configs.length <= 1) return null;

  return (
    <div className={cn("flex gap-2 flex-wrap", className)}>
      {configs.map((config, index) => (
        <button
          key={`${config.footprintSize ?? "config"}-${index}`}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(index)}
          className={cn(
            "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
            disabled && "opacity-50 cursor-not-allowed",
            activeIndex === index
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:border-primary/30",
          )}
        >
          {String(config.footprintSize ?? `Config ${index + 1}`)}
          <span className="text-xs opacity-70 ml-2">
            (
            {config.totalSqft ||
              calculateBoothDimensions(String(config.footprintSize ?? "30x30")).totalSqft}{" "}
            sq ft)
          </span>
        </button>
      ))}
    </div>
  );
}
