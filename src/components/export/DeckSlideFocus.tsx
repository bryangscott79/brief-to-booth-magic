// DeckSlideFocus — the per-slide feedback channel.
//
// Clicking a thumbnail opens this inline panel above the grid (the grid
// stays visible for context): the slide at full width (the 1280×720
// artboard scaled to the panel), prev / next arrows + ← → keys, a mono
// "Slide 5 of 25 · concept" caption, and a composer DIRECTLY beneath it
// whose feedback is sent with this slide preset as the target. The iframe
// is keyed on the rendered HTML, so the moment ops apply the slide visibly
// re-renders in place; the last assistant reply sits under the input.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { overrideTags, type DeckChatMessage, type SlideOverrides } from "@/lib/deckOps";
import { AssistantMeta } from "@/components/export/DeckChat";
import { cn } from "@/lib/utils";

const ARTBOARD = { w: 1280, h: 720 } as const;

export interface DeckSlideFocusProps {
  /** Rendered artboard HTML (renderSlideHtml) for the focused slide. */
  html: string;
  /** Stable key for the rendered HTML — changes whenever the slide re-renders. */
  renderKey: string;
  index: number;
  total: number;
  layout: string;
  overrides?: SlideOverrides | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onSend: (feedback: string) => void | Promise<void>;
  busy: boolean;
  /** The last assistant turn (shown under the composer). */
  lastReply: DeckChatMessage | null;
  disabled?: boolean;
  disabledReason?: string;
}

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);

export function DeckSlideFocus({
  html,
  renderKey,
  index,
  total,
  layout,
  overrides,
  onPrev,
  onNext,
  onClose,
  onSend,
  busy,
  lastReply,
  disabled = false,
  disabledReason,
}: DeckSlideFocusProps) {
  const [draft, setDraft] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const canSend = !disabled && !busy && draft.trim().length > 0;
  const tags = overrideTags(overrides);

  // Fit the 1280-wide artboard to the panel.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / ARTBOARD.w);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ← → step slides, Esc closes — unless the user is typing.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext, onClose]);

  const send = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    void onSend(text);
  };
  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section className="rounded-[14px] border border-navy bg-white" aria-label={`Slide ${index + 1} focus`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="font-mono text-[12px] font-medium tracking-tight text-navy">
          Slide {index + 1} of {total} · {layout}
        </span>
        {tags.map((t) => (
          <span key={t} className="rounded-[4px] bg-cloud px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate">
            {t}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label="Previous slide"
            className="rounded-md border border-border p-1 text-slate transition-colors hover:text-navy disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="Next slide"
            className="rounded-md border border-border p-1 text-slate transition-colors hover:text-navy disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close slide focus"
            className="ml-1 rounded-md p-1 text-slate transition-colors hover:text-navy"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-[8px] border border-border bg-cloud"
          style={{ aspectRatio: `${ARTBOARD.w} / ${ARTBOARD.h}` }}
        >
          <iframe
            key={renderKey}
            title={`Slide ${index + 1}`}
            srcDoc={html}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: ARTBOARD.w, height: ARTBOARD.h, transform: `scale(${scale})` }}
            scrolling="no"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[960px] px-4 py-3">
        {disabled && disabledReason && (
          <p className="mb-2 rounded-[4px] bg-amber-soft px-2 py-1 text-[11px] leading-[15px] text-warn">{disabledReason}</p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Feedback on this slide…"
            rows={2}
            disabled={disabled}
            aria-label={`Feedback on slide ${index + 1}`}
            className="min-h-[52px] flex-1 resize-none bg-white text-[13px]"
          />
          <Button size="sm" onClick={send} disabled={!canSend} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />}
            Send
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-slate-faint">⌘↵ to send · ← → to move · Esc to close</span>
        </div>
        {(busy || lastReply) && (
          <div className={cn("mt-2 rounded-[8px] px-3 py-2 text-[13px] leading-[19px]", lastReply?.error ? "bg-red-soft text-blocking" : "bg-cloud text-charcoal")}>
            {busy ? (
              <span className="inline-flex items-center gap-2 text-[12px] text-slate">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Revising…
              </span>
            ) : lastReply ? (
              <>
                <p className="whitespace-pre-wrap">{lastReply.error ? `Couldn't revise — ${lastReply.content}` : lastReply.content}</p>
                <AssistantMeta message={lastReply} />
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
