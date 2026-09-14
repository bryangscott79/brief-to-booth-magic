// CarriedDirectionBanner — the Generate step's proof that Planning wasn't
// a dead end.
//
// When a concept card has been carried forward on the Planning board, this
// sits above the eight elements and says, plainly, what the generation is
// building on: the approved thumbnail, its label, one line of rationale, a
// way back to the board, and a way out ("Don't use this").
//
// Renders nothing when no direction is carried — the Generate step then
// behaves exactly as it did before this existed.
//
// Flow C: white sheet, hairline, navy ink, mono for the badge.

import { Link } from "react-router-dom";
import { ArrowUpRight, Flag, X } from "lucide-react";
import type { PlanningCard } from "@/lib/planningCanvas";

export interface CarriedDirectionBannerProps {
  card: PlanningCard;
  projectId: string | null;
  /** Clear the selection — generation goes back to brief-only. */
  onClear: () => void;
}

export function CarriedDirectionBanner({
  card,
  projectId,
  onClear,
}: CarriedDirectionBannerProps) {
  return (
    <section
      aria-label="Carried creative direction"
      className="flex items-start gap-3 rounded-media border border-navy/20 bg-navy/[0.04] p-3"
    >
      <div className="h-[54px] w-[86px] shrink-0 overflow-hidden rounded-square bg-cloud">
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt={card.label}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-tag bg-navy px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
            <Flag className="h-2.5 w-2.5" strokeWidth={2} />
            Carried forward
          </span>
          <h3 className="truncate text-[13px] font-semibold leading-[18px] text-navy">
            Building on: {card.label}
          </h3>
        </div>
        {card.rationale && (
          <p className="mt-1 line-clamp-1 text-[12px] leading-[17px] text-slate">
            {card.rationale}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <Link
            to={projectId ? `/planning?project=${projectId}` : "/planning"}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-navy underline-offset-2 hover:underline"
          >
            Back to the concept board
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
          </Link>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-[11px] text-slate transition-colors hover:text-pink-deep"
          >
            <X className="h-3 w-3" strokeWidth={2} />
            Don't use this
          </button>
        </div>
      </div>
    </section>
  );
}
