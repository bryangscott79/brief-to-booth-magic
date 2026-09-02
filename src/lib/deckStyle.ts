// deckStyle — style presets for the deterministic deck system.
//
// The legacy AI-designed deck offered four presets (Pitch / Executive /
// Editorial / Tactical). This module ports that range into the deterministic
// renderers as a token object both deckBuilder.ts (PPTX) and deckSlideHtml.ts
// (HTML preview / PDF) consume. Style never touches CONTENT — a DeckSpec
// compiles once and renders in any style — and never touches the brand kit
// (palette + typefaces stay the agency's / client's). Style only decides how
// the shared geometry is dressed: cover treatment, type scale, density,
// how much color the surfaces carry, image framing, and whether the money /
// square-footage tables lead with the number.
//
// "pitch" IS today's design: its tokens are the legacy defaults, so a caller
// that passes no style gets byte-identical output to before styles existed
// (deckStyle.test.ts pins this).

export type DeckStyleId = "pitch" | "executive" | "editorial" | "tactical";

export const DEFAULT_DECK_STYLE: DeckStyleId = "pitch";

export interface DeckStyleMeta {
  id: DeckStyleId;
  label: string;
  blurb: string;
}

export const DECK_STYLES: readonly DeckStyleMeta[] = [
  { id: "pitch", label: "Pitch deck", blurb: "Bold, brand-color-forward — for new business." },
  { id: "executive", label: "Executive", blurb: "Restrained, high-whitespace — for C-suite reviews." },
  { id: "editorial", label: "Editorial", blurb: "Magazine-style typography, prose over bullets — for storytelling." },
  { id: "tactical", label: "Tactical", blurb: "Numbers + diagrams forward — for production reviews." },
] as const;

export const isDeckStyleId = (v: unknown): v is DeckStyleId =>
  v === "pitch" || v === "executive" || v === "editorial" || v === "tactical";

// ── Tokens ────────────────────────────────────────────────────────────────────

/** Cover treatment.
 *  field     — full primary ground with the soft geometry (today's cover).
 *  quiet     — paper ground, thin primary rule under the mark, ink type.
 *  editorial — paper ground, oversized display title on a hairline grid.
 *  grid      — paper ground, brand bar + a four-cell meta strip of the facts. */
export type DeckCoverTreatment = "field" | "quiet" | "editorial" | "grid";

/** Section-divider variant.
 *  number  — ink ground, oversized section numeral (today's divider).
 *  rule    — paper ground, small numeral, primary rule, primary title.
 *  display — ink ground, oversized display title, numeral as a kicker.
 *  index   — ink ground, numbered chip + title + a project meta row. */
export type DeckSectionVariant = "number" | "rule" | "display" | "index";

/** How much brand color the surfaces carry.
 *  hairline — no tinted panels; rules and whitespace do the structuring.
 *  tint     — light tinted panels + zebra rows (today's look).
 *  field    — stronger tints, filled table headers. */
export type DeckAccentIntensity = "hairline" | "tint" | "field";

export interface DeckStyleTokens {
  id: DeckStyleId;
  cover: DeckCoverTreatment;
  section: DeckSectionVariant;
  /** Point-size multipliers. title → display/heading faces, body → running
   *  text, caption → kickers, captions, footers. Resolved sizes round to
   *  0.5 pt in BOTH renderers so preview === pptx. */
  type: { title: number; body: number; caption: number };
  /** margin: page margin in inches (legacy 0.6). spacing: multiplier on
   *  vertical rhythm — row pitches, list gaps, card gaps. */
  density: { margin: number; spacing: number };
  accent: {
    intensity: DeckAccentIntensity;
    /** pptx fill transparency (%) for tinted panels; 100 = no panel. */
    panelTransparency: number;
    /** Zebra striping on budget rows. */
    zebra: boolean;
    /** Body-master top brand bar. */
    topBar: boolean;
    /** Soft geometry (circles) on the cover/closing field. */
    geometry: boolean;
  };
  images: {
    /** renderFull: bleed = edge-to-edge with a caption plate;
     *  inset = framed inside the margins on paper, caption beneath. */
    framing: "bleed" | "inset";
    /** Prefix grid captions with a figure index ("01 — Aisle left"). */
    figureNumbers: boolean;
  };
  tables: {
    /** Budget / spatial / materials: the number column leads (left, in the
     *  heading face) instead of trailing right-aligned. */
    numbersLead: boolean;
  };
  /** Objectives and concept points run as prose / stacked deks instead of
   *  bulleted chips. */
  prose: boolean;
}

/** Today's design, verbatim — the reference every other style deviates from. */
export const PITCH_LEGACY_TOKENS: DeckStyleTokens = Object.freeze({
  id: "pitch",
  cover: "field",
  section: "number",
  type: { title: 1, body: 1, caption: 1 },
  density: { margin: 0.6, spacing: 1 },
  accent: { intensity: "tint", panelTransparency: 95, zebra: true, topBar: true, geometry: true },
  images: { framing: "bleed", figureNumbers: false },
  tables: { numbersLead: false },
  prose: false,
}) as DeckStyleTokens;

const STYLE_TOKENS: Record<DeckStyleId, DeckStyleTokens> = {
  pitch: PITCH_LEGACY_TOKENS,
  executive: {
    id: "executive",
    cover: "quiet",
    section: "rule",
    type: { title: 0.92, body: 0.96, caption: 1 },
    density: { margin: 0.85, spacing: 1.08 },
    accent: { intensity: "hairline", panelTransparency: 100, zebra: false, topBar: false, geometry: false },
    images: { framing: "inset", figureNumbers: false },
    tables: { numbersLead: false },
    prose: false,
  },
  editorial: {
    id: "editorial",
    cover: "editorial",
    section: "display",
    type: { title: 1.18, body: 1.04, caption: 0.95 },
    density: { margin: 0.75, spacing: 1.04 },
    accent: { intensity: "hairline", panelTransparency: 100, zebra: false, topBar: false, geometry: false },
    images: { framing: "bleed", figureNumbers: false },
    tables: { numbersLead: false },
    prose: true,
  },
  tactical: {
    id: "tactical",
    cover: "grid",
    section: "index",
    type: { title: 0.9, body: 0.95, caption: 1 },
    density: { margin: 0.6, spacing: 0.92 },
    accent: { intensity: "field", panelTransparency: 90, zebra: true, topBar: true, geometry: false },
    images: { framing: "inset", figureNumbers: true },
    tables: { numbersLead: true },
    prose: false,
  },
};

/** Resolve a style id (or nothing) to its tokens. Unknown / missing → pitch,
 *  so persisted settings from before styles existed keep rendering as before. */
export function resolveDeckStyle(id?: DeckStyleId | string | null): DeckStyleTokens {
  return STYLE_TOKENS[isDeckStyleId(id) ? id : DEFAULT_DECK_STYLE];
}

// ── Shared scale helpers (both renderers MUST use these, never inline math) ──

/** Round a scaled point size to the nearest 0.5 pt. */
const halfPt = (v: number): number => Math.round(v * 2) / 2;

export interface DeckScale {
  /** display / heading sizes */
  T: (pt: number) => number;
  /** running-text sizes */
  B: (pt: number) => number;
  /** kicker / caption / footer sizes */
  C: (pt: number) => number;
  /** vertical-rhythm distances (inches) */
  S: (inches: number) => number;
  /** page margin (inches) */
  M: number;
  /** content width (inches) */
  CW: number;
}

export const DECK_PAGE_WIDTH = 13.333;

export function deckScale(tok: DeckStyleTokens): DeckScale {
  const M = tok.density.margin;
  return {
    T: (pt) => halfPt(pt * tok.type.title),
    B: (pt) => halfPt(pt * tok.type.body),
    C: (pt) => halfPt(pt * tok.type.caption),
    S: (inches) => Math.round(inches * tok.density.spacing * 1000) / 1000,
    M,
    CW: DECK_PAGE_WIDTH - M * 2,
  };
}

/** Ground colors per style for the non-body masters. Cover and closing share
 *  one master and one ground — the field treatment is the only one on the
 *  primary color; every other treatment sits on paper, so a single brand
 *  mark (kit.leadLogoUrl) reads on both bookends. Section follows its
 *  variant; the bleed image slide is always ink and the inset one sits on
 *  the body master. */
export const coverOnPaper = (tok: DeckStyleTokens): boolean => tok.cover !== "field";
export const closingOnPaper = (tok: DeckStyleTokens): boolean => coverOnPaper(tok);
export const sectionOnPaper = (tok: DeckStyleTokens): boolean => tok.section === "rule";
