// RoundHistory — previous feedback rounds as open list rows (Flow C):
// label, date, how many revisions it carried, and where it got to.
// Selecting a row loads that round back into the review sheet.

import { formatDistanceToNow } from "date-fns";
import { SpecMono, StatusChip } from "@/components/shell";
import type { StatusChipVariant } from "@/components/shell";
import { cn } from "@/lib/utils";
import type { ClientFeedbackRound } from "@/hooks/useClientFeedback";
import type { FeedbackRoundStatus } from "@/lib/feedbackRevision";

const STATUS_META: Record<FeedbackRoundStatus, { label: string; variant: StatusChipVariant }> = {
  new: { label: "Not read", variant: "neutral" },
  parsed: { label: "Ready to apply", variant: "attention" },
  applying: { label: "Applying", variant: "generating" },
  applied: { label: "Applied", variant: "pass" },
};

function when(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

interface RoundHistoryProps {
  rounds: ClientFeedbackRound[];
  activeRoundId: string | null;
  onSelect: (round: ClientFeedbackRound) => void;
}

export function RoundHistory({ rounds, activeRoundId, onSelect }: RoundHistoryProps) {
  if (rounds.length === 0) {
    return (
      <p className="text-[13px] leading-[19px] text-slate">
        No rounds yet. The first batch of client notes you read will land here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-cloud-line border-y border-cloud-line">
      {rounds.map((round) => {
        const meta = STATUS_META[round.status] ?? STATUS_META.new;
        const included = round.items.filter((i) => i.include).length;
        const isActive = round.id === activeRoundId;
        return (
          <li key={round.id}>
            <button
              type="button"
              onClick={() => onSelect(round)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-cloud",
                isActive && "bg-cloud",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-8 w-0.5 shrink-0 rounded-tag",
                  isActive ? "bg-navy" : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-navy">
                  {round.label || "Client feedback"}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-[17px] text-slate">
                  {round.raw_feedback?.trim().slice(0, 110) || "No notes recorded"}
                </span>
              </span>
              <SpecMono className="shrink-0 text-slate-faint">
                {included} {included === 1 ? "revision" : "revisions"}
              </SpecMono>
              <SpecMono className="hidden shrink-0 text-slate-faint sm:inline">
                {when(round.created_at)}
              </SpecMono>
              <StatusChip variant={meta.variant}>{meta.label}</StatusChip>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
