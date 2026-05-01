// PromptVersionTabs — horizontal version selector with a "New version"
// affordance. Renders along the top of the Prompts page when more than one
// version exists, or always exposes the "New version" button.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { StylePresetSelector, StylePresetPill } from "./StylePresetSelector";
import {
  PROMPT_STYLE_PRESETS,
  getPresetById,
  type PromptStylePresetId,
} from "@/lib/promptStylePresets";
import type { PromptVersionMeta } from "@/lib/promptVersions";

interface PromptVersionTabsProps {
  versions: PromptVersionMeta[];
  activeVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onCreateVersion: (params: {
    preset: PromptStylePresetId;
    label: string;
    customEmphasis?: string;
  }) => void;
  onDeleteVersion?: (id: string) => void;
  /** Disable creating new versions (e.g. mid-generation). */
  disabled?: boolean;
}

export function PromptVersionTabs({
  versions,
  activeVersionId,
  onSelectVersion,
  onCreateVersion,
  onDeleteVersion,
  disabled = false,
}: PromptVersionTabsProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newPreset, setNewPreset] = useState<PromptStylePresetId>("traffic-optimized");
  const [newCustomEmphasis, setNewCustomEmphasis] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const handleSubmitNew = () => {
    const preset = getPresetById(newPreset);
    const label = newLabel.trim() || `${preset.shortLabel} — ${new Date().toLocaleDateString()}`;
    onCreateVersion({
      preset: newPreset,
      label,
      customEmphasis: newPreset === "custom" ? newCustomEmphasis.trim() : undefined,
    });
    setShowNewDialog(false);
    setNewLabel("");
    setNewCustomEmphasis("");
    setNewPreset("traffic-optimized");
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
          Versions
        </span>

        {versions.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            No versions yet — generate one to get started.
          </span>
        )}

        {versions.map((v) => {
          const preset = getPresetById(v.preset);
          const isActive = v.id === activeVersionId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => !disabled && onSelectVersion(v.id)}
              disabled={disabled}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30",
              )}
              title={`Created ${formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}`}
            >
              {isActive && <Check className="h-3 w-3 text-primary" />}
              <span className="font-medium truncate max-w-[180px]">{v.label}</span>
              <StylePresetPill preset={preset} />
              {onDeleteVersion && versions.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete version "${v.label}"? Saved images stay in storage but the version disappears from this list.`)) {
                      onDeleteVersion(v.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      if (confirm(`Delete version "${v.label}"?`)) onDeleteVersion(v.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive cursor-pointer inline-flex"
                  aria-label="Delete version"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => setShowNewDialog(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          New version
        </Button>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              New prompt version
            </DialogTitle>
            <DialogDescription>
              Pick a style emphasis. Each version generates its own set of renders so you can
              compare or hand multiple options to the client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="version-label" className="text-xs">
                Label <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Input
                id="version-label"
                placeholder="e.g. Round 2 — show floor focused"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to auto-name from the preset and date.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Style preset</Label>
              <StylePresetSelector
                value={newPreset}
                onChange={setNewPreset}
                customEmphasis={newCustomEmphasis}
                onCustomEmphasisChange={setNewCustomEmphasis}
                compact
              />
            </div>

            <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="text-[10px] mr-2">Heads up</Badge>
              Each version stores its renders separately. Existing versions are not modified.
              You can switch between them at any time.
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitNew}
              disabled={
                newPreset === "custom" && newCustomEmphasis.trim().length === 0
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Currently selected version's preset descriptor (read-only) */}
      {(() => {
        const active = versions.find((v) => v.id === activeVersionId);
        if (!active) return null;
        const preset = getPresetById(active.preset);
        return PROMPT_STYLE_PRESETS.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 mt-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wider">Active version</span>
              <span className="text-foreground font-medium">{active.label}</span>
              <StylePresetPill preset={preset} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {preset.id === "custom" && active.customEmphasis
                ? active.customEmphasis
                : preset.description}
            </p>
          </div>
        ) : null;
      })()}
    </>
  );
}
