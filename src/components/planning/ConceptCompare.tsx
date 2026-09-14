// ConceptCompare — the side-by-side view for 2-4 selected concept cards.
//
// Pin-up mode: the images get the whole dialog at the largest size the
// count allows, with only the label, the rationale, and the user's notes
// underneath. No controls that could change a card — comparing is a
// reading act; decisions go back through the board.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Star } from "lucide-react";
import type { PlanningCard } from "@/lib/planningCanvas";
import { cn } from "@/lib/utils";

export interface ConceptCompareProps {
  cards: PlanningCard[];
  open: boolean;
  onClose: () => void;
}

export function ConceptCompare({ cards, open, onClose }: ConceptCompareProps) {
  // 2 cards → side by side. 3-4 → a 2-up grid so each image stays large.
  const columns = cards.length <= 2 ? cards.length : 2;

  return (
    <Dialog open={open && cards.length >= 2} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[min(1400px,95vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-navy">Compare concepts</DialogTitle>
          <DialogDescription>
            {cards.length} directions side by side. Close to keep working on the board.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid gap-5",
            columns === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
          )}
        >
          {cards.map((card) => (
            <figure key={card.id} className="min-w-0">
              <div className="overflow-hidden rounded-media border border-cloud-line bg-cloud">
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt={card.label} className="w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-[12px] text-slate">
                    No image yet
                  </div>
                )}
              </div>
              <figcaption className="mt-2.5">
                <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-navy">
                  {card.favorite && (
                    <Star className="h-3.5 w-3.5 shrink-0 text-pink-deep" fill="currentColor" strokeWidth={1.5} />
                  )}
                  {card.label}
                </h3>
                {card.rationale && (
                  <p className="mt-1 text-[12px] leading-[17px] text-slate">{card.rationale}</p>
                )}
                {card.notes.trim().length > 0 && (
                  <p className="mt-2 rounded-square bg-cloud px-2.5 py-1.5 text-[12px] leading-[17px] text-charcoal">
                    {card.notes}
                  </p>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
