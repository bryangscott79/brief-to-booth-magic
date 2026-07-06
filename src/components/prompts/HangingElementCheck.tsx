// HangingElementCheck — hero-first review gate for hanging elements.
//
// Shown on the hero-review step when the brief carries hanging elements.
// The owner-described flow: the hero render is where the hanging element
// gets judged. The panel puts the canonical spec next to the render with
// two actions:
//
//   [Looks right — approve]   → marks this config+hero combination
//                                approved (store + persisted into the
//                                hero image's prompt_artifacts)
//   [Refine hanging element]  → free-text feedback + quick chips; submit
//                                runs an edit-style generation that keeps
//                                booth/environment/camera locked and
//                                changes ONLY the suspended element. The
//                                result is a NEW hero version in the same
//                                config stack.
//
// The panel also hosts the per-element "creative direction" editor —
// the same field authored on the Review step's hanging card — so the
// user can lock exact language without leaving the render flow.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Wind,
  X,
} from "lucide-react";
import type { NormalizedHangingElement } from "@/lib/normalizedBrief";
import { formatHangingSpecLines } from "@/lib/hangingRefinement";

/** Quick-chips for common hanging adjustments — appended to the feedback box. */
const QUICK_CHIPS: Array<{ label: string; text: string }> = [
  { label: "Smaller", text: "Make it noticeably smaller." },
  { label: "Larger", text: "Make it noticeably larger." },
  { label: "Hang higher", text: "Raise it higher toward the ceiling." },
  { label: "Hang lower", text: "Lower it closer to the booth." },
  { label: "Material", text: "Change the material to " },
  { label: "Lighting", text: "Adjust the lighting: " },
  { label: "Remove printing", text: "Remove all printed graphics from it." },
];

export interface HangingElementCheckProps {
  elements: NormalizedHangingElement[];
  units: "imperial" | "metric";
  /** Approval state for the CURRENT config + hero version. */
  approved: boolean;
  /** Disable all actions (render in flight). */
  disabled?: boolean;
  /** True while a hanging refinement render is running. */
  refining?: boolean;
  onApprove: () => void;
  /** Submit refine feedback — kicks off the edit-style hero generation. */
  onRefine: (feedback: string) => void | Promise<void>;
  /**
   * Persist a creative-direction edit for elements[index] back into
   * parsed_brief.hangingElements[index]. Committed on blur.
   */
  onCreativeDirectionChange: (index: number, text: string) => void;
}

export function HangingElementCheck({
  elements,
  units,
  approved,
  disabled = false,
  refining = false,
  onApprove,
  onRefine,
  onCreativeDirectionChange,
}: HangingElementCheckProps) {
  const [refineOpen, setRefineOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  // Local drafts so typing doesn't write to parsed_brief per keystroke;
  // committed on blur via onCreativeDirectionChange.
  const [directionDrafts, setDirectionDrafts] = useState<Record<number, string>>({});

  if (elements.length === 0) return null;

  const appendChip = (text: string) => {
    setFeedback((prev) => {
      const sep = prev.trim().length > 0 && !prev.endsWith(" ") ? " " : "";
      return `${prev}${sep}${text}`;
    });
  };

  const handleSubmitRefine = async () => {
    const trimmed = feedback.trim();
    if (!trimmed) return;
    await onRefine(trimmed);
    setFeedback("");
    setRefineOpen(false);
  };

  return (
    <Card className="element-card border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wind className="h-4 w-4 text-primary" />
            Hanging element check
          </CardTitle>
          {approved ? (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border border-emerald-500/40 hover:bg-emerald-500/15">
              <CheckCircle2 className="h-3 w-3" />
              Approved for this hero
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" />
              Not approved
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Check the suspended element in the hero render against its spec below.
          Approve it before generating the other views — they inherit this hero.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Canonical spec per element */}
        <div className="space-y-3">
          {elements.map((el, idx) => (
            <div
              key={el.id || idx}
              className="rounded-md border border-border bg-muted/20 p-3 space-y-2"
            >
              <div className="text-sm font-medium">{el.name}</div>
              <ul className="space-y-0.5">
                {formatHangingSpecLines(el, units).map((line, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
              <div className="space-y-1 pt-1">
                <Label className="text-[11px] text-muted-foreground">
                  Creative direction (treated as EXACT instructions, not inspiration)
                </Label>
                <Textarea
                  value={directionDrafts[idx] ?? el.creativeDirection ?? ""}
                  onChange={(e) =>
                    setDirectionDrafts((prev) => ({ ...prev, [idx]: e.target.value }))
                  }
                  onBlur={() => {
                    const draft = directionDrafts[idx];
                    if (draft !== undefined && draft !== (el.creativeDirection ?? "")) {
                      onCreativeDirectionChange(idx, draft);
                    }
                  }}
                  placeholder='e.g. "Thin brushed-aluminum ring, logo on outer face only, no printing on the underside."'
                  className="min-h-[52px] text-xs"
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>

        {!approved && (
          <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
            Hanging element not approved — views generated now will inherit it
            from this hero.
          </p>
        )}

        {/* Actions */}
        {!refineOpen ? (
          <div className="flex gap-2 flex-wrap">
            {!approved && (
              <Button size="sm" onClick={onApprove} disabled={disabled}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Looks right — approve
              </Button>
            )}
            <Button
              size="sm"
              variant={approved ? "outline" : "secondary"}
              onClick={() => setRefineOpen(true)}
              disabled={disabled}
            >
              <Wind className="h-3.5 w-3.5 mr-1.5" />
              Refine hanging element
            </Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                What should change about the hanging element?
              </Label>
              <button
                type="button"
                onClick={() => setRefineOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close refine panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => appendChip(chip.text)}
                  disabled={disabled}
                  className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder='e.g. "make the ring thinner, brushed aluminum, logo on outer face only"'
              className="min-h-[70px] text-sm"
              disabled={disabled}
            />
            <p className="text-[11px] text-muted-foreground">
              The booth, environment, lighting, and camera stay locked — only the
              suspended element changes. The result saves as a new hero version;
              you can flip back anytime.
            </p>
            <Button
              size="sm"
              onClick={handleSubmitRefine}
              disabled={disabled || !feedback.trim()}
            >
              {refining ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Refining hanging element…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Refine on this hero
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
