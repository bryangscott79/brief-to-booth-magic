// PlanningChat — the conversation column on the Planning step.
//
// Presentational, same idiom as DeckChat on the Export step: the thread
// (user bubbles right on navy, the director's replies left on cloud), a
// target chip naming the card the next turn is aimed at, a
// "generating N visuals…" progress row while images render, and the
// composer (⌘/Ctrl+Enter sends).
//
// Planning.tsx owns everything real: it calls plan-concepts, fans the
// returned concepts out to generate-hero, and persists the canvas.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { KnowledgeUsedBadge } from "@/components/knowledge/KnowledgeUsedBadge";
import { Loader2, SendHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/shell";
import type { PlanningMessage } from "@/lib/planningCanvas";
import { cn } from "@/lib/utils";

const isSendKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  e.key === "Enter" && (e.metaKey || e.ctrlKey);

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function Bubble({ message, cardLabel }: { message: PlanningMessage; cardLabel?: string }) {
  const mine = message.role === "user";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-square px-3 py-2 text-[13px] leading-[19px]",
          mine
            ? "bg-navy text-white"
            : message.error
              ? "bg-red-soft text-blocking"
              : "bg-cloud text-charcoal",
        )}
      >
        {mine && cardLabel && (
          <span className="mb-1 inline-block max-w-full truncate rounded-tag bg-white/15 px-1.5 font-mono text-[10px] font-semibold tracking-tight text-white">
            {cardLabel}
          </span>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {!mine && (message.cardIds?.length ?? 0) > 0 && (
            <span className="mt-1.5 inline-flex items-center rounded-tag bg-violet-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-[#7C3AED]">
              {message.cardIds!.length} concept{message.cardIds!.length === 1 ? "" : "s"} on the board
            </span>
          )}
          {/* Names the agency's own documents that shaped this turn. Renders
              nothing when retrieval contributed nothing — an empty knowledge
              base must not look like a working one. */}
          {!mine && <KnowledgeUsedBadge knowledge={message.knowledge} />}
        </div>
      </div>
      <span className="mt-0.5 font-mono text-[10px] text-slate-faint">{timeOf(message.createdAt)}</span>
    </div>
  );
}

export interface PlanningChatProps {
  messages: PlanningMessage[];
  /** Card the next turn is aimed at. */
  targetCardId: string | null;
  targetCardLabel: string | null;
  onClearTarget: () => void;
  onSend: (message: string) => void | Promise<void>;
  /** The director is thinking (no images yet). */
  planning: boolean;
  /** Images currently rendering — drives "generating N visuals…". */
  generatingCount: number;
  disabled?: boolean;
  disabledReason?: string;
  /** Externally injected draft (a starter prompt clicked on the board). */
  draftSeed?: string | null;
  onDraftSeedConsumed?: () => void;
  className?: string;
}

export function PlanningChat({
  messages,
  targetCardId,
  targetCardLabel,
  onClearTarget,
  onSend,
  planning,
  generatingCount,
  disabled = false,
  disabledReason,
  draftSeed,
  onDraftSeedConsumed,
  className,
}: PlanningChatProps) {
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const busy = planning || generatingCount > 0;
  const canSend = !disabled && !busy && draft.trim().length > 0;

  // A starter prompt clicked on the board lands in the composer so the
  // user can edit it before sending.
  useEffect(() => {
    if (draftSeed) {
      setDraft(draftSeed);
      onDraftSeedConsumed?.();
    }
  }, [draftSeed, onDraftSeedConsumed]);

  // Keep the newest turn in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, planning, generatingCount]);

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    void onSend(text);
  };

  return (
    <aside
      className={cn("flex flex-col rounded-media border border-cloud-line bg-white", className)}
      aria-label="Planning conversation"
    >
      <div className="flex items-center justify-between gap-2 border-b border-cloud-line px-4 py-3">
        <SectionLabel accent="pink">Plan with Canopy</SectionLabel>
        <span className="font-mono text-[10px] text-slate-faint">⌘↵ to send</span>
      </div>

      <div ref={threadRef} className="min-h-[260px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !busy ? (
          <p className="py-2 text-[12px] leading-[17px] text-slate">
            Describe what you want to see and Canopy renders it into the board — one concept for a
            focused ask, a few directions when you want to explore. Click any card to aim your next
            note at it.
          </p>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              cardLabel={m.targetCardId === targetCardId && targetCardLabel ? targetCardLabel : undefined}
            />
          ))
        )}

        {planning && (
          <div className="flex items-start">
            <span className="inline-flex items-center gap-2 rounded-square bg-cloud px-3 py-2 text-[12px] text-slate">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking through directions…
            </span>
          </div>
        )}
        {generatingCount > 0 && (
          <div className="flex items-start">
            <span className="inline-flex items-center gap-2 rounded-square bg-violet-soft px-3 py-2 text-[12px] font-medium text-[#7C3AED]">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" strokeWidth={1.5} />
              Generating <span className="font-mono">{generatingCount}</span> visual
              {generatingCount === 1 ? "" : "s"}…
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-cloud-line px-4 py-3">
        {disabled && disabledReason && (
          <p className="mb-2 rounded-tag bg-amber-soft px-2 py-1 text-[11px] leading-[15px] text-warn">
            {disabledReason}
          </p>
        )}
        <div className="mb-2 flex min-h-[22px] items-center gap-2">
          {targetCardId && targetCardLabel ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-tag bg-pink-deep px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
              <span className="truncate">{targetCardLabel}</span>
              <button
                type="button"
                onClick={onClearTarget}
                aria-label="Clear card target"
                className="ml-0.5 shrink-0 rounded-sm text-white/70 hover:text-white"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-faint">
              Whole project
            </span>
          )}
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (isSendKey(e)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            targetCardLabel
              ? `What should change about ${targetCardLabel}?`
              : "Show me three directions for this booth…"
          }
          rows={3}
          disabled={disabled}
          aria-label="Message the planning director"
          className="min-h-[72px] resize-none bg-white text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end">
          <Button size="sm" onClick={send} disabled={!canSend} className="gap-1.5">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
