// deckGround — per-slide ground + accent resolution shared by BOTH renderers.
//
// A style (deckStyle.ts) decides which ground every layout sits on: the
// field cover on the primary colour, section dividers on ink, everything
// else on paper. Deck feedback can override that per slide
// (SlideOverrides.ground / accent / hideLogo — deckOps.ts). This module is
// the single place that turns { layout, style, override } into what a
// renderer actually needs — the ground hex, which cover treatment / section
// variant / image framing to draw, an accent-adjusted token set, and a
// GROUND-RELATIVE palette — so deckBuilder (pptx) and deckSlideHtml
// (preview / PDF) resolve identical answers.
//
// Two families of layout variant:
//   · paper-native — designed for a paper ground (every body layout, the
//     quiet / editorial / grid covers, the "rule" section, the inset
//     render). On a dark override ground their palette ROLES swap: titles
//     and body go paper, the ground colour takes the paper role, muted and
//     hairlines are mixed toward the ground.
//   · dark-native — designed for a dark ground (field cover, the numeral
//     sections, the bleed render, the field closing). They keep the base
//     palette and mix their soft text toward the effective ground hex. A
//     PAPER override on one of these switches it to its paper-native
//     sibling (field → quiet, number/display/index → rule, bleed → inset),
//     so "put the cover on white" reads like the executive cover.
//
// With no override every value here equals what the style alone implies,
// so decks compiled before overrides existed render byte-identically.

import type { BrandKit } from "./brandKit";
import type { SlideLayout, SlideSpec } from "./deckSpec";
import type { SlideOverrides } from "./deckOps";
import {
  closingOnPaper,
  coverOnPaper,
  sectionOnPaper,
  type DeckAccentIntensity,
  type DeckCoverTreatment,
  type DeckSectionVariant,
  type DeckStyleTokens,
} from "./deckStyle";
import { contrastRatio, normalizeHex, DEFAULT_INK, DEFAULT_PAPER } from "./logoContrast";

export type SlideGround = NonNullable<SlideOverrides["ground"]>;
export type SlideAccent = NonNullable<SlideOverrides["accent"]>;

/** Fallback primary when the kit carries no usable hex — mirrors the
 *  renderers' own fallback. */
export const DEFAULT_PRIMARY = "#0B1B2B";

// ── Colour helpers (identical math to both renderers' mixers) ────────────────

/** Linear mix of two '#RRGGBB' colours: t=1 → a, t=0 → b. */
export function mixHex6(a: string, b: string, t: number): string {
  const pa = (normalizeHex(a) ?? "#000000").slice(1);
  const pb = (normalizeHex(b) ?? "#FFFFFF").slice(1);
  const ch = (i: number) =>
    Math.round(parseInt(pa.slice(i, i + 2), 16) * t + parseInt(pb.slice(i, i + 2), 16) * (1 - t))
      .toString(16)
      .padStart(2, "0");
  return "#" + (ch(0) + ch(2) + ch(4)).toUpperCase();
}

/** The three ground hexes a deck can use, normalised. */
export interface KitGrounds {
  primary: string;
  paper: string;
  ink: string;
}

export function kitGrounds(kit: Pick<BrandKit, "primary" | "paper" | "ink">): KitGrounds {
  return {
    primary: normalizeHex(kit.primary) ?? DEFAULT_PRIMARY,
    paper: normalizeHex(kit.paper) ?? DEFAULT_PAPER,
    ink: normalizeHex(kit.ink) ?? DEFAULT_INK,
  };
}

export const groundHexFor = (grounds: KitGrounds, ground: SlideGround): string => grounds[ground];

// ── Accent ───────────────────────────────────────────────────────────────────

const ACCENT_STEPS: readonly DeckAccentIntensity[] = ["hairline", "tint", "field"];

/** Panel transparency each intensity carries (mirrors the style presets). */
const panelTransparencyFor = (intensity: DeckAccentIntensity): number =>
  intensity === "hairline" ? 100 : intensity === "field" ? 90 : 95;

/** Step the style's accent block one notch quieter or louder for a slide.
 *  quiet drops the top bar and the field geometry; loud turns them on. */
export function accentTokensFor(tok: DeckStyleTokens, accent?: SlideAccent | null): DeckStyleTokens {
  if (!accent || accent === "normal") return tok;
  const i = ACCENT_STEPS.indexOf(tok.accent.intensity);
  const j = accent === "quiet" ? Math.max(0, i - 1) : Math.min(ACCENT_STEPS.length - 1, i + 1);
  const intensity = ACCENT_STEPS[j];
  const panelTransparency = panelTransparencyFor(intensity);
  return {
    ...tok,
    accent:
      accent === "quiet"
        ? { intensity, panelTransparency, zebra: intensity !== "hairline" && tok.accent.zebra, topBar: false, geometry: false }
        : { intensity, panelTransparency, zebra: true, topBar: true, geometry: true },
  };
}

// ── Resolution ───────────────────────────────────────────────────────────────

/** The ground a layout sits on for a style, before any override. */
export function defaultSlideGround(layout: SlideLayout, tok: DeckStyleTokens): SlideGround {
  switch (layout) {
    case "cover":
      return coverOnPaper(tok) ? "paper" : "primary";
    case "closing":
      return closingOnPaper(tok) ? "paper" : "primary";
    case "section":
      return sectionOnPaper(tok) ? "paper" : "ink";
    case "renderFull":
      return tok.images.framing === "inset" ? "paper" : "ink";
    default:
      return "paper";
  }
}

export interface SlideResolution {
  ground: SlideGround;
  /** '#RRGGBB' of the effective ground. */
  groundHex: string;
  onPaper: boolean;
  /** Effective cover treatment (cover slides). */
  cover: DeckCoverTreatment;
  /** Effective section variant (section slides). */
  section: DeckSectionVariant;
  /** Effective render framing (renderFull slides). */
  framing: DeckStyleTokens["images"]["framing"];
  /** Style tokens with the slide's accent override applied. */
  tok: DeckStyleTokens;
  hideLogo: boolean;
  /** Presenter notes (pptx speaker notes). */
  notes: string | null;
  /** The variant is designed for paper → gets the ground-relative palette
   *  when its ground is dark. */
  paperNative: boolean;
  /** Anything about ground, chrome or accent differs from the bare style —
   *  renderers leave the byte-identical legacy path only when true. */
  overridden: boolean;
}

export function resolveSlide(
  slide: Pick<SlideSpec, "layout">,
  styleTok: DeckStyleTokens,
  grounds: KitGrounds,
  overrides?: SlideOverrides | null,
): SlideResolution {
  const defaultGround = defaultSlideGround(slide.layout, styleTok);
  const ground: SlideGround = overrides?.ground ?? defaultGround;
  const onPaper = ground === "paper";
  const tok = accentTokensFor(styleTok, overrides?.accent);

  const cover: DeckCoverTreatment = onPaper && styleTok.cover === "field" ? "quiet" : styleTok.cover;
  const section: DeckSectionVariant = onPaper
    ? "rule"
    : styleTok.section === "rule"
      ? "number"
      : styleTok.section;
  const framing: DeckStyleTokens["images"]["framing"] = onPaper ? "inset" : "bleed";

  let paperNative: boolean;
  switch (slide.layout) {
    case "cover":
      paperNative = cover !== "field";
      break;
    case "section":
      paperNative = section === "rule";
      break;
    case "closing":
      paperNative = onPaper;
      break;
    case "renderFull":
      paperNative = framing === "inset";
      break;
    default:
      paperNative = true;
  }

  const hideLogo = overrides?.hideLogo === true;
  const accentChanged = !!overrides?.accent && overrides.accent !== "normal";
  const notes = typeof overrides?.notes === "string" && overrides.notes.trim().length > 0 ? overrides.notes : null;

  return {
    ground,
    groundHex: groundHexFor(grounds, ground),
    onPaper,
    cover,
    section,
    framing,
    tok,
    hideLogo,
    notes,
    paperNative,
    overridden: ground !== defaultGround || hideLogo || accentChanged,
  };
}

// ── Ground-relative palette ──────────────────────────────────────────────────

export interface BasePalette {
  primary: string;
  secondary: string;
  ink: string;
  paper: string;
}

export interface GroundPalette extends BasePalette {
  /** ink softened toward the ground — captions, footers, hints */
  muted: string;
  /** hairline dividers */
  line: string;
  /** The slide ground itself (== paper on the legacy path). */
  ground: string;
  /** Text goes light on this ground. */
  darkGround: boolean;
}

/** The palette a paper-native layout draws with on a given ground. On paper
 *  it is the base palette with the legacy muted / line mixes; on a dark
 *  ground the roles swap so titles and body read light; on a light non-paper
 *  ground (a pale brand primary) ink stays ink and primary is only kept for
 *  titles if it still contrasts. */
export function groundPalette(base: BasePalette, groundHex: string): GroundPalette {
  const primary = normalizeHex(base.primary) ?? DEFAULT_PRIMARY;
  const secondary = normalizeHex(base.secondary) ?? "#4F6BE8";
  const ink = normalizeHex(base.ink) ?? DEFAULT_INK;
  const paper = normalizeHex(base.paper) ?? DEFAULT_PAPER;
  const ground = normalizeHex(groundHex) ?? paper;
  if (ground === paper) {
    return {
      primary,
      secondary,
      ink,
      paper,
      muted: mixHex6(ink, paper, 0.55),
      line: mixHex6(ink, paper, 0.14),
      ground,
      darkGround: false,
    };
  }
  const darkGround = contrastRatio(paper, ground) >= contrastRatio(ink, ground);
  if (darkGround) {
    return {
      primary: paper,
      secondary,
      ink: paper,
      paper: ground,
      muted: mixHex6(paper, ground, 0.6),
      line: mixHex6(paper, ground, 0.25),
      ground,
      darkGround,
    };
  }
  return {
    primary: contrastRatio(primary, ground) >= 3 ? primary : ink,
    secondary,
    ink,
    paper: ground,
    muted: mixHex6(ink, ground, 0.55),
    line: mixHex6(ink, ground, 0.14),
    ground,
    darkGround,
  };
}

/** Should this slide draw with the ground-relative palette? */
export const usesGroundPalette = (res: SlideResolution): boolean => res.paperNative && !res.onPaper;

/** Body-master top bar colour: the brand primary on paper, the secondary on
 *  a dark ground (the section-divider language). */
export const topBarHex = (pal: GroundPalette, base: BasePalette): string =>
  pal.darkGround ? (normalizeHex(base.secondary) ?? "#4F6BE8") : pal.primary;

/** Does this slide sit on the body master (paper chrome: bar, footer, page
 *  number)? Mirrors deckBuilder.masterFor / deckSlideHtml.onBodyMaster. */
export function onBodyMaster(layout: SlideLayout, res: SlideResolution): boolean {
  switch (layout) {
    case "cover":
    case "closing":
    case "section":
      return false;
    case "renderFull":
      return res.framing === "inset";
    default:
      return true;
  }
}
