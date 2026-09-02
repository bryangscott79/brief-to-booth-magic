// DeckSlideFocus — the per-slide feedback channel, as a full-screen modal.
//
// Clicking a thumbnail opens the slide LARGE: a 95vw × 92vh dialog on an
// ink surface with the 1280×720 artboard scaled to fill the stage
// (scale = min(availW / 1280, availH / 720), so a laptop shows it ≥1100px
// wide and body copy is readable), prev / next arrows on the sides + ← →
// keys, a mono "Slide 3 of 25 · briefSummary" caption, and a composer
// pinned to the bottom whose feedback is sent with this slide preset as
// the target. The iframe is keyed on the rendered HTML, so the moment ops
// apply the slide visibly re-renders in place — the modal never closes on
// feedback. Esc (or the ✕) closes.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2, SendHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const canSend = !disabled && !busy && draft.trim().length > 0;
  const tags = overrideTags(overrides);

  // Fit the artboard to whatever the stage has left after the header and
  // the composer (both are outside the stage, so its box IS the budget).
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / ARTBOARD.w, el.clientHeight / ARTBOARD.h));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ← → step slides unless the user is typing (Esc is the dialog's own).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

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

  const frameW = Math.round(ARTBOARD.w * scale);
  const frameH = Math.round(ARTBOARD.h * scale);
  const arrow =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-25 disabled:hover:bg-white/10";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[92vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden rounded-[14px] border-0 bg-[#101418] p-0 text-white sm:rounded-[14px]"
      >
        {/* Header: caption, override tags, position */}
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-5 py-3 pr-14">
          <DialogTitle className="font-mono text-[12px] font-medium tracking-tight text-white">
            Slide {index + 1} of {total} · {layout}
          </DialogTitle>
          {tags.map((t) => (
            <span key={t} className="rounded-[4px] bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/70">
              {t}
            </span>
          ))}
          <span className="ml-auto font-mono text-[10px] text-white/45">⌘↵ send · ← → move · Esc close</span>
        </div>

        {/* Stage: the artboard, scaled to fit; arrows over the sides */}
        <div className="relative min-h-0 flex-1 px-16 py-4">
          <button type="button" onClick={onPrev} disabled={index <= 0} aria-label="Previous slide" className={cn(arrow, "left-3")}>
            <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <button type="button" onClick={onNext} disabled={index >= total - 1} aria-label="Next slide" className={cn(arrow, "right-3")}>
            <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
          </button>
          <div ref={stageRef} className="flex h-full w-full items-center justify-center">
            <div className="relative overflow-hidden rounded-[6px] bg-cloud shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" style={{ width: frameW, height: frameH }}>
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
        </div>

        {/* Composer, pinned to the bottom */}
        <div className="shrink-0 border-t border-white/10 bg-[#0B0E12] px-5 py-3">
          <div className="mx-auto w-full max-w-[1100px]">
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
                autoFocus
                aria-label={`Feedback on slide ${index + 1}`}
                className="min-h-[52px] flex-1 resize-none border-white/15 bg-white text-[13px] text-charcoal"
              />
              <Button size="sm" onClick={send} disabled={!canSend} className="gap-1.5">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />}
                Send
              </Button>
            </div>
            {(busy || lastReply) && (
              <div
                className={cn(
                  "mt-2 rounded-[8px] px-3 py-2 text-[13px] leading-[19px]",
                  lastReply?.error ? "bg-red-soft text-blocking" : "bg-white/10 text-white",
                )}
              >
                {busy ? (
                  <span className="inline-flex items-center gap-2 text-[12px] text-white/70">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
