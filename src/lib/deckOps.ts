// deckOps — the edit vocabulary for deck feedback.
//
// Free-text feedback ("go navy", "shorten slide 5", "swap slide 9 for the
// left-side render") is turned into a closed set of structured operations
// by the deck-revise edge function, then applied HERE, deterministically,
// to the DeckSpec + deck settings. The AI never redraws a slide; it patches
// the spec, and the designed renderers re-render — so accuracy and design
// consistency survive every round of feedback.
//
// Every applied batch becomes a DeckVersion (snapshot + the message that
// produced it) so users can flip between versions or restore one.

import type { DeckSpec, SlideSpec, SlideLayout } from "@/lib/deckSpec";
import type { BrandMode } from "@/lib/brandKit";
import type { DeckStyleId } from "@/lib/deckStyle";

// ── Settings the ops can touch ───────────────────────────────────────────────

/** Per-slide design overrides the renderers honor (all optional). */
export interface SlideOverrides {
  /** Force the slide ground: brand primary field, paper (white), or ink (near-black). */
  ground?: "primary" | "paper" | "ink";
  /** Hide the logo/mark on this slide. */
  hideLogo?: boolean;
  /** Emphasis: quieter (less accent fill) or louder (more). */
  accent?: "quiet" | "normal" | "loud";
  /** Free-form presenter note carried into pptx speaker notes. */
  notes?: string;
}

/** Deck-level design settings that feedback can adjust. Palette/font
 *  overrides live on the DECK — they never rewrite the saved brand kit. */
export interface DeckDesignSettings {
  brandMode?: BrandMode;
  style?: DeckStyleId;
  paletteOverride?: { primary?: string; secondary?: string };
  fontOverride?: { headingFontId?: string; bodyFontId?: string };
  renderPresentation?: "full" | "mixed" | "grid";
  /** Per-slide overrides keyed by slide index (as string, JSON-safe). */
  slideOverrides?: Record<string, SlideOverrides>;
}

// ── Operations ───────────────────────────────────────────────────────────────

export type DeckOp =
  | { op: "set_style"; style: DeckStyleId }
  | { op: "set_brand_mode"; mode: BrandMode }
  | { op: "set_palette"; primary?: string; secondary?: string }
  | { op: "set_fonts"; headingFontId?: string; bodyFontId?: string }
  | { op: "set_render_presentation"; mode: "full" | "mixed" | "grid" }
  | { op: "update_slide"; index: number; patch: Record<string, unknown> }
  | { op: "set_slide_overrides"; index: number; overrides: SlideOverrides }
  | { op: "remove_slide"; index: number }
  | { op: "reorder_slides"; order: number[] }
  | { op: "insert_slide"; index: number; slide: SlideSpec }
  | { op: "duplicate_slide"; index: number };

export const DECK_OP_NAMES = [
  "set_style",
  "set_brand_mode",
  "set_palette",
  "set_fonts",
  "set_render_presentation",
  "update_slide",
  "set_slide_overrides",
  "remove_slide",
  "reorder_slides",
  "insert_slide",
  "duplicate_slide",
] as const;

export const SLIDE_LAYOUTS: SlideLayout[] = [
  "cover",
  "section",
  "briefSummary",
  "concept",
  "elementGrid",
  "spatial",
  "renderFull",
  "renderGrid",
  "budget",
  "materials",
  "nextSteps",
  "closing",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Lightweight runtime validation — the edge function is trusted to emit
 *  the schema, but a malformed op must never corrupt a deck. */
export function isValidDeckOp(raw: unknown, slideCount: number): raw is DeckOp {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const idxOk = (i: unknown) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < slideCount;
  switch (o.op) {
    case "set_style":
      return ["pitch", "executive", "editorial", "tactical"].includes(o.style as string);
    case "set_brand_mode":
      return ["agency", "client", "blend"].includes(o.mode as string);
    case "set_palette":
      return (
        (o.primary === undefined || HEX.test(String(o.primary))) &&
        (o.secondary === undefined || HEX.test(String(o.secondary))) &&
        (o.primary !== undefined || o.secondary !== undefined)
      );
    case "set_fonts":
      return typeof o.headingFontId === "string" || typeof o.bodyFontId === "string";
    case "set_render_presentation":
      return ["full", "mixed", "grid"].includes(o.mode as string);
    case "update_slide":
      return idxOk(o.index) && !!o.patch && typeof o.patch === "object";
    case "set_slide_overrides":
      return idxOk(o.index) && !!o.overrides && typeof o.overrides === "object";
    case "remove_slide":
      return idxOk(o.index);
    case "duplicate_slide":
      return idxOk(o.index);
    case "reorder_slides": {
      const order = o.order;
      if (!Array.isArray(order) || order.length !== slideCount) return false;
      const seen = new Set(order);
      return seen.size === slideCount && order.every((i) => idxOk(i));
    }
    case "insert_slide": {
      const slide = o.slide as Record<string, unknown> | undefined;
      const insertIdx = o.index;
      return (
        typeof insertIdx === "number" &&
        insertIdx >= 0 &&
        insertIdx <= slideCount &&
        !!slide &&
        SLIDE_LAYOUTS.includes(slide.layout as SlideLayout)
      );
    }
    default:
      return false;
  }
}

// ── Application ──────────────────────────────────────────────────────────────

export interface DeckState {
  spec: DeckSpec;
  settings: DeckDesignSettings;
}

/** Shift per-slide override keys when slides move, so overrides follow
 *  their slide instead of sticking to a position. */
function remapOverrides(
  overrides: Record<string, SlideOverrides> | undefined,
  mapping: (oldIndex: number) => number | null,
): Record<string, SlideOverrides> | undefined {
  if (!overrides) return overrides;
  const next: Record<string, SlideOverrides> = {};
  for (const [k, v] of Object.entries(overrides)) {
    const to = mapping(Number(k));
    if (to !== null) next[String(to)] = v;
  }
  return next;
}

/** Apply ops in order. Pure: returns a new state; invalid ops are skipped
 *  and reported so the UI can say "couldn't apply X". */
export function applyDeckOps(
  state: DeckState,
  ops: unknown[],
): { state: DeckState; applied: DeckOp[]; skipped: unknown[] } {
  let spec: DeckSpec = { ...state.spec, slides: [...state.spec.slides] };
  let settings: DeckDesignSettings = { ...state.settings };
  const applied: DeckOp[] = [];
  const skipped: unknown[] = [];

  for (const raw of ops) {
    if (!isValidDeckOp(raw, spec.slides.length)) {
      skipped.push(raw);
      continue;
    }
    const op = raw;
    switch (op.op) {
      case "set_style":
        settings = { ...settings, style: op.style };
        break;
      case "set_brand_mode":
        settings = { ...settings, brandMode: op.mode };
        break;
      case "set_palette":
        settings = {
          ...settings,
          paletteOverride: {
            ...(settings.paletteOverride ?? {}),
            ...(op.primary ? { primary: op.primary } : {}),
            ...(op.secondary ? { secondary: op.secondary } : {}),
          },
        };
        break;
      case "set_fonts":
        settings = {
          ...settings,
          fontOverride: {
            ...(settings.fontOverride ?? {}),
            ...(op.headingFontId ? { headingFontId: op.headingFontId } : {}),
            ...(op.bodyFontId ? { bodyFontId: op.bodyFontId } : {}),
          },
        };
        break;
      case "set_render_presentation":
        settings = { ...settings, renderPresentation: op.mode };
        break;
      case "update_slide": {
        const current = spec.slides[op.index];
        // Layout is immutable through patches — swapping layouts is an
        // insert+remove so the renderer never sees a half-shaped slide.
        const { layout: _ignored, ...patch } = op.patch as Record<string, unknown>;
        spec.slides[op.index] = { ...current, ...patch } as SlideSpec;
        break;
      }
      case "set_slide_overrides": {
        const key = String(op.index);
        settings = {
          ...settings,
          slideOverrides: {
            ...(settings.slideOverrides ?? {}),
            [key]: { ...(settings.slideOverrides?.[key] ?? {}), ...op.overrides },
          },
        };
        break;
      }
      case "remove_slide": {
        spec.slides.splice(op.index, 1);
        settings = {
          ...settings,
          slideOverrides: remapOverrides(settings.slideOverrides, (i) =>
            i === op.index ? null : i > op.index ? i - 1 : i,
          ),
        };
        break;
      }
      case "duplicate_slide": {
        const copy = JSON.parse(JSON.stringify(spec.slides[op.index])) as SlideSpec;
        spec.slides.splice(op.index + 1, 0, copy);
        settings = {
          ...settings,
          slideOverrides: remapOverrides(settings.slideOverrides, (i) => (i > op.index ? i + 1 : i)),
        };
        break;
      }
      case "insert_slide": {
        spec.slides.splice(op.index, 0, op.slide);
        settings = {
          ...settings,
          slideOverrides: remapOverrides(settings.slideOverrides, (i) => (i >= op.index ? i + 1 : i)),
        };
        break;
      }
      case "reorder_slides": {
        const oldSlides = spec.slides;
        spec.slides = op.order.map((i) => oldSlides[i]);
        const inverse = new Map<number, number>();
        op.order.forEach((oldIdx, newIdx) => inverse.set(oldIdx, newIdx));
        settings = {
          ...settings,
          slideOverrides: remapOverrides(settings.slideOverrides, (i) => inverse.get(i) ?? null),
        };
        break;
      }
    }
    applied.push(op);
  }

  spec = { ...spec };
  return { state: { spec, settings }, applied, skipped };
}

// ── Versions ─────────────────────────────────────────────────────────────────

export interface DeckVersion {
  id: string;
  /** ISO timestamp */
  createdAt: string;
  /** What produced this version: the user's feedback, or "Compiled". */
  message: string;
  /** Short assistant summary of what changed (from deck-revise). */
  summary?: string;
  spec: DeckSpec;
  settings: DeckDesignSettings;
  /** Optional user label ("Client review v2"). */
  label?: string;
}

export const MAX_VERSIONS = 40;

export function newVersionId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Append a version (capped, oldest dropped) — pure. */
export function pushVersion(versions: DeckVersion[], version: DeckVersion): DeckVersion[] {
  const next = [...versions, version];
  return next.length > MAX_VERSIONS ? next.slice(next.length - MAX_VERSIONS) : next;
}

/** Compact, model-facing description of the deck for the revise prompt:
 *  enough for the model to target slides accurately without the full
 *  payload of every image URL. */
export function summarizeDeckForModel(spec: DeckSpec, settings: DeckDesignSettings): string {
  const lines = spec.slides.map((s, i) => {
    const rec = s as unknown as Record<string, unknown>;
    const title =
      (rec.title as string) ?? (rec.headline as string) ?? (rec.heading as string) ?? "";
    const extras: string[] = [];
    if (Array.isArray(rec.images)) extras.push(`${(rec.images as unknown[]).length} images`);
    if (rec.image) extras.push("1 image");
    if (Array.isArray(rec.rows)) extras.push(`${(rec.rows as unknown[]).length} rows`);
    if (Array.isArray(rec.items)) extras.push(`${(rec.items as unknown[]).length} items`);
    const ov = settings.slideOverrides?.[String(i)];
    if (ov && Object.keys(ov).length) extras.push(`overrides=${JSON.stringify(ov)}`);
    return `${i}: [${s.layout}] ${title}${extras.length ? " (" + extras.join(", ") + ")" : ""}`;
  });
  const design = [
    `style=${settings.style ?? "pitch"}`,
    `brandMode=${settings.brandMode ?? "agency"}`,
    settings.paletteOverride ? `paletteOverride=${JSON.stringify(settings.paletteOverride)}` : null,
    settings.fontOverride ? `fontOverride=${JSON.stringify(settings.fontOverride)}` : null,
    settings.renderPresentation ? `renderPresentation=${settings.renderPresentation}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `DESIGN: ${design}\nSLIDES (index: [layout] title):\n${lines.join("\n")}`;
}
