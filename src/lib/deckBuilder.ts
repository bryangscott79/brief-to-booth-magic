// deckBuilder — DeckSpec + BrandKit (+ DeckStyle) → a designed, fully
// editable .pptx.
//
// This is the flagship deliverable path: every slide is drawn with explicit
// geometry from the typed spec (deckSpec.ts), on slide masters that carry
// the brand system, so the client receives a deck that is both beautiful
// AND editable text-by-text in PowerPoint. deckSlideHtml.ts mirrors these
// layouts 1:1 for the on-screen preview — change geometry here, change it
// there.
//
// Craft rules encoded below:
//  · 16:9 (13.333 × 7.5 in), style-set margins (0.6 in for pitch), one
//    master per layout family.
//  · Typography: kit.heading for display, kit.body for text. Never Calibri.
//  · Color: kit primary / secondary / ink / paper + white only; tints are
//    made with fill transparency or ink↔paper mixes — no new hues.
//  · Every text frame has explicit x/y/w/h; long text shrinks or top-aligns
//    in a generous box. Images cover-crop into frames; logos contain-fit.
//  · Style (deckStyle.ts) dresses the geometry — cover treatment, type
//    scale, density, accent intensity, image framing, number-led tables —
//    and never changes content. Sizes go through the shared T/B/C/S scale
//    helpers so the HTML mirror resolves the exact same numbers.

import PptxGenJS from "pptxgenjs";
import type { BrandKit } from "./brandKit";
import type {
  DeckSpec,
  SlideSpec,
  ImageSlot,
  BriefSummarySlide,
  ConceptSlide,
  ElementGridSlide,
  SpatialSlide,
  RenderGridSlide,
  BudgetSlide,
  MaterialsSlide,
  NextStepsSlide,
  ClosingSlide,
  CoverSlide,
  SectionSlide,
  RenderFullSlide,
} from "./deckSpec";
import {
  closingOnPaper,
  coverOnPaper,
  deckScale,
  resolveDeckStyle,
  sectionOnPaper,
  type DeckStyleId,
  type DeckStyleTokens,
} from "./deckStyle";

// ── Geometry constants (inches) — mirrored in deckSlideHtml.ts ───────────────

export const DECK_PAGE = { w: 13.333, h: 7.5 } as const;
/** Legacy (pitch) page margin. Styles may widen it — see deckStyle.density. */
export const DECK_MARGIN = 0.6;

// ── Color plumbing ────────────────────────────────────────────────────────────

/** '#8FD3F4' | '8FD3F4' | '#f0a' → '8FD3F4' (pptx wants bare 6-hex). */
export function pptxHex(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const c = String(input).replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return c.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(c)) return c.split("").map((ch) => ch + ch).join("").toUpperCase();
  return fallback;
}

/** Linear mix of two hex colors: t=1 → a, t=0 → b. Used to derive muted
 *  grays and tints without leaving the kit palette. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = pptxHex(a, "000000");
  const pb = pptxHex(b, "FFFFFF");
  const ch = (i: number) =>
    Math.round(
      parseInt(pa.slice(i, i + 2), 16) * t + parseInt(pb.slice(i, i + 2), 16) * (1 - t),
    )
      .toString(16)
      .padStart(2, "0");
  return (ch(0) + ch(2) + ch(4)).toUpperCase();
}

interface Palette {
  primary: string;
  secondary: string;
  ink: string;
  paper: string;
  /** ink softened toward paper — captions, footers, hints */
  muted: string;
  /** hairline dividers */
  line: string;
}

function paletteFrom(kit: BrandKit): Palette {
  const ink = pptxHex(kit.ink, "101418");
  const paper = pptxHex(kit.paper, "FFFFFF");
  return {
    primary: pptxHex(kit.primary, "0B1B2B"),
    secondary: pptxHex(kit.secondary, "4F6BE8"),
    ink,
    paper,
    muted: mixHex(ink, paper, 0.55),
    line: mixHex(ink, paper, 0.14),
  };
}

// ── Image fetching (concurrency 4, graceful skip) ─────────────────────────────

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface DeckBuildOptions {
  onProgress?: (stage: string, done: number, total: number) => void;
  /** Called once per image that failed to download (slide keeps its layout,
   *  the frame is simply omitted / falls back). */
  onImageSkipped?: (url: string, label: string) => void;
  /** Style preset (deckStyle.ts). Omit → "pitch", today's design. */
  style?: DeckStyleId | DeckStyleTokens | null;
}

async function fetchAllImages(
  entries: Array<{ url: string; label: string }>,
  opts: DeckBuildOptions,
): Promise<Map<string, string>> {
  const unique = new Map<string, string>(); // url → label (first wins)
  for (const e of entries) if (e.url && !unique.has(e.url)) unique.set(e.url, e.label);
  const urls = [...unique.keys()];
  const out = new Map<string, string>();
  let done = 0;
  const CONCURRENCY = 4;

  const worker = async () => {
    while (urls.length) {
      const url = urls.shift();
      if (!url) return;
      const data = await urlToDataUrl(url);
      done += 1;
      opts.onProgress?.("Downloading images", done, unique.size);
      if (data) out.set(url, data);
      else opts.onImageSkipped?.(url, unique.get(url) ?? url);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

/** Every image URL a spec references (renders + logos). */
function collectImageEntries(spec: DeckSpec, kit: BrandKit): Array<{ url: string; label: string }> {
  const entries: Array<{ url: string; label: string }> = [];
  if (kit.leadLogoUrl) entries.push({ url: kit.leadLogoUrl, label: "Lead logo" });
  if (kit.coLogoUrl) entries.push({ url: kit.coLogoUrl, label: "Co-brand logo" });
  for (const slide of spec.slides) {
    switch (slide.layout) {
      case "renderFull":
        entries.push(slide.image);
        break;
      case "renderGrid":
        entries.push(...slide.images);
        break;
      case "spatial":
        if (slide.image) entries.push(slide.image);
        break;
      default:
        break;
    }
  }
  return entries;
}

// ── Master names ──────────────────────────────────────────────────────────────

const MASTER = {
  cover: "CANOPY_COVER",
  section: "CANOPY_SECTION",
  body: "CANOPY_BODY",
  image: "CANOPY_IMAGE",
} as const;

/** Grid-cover meta strip cells, in order. Empty values are dropped so the
 *  strip never shows a blank fact. Mirrored in deckSlideHtml.ts. */
export function coverMetaCells(meta: DeckSpec["meta"]): Array<[string, string]> {
  const cells: Array<[string, string | undefined]> = [
    ["Client", meta.clientName],
    ["Show", meta.showName],
    ["Footprint", meta.boothSize],
    ["Date", meta.dateLabel],
  ];
  return cells.filter((c): c is [string, string] => !!c[1] && c[1].trim().length > 0);
}

/** Section-index meta row. Mirrored in deckSlideHtml.ts. */
export function sectionMetaLine(meta: DeckSpec["meta"]): string {
  return [meta.projectName, meta.boothSize, meta.showName]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join("   ·   ")
    .toUpperCase();
}

/** Prose form of a list (editorial): sentence-cased items ending in a period,
 *  run together. Mirrored in deckSlideHtml.ts. */
export function proseJoin(items: string[]): string {
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?…]$/.test(s) ? s : s + "."))
    .join(" ");
}

/** Figure-numbered caption ("01 — Aisle left"). Mirrored in deckSlideHtml.ts. */
export const figureCaption = (label: string, i: number, on: boolean): string =>
  on ? `${String(i + 1).padStart(2, "0")} — ${label}` : label;

// ── The builder ───────────────────────────────────────────────────────────────

export async function buildDeckPptx(
  spec: DeckSpec,
  kit: BrandKit,
  opts: DeckBuildOptions = {},
): Promise<Blob> {
  const pal = paletteFrom(kit);
  const HEAD = kit.heading.family;
  const BODY = kit.body.family;
  const tok = typeof opts.style === "object" && opts.style ? opts.style : resolveDeckStyle(opts.style);
  const { T, B, C, S, M, CW } = deckScale(tok);
  const hairline = tok.accent.intensity === "hairline";
  const field = tok.accent.intensity === "field";

  const images = await fetchAllImages(collectImageEntries(spec, kit), opts);
  const leadLogo = kit.leadLogoUrl ? images.get(kit.leadLogoUrl) ?? null : null;
  const coLogo = kit.coLogoUrl ? images.get(kit.coLogoUrl) ?? null : null;

  const pres = new PptxGenJS();
  pres.defineLayout({ name: "CANOPY_WIDE", width: DECK_PAGE.w, height: DECK_PAGE.h });
  pres.layout = "CANOPY_WIDE";
  pres.author = spec.meta.agencyName;
  pres.company = spec.meta.agencyName;
  pres.subject = "Booth Design Proposal";
  pres.title = spec.meta.projectName;

  // ── Masters ────────────────────────────────────────────────────────────
  // Cover + closing: primary field (pitch) or paper (quiet / editorial /
  // grid); the grid treatment carries the body brand bar. The soft field
  // geometry is drawn per slide (drawFieldGeometry) — master objects only
  // accept rect/line/image/text, so ellipses there are silently dropped.
  pres.defineSlideMaster({
    title: MASTER.cover,
    background: { color: coverOnPaper(tok) ? pal.paper : pal.primary },
    objects:
      tok.cover === "grid"
        ? [{ rect: { x: 0, y: 0, w: DECK_PAGE.w, h: 0.09, fill: { color: pal.primary } } }]
        : [],
  });

  // Section divider: ink ground (paper for the "rule" variant); the numeral
  // variants carry a secondary top bar.
  pres.defineSlideMaster({
    title: MASTER.section,
    background: { color: sectionOnPaper(tok) ? pal.paper : pal.ink },
    objects:
      tok.section === "number" || tok.section === "index"
        ? [{ rect: { x: 0, y: 0, w: DECK_PAGE.w, h: 0.09, fill: { color: pal.secondary } } }]
        : [],
  });

  // Content: paper ground, (optional) top brand bar, footer (lead name ·
  // page number, co-brand mark when blending).
  const bodyObjects: PptxGenJS.SlideMasterProps["objects"] = [
    ...(tok.accent.topBar
      ? [{ rect: { x: 0, y: 0, w: DECK_PAGE.w, h: 0.09, fill: { color: pal.primary } } }]
      : []),
    { rect: { x: M, y: 7.02, w: CW, h: 0.008, fill: { color: pal.line } } },
    {
      text: {
        text: (kit.leadName ?? spec.meta.agencyName).toUpperCase(),
        options: {
          x: M, y: 7.08, w: 6, h: 0.3, fontFace: BODY, fontSize: C(8),
          color: pal.muted, charSpacing: 2, align: "left", valign: "middle",
        },
      },
    },
  ];
  if (coLogo) {
    bodyObjects.push({
      image: { x: 11.35, y: 7.06, w: 1.0, h: 0.3, data: coLogo, sizing: { type: "contain", w: 1.0, h: 0.3 } },
    });
  }
  pres.defineSlideMaster({
    title: MASTER.body,
    background: { color: pal.paper },
    objects: bodyObjects,
    slideNumber: {
      x: 12.55, y: 7.08, w: 0.4, h: 0.3,
      fontFace: BODY, fontSize: C(8), color: pal.muted, align: "right",
    },
  });

  // Full-bleed image slides: ink ground (visible only while images load /
  // if a frame was skipped), no footer furniture.
  pres.defineSlideMaster({
    title: MASTER.image,
    background: { color: pal.ink },
    objects: [],
  });

  // ── Shared drawing helpers ─────────────────────────────────────────────
  const total = spec.slides.length;

  /** Content-slide title block: small caps kicker + display title. */
  const addTitle = (slide: PptxGenJS.Slide, kicker: string, title: string) => {
    slide.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: CW, h: 0.3, fontFace: BODY, fontSize: C(9),
      color: pal.secondary, charSpacing: 3, bold: true,
    });
    slide.addText(title, {
      x: M - 0.03, y: 0.68, w: CW, h: 0.65, fontFace: HEAD, fontSize: T(24),
      color: pal.primary, bold: true, fit: "shrink",
    });
  };

  const addCoverImageOr = (slide: PptxGenJS.Slide, slot: ImageSlot, box: { x: number; y: number; w: number; h: number }) => {
    const data = images.get(slot.url);
    if (data) {
      slide.addImage({ data, ...box, sizing: { type: "cover", w: box.w, h: box.h } });
    } else {
      // Skipped image → quiet tinted frame with the label, never a broken box.
      slide.addShape("rect", { ...box, fill: { color: pal.primary, transparency: 94 }, line: { color: pal.line, width: 0.75 } });
      slide.addText(slot.label, {
        ...box, fontFace: BODY, fontSize: C(10), color: pal.muted, align: "center", valign: "middle",
      });
    }
  };

  const addLogo = (slide: PptxGenJS.Slide, data: string | null, x: number, y: number, w: number, h: number) => {
    if (data) slide.addImage({ data, x, y, w, h, sizing: { type: "contain", w, h } });
  };

  /** Soft geometric accents for the field treatment: a large secondary
   *  circle cropping the top-right, a faint paper arc bottom-left. Drawn
   *  first so content sits above. Mirrors deckSlideHtml.fieldGeometry. */
  const drawFieldGeometry = (slide: PptxGenJS.Slide) => {
    if (!tok.accent.geometry) return;
    slide.addShape("ellipse", { x: 9.1, y: -2.9, w: 7.6, h: 7.6, fill: { color: pal.secondary, transparency: 72 } });
    slide.addShape("ellipse", { x: 10.6, y: -1.4, w: 4.6, h: 4.6, fill: { color: pal.secondary, transparency: 55 } });
    slide.addShape("ellipse", { x: -2.2, y: 5.6, w: 5.2, h: 5.2, fill: { color: pal.paper, transparency: 92 } });
  };

  // ── Layout renderers ───────────────────────────────────────────────────

  const drawCover = (s: PptxGenJS.Slide, d: CoverSlide) => {
    const footer = `${spec.meta.agencyName}   ·   ${spec.meta.dateLabel}`;
    switch (tok.cover) {
      case "quiet": {
        addLogo(s, leadLogo, M, 0.55, 2.2, 0.62);
        s.addShape("rect", { x: M, y: 1.42, w: CW, h: 0.02, fill: { color: pal.primary } });
        s.addText(d.eyebrow.toUpperCase(), {
          x: M, y: 2.78, w: 10.5, h: 0.4, fontFace: BODY, fontSize: C(11),
          color: pal.muted, charSpacing: 3, bold: true,
        });
        s.addText(d.title, {
          x: M - 0.05, y: 3.12, w: 10.6, h: 1.95, fontFace: HEAD, fontSize: T(44),
          color: pal.primary, bold: true, fit: "shrink", valign: "top", lineSpacing: T(48),
        });
        s.addText(d.subtitle, {
          x: M, y: 5.1, w: 9.5, h: 0.5, fontFace: BODY, fontSize: B(16), color: pal.ink,
        });
        s.addShape("rect", { x: M, y: 6.55, w: CW, h: 0.008, fill: { color: pal.line } });
        s.addText(footer, {
          x: M, y: 6.78, w: 8, h: 0.35, fontFace: BODY, fontSize: C(10), color: pal.muted, charSpacing: 1,
        });
        addLogo(s, coLogo, 11.0, 6.62, 1.73, 0.55);
        return;
      }
      case "editorial": {
        s.addText(d.eyebrow.toUpperCase(), {
          x: M, y: 0.6, w: 8, h: 0.3, fontFace: BODY, fontSize: C(9),
          color: pal.muted, charSpacing: 3, bold: true,
        });
        addLogo(s, leadLogo, DECK_PAGE.w - M - 2.2, 0.42, 2.2, 0.62);
        s.addShape("rect", { x: M, y: 0.98, w: CW, h: 0.012, fill: { color: pal.ink } });
        s.addText(d.title, {
          x: M - 0.06, y: 1.3, w: CW, h: 3.7, fontFace: HEAD, fontSize: T(64),
          color: pal.ink, bold: true, fit: "shrink", valign: "top", lineSpacing: T(66),
        });
        s.addShape("rect", { x: M + 0.02, y: 5.2, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
        s.addText(d.subtitle, {
          x: M, y: 5.35, w: 9.5, h: 0.6, fontFace: BODY, fontSize: B(18), italic: true,
          color: mixHex(pal.ink, pal.paper, 0.72),
        });
        s.addShape("rect", { x: M, y: 6.55, w: CW, h: 0.008, fill: { color: pal.line } });
        s.addText(footer, {
          x: M, y: 6.78, w: 8, h: 0.35, fontFace: BODY, fontSize: C(10), color: pal.muted, charSpacing: 1,
        });
        addLogo(s, coLogo, 11.0, 6.62, 1.73, 0.55);
        return;
      }
      case "grid": {
        addLogo(s, leadLogo, M, 0.55, 2.2, 0.62);
        s.addText(d.eyebrow.toUpperCase(), {
          x: M, y: 1.95, w: 10.5, h: 0.3, fontFace: BODY, fontSize: C(10),
          color: pal.secondary, charSpacing: 3, bold: true,
        });
        s.addText(d.title, {
          x: M - 0.05, y: 2.3, w: 10.6, h: 1.6, fontFace: HEAD, fontSize: T(40),
          color: pal.primary, bold: true, fit: "shrink", valign: "top", lineSpacing: T(44),
        });
        s.addText(d.subtitle, {
          x: M, y: 3.95, w: 9.5, h: 0.5, fontFace: BODY, fontSize: B(14), color: pal.ink,
        });
        s.addShape("rect", { x: M, y: 5.3, w: CW, h: 0.014, fill: { color: pal.primary } });
        const cellW = CW / 4;
        coverMetaCells(spec.meta).forEach(([label, value], i) => {
          const x = M + i * cellW;
          if (i > 0) s.addShape("rect", { x: x - 0.12, y: 5.48, w: 0.008, h: 0.85, fill: { color: pal.line } });
          s.addText(label.toUpperCase(), {
            x, y: 5.48, w: cellW - 0.24, h: 0.26, fontFace: BODY, fontSize: C(8.5),
            color: pal.muted, charSpacing: 2, bold: true,
          });
          s.addText(value, {
            x, y: 5.74, w: cellW - 0.24, h: 0.5, fontFace: HEAD, fontSize: T(14),
            color: pal.primary, bold: true, fit: "shrink", valign: "top",
          });
        });
        s.addShape("rect", { x: M, y: 6.55, w: CW, h: 0.008, fill: { color: pal.line } });
        s.addText(footer, {
          x: M, y: 6.78, w: 8, h: 0.35, fontFace: BODY, fontSize: C(10), color: pal.muted, charSpacing: 1,
        });
        addLogo(s, coLogo, 11.0, 6.62, 1.73, 0.55);
        return;
      }
      case "field":
      default: {
        drawFieldGeometry(s);
        addLogo(s, leadLogo, M, 0.55, 2.2, 0.62);
        s.addShape("rect", { x: M + 0.02, y: 2.62, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
        s.addText(d.eyebrow.toUpperCase(), {
          x: M, y: 2.78, w: 10.5, h: 0.4, fontFace: BODY, fontSize: C(11),
          color: mixHex(pal.paper, pal.primary, 0.78), charSpacing: 3, bold: true,
        });
        s.addText(d.title, {
          x: M - 0.05, y: 3.12, w: 10.6, h: 1.95, fontFace: HEAD, fontSize: T(48),
          color: pal.paper, bold: true, fit: "shrink", valign: "top", lineSpacing: T(52),
        });
        s.addText(d.subtitle, {
          x: M, y: 5.1, w: 9.5, h: 0.5, fontFace: BODY, fontSize: B(16),
          color: mixHex(pal.paper, pal.primary, 0.9),
        });
        s.addText(footer, {
          x: M, y: 6.78, w: 8, h: 0.35, fontFace: BODY, fontSize: C(10),
          color: mixHex(pal.paper, pal.primary, 0.65), charSpacing: 1,
        });
        addLogo(s, coLogo, 11.0, 6.62, 1.73, 0.55);
        return;
      }
    }
  };

  const drawSection = (s: PptxGenJS.Slide, d: SectionSlide) => {
    const num = String(d.number).padStart(2, "0");
    switch (tok.section) {
      case "rule": {
        s.addText(num, {
          x: DECK_PAGE.w - M - 2.4, y: 3.42, w: 2.4, h: 1.2, fontFace: HEAD, fontSize: T(34), bold: true,
          color: mixHex(pal.primary, pal.paper, 0.3), align: "right", valign: "middle",
        });
        s.addText(`SECTION ${num}`, {
          x: M, y: 3.02, w: 5, h: 0.3, fontFace: BODY, fontSize: C(10),
          color: pal.muted, charSpacing: 4, bold: true,
        });
        s.addShape("rect", { x: M, y: 3.38, w: CW, h: 0.012, fill: { color: pal.primary } });
        s.addText(d.title, {
          x: M - 0.03, y: 3.5, w: 8.2, h: 1.1, fontFace: HEAD, fontSize: T(34),
          color: pal.primary, bold: true, fit: "shrink",
        });
        if (d.subtitle) {
          s.addText(d.subtitle, {
            x: M, y: 4.6, w: 7.4, h: 0.6, fontFace: BODY, fontSize: B(13), color: pal.muted,
          });
        }
        return;
      }
      case "display": {
        s.addText(`SECTION ${num}`, {
          x: M, y: 1.2, w: 5, h: 0.35, fontFace: BODY, fontSize: C(10),
          color: pal.secondary, charSpacing: 4, bold: true,
        });
        s.addText(d.title, {
          x: M - 0.06, y: 1.6, w: CW, h: 3.6, fontFace: HEAD, fontSize: T(64),
          color: pal.paper, bold: true, fit: "shrink", valign: "top", lineSpacing: T(66),
        });
        s.addShape("rect", { x: M + 0.02, y: 5.32, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
        if (d.subtitle) {
          s.addText(d.subtitle, {
            x: M, y: 5.48, w: 9, h: 0.7, fontFace: BODY, fontSize: B(15), italic: true,
            color: mixHex(pal.paper, pal.ink, 0.7),
          });
        }
        return;
      }
      case "index": {
        s.addShape("rect", { x: M, y: 2.85, w: 0.95, h: 0.95, fill: { color: pal.secondary } });
        s.addText(num, {
          x: M, y: 2.85, w: 0.95, h: 0.95, fontFace: HEAD, fontSize: T(28), bold: true,
          color: pal.paper, align: "center", valign: "middle",
        });
        s.addText(d.title, {
          x: M + 1.2, y: 2.85, w: 8.5, h: 0.95, fontFace: HEAD, fontSize: T(34),
          color: pal.paper, bold: true, fit: "shrink", valign: "middle",
        });
        if (d.subtitle) {
          s.addText(d.subtitle, {
            x: M + 1.2, y: 3.85, w: 7.4, h: 0.6, fontFace: BODY, fontSize: B(13),
            color: mixHex(pal.paper, pal.ink, 0.62),
          });
        }
        s.addShape("rect", { x: M, y: 6.3, w: CW, h: 0.008, fill: { color: mixHex(pal.paper, pal.ink, 0.25) } });
        s.addText(sectionMetaLine(spec.meta), {
          x: M, y: 6.42, w: CW, h: 0.35, fontFace: BODY, fontSize: C(9),
          color: mixHex(pal.paper, pal.ink, 0.6), charSpacing: 2, bold: true,
        });
        return;
      }
      case "number":
      default: {
        s.addText(num, {
          x: 6.6, y: 0.7, w: 6.4, h: 6.4, fontFace: HEAD, fontSize: 250, bold: true,
          color: mixHex(pal.secondary, pal.ink, 0.42), align: "right", valign: "middle",
        });
        s.addShape("rect", { x: M + 0.02, y: 3.02, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
        s.addText(`SECTION ${num}`, {
          x: M, y: 3.18, w: 5, h: 0.35, fontFace: BODY, fontSize: C(10),
          color: pal.secondary, charSpacing: 4, bold: true,
        });
        s.addText(d.title, {
          x: M - 0.03, y: 3.5, w: 8.2, h: 1.1, fontFace: HEAD, fontSize: T(34),
          color: pal.paper, bold: true, fit: "shrink",
        });
        if (d.subtitle) {
          s.addText(d.subtitle, {
            x: M, y: 4.6, w: 7.4, h: 0.6, fontFace: BODY, fontSize: B(13),
            color: mixHex(pal.paper, pal.ink, 0.62),
          });
        }
        return;
      }
    }
  };

  const drawBriefSummary = (s: PptxGenJS.Slide, d: BriefSummarySlide) => {
    addTitle(s, "The Ask", d.title);
    // Left rail: facts.
    let y = 1.75;
    for (const f of d.facts.slice(0, 5)) {
      s.addText(f.label.toUpperCase(), {
        x: M, y, w: 4.2, h: 0.26, fontFace: BODY, fontSize: C(8.5),
        color: pal.muted, charSpacing: 2, bold: true,
      });
      s.addText(f.value, {
        x: M, y: y + 0.24, w: 4.2, h: 0.55, fontFace: BODY, fontSize: B(13.5),
        color: pal.ink, bold: true, fit: "shrink", valign: "top",
      });
      y += S(0.92);
      s.addShape("rect", { x: M, y: y - 0.12, w: 4.2, h: 0.008, fill: { color: pal.line } });
    }
    // Right: objectives then audiences.
    const rx = 5.55;
    const rw = DECK_PAGE.w - M - rx;
    let ry = 1.75;
    if (d.objectives.length) {
      s.addText("OBJECTIVES", {
        x: rx, y: ry, w: rw, h: 0.26, fontFace: BODY, fontSize: C(8.5),
        color: pal.secondary, charSpacing: 2, bold: true,
      });
      ry += 0.32;
      if (tok.prose) {
        const h = S(0.56) * d.objectives.length;
        s.addText(proseJoin(d.objectives), {
          x: rx, y: ry, w: rw, h, fontFace: BODY, fontSize: B(12.5),
          color: pal.ink, valign: "top", fit: "shrink", lineSpacing: B(19),
        });
        ry += h;
      } else {
        for (const o of d.objectives) {
          s.addShape("rect", { x: rx + 0.02, y: ry + 0.09, w: 0.14, h: 0.045, fill: { color: pal.secondary } });
          s.addText(o, {
            x: rx + 0.3, y: ry, w: rw - 0.3, h: 0.52, fontFace: BODY, fontSize: B(11.5),
            color: pal.ink, valign: "top", fit: "shrink",
          });
          ry += S(0.56);
        }
      }
      ry += 0.18;
    }
    if (d.audiences.length) {
      s.addText("WHO WE'RE DESIGNING FOR", {
        x: rx, y: ry, w: rw, h: 0.26, fontFace: BODY, fontSize: C(8.5),
        color: pal.secondary, charSpacing: 2, bold: true,
      });
      ry += 0.34;
      for (const a of d.audiences) {
        s.addText(
          [
            { text: a.name, options: { bold: true, color: pal.primary } },
            { text: a.description ? "  —  " + a.description : "", options: { color: pal.muted } },
          ],
          { x: rx, y: ry, w: rw, h: 0.5, fontFace: BODY, fontSize: B(10.5), valign: "top", fit: "shrink" },
        );
        ry += S(0.5);
      }
    }
  };

  const drawConcept = (s: PptxGenJS.Slide, d: ConceptSlide) => {
    s.addText("THE BIG IDEA", {
      x: M, y: 0.55, w: CW, h: 0.3, fontFace: BODY, fontSize: C(9),
      color: pal.secondary, charSpacing: 3, bold: true,
    });
    s.addText(d.headline, {
      x: M - 0.04, y: 0.9, w: 9.2, h: 1.7, fontFace: HEAD, fontSize: T(32),
      color: pal.primary, bold: true, fit: "shrink", valign: "top", lineSpacing: T(36),
    });
    let ny = 2.7;
    if (d.subheadline) {
      s.addText(d.subheadline, {
        x: M, y: ny, w: 7.2, h: 0.55, fontFace: BODY, fontSize: B(14),
        color: pal.secondary, italic: true, fit: "shrink", valign: "top",
      });
      ny += 0.62;
    }
    s.addText(d.narrative, {
      x: M, y: ny, w: 7.2, h: 6.55 - ny, fontFace: BODY, fontSize: B(12.5),
      color: pal.ink, valign: "top", lineSpacing: B(19), fit: "shrink",
    });
    // Supporting points down the right: numbered chips, or (prose) stacked
    // deks under hairlines with a small numeral.
    const px = 8.35;
    const pw = DECK_PAGE.w - M - px;
    let py = 2.7;
    d.points.forEach((point, i) => {
      if (tok.prose) {
        s.addShape("rect", { x: px, y: py, w: pw, h: 0.008, fill: { color: pal.line } });
        s.addText(String(i + 1).padStart(2, "0"), {
          x: px, y: py + 0.1, w: 0.5, h: 0.3, fontFace: BODY, fontSize: C(9), bold: true,
          color: pal.secondary, charSpacing: 2,
        });
        s.addText(point, {
          x: px + 0.5, y: py + 0.08, w: pw - 0.5, h: 1.05, fontFace: BODY, fontSize: B(11.5),
          color: pal.ink, valign: "top", fit: "shrink",
        });
      } else {
        s.addShape("ellipse", { x: px, y: py, w: 0.34, h: 0.34, fill: { color: pal.primary } });
        s.addText(String(i + 1), {
          x: px, y: py, w: 0.34, h: 0.34, fontFace: HEAD, fontSize: T(11), bold: true,
          color: pal.paper, align: "center", valign: "middle",
        });
        s.addText(point, {
          x: px + 0.5, y: py - 0.03, w: pw - 0.5, h: 1.15, fontFace: BODY, fontSize: B(10.5),
          color: pal.ink, valign: "top", fit: "shrink",
        });
      }
      py += S(1.28);
    });
  };

  const drawElementGrid = (s: PptxGenJS.Slide, d: ElementGridSlide) => {
    addTitle(s, "The Concept", d.title);
    const cards = d.cards.slice(0, 6);
    const cols = cards.length <= 4 ? 2 : 3;
    const rows = Math.ceil(cards.length / cols);
    const gap = S(0.26);
    const cw = (CW - gap * (cols - 1)) / cols;
    const chAvail = 6.85 - 1.62;
    const ch = Math.min(2.42, (chAvail - gap * (rows - 1)) / rows);
    cards.forEach((card, i) => {
      const cx = M + (i % cols) * (cw + gap);
      const cy = 1.62 + Math.floor(i / cols) * (ch + gap);
      if (hairline) {
        s.addShape("rect", { x: cx, y: cy, w: cw, h: 0.008, fill: { color: pal.line } });
      } else {
        s.addShape("roundRect", {
          x: cx, y: cy, w: cw, h: ch, rectRadius: 0.08,
          fill: { color: pal.primary, transparency: tok.accent.panelTransparency },
          line: { color: pal.line, width: 0.75 },
        });
      }
      s.addShape("rect", { x: cx + 0.24, y: cy + 0.28, w: 0.42, h: 0.05, fill: { color: pal.secondary } });
      s.addText(card.title, {
        x: cx + 0.2, y: cy + 0.38, w: cw - 0.44, h: 0.5, fontFace: HEAD, fontSize: T(13),
        color: pal.primary, bold: true, fit: "shrink", valign: "top",
      });
      s.addText(card.body, {
        x: cx + 0.2, y: cy + 0.88, w: cw - 0.44, h: ch - 1.05, fontFace: BODY, fontSize: B(9.5),
        color: mixHex(pal.ink, pal.paper, 0.82), valign: "top", fit: "shrink", lineSpacing: B(13),
      });
    });
  };

  const drawSpatial = (s: PptxGenJS.Slide, d: SpatialSlide) => {
    addTitle(s, "The Space", d.title);
    const hasImage = !!d.image;
    const tableX = hasImage ? 7.5 : M;
    const tableW = DECK_PAGE.w - M - tableX;
    const lead = tok.tables.numbersLead;

    if (d.image) {
      const box = { x: M, y: 1.62, w: 6.55, h: 4.75 };
      s.addShape("rect", {
        x: box.x - 0.04, y: box.y - 0.04, w: box.w + 0.08, h: box.h + 0.08,
        fill: { color: pal.paper }, line: { color: pal.line, width: 1 },
      });
      const data = images.get(d.image.url);
      if (data) {
        s.addImage({ data, ...box, sizing: { type: "contain", w: box.w, h: box.h } });
      } else {
        s.addText(d.image.label, { ...box, fontFace: BODY, fontSize: C(10), color: pal.muted, align: "center", valign: "middle" });
      }
      s.addText(d.image.label.toUpperCase(), {
        x: box.x, y: box.y + box.h + 0.08, w: box.w, h: 0.28, fontFace: BODY, fontSize: C(8.5),
        color: pal.muted, charSpacing: 2,
      });
    }

    // Zone table: header, hairline rows, sqft column (trailing right-aligned,
    // or leading in the heading face when numbers lead), bold total rule.
    let y = 1.62;
    const headOpts = { fontFace: BODY, fontSize: C(8.5), color: pal.muted, charSpacing: 2, bold: true } as const;
    if (lead) {
      s.addText("SQ FT", { x: tableX, y, w: 1.4, h: 0.26, ...headOpts });
      s.addText("ZONE", { x: tableX + 1.4, y, w: tableW - 1.4, h: 0.26, ...headOpts });
    } else {
      s.addText("ZONE", { x: tableX, y, w: tableW - 1.4, h: 0.26, ...headOpts });
      s.addText("SQ FT", { x: tableX + tableW - 1.4, y, w: 1.4, h: 0.26, ...headOpts, align: "right" });
    }
    y += 0.32;
    s.addShape("rect", { x: tableX, y, w: tableW, h: 0.014, fill: { color: pal.primary } });
    y += 0.08;
    const rowH = S(d.zones.length > 6 ? 0.5 : 0.58);
    for (const z of d.zones) {
      const nameText = z.note
        ? [
            { text: z.name, options: { bold: true, color: pal.ink } },
            { text: "\n" + z.note, options: { fontSize: C(8.5), color: pal.muted } },
          ]
        : z.name;
      const sqft = z.sqft.toLocaleString("en-US");
      if (lead) {
        s.addText(sqft, {
          x: tableX, y, w: 1.4, h: rowH, fontFace: HEAD, fontSize: T(13),
          color: pal.primary, bold: true, align: "left", valign: "middle",
        });
        s.addText(nameText, {
          x: tableX + 1.4, y, w: tableW - 1.4, h: rowH, fontFace: BODY, fontSize: B(11), color: pal.ink, valign: "middle", fit: "shrink",
        });
      } else {
        s.addText(nameText, {
          x: tableX, y, w: tableW - 1.4, h: rowH, fontFace: BODY, fontSize: B(11), color: pal.ink, valign: "middle", fit: "shrink",
        });
        s.addText(sqft, {
          x: tableX + tableW - 1.4, y, w: 1.4, h: rowH, fontFace: BODY, fontSize: B(11),
          color: pal.ink, bold: true, align: "right", valign: "middle",
        });
      }
      y += rowH;
      s.addShape("rect", { x: tableX, y, w: tableW, h: 0.008, fill: { color: pal.line } });
      y += 0.02;
    }
    if (typeof d.totalSqft === "number") {
      y += 0.06;
      const totalText = d.totalSqft.toLocaleString("en-US");
      if (lead) {
        s.addText(totalText, {
          x: tableX, y, w: 1.6, h: 0.4, fontFace: HEAD, fontSize: T(14),
          color: pal.primary, bold: true, align: "left", valign: "middle",
        });
        s.addText(`${d.boothSize} TOTAL`, {
          x: tableX + 1.6, y, w: tableW - 1.6, h: 0.4, fontFace: BODY, fontSize: C(10),
          color: pal.primary, bold: true, charSpacing: 1, valign: "middle",
        });
      } else {
        s.addText(`${d.boothSize} TOTAL`, {
          x: tableX, y, w: tableW - 1.6, h: 0.4, fontFace: BODY, fontSize: C(10),
          color: pal.primary, bold: true, charSpacing: 1, valign: "middle",
        });
        s.addText(totalText, {
          x: tableX + tableW - 1.6, y, w: 1.6, h: 0.4, fontFace: HEAD, fontSize: T(14),
          color: pal.primary, bold: true, align: "right", valign: "middle",
        });
      }
    }
  };

  const drawRenderFull = (s: PptxGenJS.Slide, d: RenderFullSlide) => {
    if (tok.images.framing === "inset") {
      // Framed inside the margins on the body master; caption beneath.
      addCoverImageOr(s, d.image, { x: M, y: 0.95, w: CW, h: 5.4 });
      s.addShape("rect", { x: M, y: 6.58, w: 0.5, h: 0.045, fill: { color: pal.secondary } });
      s.addText(d.caption.toUpperCase(), {
        x: M + 0.62, y: 6.46, w: 9.5, h: 0.3, fontFace: BODY, fontSize: C(11),
        color: pal.primary, charSpacing: 3, bold: true, valign: "middle",
      });
      s.addText(spec.meta.projectName, {
        x: 9.2, y: 6.46, w: 3.5, h: 0.3, fontFace: BODY, fontSize: C(8.5),
        color: pal.muted, align: "right", valign: "middle", charSpacing: 1,
      });
      return;
    }
    addCoverImageOr(s, d.image, { x: 0, y: 0, w: DECK_PAGE.w, h: DECK_PAGE.h });
    // Caption plate along the bottom — translucent ink so the render shows through.
    s.addShape("rect", {
      x: 0, y: 6.72, w: DECK_PAGE.w, h: 0.78,
      fill: { color: pal.ink, transparency: 28 },
    });
    s.addShape("rect", { x: M, y: 6.98, w: 0.5, h: 0.045, fill: { color: pal.secondary } });
    s.addText(d.caption.toUpperCase(), {
      x: M + 0.62, y: 6.86, w: 9.5, h: 0.3, fontFace: BODY, fontSize: C(11),
      color: pal.paper, charSpacing: 3, bold: true, valign: "middle",
    });
    s.addText(spec.meta.projectName, {
      x: 9.2, y: 6.86, w: 3.5, h: 0.3, fontFace: BODY, fontSize: C(8.5),
      color: mixHex(pal.paper, pal.ink, 0.7), align: "right", valign: "middle", charSpacing: 1,
    });
  };

  const drawRenderGrid = (s: PptxGenJS.Slide, d: RenderGridSlide) => {
    addTitle(s, "The Space", d.title);
    const imgs = d.images.slice(0, 4);
    const gap = S(0.26);
    const capH = 0.3;
    const fig = tok.images.figureNumbers;
    if (imgs.length <= 2) {
      // 2-up: two large frames side by side.
      const fw = (CW - gap) / 2;
      const fh = 4.55;
      imgs.forEach((slot, i) => {
        const x = M + i * (fw + gap);
        addCoverImageOr(s, slot, { x, y: 1.62, w: fw, h: fh });
        s.addText(figureCaption(slot.label, i, fig).toUpperCase(), {
          x, y: 1.62 + fh + 0.08, w: fw, h: capH, fontFace: BODY, fontSize: C(8.5),
          color: pal.muted, charSpacing: 2,
        });
      });
    } else {
      // 4-up (3 leaves one cell open — the grid stays honest, no stretching).
      const fw = (CW - gap) / 2;
      const fh = 2.28;
      imgs.forEach((slot, i) => {
        const x = M + (i % 2) * (fw + gap);
        const y = 1.58 + Math.floor(i / 2) * (fh + capH + 0.18);
        addCoverImageOr(s, slot, { x, y, w: fw, h: fh });
        s.addText(figureCaption(slot.label, i, fig).toUpperCase(), {
          x, y: y + fh + 0.04, w: fw, h: capH, fontFace: BODY, fontSize: C(8.5),
          color: pal.muted, charSpacing: 2,
        });
      });
    }
  };

  const drawBudget = (s: PptxGenJS.Slide, d: BudgetSlide) => {
    addTitle(s, "The Investment", d.title);
    const lead = tok.tables.numbersLead;
    const rows: PptxGenJS.TableRow[] = [];
    // charSpacing is honored on table cells at runtime (emits a:rPr spc) but
    // is missing from TableCellProps in the typings.
    type CellProps = PptxGenJS.TableCellProps & { charSpacing?: number };
    const headOpts: CellProps = {
      fontFace: BODY, fontSize: C(8.5), bold: true, color: field ? pal.paper : pal.muted, charSpacing: 2,
      fill: { color: field ? pal.primary : pal.paper }, border: [
        { type: "none" }, { type: "none" },
        { type: "solid", color: pal.primary, pt: 1.5 }, { type: "none" },
      ],
      valign: "middle", margin: [0.06, 0.08, 0.06, 0.08],
    };
    const headCategory = { text: "CATEGORY", options: { ...headOpts, align: "left" as const } };
    const headShare = { text: "SHARE", options: { ...headOpts, align: "right" as const } };
    const headAmount = { text: "AMOUNT", options: { ...headOpts, align: lead ? ("left" as const) : ("right" as const) } };
    rows.push(lead ? [headAmount, headShare, headCategory] : [headCategory, headShare, headAmount]);
    d.rows.forEach((r, i) => {
      const fill = tok.accent.zebra && i % 2 === 1 ? { color: pal.primary, transparency: 96 } : { color: pal.paper };
      const base: PptxGenJS.TableCellProps = {
        fontFace: BODY, fontSize: B(11), color: pal.ink, fill, valign: "middle",
        border: [
          { type: "none" }, { type: "none" },
          { type: "solid", color: pal.line, pt: 0.5 }, { type: "none" },
        ],
        margin: [0.06, 0.08, 0.06, 0.08],
      };
      const category = {
        text: r.description
          ? [
              { text: r.category, options: { bold: true } },
              { text: "   " + r.description, options: { fontSize: C(9), color: pal.muted } },
            ]
          : r.category,
        options: { ...base, align: "left" as const },
      };
      const share = {
        text: typeof r.percentage === "number" ? `${r.percentage}%` : "",
        options: { ...base, align: "right" as const, color: pal.muted, fontSize: C(10) },
      };
      const amount = {
        text: "$" + r.amount.toLocaleString("en-US"),
        options: lead
          ? { ...base, align: "left" as const, bold: true, fontFace: HEAD, fontSize: T(12), color: pal.primary }
          : { ...base, align: "right" as const, bold: true },
      };
      rows.push(lead ? [amount, share, category] : [category, share, amount]);
    });
    const totalOpts: CellProps = {
      fontFace: BODY, fontSize: B(12.5), bold: true, color: pal.primary,
      fill: { color: pal.primary, transparency: 92 }, valign: "middle",
      border: [
        { type: "solid", color: pal.primary, pt: 1.5 }, { type: "none" },
        { type: "none" }, { type: "none" },
      ],
      margin: [0.08, 0.08, 0.08, 0.08],
    };
    const totalLabel = { text: d.totalLabel.toUpperCase(), options: { ...totalOpts, fontSize: C(10), charSpacing: 2, align: "left" as const } };
    const totalAmount = {
      text: "$" + d.total.toLocaleString("en-US"),
      options: { ...totalOpts, fontFace: HEAD, fontSize: T(15), align: lead ? ("left" as const) : ("right" as const) },
    };
    rows.push(lead ? [totalAmount, { text: "", options: totalOpts }, totalLabel] : [totalLabel, { text: "", options: totalOpts }, totalAmount]);
    s.addTable(rows, {
      x: M, y: 1.6, w: CW,
      colW: lead ? [2.0, 1.2, CW - 3.2] : [CW - 3.2, 1.2, 2.0],
      rowH: S(0.42),
    });
  };

  const drawMaterials = (s: PptxGenJS.Slide, d: MaterialsSlide) => {
    addTitle(s, "The Investment", d.title);
    const lead = tok.tables.numbersLead;
    let y = 1.65;
    s.addShape("rect", { x: M, y, w: CW, h: 0.014, fill: { color: pal.primary } });
    y += 0.1;
    const rowH = S(d.rows.length > 6 ? 0.52 : 0.62);
    for (const r of d.rows) {
      const text = r.summary
        ? [
            { text: r.category, options: { bold: true, color: pal.ink } },
            { text: "\n" + r.summary, options: { fontSize: C(8.5), color: pal.muted } },
          ]
        : r.category;
      const hasSub = typeof r.subtotal === "number";
      const sub = hasSub ? "$" + (r.subtotal as number).toLocaleString("en-US") : "";
      if (lead) {
        if (hasSub) {
          s.addText(sub, {
            x: M, y, w: 1.8, h: rowH, fontFace: HEAD, fontSize: T(13),
            color: pal.primary, bold: true, align: "left", valign: "middle",
          });
        }
        s.addText(text, { x: M + 1.8, y, w: CW - 1.8, h: rowH, fontFace: BODY, fontSize: B(11.5), color: pal.ink, valign: "middle", fit: "shrink" });
      } else {
        s.addText(text, { x: M, y, w: CW - 1.8, h: rowH, fontFace: BODY, fontSize: B(11.5), color: pal.ink, valign: "middle", fit: "shrink" });
        if (hasSub) {
          s.addText(sub, {
            x: M + CW - 1.8, y, w: 1.8, h: rowH, fontFace: BODY, fontSize: B(11.5),
            color: pal.ink, bold: true, align: "right", valign: "middle",
          });
        }
      }
      y += rowH;
      s.addShape("rect", { x: M, y, w: CW, h: 0.008, fill: { color: pal.line } });
      y += 0.03;
    }
    if (typeof d.total === "number") {
      y += 0.08;
      const totalText = "$" + d.total.toLocaleString("en-US");
      if (lead) {
        s.addText(totalText, {
          x: M, y, w: 2.2, h: 0.45, fontFace: HEAD, fontSize: T(16),
          color: pal.primary, bold: true, align: "left", valign: "middle",
        });
        s.addText("ESTIMATED MATERIALS TOTAL", {
          x: M + 2.2, y, w: CW - 2.2, h: 0.45, fontFace: BODY, fontSize: C(10),
          color: pal.primary, bold: true, charSpacing: 2, valign: "middle",
        });
      } else {
        s.addText("ESTIMATED MATERIALS TOTAL", {
          x: M, y, w: CW - 2.2, h: 0.45, fontFace: BODY, fontSize: C(10),
          color: pal.primary, bold: true, charSpacing: 2, valign: "middle",
        });
        s.addText(totalText, {
          x: M + CW - 2.2, y, w: 2.2, h: 0.45, fontFace: HEAD, fontSize: T(16),
          color: pal.primary, bold: true, align: "right", valign: "middle",
        });
      }
      y += 0.5;
    }
    if (d.note) {
      s.addText(d.note, {
        x: M, y: Math.min(y + 0.05, 6.4), w: CW, h: 0.5, fontFace: BODY, fontSize: C(9),
        color: pal.muted, italic: true, valign: "top",
      });
    }
  };

  const drawNextSteps = (s: PptxGenJS.Slide, d: NextStepsSlide) => {
    addTitle(s, "Next Steps", d.title);
    const steps = d.steps.slice(0, 5);
    const startY = 1.7;
    const availH = (d.timelineNote ? 6.0 : 6.6) - startY;
    const stepH = availH / steps.length;
    steps.forEach((step, i) => {
      const y = startY + i * stepH;
      if (i < steps.length - 1) {
        s.addShape("rect", { x: M + 0.185, y: y + 0.42, w: 0.012, h: stepH - 0.42, fill: { color: pal.line } });
      }
      s.addShape("ellipse", { x: M, y, w: 0.38, h: 0.38, fill: { color: pal.primary } });
      s.addText(String(i + 1), {
        x: M, y, w: 0.38, h: 0.38, fontFace: HEAD, fontSize: T(12), bold: true,
        color: pal.paper, align: "center", valign: "middle",
      });
      s.addText(step.title, {
        x: M + 0.6, y: y - 0.02, w: 5.4, h: 0.4, fontFace: HEAD, fontSize: T(14),
        color: pal.primary, bold: true, valign: "top", fit: "shrink",
      });
      if (step.detail) {
        s.addText(step.detail, {
          x: 6.4, y, w: DECK_PAGE.w - M - 6.4, h: stepH - 0.1, fontFace: BODY, fontSize: B(10.5),
          color: mixHex(pal.ink, pal.paper, 0.8), valign: "top", fit: "shrink",
        });
      }
    });
    if (d.timelineNote) {
      if (hairline) {
        s.addShape("rect", { x: M, y: 6.15, w: CW, h: 0.008, fill: { color: pal.line } });
        s.addText(d.timelineNote.toUpperCase(), {
          x: M, y: 6.15, w: CW, h: 0.55, fontFace: BODY, fontSize: C(10),
          color: mixHex(pal.secondary, pal.ink, 0.85), charSpacing: 2, bold: true, valign: "middle",
        });
      } else {
        s.addShape("roundRect", {
          x: M, y: 6.15, w: CW, h: 0.55, rectRadius: 0.08,
          fill: { color: pal.secondary, transparency: 92 },
        });
        s.addText(d.timelineNote.toUpperCase(), {
          x: M + 0.25, y: 6.15, w: CW - 0.5, h: 0.55, fontFace: BODY, fontSize: C(10),
          color: mixHex(pal.secondary, pal.ink, 0.85), charSpacing: 2, bold: true, valign: "middle",
        });
      }
    }
  };

  const drawClosing = (s: PptxGenJS.Slide, d: ClosingSlide) => {
    const onPaper = closingOnPaper(tok);
    drawFieldGeometry(s);
    s.addText(d.headline, {
      x: M - 0.04, y: 2.35, w: 9.6, h: 1.4, fontFace: HEAD, fontSize: T(44),
      color: onPaper ? pal.primary : pal.paper, bold: true, fit: "shrink",
    });
    if (d.subline) {
      s.addShape("rect", { x: M + 0.02, y: 3.85, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
      s.addText(d.subline, {
        x: M, y: 3.98, w: 8.5, h: 0.5, fontFace: BODY, fontSize: B(15),
        color: onPaper ? pal.ink : mixHex(pal.paper, pal.primary, 0.88),
      });
    }
    let y = 4.85;
    for (const c of d.contacts.slice(0, 3)) {
      s.addText(
        [
          { text: c.name, options: { bold: true, color: onPaper ? pal.primary : pal.paper } },
          {
            text: [c.email, c.phone].filter(Boolean).length ? "   ·   " + [c.email, c.phone].filter(Boolean).join("   ·   ") : "",
            options: { color: onPaper ? pal.muted : mixHex(pal.paper, pal.primary, 0.72) },
          },
        ],
        { x: M, y, w: 10.5, h: 0.38, fontFace: BODY, fontSize: B(12) },
      );
      y += S(0.42);
    }
    addLogo(s, leadLogo, M, 6.55, 1.9, 0.55);
    addLogo(s, coLogo, 10.85, 6.55, 1.88, 0.55);
  };

  // ── Assemble ───────────────────────────────────────────────────────────
  const masterFor = (slide: SlideSpec): string => {
    switch (slide.layout) {
      case "cover":
      case "closing":
        return MASTER.cover;
      case "section":
        return MASTER.section;
      case "renderFull":
        return tok.images.framing === "inset" ? MASTER.body : MASTER.image;
      default:
        return MASTER.body;
    }
  };

  spec.slides.forEach((slideSpec, i) => {
    const slide = pres.addSlide({ masterName: masterFor(slideSpec) });
    switch (slideSpec.layout) {
      case "cover": drawCover(slide, slideSpec); break;
      case "section": drawSection(slide, slideSpec); break;
      case "briefSummary": drawBriefSummary(slide, slideSpec); break;
      case "concept": drawConcept(slide, slideSpec); break;
      case "elementGrid": drawElementGrid(slide, slideSpec); break;
      case "spatial": drawSpatial(slide, slideSpec); break;
      case "renderFull": drawRenderFull(slide, slideSpec); break;
      case "renderGrid": drawRenderGrid(slide, slideSpec); break;
      case "budget": drawBudget(slide, slideSpec); break;
      case "materials": drawMaterials(slide, slideSpec); break;
      case "nextSteps": drawNextSteps(slide, slideSpec); break;
      case "closing": drawClosing(slide, slideSpec); break;
    }
    opts.onProgress?.("Building slides", i + 1, total);
  });

  const blob = (await pres.write({ outputType: "blob" })) as Blob;
  return blob;
}
