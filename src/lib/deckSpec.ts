// deckSpec — the typed slide-spec model for the CANOPY deck system.
//
// A DeckSpec is the deterministic contract between content compilation
// (compileDeckSpec) and the two renderers (deckBuilder → PPTX,
// deckSlideHtml → on-screen preview / PDF). AI never freestyles slide
// layout: content fills one of the designed layouts below, and both
// renderers draw the same geometry from the same spec, so what the user
// previews is exactly what the client opens in PowerPoint.
//
// Every layout is a discriminated-union member keyed on `layout`. Slides
// whose data is absent are simply never emitted — the model has no
// placeholder/lorem states.

/** An image placed on a slide. Always carries a human label so renderers
 *  can caption it and the builder can report skips meaningfully. */
export interface ImageSlot {
  url: string;
  label: string;
}

/** A short label/value fact ("Budget" / "$185,000 per show"). */
export interface FactRow {
  label: string;
  value: string;
}

export interface DeckMeta {
  projectName: string;
  clientName: string;
  agencyName: string;
  boothSize: string;
  showName?: string;
  dateLabel: string;
}

// ── Layouts ───────────────────────────────────────────────────────────────────

/** Full-bleed brand-color cover: project identity + lead logo. */
export interface CoverSlide {
  layout: "cover";
  eyebrow: string;
  title: string;
  subtitle: string;
}

/** Ink-ground divider with an oversized section number. */
export interface SectionSlide {
  layout: "section";
  number: number;
  title: string;
  subtitle?: string;
}

/** The Ask — brief facts + objectives + audiences. */
export interface BriefSummarySlide {
  layout: "briefSummary";
  title: string;
  facts: FactRow[];
  objectives: string[];
  audiences: Array<{ name: string; description: string }>;
}

/** Big idea: display headline + narrative + supporting points. */
export interface ConceptSlide {
  layout: "concept";
  headline: string;
  subheadline?: string;
  narrative: string;
  points: string[];
}

/** 4–6 titled cards (the strategy elements, distilled). */
export interface ElementGridSlide {
  layout: "elementGrid";
  title: string;
  cards: Array<{ title: string; body: string }>;
}

/** Floor plan image + zone allocation table with sqft. */
export interface SpatialSlide {
  layout: "spatial";
  title: string;
  boothSize: string;
  totalSqft?: number;
  image?: ImageSlot;
  zones: Array<{ name: string; sqft: number; note?: string }>;
}

/** One hero render, full bleed, captioned. */
export interface RenderFullSlide {
  layout: "renderFull";
  image: ImageSlot;
  caption: string;
}

/** 2-up or 4-up grid of view renders. */
export interface RenderGridSlide {
  layout: "renderGrid";
  title: string;
  images: ImageSlot[]; // 2–4 entries
}

/** Budget allocation table: rows + bold total. */
export interface BudgetSlide {
  layout: "budget";
  title: string;
  rows: Array<{
    category: string;
    amount: number;
    percentage?: number;
    description?: string;
  }>;
  total: number;
  totalLabel: string;
}

/** Materials category rows (from the generated materials estimate). */
export interface MaterialsSlide {
  layout: "materials";
  title: string;
  rows: Array<{ category: string; summary: string; subtotal?: number }>;
  total?: number;
  note?: string;
}

/** Numbered next steps + a one-line timeline. */
export interface NextStepsSlide {
  layout: "nextSteps";
  title: string;
  steps: Array<{ title: string; detail?: string }>;
  timelineNote?: string;
}

/** Thank-you + contacts + co-brand. */
export interface ClosingSlide {
  layout: "closing";
  headline: string;
  subline?: string;
  contacts: Array<{ name: string; email?: string; phone?: string }>;
}

export type SlideSpec =
  | CoverSlide
  | SectionSlide
  | BriefSummarySlide
  | ConceptSlide
  | ElementGridSlide
  | SpatialSlide
  | RenderFullSlide
  | RenderGridSlide
  | BudgetSlide
  | MaterialsSlide
  | NextStepsSlide
  | ClosingSlide;

export type SlideLayout = SlideSpec["layout"];

export interface DeckSpec {
  meta: DeckMeta;
  slides: SlideSpec[];
}

/** Canonical slide-family order — compile emits in this sequence. Useful
 *  for tests and for any UI that wants to show deck structure. */
export const DECK_SECTION_ORDER = [
  "The Ask",
  "The Concept",
  "The Space",
  "The Investment",
] as const;
