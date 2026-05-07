// PromptVersionTabs — horizontal version selector with create / edit /
// delete affordances. Renders along the top of the Prompts page.
//
// Each version is a separate "take" on the renders — different style
// preset, different generated images. The active version's chip is
// outlined; clicking any other chip switches to it. Per-version actions
// (edit settings, delete) are exposed via icon buttons on the active
// chip's panel below — visible by default rather than hover-only, so
// users can find them without guessing.

import { useEffect, useState } from "react";
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
import {
  Plus,
  Check,
  Sparkles,
  Trash2,
  Settings2,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { StylePresetSelector, StylePresetPill } from "./StylePresetSelector";
import {
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
    imageModel?: "gemini" | "openai";
  }) => void;
  /** Update label/preset/customEmphasis/imageModel on an existing version. */
  onUpdateVersion?: (
    id: string,
    patch: {
      label?: string;
      preset?: PromptStylePresetId;
      customEmphasis?: string;
      imageModel?: "gemini" | "openai";
    },
  ) => void;
  onDeleteVersion?: (id: string) => void;
  /** Disable creating new versions (e.g. mid-generation). */
  disabled?: boolean;
}

type DialogMode = { type: "closed" } | { type: "create" } | { type: "edit"; versionId: string };

const IMAGE_MODEL_OPTIONS: Array<{
  id: "gemini" | "openai";
  label: string;
  pillLabel: string;
  description: string;
}> = [
  {
    id: "gemini",
    label: "Gemini Nano (default)",
    pillLabel: "Gemini",
    description: "Fast and consistent. Best for hard geometric architecture and traditional booth shapes. Bundled — no extra setup.",
  },
  {
    id: "openai",
    label: "OpenAI gpt-image-2",
    pillLabel: "GPT-Image-2",
    description: "Stronger logo fidelity and organic / fluid structures. Slower and costlier. Requires OPENAI_API_KEY in Supabase secrets.",
  },
];

export function PromptVersionTabs({
  versions,
  activeVersionId,
  onSelectVersion,
  onCreateVersion,
  onUpdateVersion,
  onDeleteVersion,
  disabled = false,
}: PromptVersionTabsProps) {
  const [dialog, setDialog] = useState<DialogMode>({ type: "closed" });
  const [draftPreset, setDraftPreset] = useState<PromptStylePresetId>("traffic-optimized");
  const [draftCustomEmphasis, setDraftCustomEmphasis] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftImageModel, setDraftImageModel] = useState<"gemini" | "openai">("gemini");

  // When the dialog opens for "edit", prefill from the version. When it
  // opens for "create", reset to defaults.
  useEffect(() => {
    if (dialog.type === "edit") {
      const v = versions.find((vv) => vv.id === dialog.versionId);
      if (v) {
        setDraftLabel(v.label);
        setDraftPreset(v.preset);
        setDraftCustomEmphasis(v.customEmphasis ?? "");
        setDraftImageModel(v.imageModel ?? "gemini");
      }
    } else if (dialog.type === "create") {
      setDraftLabel("");
      setDraftPreset("traffic-optimized");
      setDraftCustomEmphasis("");
      setDraftImageModel("gemini");
    }
  }, [dialog, versions]);

  const closeDialog = () => setDialog({ type: "closed" });

  const handleSubmitCreate = () => {
    const preset = getPresetById(draftPreset);
    const label = draftLabel.trim() || `${preset.shortLabel} — ${new Date().toLocaleDateString()}`;
    onCreateVersion({
      preset: draftPreset,
      label,
      customEmphasis: draftPreset === "custom" ? draftCustomEmphasis.trim() : undefined,
      imageModel: draftImageModel,
    });
    closeDialog();
  };

  const handleSubmitEdit = () => {
    if (dialog.type !== "edit" || !onUpdateVersion) return;
    const preset = getPresetById(draftPreset);
    const label = draftLabel.trim() || `${preset.shortLabel} — ${new Date().toLocaleDateString()}`;
    onUpdateVersion(dialog.versionId, {
      label,
      preset: draftPreset,
      customEmphasis: draftPreset === "custom" ? draftCustomEmphasis.trim() : undefined,
      imageModel: draftImageModel,
    });
    closeDialog();
  };

  const handleDeleteVersion = (id: string, label: string) => {
    const isOnlyOne = versions.length === 1;
    const message = isOnlyOne
      ? `Discard version "${label}"? You'll start fresh — saved renders stay in your project files but won't be linked to this version anymore.`
      : `Delete version "${label}"? Saved renders stay in storage but the version disappears from this list.`;
    if (confirm(message)) onDeleteVersion?.(id);
  };

  const activeVersion = versions.find((v) => v.id === activeVersionId);

  return (
    <>
      {/* Chip row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mr-1">
          Versions
        </span>

        {versions.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            No versions yet — generate to create one automatically, or click "New version" to set one up.
          </span>
        )}

        {versions.map((v) => {
          const preset = getPresetById(v.preset);
          const isActive = v.id === activeVersionId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => !disabled && !isActive && onSelectVersion(v.id)}
              disabled={disabled || isActive}
              title={
                isActive
                  ? `Active version · created ${formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}`
                  : `Click to switch to this version · created ${formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}`
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/10 text-foreground cursor-default"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card cursor-pointer",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {isActive ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <ArrowLeftRight className="h-3 w-3 opacity-60" />
              )}
              <span className="font-medium truncate max-w-[200px]">{v.label}</span>
              <StylePresetPill preset={preset} />
            </button>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => setDialog({ type: "create" })}
        >
          <Plus className="h-3 w-3 mr-1" />
          New version
        </Button>
      </div>

      {/* Active-version detail panel — actions live here so they're easy
       * to find. No more hover-only delete buttons. */}
      {activeVersion && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 mt-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="uppercase tracking-wider">Active version</span>
                <span className="text-foreground font-medium truncate">{activeVersion.label}</span>
                <StylePresetPill preset={getPresetById(activeVersion.preset)} />
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {(activeVersion.imageModel ?? "gemini") === "openai"
                    ? "GPT-Image-2"
                    : "Gemini"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {activeVersion.preset === "custom" && activeVersion.customEmphasis
                  ? activeVersion.customEmphasis
                  : getPresetById(activeVersion.preset).description}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onUpdateVersion && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDialog({ type: "edit", versionId: activeVersion.id })}
                  disabled={disabled}
                  title="Change this version's preset, label, or custom emphasis"
                >
                  <Settings2 className="h-3 w-3 mr-1" />
                  Edit settings
                </Button>
              )}
              {onDeleteVersion && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteVersion(activeVersion.id, activeVersion.label)}
                  disabled={disabled}
                  title="Discard this version"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {versions.length === 1 ? "Discard" : "Delete"}
                </Button>
              )}
            </div>
          </div>
          {versions.length > 1 && (
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              Click another version chip above to switch.
            </p>
          )}
        </div>
      )}

      {/* Create / edit dialog (single dialog, two modes) */}
      <Dialog open={dialog.type !== "closed"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {dialog.type === "edit" ? "Edit version" : "New prompt version"}
            </DialogTitle>
            <DialogDescription>
              {dialog.type === "edit"
                ? "Update this version's preset, label, or custom emphasis. Existing renders stay attached — only future generations use the updated emphasis."
                : "Pick a style emphasis. Each version stores its own set of renders so you can compare or hand multiple options to the client."}
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
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to auto-name from the preset and date.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Style preset</Label>
              <StylePresetSelector
                value={draftPreset}
                onChange={setDraftPreset}
                customEmphasis={draftCustomEmphasis}
                onCustomEmphasisChange={setDraftCustomEmphasis}
                compact
              />
            </div>

            {/* Image model selector — Gemini Nano (default, bundled) vs
              * OpenAI gpt-image-2 (better logo + organic structures, needs
              * OPENAI_API_KEY in Supabase secrets). Per-version so users
              * can A/B compare on the same project. */}
            <div className="space-y-2">
              <Label className="text-xs">Image model</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {IMAGE_MODEL_OPTIONS.map((opt) => {
                  const isActive = opt.id === draftImageModel;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDraftImageModel(opt.id)}
                      className={cn(
                        "rounded-lg border text-left transition-colors px-3 py-2.5",
                        isActive
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-card hover:border-primary/30",
                      )}
                    >
                      <div className="text-sm font-medium mb-0.5">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-snug">
                        {opt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
              {draftImageModel === "openai" && (
                <p className="text-[11px] text-amber-700 leading-snug">
                  Needs <code className="font-mono text-[10px] bg-amber-500/10 px-1 py-0.5 rounded">OPENAI_API_KEY</code>
                  {" "}in Supabase → Edge Function Secrets. If it's missing, the function will
                  fall back to Gemini automatically.
                </p>
              )}
            </div>

            {dialog.type === "create" && (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                <Badge variant="secondary" className="text-[10px] mr-2">Heads up</Badge>
                Each version stores its renders separately. Existing versions are not modified.
                You can switch between them at any time.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={dialog.type === "edit" ? handleSubmitEdit : handleSubmitCreate}
              disabled={
                draftPreset === "custom" && draftCustomEmphasis.trim().length === 0
              }
            >
              {dialog.type === "edit" ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Save changes
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create version
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
