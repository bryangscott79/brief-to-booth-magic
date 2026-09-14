// ConceptBoard — the Planning step's main surface: every visual the
// conversation has produced, as cards in a responsive grid.
//
// Pinned cards float to the front. Selecting 2+ cards arms the COMPARE
// bar. The empty state explains the flow rather than showing a bare grid —
// the whole point of this step is that the user talks first.

import { Flag, Images, LayoutGrid, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionLabel } from "@/components/shell";
import { ConceptCard } from "@/components/planning/ConceptCard";
import { MAX_COMPARE, sortedCards, type PlanningCard } from "@/lib/planningCanvas";

export interface ConceptBoardProps {
  cards: PlanningCard[];
  targetCardId: string | null;
  compareIds: string[];
  /** The one direction the project is building on, if any. */
  carriedDirectionId: string | null;
  savingCardId: string | null;
  onTarget: (cardId: string) => void;
  /** Carry a direction forward — or clear it by carrying it again. */
  onCarryForward: (cardId: string) => void;
  /** Clicking a card's image opens the full-screen concept focus view. */
  onOpenFocus: (cardId: string) => void;
  onToggleCompare: (cardId: string) => void;
  onClearCompare: () => void;
  onOpenCompare: () => void;
  onToggleFlag: (cardId: string, flag: "pinned" | "favorite") => void;
  onNotesChange: (cardId: string, notes: string) => void;
  onViewPrompt: (cardId: string) => void;
  onAddToRenders: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  /** Starter asks drawn from the brief, shown in the empty state. */
  starters: string[];
  onStarter: (text: string) => void;
  /** Chat is busy — starter buttons go inert. */
  busy: boolean;
}

export function ConceptBoard({
  cards,
  targetCardId,
  compareIds,
  carriedDirectionId,
  savingCardId,
  onTarget,
  onCarryForward,
  onOpenFocus,
  onToggleCompare,
  onClearCompare,
  onOpenCompare,
  onToggleFlag,
  onNotesChange,
  onViewPrompt,
  onAddToRenders,
  onRemove,
  starters,
  onStarter,
  busy,
}: ConceptBoardProps) {
  if (cards.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Images}
          title="Plan the visuals before you build the deck"
          body="Talk to Canopy on the right like you would a creative director. Each turn can put one concept — or a few directions to compare — on this board. Star what works, note what doesn't, and push the keepers into the project's renders."
        />
        {starters.length > 0 && (
          <div className="mx-auto max-w-2xl space-y-2.5">
            <SectionLabel accent="violet">Start from the brief</SectionLabel>
            <div className="flex flex-col gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => onStarter(s)}
                  className="rounded-square border border-cloud-line bg-white px-3.5 py-2.5 text-left text-[13px] leading-[18px] text-charcoal transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const ordered = sortedCards(cards);
  const carried = carriedDirectionId
    ? cards.find((c) => c.id === carriedDirectionId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {carried && (
        <div className="flex flex-wrap items-center gap-2 rounded-square border border-navy/20 bg-navy/[0.04] px-3 py-2">
          <span className="flex items-center gap-1 rounded-tag bg-navy px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
            <Flag className="h-2.5 w-2.5" strokeWidth={2} />
            Carried forward
          </span>
          <p className="min-w-0 flex-1 truncate text-[12px] leading-[17px] text-charcoal">
            Generate will build on <span className="font-semibold text-navy">{carried.label}</span>.
          </p>
          <button
            type="button"
            onClick={() => onCarryForward(carried.id)}
            className="rounded-btn px-1.5 py-0.5 text-[11px] text-slate transition-colors hover:text-navy"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel accent="violet">
          Concept board · <span className="font-mono">{cards.length}</span>
        </SectionLabel>
        {compareIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate">
              {compareIds.length} selected
              {compareIds.length >= MAX_COMPARE ? ` (max ${MAX_COMPARE})` : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={compareIds.length < 2}
              onClick={onOpenCompare}
              className="h-7 gap-1.5 px-2.5 text-[11px]"
            >
              <LayoutGrid className="h-3 w-3" strokeWidth={1.5} />
              Compare
            </Button>
            <button
              type="button"
              onClick={onClearCompare}
              aria-label="Clear compare selection"
              className="rounded-btn p-1 text-slate-faint transition-colors hover:text-navy"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((card) => (
          <ConceptCard
            key={card.id}
            card={card}
            targeted={targetCardId === card.id}
            compared={compareIds.includes(card.id)}
            carried={carriedDirectionId === card.id}
            saving={savingCardId === card.id}
            onTarget={() => onTarget(card.id)}
            onCarryForward={() => onCarryForward(card.id)}
            onOpenFocus={() => onOpenFocus(card.id)}
            onToggleCompare={() => onToggleCompare(card.id)}
            onToggleFlag={(flag) => onToggleFlag(card.id, flag)}
            onNotesChange={(notes) => onNotesChange(card.id, notes)}
            onViewPrompt={() => onViewPrompt(card.id)}
            onAddToRenders={() => onAddToRenders(card.id)}
            onRemove={() => onRemove(card.id)}
          />
        ))}
      </div>
    </div>
  );
}
