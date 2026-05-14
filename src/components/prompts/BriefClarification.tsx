// src/components/prompts/BriefClarification.tsx
//
// Shared gap-question UI. Mounted at the Brief Review step (primary)
// and the Prompts step (safety net). Renders one card per gap; on
// answer, calls onAnswer(field, value); on skip, calls onSkip(field).
// The host component handles writing the answer back to parsedBrief
// and re-running validateBrief.

import { useState } from "react";
import type { Gap } from "@/lib/normalizedBrief";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  // Blocking first, then helpful.
  const sorted = [...gaps].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1,
  );
  const visible = showAll ? sorted : sorted.slice(0, visibleCap);
  const hiddenCount = sorted.length - visible.length;

  if (gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">A few clarifications to sharpen the brief</h3>
        <Badge variant="outline">{gaps.length}</Badge>
      </div>
      {visible.map((gap) => (
        <Card key={gap.field} role="group">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{gap.question}</p>
              <Badge
                variant={gap.severity === "blocking" ? "destructive" : "secondary"}
                className="text-xs"
              >
                {gap.severity}
              </Badge>
            </div>
            {gap.options && gap.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {gap.options.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onAnswer(gap.field, opt)}
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
                      onAnswer(gap.field, drafts[gap.field]);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!(drafts[gap.field] ?? "").trim()}
                  onClick={() => onAnswer(gap.field, drafts[gap.field])}
                >
                  Save
                </Button>
              </div>
            )}
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSkip(gap.field)}
            >
              Skip with default
            </button>
          </CardContent>
        </Card>
      ))}
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show {hiddenCount} more
        </Button>
      )}
    </div>
  );
}
