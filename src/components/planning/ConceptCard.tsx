// ConceptCard — one visual on the Planning step's concept board.
//
// A card is a sketch, not a project render: it holds the image, the
// director's label + rationale, the exact prompt that made it, and the
// user's own marks (star, pin, notes). "Add to project renders" is the one
// action that promotes it into project_images via the normal
// save-render-image path.
//
// Clicking the IMAGE opens the concept focus view (mark it up, edit the
// prompt, walk its versions). "Ask about this" TARGETS the card for
// follow-up feedback ("make this one warmer") — that reply comes back as a
// NEW card, never a replacement.
//
// Flow C: white card r14, hairlines, navy ink, mono for anything measured,
// pink-deep for the selected/targeted state.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/shell";
import { cardVersions, type PlanningCard } from "@/lib/planningCanvas";
import { cn } from "@/lib/utils";

export interface ConceptCardProps {
  card: PlanningCard;
  /** This card is the target of the next chat turn. */
  targeted: boolean;
  /** This card is in the compare selection. */
  compared: boolean;
  onTarget: () => void;
  /** Open the full-screen concept focus view on this card. */
  onOpenFocus: () => void;
  onToggleCompare: () => void;
  onToggleFlag: (flag: "pinned" | "favorite") => void;
  onNotesChange: (notes: string) => void;
  onViewPrompt: () => void;
  onAddToRenders: () => void;
  onRemove: () => void;
  /** A save-render-image call is in flight for this card. */
  saving?: boolean;
}

export function ConceptCard({
  card,
  targeted,
  compared,
  onTarget,
  onOpenFocus,
  onToggleCompare,
  onToggleFlag,
  onNotesChange,
  onViewPrompt,
  onAddToRenders,
  onRemove,
  saving = false,
}: ConceptCardProps) {
  // Notes are typed locally and committed on blur — persisting per
  // keystroke would upsert the whole canvas row on every character.
  const [notes, setNotes] = useState(card.notes);
  useEffect(() => setNotes(card.notes), [card.notes]);

  const added = Boolean(card.angleId);
  const ready = card.status === "complete" && Boolean(card.imageUrl);
  const versionCount = cardVersions(card).length;

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-media border bg-white transition-colors",
        targeted ? "border-pink-deep" : "border-cloud-line hover:border-navy/30",
      )}
    >
      {/* ── Image ───────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={ready ? onOpenFocus : onTarget}
        aria-label={
          ready
            ? `Open ${card.label} full screen to mark it up`
            : `Target follow-up feedback at ${card.label}`
        }
        className="relative block aspect-video w-full overflow-hidden bg-cloud"
      >
        {card.status === "generating" && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Rendering</span>
          </span>
        )}
        {card.status === "error" && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <AlertTriangle className="h-5 w-5 text-blocking" strokeWidth={1.5} />
            <span className="text-[11px] leading-[15px] text-blocking">
              {card.error ?? "Render failed"}
            </span>
          </span>
        )}
        {card.status === "complete" && card.imageUrl && (
          <img
            src={card.imageUrl}
            alt={card.label}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}

        {/* Compare checkbox — stops the click from re-targeting the card. */}
        <span
          role="checkbox"
          aria-checked={compared}
          tabIndex={0}
          aria-label={`Compare ${card.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleCompare();
            }
          }}
          className={cn(
            "absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-tag border transition-colors",
            compared
              ? "border-navy bg-navy text-white"
              : "border-cloud-line bg-white/90 text-transparent hover:border-navy",
          )}
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>

        <span className="absolute right-2 top-2 flex items-center gap-1">
          {versionCount > 1 && (
            <span className="flex items-center gap-1 rounded-tag bg-navy px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              <Layers className="h-2.5 w-2.5" strokeWidth={2} />
              {versionCount}
            </span>
          )}
          {targeted && (
            <span className="rounded-tag bg-pink-deep px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              Targeted
            </span>
          )}
        </span>
      </button>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-semibold leading-[18px] text-navy">
              {card.label}
            </h3>
            {card.rationale && (
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-[16px] text-slate">
                {card.rationale}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconToggle
              active={card.favorite}
              label={card.favorite ? "Unstar concept" : "Star concept"}
              onClick={() => onToggleFlag("favorite")}
              activeClassName="text-pink-deep"
            >
              <Star className="h-3.5 w-3.5" strokeWidth={1.5} fill={card.favorite ? "currentColor" : "none"} />
            </IconToggle>
            <IconToggle
              active={card.pinned}
              label={card.pinned ? "Unpin concept" : "Pin concept to the front"}
              onClick={() => onToggleFlag("pinned")}
              activeClassName="text-navy"
            >
              <Pin className="h-3.5 w-3.5" strokeWidth={1.5} fill={card.pinned ? "currentColor" : "none"} />
            </IconToggle>
          </div>
        </div>

        {(card.parentId || added) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {card.parentId && <StatusChip variant="neutral">Variant</StatusChip>}
            {added && <StatusChip variant="pass">In project renders</StatusChip>}
          </div>
        )}

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== card.notes) onNotesChange(notes);
          }}
          rows={2}
          placeholder="Notes for the team…"
          aria-label={`Notes on ${card.label}`}
          className="min-h-[44px] resize-none bg-white text-[12px] leading-[17px]"
        />

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTarget}
            aria-pressed={targeted}
            className={cn(
              "h-7 gap-1 px-2 text-[11px]",
              targeted && "border-pink-deep text-pink-deep",
            )}
          >
            <MessageSquare className="h-3 w-3" strokeWidth={1.5} />
            {targeted ? "Targeted" : "Ask about this"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onViewPrompt}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <FileText className="h-3 w-3" strokeWidth={1.5} />
            View prompt
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onAddToRenders}
            disabled={card.status !== "complete" || saving || added}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" strokeWidth={2} />
            )}
            {added ? "Added" : "Add to project renders"}
          </Button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${card.label} from the board`}
            className="ml-auto rounded-btn p-1 text-slate-faint transition-colors hover:text-blocking"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </article>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  activeClassName,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  activeClassName: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded-btn p-1 transition-colors",
        active ? activeClassName : "text-slate-faint hover:text-navy",
      )}
    >
      {children}
    </button>
  );
}
