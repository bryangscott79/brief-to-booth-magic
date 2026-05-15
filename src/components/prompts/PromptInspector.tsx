// PromptInspector — collapsible "exact prompt for this render" surface
// shown on the hero card and every view card.
//
// Users asked for two things, both bundled here:
//
//   1. Always be able to see the prompt that produced (or is about to
//      produce) an image. No more hidden composition; the surface is
//      one click away from every render.
//
//   2. Edit the prompt inline and re-render with the edits, OR copy
//      it to take to another model. The edit becomes a per-render
//      override so re-opening the card shows the same prompt that
//      generated the visible image.
//
// The component is intentionally dumb: it owns its open/edit state and
// emits callbacks for Save (commit edit + trigger re-render) and Reset
// (drop the override, fall back to the auto-composed prompt). The
// host wires the callbacks to renderStore.setGeneratedPrompts /
// setHeroPrompt + the existing regenerate handlers.
//
// Edit mode shows a textarea with the current prompt pre-filled, plus
// Save / Cancel / Reset. Read-only mode shows the prompt in a
// muted textarea with Copy and Edit buttons. The header always shows
// "Prompt" + a chip indicating whether the current prompt is the
// auto-composed default or a user override.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Pencil,
  RotateCcw,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PromptInspectorProps {
  /** Current prompt for the render (override if set, else auto-composed). */
  prompt: string;
  /**
   * Auto-composed prompt — what the system would produce given the
   * current brief / spatial / brand state. Compared against `prompt`
   * to decide whether to show the "Override" badge and enable Reset.
   * If omitted, edits don't distinguish override-vs-default.
   */
  defaultPrompt?: string;
  /**
   * Called when the user clicks "Save & re-render" with their edited
   * text. Host commits the new prompt to its state and kicks off the
   * appropriate render call. Required — without this the editor is
   * effectively view-only.
   */
  onSaveAndRerender: (editedPrompt: string) => void | Promise<void>;
  /**
   * Called when the user clicks "Reset to default". Host should clear
   * its override so the next read falls back to the auto-composed
   * prompt. Omitted = no reset affordance.
   */
  onReset?: () => void;
  /** Disables both buttons (e.g. while a render is in-flight). */
  disabled?: boolean;
  /** Label shown in the disclosure header. Default "Prompt". */
  label?: string;
  /** Start expanded? Default false. */
  defaultOpen?: boolean;
}

export function PromptInspector({
  prompt,
  defaultPrompt,
  onSaveAndRerender,
  onReset,
  disabled = false,
  label = "Prompt",
  defaultOpen = false,
}: PromptInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep the draft in sync when the underlying prompt changes from
  // outside (e.g. a fresh recompose). Don't stomp the user mid-edit.
  useEffect(() => {
    if (!editing) setDraft(prompt);
  }, [prompt, editing]);

  // Auto-focus when entering edit mode so the user can start typing
  // immediately. selectionStart=end keeps the cursor at the bottom of
  // the prompt rather than highlighting everything.
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }, [editing]);

  const isOverride =
    typeof defaultPrompt === "string" &&
    defaultPrompt.trim().length > 0 &&
    prompt.trim() !== defaultPrompt.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in unfocused tabs / strict permissions.
      // Silent — Copy is non-critical and the user can still highlight
      // the textarea text manually.
    }
  };

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await onSaveAndRerender(trimmed);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(prompt);
    setEditing(false);
  };

  const handleReset = () => {
    if (!onReset) return;
    onReset();
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      {/* Header — toggle + status chips */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <span className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium">{label}</span>
          {isOverride && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700"
            >
              <Pencil className="h-2.5 w-2.5" />
              Edited
            </Badge>
          )}
          {!isOverride && defaultPrompt && (
            <Badge
              variant="outline"
              className="text-[10px] gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Auto
            </Badge>
          )}
        </span>
        {open && !editing && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                handleCopy();
              }
            }}
            className="inline-flex h-6 items-center px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors gap-1 cursor-pointer"
            aria-label="Copy prompt"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </span>
        )}
      </button>

      {/* Body */}
      {open && (
        <div className="p-3 pt-0 space-y-2">
          <Textarea
            ref={textareaRef}
            value={editing ? draft : prompt}
            readOnly={!editing}
            onChange={(e) => setDraft(e.target.value)}
            className={cn(
              "min-h-[160px] max-h-[420px] text-xs font-mono",
              editing
                ? "bg-background border-primary/40 focus-visible:ring-primary/30"
                : "bg-muted/30",
            )}
            placeholder={editing ? "Edit the prompt that will be sent to the image model…" : ""}
          />

          {/* Actions row */}
          {editing ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={disabled || !draft.trim()}
              >
                <Sparkles className="h-3 w-3 mr-1.5" />
                Save & re-render
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={disabled}
              >
                <XIcon className="h-3 w-3 mr-1.5" />
                Cancel
              </Button>
              {onReset && isOverride && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  disabled={disabled}
                  className="ml-auto text-muted-foreground"
                  title="Discard your edits and restore the auto-composed prompt"
                >
                  <RotateCcw className="h-3 w-3 mr-1.5" />
                  Reset to default
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(prompt);
                  setEditing(true);
                }}
                disabled={disabled || !prompt}
              >
                <Pencil className="h-3 w-3 mr-1.5" />
                Edit & re-render
              </Button>
              {onReset && isOverride && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  disabled={disabled}
                  className="text-muted-foreground"
                  title="Discard your edits and restore the auto-composed prompt"
                >
                  <RotateCcw className="h-3 w-3 mr-1.5" />
                  Reset
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
