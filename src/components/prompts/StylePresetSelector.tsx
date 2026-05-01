// StylePresetSelector — chip row for picking the visual emphasis on a
// version of generated renders. Used at version-creation time and shown as
// read-only context inside an existing version.

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Target, Compass, Users, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PROMPT_STYLE_PRESETS,
  type PromptStylePreset,
  type PromptStylePresetId,
} from "@/lib/promptStylePresets";

const PRESET_ICONS: Record<PromptStylePresetId, LucideIcon> = {
  "balanced": Target,
  "traffic-optimized": Compass,
  "hero-centric": Sparkles,
  "engagement": Users,
  "custom": Pencil,
};

interface StylePresetSelectorProps {
  value: PromptStylePresetId;
  onChange: (id: PromptStylePresetId) => void;
  customEmphasis?: string;
  onCustomEmphasisChange?: (text: string) => void;
  /** Render in read-only mode (no chip clicks, custom textarea disabled). */
  readOnly?: boolean;
  /** Optional compact rendering — fewer chips per row, smaller padding. */
  compact?: boolean;
}

export function StylePresetSelector({
  value,
  onChange,
  customEmphasis = "",
  onCustomEmphasisChange,
  readOnly = false,
  compact = false,
}: StylePresetSelectorProps) {
  const active = PROMPT_STYLE_PRESETS.find((p) => p.id === value) ?? PROMPT_STYLE_PRESETS[0]!;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "grid gap-2",
          compact
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
        )}
      >
        {PROMPT_STYLE_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.id];
          const isActive = preset.id === value;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={readOnly}
              onClick={() => !readOnly && onChange(preset.id)}
              className={cn(
                "group rounded-lg border text-left transition-colors px-3 py-2.5",
                isActive
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-card hover:border-primary/30 text-muted-foreground hover:text-foreground",
                readOnly && !isActive && "opacity-50",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="text-sm font-medium truncate text-foreground">
                  {preset.shortLabel}
                </span>
              </div>
              <p className="text-[11px] leading-snug line-clamp-2">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* Active preset detail */}
      {active && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="text-[10px] uppercase">
              Active emphasis
            </Badge>
            <span className="text-xs font-medium">{active.label}</span>
          </div>
          {active.id === "custom" ? (
            <Textarea
              value={customEmphasis}
              onChange={(e) => onCustomEmphasisChange?.(e.target.value)}
              disabled={readOnly}
              rows={4}
              placeholder={`Describe the visual emphasis you want. Example:\n• Quiet luxury — restrained, soft monochrome, minimal signage, after-hours lighting.\n• Sustainability storytelling — visible reclaimed materials, plant integration, daylight emphasis.`}
              className="text-xs"
            />
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">{active.emphasisBlock}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Tiny inline pill for showing a version's preset elsewhere in the UI. */
export function StylePresetPill({ preset }: { preset: PromptStylePreset }) {
  const Icon = PRESET_ICONS[preset.id];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {preset.shortLabel}
    </span>
  );
}
