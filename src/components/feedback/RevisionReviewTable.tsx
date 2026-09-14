// RevisionReviewTable — the review step between "read the feedback" and
// "apply to renders". One open row per parsed item (Flow C: hairline
// dividers, no nested cards): what it targets, the instruction (editable
// in place before anything renders), how confident the read was, and an
// include/exclude toggle.
//
// Nothing here calls the model — the page owns the batch. This component
// is a controlled editor over FeedbackRevisionItem[].

import { AlertTriangle, Check, Layers, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SpecMono, StatusChip } from "@/components/shell";
import type { StatusChipVariant } from "@/components/shell";
import { cn } from "@/lib/utils";
import {
  ALL_RENDERS,
  resolveItemTargets,
  type CurrentRender,
  type FeedbackRevisionItem,
} from "@/lib/feedbackRevision";

/** Confidence bands — the chip is advisory, never a gate. */
function confidenceMeta(confidence: number): { label: string; variant: StatusChipVariant } {
  if (confidence >= 0.75) return { label: "High", variant: "pass" };
  if (confidence >= 0.45) return { label: "Medium", variant: "warning" };
  return { label: "Low", variant: "attention" };
}

function ItemStatusChip({ item }: { item: FeedbackRevisionItem }) {
  const done = (item.targets ?? []).filter((t) => t.status === "done").length;
  const total = (item.targets ?? []).length;

  switch (item.status) {
    case "applying":
      return (
        <StatusChip variant="generating">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
          {total > 0 ? `${done}/${total}` : "Working"}
        </StatusChip>
      );
    case "applied":
      return (
        <StatusChip variant={item.error ? "warning" : "pass"}>
          <Check className="h-3 w-3" strokeWidth={2} />
          {item.error ? "Partial" : "Applied"}
        </StatusChip>
      );
    case "error":
      return (
        <StatusChip variant="blocking">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
          Failed
        </StatusChip>
      );
    case "skipped":
      return <StatusChip variant="neutral">No target</StatusChip>;
    default:
      return null;
  }
}

interface RevisionReviewTableProps {
  items: FeedbackRevisionItem[];
  renders: CurrentRender[];
  onChangeItem: (id: string, patch: Partial<FeedbackRevisionItem>) => void;
  /** True while the batch runs — edits and toggles lock. */
  locked?: boolean;
}

export function RevisionReviewTable({
  items,
  renders,
  onChangeItem,
  locked,
}: RevisionReviewTableProps) {
  return (
    <div className="divide-y divide-cloud-line border-y border-cloud-line">
      <div className="grid grid-cols-[150px_1fr_150px] gap-4 bg-cloud px-3 py-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
          Target
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
          Revision instruction
        </span>
        <span className="text-right font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">
          Confidence · Include
        </span>
      </div>

      {items.map((item) => {
        const targets = item.targets ?? resolveItemTargets(item, renders);
        const isGlobal = item.scope === "global" || item.angleId === ALL_RENDERS;
        const thumb = targets[0];
        const meta = confidenceMeta(item.confidence);

        return (
          <div
            key={item.id}
            className={cn(
              "grid grid-cols-[150px_1fr_150px] items-start gap-4 px-3 py-4 transition-opacity",
              !item.include && "opacity-45",
            )}
          >
            {/* Target */}
            <div className="min-w-0 space-y-1.5">
              {isGlobal ? (
                <>
                  <span className="flex h-14 w-[120px] items-center justify-center gap-1.5 rounded-media bg-cloud text-navy">
                    <Layers className="h-4 w-4" strokeWidth={1.3} />
                  </span>
                  <p className="truncate text-[13px] font-semibold text-navy">All renders</p>
                </>
              ) : (
                <>
                  {thumb?.beforeUrl ? (
                    <img
                      src={thumb.beforeUrl}
                      alt={thumb.angleName}
                      className="h-14 w-[120px] rounded-media border border-cloud-line object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-14 w-[120px] items-center justify-center rounded-media bg-cloud">
                      <AlertTriangle className="h-4 w-4 text-slate-faint" strokeWidth={1.3} />
                    </span>
                  )}
                  <p className="truncate text-[13px] font-semibold text-navy">
                    {thumb?.angleName ?? item.angleId}
                  </p>
                </>
              )}
              <SpecMono className="block text-slate-faint">
                {targets.length} {targets.length === 1 ? "image" : "images"}
              </SpecMono>
            </div>

            {/* Instruction (editable before applying) */}
            <div className="min-w-0 space-y-2">
              <Textarea
                value={item.instruction}
                onChange={(e) => onChangeItem(item.id, { instruction: e.target.value })}
                disabled={locked || !item.include}
                rows={3}
                className="min-h-[64px] resize-y rounded-square border-cloud-line bg-white text-[13px] leading-[19px] text-charcoal"
              />
              {item.error && (
                <p className="text-[12px] leading-[17px] text-blocking">{item.error}</p>
              )}
              {(item.targets ?? []).some((t) => t.status === "error") && (
                <p className="text-[12px] leading-[17px] text-warn">
                  {(item.targets ?? [])
                    .filter((t) => t.status === "error")
                    .map((t) => `${t.angleName}: ${t.error ?? "failed"}`)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Confidence + include */}
            <div className="flex flex-col items-end gap-2">
              <StatusChip variant={meta.variant}>{meta.label}</StatusChip>
              <SpecMono className="text-slate-faint">{item.confidence.toFixed(2)}</SpecMono>
              <Switch
                checked={item.include}
                onCheckedChange={(checked) => onChangeItem(item.id, { include: checked })}
                disabled={locked}
                aria-label={item.include ? "Exclude this revision" : "Include this revision"}
              />
              <ItemStatusChip item={item} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
