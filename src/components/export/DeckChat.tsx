// DeckChat — the deck-wide feedback thread on the Export step.
//
// Presentational: the thread (user bubbles right, assistant replies left
// with an "Applied N changes" mono chip and amber notes for ops the client
// refused), a target chip for the slide the feedback is aimed at, and the
// composer (⌘/Ctrl+Enter sends; the placeholder rotates through example
// asks while empty). DeckStudio owns the state: it calls deck-revise,
// applies the ops, re-renders the thumbnails, persists, and records a
// version — this component only reports what the user typed.
//
// Flow C: white card, hairlines, navy for the primary action, mono for
// counts, green = applied, amber = couldn't apply, red = failed.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/shell";
import { FEEDBACK_EXAMPLES, type DeckChatMessage } from "@/lib/deckOps";
import { cn } from "@/lib/utils";

const ROTATE_MS = 3600;

/** Rotating placeholder while the composer is empty. */
function useRotatingPlaceholder(active: boolean, examples: readonly string[] = FEEDBACK_EXAMPLES): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % examples.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active, examples.length]);
  return examples[i % examples.length];
}

const isSendKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  e.key === "Enter" && (e.metaKey || e.ctrlKey);

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** "Applied 3 changes" / "No changes" mono chip + skipped / error notes. */
export function AssistantMeta({ message }: { message: DeckChatMessage }) {
  if (message.error) return null;
  const n = message.appliedCount ?? 0;
  return (
    <div className="mt-1.5 space-y-1">
      <span
        className={cn(
          "inline-flex items-center rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight",
          n > 0 ? "bg-green-soft text-pass" : "bg-cloud text-slate",
        )}
      >
        {n > 0 ? `Applied ${n} change${n === 1 ? "" : "s"}` : "No changes"}
      </span>
      {(message.skipped ?? []).map((s, i) => (
        <p key={i} className="rounded-[4px] bg-amber-soft px-2 py-1 text-[11px] leading-[15px] text-warn">
          Couldn't apply: <span className="font-mono">{s}</span>
        </p>
      ))}
    </div>
  );
}

function Bubble({ message }: { message: DeckChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-[8px] px-3 py-2 text-[13px] leading-[19px]",
          mine
            ? "bg-navy text-white"
            : message.error
              ? "bg-red-soft text-blocking"
              : "bg-cloud text-charcoal",
        )}
      >
        {mine && typeof message.targetSlide === "number" && (
          <span className="mb-1 inline-block rounded-[4px] bg-white/15 px-1.5 font-mono text-[10px] font-semibold tracking-tight text-white">
            Slide {message.targetSlide + 1}
          </span>
        )}
        <p className="whitespace-pre-wrap">{message.error ? `Couldn't revise — ${message.content}` : message.content}</p>
        {!mine && <AssistantMeta message={message} />}
      </div>
      <span className="mt-0.5 font-mono text-[10px] text-slate-faint">{timeOf(message.createdAt)}</span>
    </div>
  );
}

export interface DeckChatProps {
  messages: DeckChatMessage[];
  /** 0-based index of the slide feedback is aimed at (the focused slide). */
  selectedSlide: number | null;
  onClearSelection: () => void;
  onSend: (feedback: string) => void | Promise<void>;
  /** A revision is in flight. */
  busy: boolean;
  /** Composer locked (no deck yet, or viewing an older version). */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export function DeckChat({
  messages,
  selectedSlide,
  onClearSelection,
  onSend,
  busy,
  disabled = false,
  disabledReason,
  className,
}: DeckChatProps) {
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const placeholder = useRotatingPlaceholder(draft.length === 0 && !disabled);
  const canSend = !disabled && !busy && draft.trim().length > 0;

  // Keep the newest turn in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    void onSend(text);
  };

  const suggestions = useMemo(() => FEEDBACK_EXAMPLES.slice(0, 3), []);

  return (
    <aside className={cn("flex flex-col rounded-[14px] border border-border bg-white", className)} aria-label="Deck feedback">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <SectionLabel accent="violet">Deck feedback</SectionLabel>
        <span className="font-mono text-[10px] text-slate-faint">⌘↵ to send</span>
      </div>

      <div ref={threadRef} className="min-h-[220px] max-h-[46vh] flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !busy ? (
          <div className="space-y-2 py-2">
            <p className="text-[12px] leading-[17px] text-slate">
              Tell Canopy what to change — tone, colors, fonts, copy, order. Click a slide to aim feedback at it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => setDraft(s)}
                  className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-slate transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        {busy && (
          <div className="flex items-start">
            <div className="inline-flex items-center gap-2 rounded-[8px] bg-cloud px-3 py-2 text-[12px] text-slate">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Revising…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        {disabled && disabledReason && (
          <p className="mb-2 rounded-[4px] bg-amber-soft px-2 py-1 text-[11px] leading-[15px] text-warn">{disabledReason}</p>
        )}
        <div className="mb-2 flex min-h-[22px] items-center gap-2">
          {selectedSlide !== null ? (
            <span className="inline-flex items-center gap-1 rounded-[4px] bg-navy px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
              Slide {selectedSlide + 1}
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Clear slide target"
                className="ml-0.5 rounded-sm text-white/70 hover:text-white"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-faint">Whole deck</span>
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
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          aria-label="Deck feedback"
          className="min-h-[56px] resize-none bg-white text-[13px]"
        />
        <div className="mt-2 flex items-center justify-end">
          <Button size="sm" onClick={send} disabled={!canSend} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />}
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
