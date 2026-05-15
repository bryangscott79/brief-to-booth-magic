// src/components/prompts/BriefClarification.tsx
//
// Shared gap-question UI. Mounted at the Brief Review step (primary)
// and the Prompts step (safety net). Renders one card per gap; on
// answer, calls onAnswer(field, value); on skip, calls onSkip(field).
// The host component handles writing the answer back to parsedBrief
// and re-running validateBrief.

import { useEffect, useState } from "react";
import type { Gap } from "@/lib/normalizedBrief";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Pencil } from "lucide-react";

export interface BriefClarificationProps {
  gaps: Gap[];
  onAnswer: (field: string, value: unknown) => void;
  onSkip: (field: string) => void;
  /** Max visible gaps before collapsing remaining behind a "show all" toggle. Default 5. */
  visibleCap?: number;
}

export function BriefClarification({
  gaps,
  onAnswer,
  onSkip,
  visibleCap = 5,
}: BriefClarificationProps) {
  const [showAll, setShowAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Per-field "just saved" state. Tracks the value the user committed
  // so the card can show a read-only "Saved ✓ — [value]" state with
  // an Edit button instead of staying in an editable input that gives
  // no feedback. The previous behavior let the user keep clicking
  // Save forever with no visible confirmation.
  //
  // If the underlying gap actually resolves on the next validation
  // pass, the parent re-renders without this gap in `gaps` and the
  // card unmounts before the user notices the saved state — also
  // fine. The saved state is the safety net for cases where the gap
  // takes a moment to clear (async DB writes, debounced re-validation)
  // or genuinely doesn't fully clear (e.g. when only the primary
  // brand color got a hex; the secondary still has none but the gap
  // moves on).
  const [submitted, setSubmitted] = useState<Record<string, string>>({});

  // Drop submitted-state entries whose gap is no longer present, so
  // memory stays tidy and the saved state correctly tracks only
  // currently-visible cards.
  useEffect(() => {
    setSubmitted((prev) => {
      const fields = new Set(gaps.map((g) => g.field));
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (fields.has(k)) next[k] = v;
      }
      return next;
    });
  }, [gaps]);

  // Blocking first, then helpful.
  const sorted = [...gaps].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1,
  );
  const visible = showAll ? sorted : sorted.slice(0, visibleCap);
  const hiddenCount = sorted.length - visible.length;

  if (gaps.length === 0) return null;

  const commit = (gap: Gap, value: string) => {
    if (!value.trim()) return;
    setSubmitted((s) => ({ ...s, [gap.field]: value }));
    onAnswer(gap.field, value);
  };

  const reopen = (gap: Gap) => {
    // Restore the previously-submitted value into the draft so the
    // user can edit it instead of retyping from scratch.
    setDrafts((d) => ({ ...d, [gap.field]: submitted[gap.field] ?? d[gap.field] ?? "" }));
    setSubmitted((s) => {
      const next = { ...s };
      delete next[gap.field];
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">A few clarifications to sharpen the brief</h3>
        <Badge variant="outline">{gaps.length}</Badge>
      </div>
      {visible.map((gap) => {
        const savedValue = submitted[gap.field];
        const isSaved = typeof savedValue === "string" && savedValue.trim().length > 0;
        return (
          <Card key={gap.field} role="group">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm">{gap.question}</p>
                {isSaved ? (
                  <Badge className="text-xs gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">
                    <Check className="h-3 w-3" />
                    Saved
                  </Badge>
                ) : (
                  <Badge
                    variant={gap.severity === "blocking" ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {gap.severity}
                  </Badge>
                )}
              </div>
              {isSaved ? (
                // ── Saved state: read-only display of the committed
                //    value + Edit button to re-open. The card no
                //    longer looks editable, matching the user's
                //    expectation of clear confirmation.
                <div className="flex items-start gap-2">
                  <div className="flex-1 px-3 py-2 rounded-md bg-muted/40 text-sm text-foreground/90 break-words">
                    {savedValue}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => reopen(gap)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
              ) : gap.options && gap.options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {gap.options.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => commit(gap, opt)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type your answer…"
                    value={drafts[gap.field] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [gap.field]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (drafts[gap.field] ?? "").trim().length > 0) {
                        commit(gap, drafts[gap.field] ?? "");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!(drafts[gap.field] ?? "").trim()}
                    onClick={() => commit(gap, drafts[gap.field] ?? "")}
                  >
                    Save
                  </Button>
                </div>
              )}
              {!isSaved && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onSkip(gap.field)}
                >
                  Skip with default
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show {hiddenCount} more
        </Button>
      )}
    </div>
  );
}
