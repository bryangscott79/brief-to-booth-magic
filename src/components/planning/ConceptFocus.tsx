// ConceptFocus — one concept, full screen, with the two ways to move it
// forward: MARK IT UP, or EDIT THE PROMPT.
//
// Same modal idiom as DeckSlideFocus (95vw × 92vh, ink surface, arrows /
// ← → between items, Esc closes, the stage re-keys so a new render appears
// in place without the modal closing).
//
//   PIN     click a point → a numbered marker + a comment ("move this")
//   REGION  drag a box, or lasso freehand → comment on that area
//
// Marks are normalized 0..1 against the image's own box, so they survive
// every resize; they compose into an edit instruction
// (buildAnnotationEditInstruction) and, for regions, an alpha mask, and
// the run comes back as a NEW VERSION on the same card. Nothing is ever
// replaced: the filmstrip keeps every version, and the card's cover only
// changes when the user presses "Make hero".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Lasso,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  annotationAnchor,
  boundsOfPoints,
  describeFramePoint,
  regionFromDrag,
} from "@/lib/conceptAnnotations";
import {
  cardVersions,
  planningId,
  type ConceptAnnotation,
  type PlanningCard,
} from "@/lib/planningCanvas";
import { cn } from "@/lib/utils";

type Tool = "pin" | "region" | "lasso";

export interface ConceptFocusProps {
  card: PlanningCard;
  /** Position among the board's cards — arrows step through those. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Run the marks as an EDIT of the current version. */
  onRunAnnotations: (annotations: ConceptAnnotation[]) => void | Promise<void>;
  /** Run a hand-edited prompt as a FRESH generation. */
  onRunPrompt: (prompt: string) => void | Promise<void>;
  onSelectVersion: (versionId: string) => void;
  onMakeHero: (versionId: string) => void;
  onAddToRenders: (versionId: string) => void;
  /** A render for this card is in flight. */
  busy: boolean;
  /** A save-render-image call is in flight. */
  savingRender: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

const MIN_REGION = 0.02;
const MIN_LASSO_STEP = 0.006;

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable);

const SOURCE_LABEL: Record<string, string> = {
  initial: "Original",
  annotated: "Marked up",
  "prompt-edit": "Prompt edit",
};

export function ConceptFocus({
  card,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  onRunAnnotations,
  onRunPrompt,
  onSelectVersion,
  onMakeHero,
  onAddToRenders,
  busy,
  savingRender,
  disabled = false,
  disabledReason,
}: ConceptFocusProps) {
  const versions = useMemo(() => cardVersions(card), [card]);
  // Pick out of `versions` rather than deriving separately: cardVersions()
  // builds a fresh object for a card whose stack is still computed on read,
  // so a second derivation is never reference-equal and versions.indexOf()
  // returns -1 (the header showed "v0 of 1").
  const version = useMemo(() => {
    const found = card.currentVersionId
      ? versions.find((v) => v.id === card.currentVersionId)
      : undefined;
    return found ?? versions[versions.length - 1]!;
  }, [versions, card.currentVersionId]);

  const [tool, setTool] = useState<Tool>("pin");
  const [annotations, setAnnotations] = useState<ConceptAnnotation[]>([]);
  const [promptDraft, setPromptDraft] = useState(version.prompt);
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(null);

  // Marks belong to the image they were drawn on. A new (or newly
  // selected) version is a different image, so the set starts clean and
  // the prompt editor reloads that version's prompt.
  useEffect(() => {
    setAnnotations([]);
    setFocusAnnotationId(null);
    setPromptDraft(version.prompt);
  }, [version.id, version.prompt]);

  // The image sizes itself against the viewport and the wrapper shrink-wraps
  // it, so nothing depends on measuring an ancestor whose height can collapse
  // inside the dialog's flex column. The overlay is absolutely positioned over
  // that wrapper, so it always matches the rendered image exactly, and pointer
  // maths reads the live rect at event time.
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── ← → step CARDS (Esc is the dialog's own) ────────────────────────────
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  // ── Drawing ─────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const [lasso, setLasso] = useState<Array<{ x: number; y: number }> | null>(null);

  const pointAt = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    // A pointer event without coordinates (some synthetic events) lands at
    // the origin rather than writing NaN into a stored annotation.
    return {
      x: Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0,
      y: Number.isFinite(y) ? Math.min(1, Math.max(0, y)) : 0,
    };
  }, []);

  const addAnnotation = useCallback((a: ConceptAnnotation) => {
    setAnnotations((cur) => [...cur, a]);
    setFocusAnnotationId(a.id);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // `> 0` rather than `!== 0`: only non-primary buttons are ignored, and
    // a synthetic event without a `button` still draws.
    if (e.button > 0 || !version.imageUrl) return;
    const p = pointAt(e.clientX, e.clientY);
    // Pointer capture keeps a drag alive outside the image; jsdom (and any
    // synthetic event without a real pointer) has neither method.
    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* no pointer with that id — drawing still works */
      }
    }
    if (tool === "pin") {
      addAnnotation({ id: planningId("ann"), kind: "pin", x: p.x, y: p.y, comment: "" });
      return;
    }
    if (tool === "region") setDrag({ start: p, end: p });
    else setLasso([p]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag) {
      setDrag({ start: drag.start, end: pointAt(e.clientX, e.clientY) });
      return;
    }
    if (lasso) {
      const p = pointAt(e.clientX, e.clientY);
      const last = lasso[lasso.length - 1]!;
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) >= MIN_LASSO_STEP) {
        setLasso([...lasso, p]);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      typeof e.currentTarget.hasPointerCapture === "function" &&
      e.currentTarget.hasPointerCapture(e.pointerId)
    ) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag) {
      const rect = regionFromDrag(drag.start, drag.end);
      setDrag(null);
      // A click that never moved is a mis-click with the box tool, not a
      // zero-area region — drop it rather than creating an empty mark.
      if (rect.w >= MIN_REGION && rect.h >= MIN_REGION) {
        addAnnotation({ id: planningId("ann"), kind: "region", ...rect, comment: "" });
      }
      return;
    }
    if (lasso) {
      const points = lasso;
      setLasso(null);
      if (points.length >= 3) {
        const b = boundsOfPoints(points);
        if (b.w >= MIN_REGION || b.h >= MIN_REGION) {
          addAnnotation({
            id: planningId("ann"),
            kind: "region",
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            points,
            comment: "",
          });
        }
      }
    }
  };

  const setComment = (id: string, comment: string) =>
    setAnnotations((cur) => cur.map((a) => (a.id === id ? { ...a, comment } : a)));
  const removeAnnotation = (id: string) =>
    setAnnotations((cur) => cur.filter((a) => a.id !== id));

  // ── Runs ────────────────────────────────────────────────────────────────
  const commented = annotations.filter((a) => a.comment.trim().length > 0);
  const canRunMarks = !disabled && !busy && commented.length > 0 && Boolean(version.imageUrl);
  const promptDirty = promptDraft.trim() !== version.prompt.trim();
  const canRunPrompt = !disabled && !busy && promptDraft.trim().length >= 10;

  const runMarks = () => {
    if (!canRunMarks) return;
    void onRunAnnotations(commented);
  };
  const runPrompt = () => {
    if (!canRunPrompt) return;
    void onRunPrompt(promptDraft.trim());
  };

  const added = Boolean(card.angleId);
  const isCover = version.imageUrl !== null && version.imageUrl === card.imageUrl;

  const arrow =
    "absolute top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-25 disabled:hover:bg-white/10";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[92vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden rounded-[14px] border-0 bg-[#101418] p-0 text-white sm:rounded-[14px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-5 py-3 pr-14">
          <DialogTitle className="truncate text-[13px] font-semibold tracking-tight text-white">
            {card.label}
          </DialogTitle>
          <span className="shrink-0 font-mono text-[11px] text-white/45">
            {index + 1} of {total} · v{versions.indexOf(version) + 1} of {versions.length}
          </span>
          {isCover && (
            <span className="shrink-0 rounded-[4px] bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/70">
              Hero
            </span>
          )}
          {added && (
            <span className="shrink-0 rounded-[4px] bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#34D399]">
              In renders
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/45">
            ← → concepts · Esc close
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ── Stage ─────────────────────────────────────────────────── */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 px-14 py-4">
              <button
                type="button"
                onClick={onPrev}
                disabled={index <= 0}
                aria-label="Previous concept"
                className={cn(arrow, "left-2")}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={index >= total - 1}
                aria-label="Next concept"
                className={cn(arrow, "right-2")}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              </button>

              <div className="flex min-h-[55vh] w-full flex-1 items-center justify-center">
                <div className="relative inline-flex max-w-full overflow-hidden rounded-[6px] bg-[#0B0E12] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                  {version.imageUrl ? (
                    <img
                      // Re-key on the version so a new render swaps in place.
                      key={version.id}
                      src={version.imageUrl}
                      alt={card.label}
                      className="block max-h-[72vh] w-auto max-w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-6 text-center font-mono text-[11px] text-white/45">
                      No image on this version
                    </div>
                  )}

                  {/* Annotation overlay — normalized 0..1 against this box */}
                  <div
                    ref={overlayRef}
                    role="application"
                    aria-label="Annotation surface"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    className={cn(
                      "absolute inset-0 touch-none",
                      version.imageUrl && !busy ? "cursor-crosshair" : "pointer-events-none",
                    )}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    >
                      {annotations.map((a) =>
                        a.kind === "region" && a.points && a.points.length >= 3 ? (
                          <polygon
                            key={a.id}
                            points={a.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                            fill="rgba(219,39,119,0.16)"
                            stroke="#F472B6"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : a.kind === "region" ? (
                          <rect
                            key={a.id}
                            x={a.x * 100}
                            y={a.y * 100}
                            width={(a.w ?? 0) * 100}
                            height={(a.h ?? 0) * 100}
                            fill="rgba(219,39,119,0.16)"
                            stroke="#F472B6"
                            strokeWidth={1.5}
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null,
                      )}
                      {drag &&
                        (() => {
                          const r = regionFromDrag(drag.start, drag.end);
                          return (
                            <rect
                              x={r.x * 100}
                              y={r.y * 100}
                              width={r.w * 100}
                              height={r.h * 100}
                              fill="rgba(219,39,119,0.10)"
                              stroke="#F472B6"
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          );
                        })()}
                      {lasso && lasso.length >= 2 && (
                        <polyline
                          points={lasso.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                          fill="rgba(219,39,119,0.10)"
                          stroke="#F472B6"
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>

                    {annotations.map((a, i) => {
                      const anchor = annotationAnchor(a);
                      return (
                        <span
                          key={a.id}
                          style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}
                          className={cn(
                            "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-white ring-2 ring-white/70",
                            a.comment.trim().length > 0 ? "bg-[#DB2777]" : "bg-[#64748B]",
                          )}
                        >
                          {i + 1}
                        </span>
                      );
                    })}
                  </div>

                  {busy && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#101418]/70">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/70">
                        Rendering a new version
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Version stack ───────────────────────────────────────── */}
            <div className="shrink-0 border-t border-white/10 bg-[#0B0E12] px-5 py-2.5">
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                  Versions
                </span>
                {versions.map((v, i) => {
                  const active = v.id === version.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onSelectVersion(v.id)}
                      aria-current={active}
                      title={v.note || SOURCE_LABEL[v.source] || v.source}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-[6px] border p-1 pr-2 text-left transition-colors",
                        active
                          ? "border-[#F472B6] bg-white/10"
                          : "border-white/12 hover:border-white/35",
                      )}
                    >
                      <span className="relative block h-9 w-16 overflow-hidden rounded-[4px] bg-[#101418]">
                        {v.imageUrl && (
                          <img
                            src={v.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-[10px] font-semibold text-white/80">
                          v{i + 1} · {SOURCE_LABEL[v.source] ?? v.source}
                        </span>
                        <span className="block max-w-[168px] truncate text-[11px] leading-[15px] text-white/50">
                          {v.note || (v.imageUrl === card.imageUrl ? "Card cover" : "—")}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Side panel ────────────────────────────────────────────── */}
          <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-white/10 bg-[#0B0E12] p-4 lg:w-[380px] lg:border-l lg:border-t-0">
            {disabled && disabledReason && (
              <p className="rounded-[4px] bg-amber-soft px-2 py-1 text-[11px] leading-[15px] text-warn">
                {disabledReason}
              </p>
            )}

            {/* Tools */}
            <section className="space-y-2">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                Mark up this image
              </h3>
              <div className="flex items-center gap-1.5">
                <ToolButton
                  active={tool === "pin"}
                  label="Pin a point"
                  onClick={() => setTool("pin")}
                  icon={<MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  text="Pin"
                />
                <ToolButton
                  active={tool === "region"}
                  label="Drag a rectangle"
                  onClick={() => setTool("region")}
                  icon={<Square className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  text="Box"
                />
                <ToolButton
                  active={tool === "lasso"}
                  label="Draw a freehand lasso"
                  onClick={() => setTool("lasso")}
                  icon={<Lasso className="h-3.5 w-3.5" strokeWidth={1.5} />}
                  text="Lasso"
                />
                {annotations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAnnotations([])}
                    className="ml-auto rounded-[6px] px-2 py-1 text-[11px] text-white/50 transition-colors hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {annotations.length === 0 ? (
                <p className="text-[12px] leading-[17px] text-white/50">
                  {tool === "pin"
                    ? "Click the image to drop a numbered pin, then say what should change there — “move this”, “this isn’t buildable”."
                    : tool === "region"
                      ? "Drag a box over an area, then comment on it. Boxed areas also become the edit mask, so the rest of the render is left alone."
                      : "Draw around an area, then comment on it. Lassoed areas also become the edit mask."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {annotations.map((a, i) => (
                    <li
                      key={a.id}
                      className="rounded-[8px] border border-white/12 bg-white/[0.04] p-2"
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full font-mono text-[9px] font-semibold text-white",
                            a.comment.trim().length > 0 ? "bg-[#DB2777]" : "bg-[#64748B]",
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-white/45">
                          {a.kind === "pin" ? "Pin" : a.points ? "Lasso" : "Box"}
                        </span>
                        <span className="truncate text-[11px] text-white/45">
                          {describeFramePoint(annotationAnchor(a).x, annotationAnchor(a).y)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAnnotation(a.id)}
                          aria-label={`Delete mark ${i + 1}`}
                          className="ml-auto rounded-[4px] p-0.5 text-white/40 transition-colors hover:text-[#F472B6]"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                      <Input
                        value={a.comment}
                        autoFocus={focusAnnotationId === a.id}
                        onChange={(e) => setComment(a.id, e.target.value)}
                        placeholder="What should change here?"
                        aria-label={`Comment on mark ${i + 1}`}
                        className="h-8 border-white/15 bg-white text-[12px] text-charcoal"
                      />
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="button"
                variant="generative"
                size="sm"
                onClick={runMarks}
                disabled={!canRunMarks}
                className="h-8 w-full gap-1.5 text-[12px]"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                Run with {commented.length || "no"} mark{commented.length === 1 ? "" : "s"}
              </Button>
            </section>

            {/* Prompt editor */}
            <section className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                Prompt {promptDirty && <span className="text-[#F472B6]">· edited</span>}
              </h3>
              <Textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                rows={10}
                aria-label="Concept prompt"
                className="min-h-[180px] resize-y border-white/15 bg-white font-mono text-[11px] leading-[16px] text-charcoal"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={runPrompt}
                  disabled={!canRunPrompt}
                  className="h-8 flex-1 gap-1.5 border-white/20 bg-transparent text-[12px] text-white hover:bg-white/10 hover:text-white"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Run this prompt
                </Button>
                {promptDirty && (
                  <button
                    type="button"
                    onClick={() => setPromptDraft(version.prompt)}
                    className="rounded-[6px] px-2 py-1 text-[11px] text-white/50 transition-colors hover:text-white"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-[15px] text-white/40">
                Running the prompt is a fresh generation — a new version, not an edit of this image.
              </p>
            </section>

            {/* Promote */}
            <section className="mt-auto space-y-2 border-t border-white/10 pt-4">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/45">
                This version
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onMakeHero(version.id)}
                  disabled={!version.imageUrl || isCover}
                  className="h-8 gap-1.5 border-white/20 bg-transparent text-[12px] text-white hover:bg-white/10 hover:text-white"
                >
                  <Crown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {isCover ? "Is hero" : "Make hero"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAddToRenders(version.id)}
                  disabled={!version.imageUrl || savingRender}
                  className="h-8 gap-1.5 text-[12px]"
                >
                  {savingRender ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                  Add to project renders
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close concept focus"
                  className="ml-auto rounded-[6px] p-1 text-white/45 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  icon,
  text,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11px] transition-colors",
        active
          ? "border-[#F472B6] bg-white/10 text-white"
          : "border-white/12 text-white/55 hover:border-white/35 hover:text-white",
      )}
    >
      {icon}
      {text}
    </button>
  );
}
