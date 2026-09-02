// deckBuilder — DeckSpec + BrandKit → a designed, fully editable .pptx.
//
// This is the flagship deliverable path: every slide is drawn with explicit
// geometry from the typed spec (deckSpec.ts), on slide masters that carry
// the brand system, so the client receives a deck that is both beautiful
// AND editable text-by-text in PowerPoint. deckSlideHtml.ts mirrors these
// layouts 1:1 for the on-screen preview — change geometry here, change it
// there.
//
// Craft rules encoded below:
//  · 16:9 (13.333 × 7.5 in), 0.6 in margins, one master per layout family.
//  · Typography: kit.heading for display, kit.body for text. Never Calibri.
//  · Color: kit primary / secondary / ink / paper + white only; tints are
//    made with fill transparency or ink↔paper mixes — no new hues.
//  · Every text frame has explicit x/y/w/h; long text shrinks or top-aligns
//    in a generous box. Images cover-crop into frames; logos contain-fit.

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

// ── Geometry constants (inches) — mirrored in deckSlideHtml.ts ───────────────

export const DECK_PAGE = { w: 13.333, h: 7.5 } as const;
export const DECK_MARGIN = 0.6;
const CW = DECK_PAGE.w - DECK_MARGIN * 2; // 12.133 content width

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

// ── The builder ───────────────────────────────────────────────────────────────

export async function buildDeckPptx(
  spec: DeckSpec,
  kit: BrandKit,
  opts: DeckBuildOptions = {},
): Promise<Blob> {
  const pal = paletteFrom(kit);
  const HEAD = kit.heading.family;
  const BODY = kit.body.family;

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
  // Cover / closing: primary field + two soft geometric accents (a large
  // secondary circle cropping the top-right, a faint paper arc bottom-left).
  pres.defineSlideMaster({
    title: MASTER.cover,
    background: { color: pal.primary },
    objects: [
      { ellipse: { x: 9.1, y: -2.9, w: 7.6, h: 7.6, fill: { color: pal.secondary, transparency: 72 } } } as any,
      { ellipse: { x: 10.6, y: -1.4, w: 4.6, h: 4.6, fill: { color: pal.secondary, transparency: 55 } } } as any,
      { ellipse: { x: -2.2, y: 5.6, w: 5.2, h: 5.2, fill: { color: pal.paper, transparency: 92 } } } as any,
    ],
  });

  // Section divider: ink ground; the oversized number is drawn per slide.
  pres.defineSlideMaster({
    title: MASTER.section,
    background: { color: pal.ink },
    objects: [
      { rect: { x: 0, y: 0, w: DECK_PAGE.w, h: 0.09, fill: { color: pal.secondary } } },
    ],
  });

  // Content: paper ground, top brand bar, footer (lead name · page number,
  // co-brand mark when blending).
  const bodyObjects: PptxGenJS.SlideMasterProps["objects"] = [
    { rect: { x: 0, y: 0, w: DECK_PAGE.w, h: 0.09, fill: { color: pal.primary } } },
    { rect: { x: DECK_MARGIN, y: 7.02, w: CW, h: 0.008, fill: { color: pal.line } } },
    {
      text: {
        text: (kit.leadName ?? spec.meta.agencyName).toUpperCase(),
        options: {
          x: DECK_MARGIN, y: 7.08, w: 6, h: 0.3, fontFace: BODY, fontSize: 8,
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
      fontFace: BODY, fontSize: 8, color: pal.muted, align: "right",
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
      x: DECK_MARGIN, y: 0.42, w: CW, h: 0.3, fontFace: BODY, fontSize: 9,
      color: pal.secondary, charSpacing: 3, bold: true,
    });
    slide.addText(title, {
      x: DECK_MARGIN - 0.03, y: 0.68, w: CW, h: 0.65, fontFace: HEAD, fontSize: 24,
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
        ...box, fontFace: BODY, fontSize: 10, color: pal.muted, align: "center", valign: "middle",
      });
    }
  };

  // ── Layout renderers ───────────────────────────────────────────────────

  const drawCover = (s: PptxGenJS.Slide, d: CoverSlide) => {
    if (leadLogo) {
      s.addImage({ data: leadLogo, x: DECK_MARGIN, y: 0.55, w: 2.2, h: 0.62, sizing: { type: "contain", w: 2.2, h: 0.62 } });
    }
    s.addShape("rect", { x: DECK_MARGIN + 0.02, y: 2.62, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
    s.addText(d.eyebrow.toUpperCase(), {
      x: DECK_MARGIN, y: 2.78, w: 10.5, h: 0.4, fontFace: BODY, fontSize: 11,
      color: mixHex(pal.paper, pal.primary, 0.78), charSpacing: 3, bold: true,
    });
    s.addText(d.title, {
      x: DECK_MARGIN - 0.05, y: 3.12, w: 10.6, h: 1.95, fontFace: HEAD, fontSize: 48,
      color: pal.paper, bold: true, fit: "shrink", valign: "top", lineSpacing: 52,
    });
    s.addText(d.subtitle, {
      x: DECK_MARGIN, y: 5.1, w: 9.5, h: 0.5, fontFace: BODY, fontSize: 16,
      color: mixHex(pal.paper, pal.primary, 0.9),
    });
    s.addText(`${spec.meta.agencyName}   ·   ${spec.meta.dateLabel}`, {
      x: DECK_MARGIN, y: 6.78, w: 8, h: 0.35, fontFace: BODY, fontSize: 10,
      color: mixHex(pal.paper, pal.primary, 0.65), charSpacing: 1,
    });
    if (coLogo) {
      s.addImage({ data: coLogo, x: 11.0, y: 6.62, w: 1.73, h: 0.55, sizing: { type: "contain", w: 1.73, h: 0.55 } });
    }
  };

  const drawSection = (s: PptxGenJS.Slide, d: SectionSlide) => {
    const num = String(d.number).padStart(2, "0");
    s.addText(num, {
      x: 6.6, y: 0.7, w: 6.4, h: 6.4, fontFace: HEAD, fontSize: 250, bold: true,
      color: mixHex(pal.secondary, pal.ink, 0.42), align: "right", valign: "middle",
    });
    s.addShape("rect", { x: DECK_MARGIN + 0.02, y: 3.02, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
    s.addText(`SECTION ${num}`, {
      x: DECK_MARGIN, y: 3.18, w: 5, h: 0.35, fontFace: BODY, fontSize: 10,
      color: pal.secondary, charSpacing: 4, bold: true,
    });
    s.addText(d.title, {
      x: DECK_MARGIN - 0.03, y: 3.5, w: 8.2, h: 1.1, fontFace: HEAD, fontSize: 34,
      color: pal.paper, bold: true, fit: "shrink",
    });
    if (d.subtitle) {
      s.addText(d.subtitle, {
        x: DECK_MARGIN, y: 4.6, w: 7.4, h: 0.6, fontFace: BODY, fontSize: 13,
        color: mixHex(pal.paper, pal.ink, 0.62),
      });
    }
  };

  const drawBriefSummary = (s: PptxGenJS.Slide, d: BriefSummarySlide) => {
    addTitle(s, "The Ask", d.title);
    // Left rail: facts.
    let y = 1.75;
    for (const f of d.facts.slice(0, 5)) {
      s.addText(f.label.toUpperCase(), {
        x: DECK_MARGIN, y, w: 4.2, h: 0.26, fontFace: BODY, fontSize: 8.5,
        color: pal.muted, charSpacing: 2, bold: true,
      });
      s.addText(f.value, {
        x: DECK_MARGIN, y: y + 0.24, w: 4.2, h: 0.55, fontFace: BODY, fontSize: 13.5,
        color: pal.ink, bold: true, fit: "shrink", valign: "top",
      });
      y += 0.92;
      s.addShape("rect", { x: DECK_MARGIN, y: y - 0.12, w: 4.2, h: 0.008, fill: { color: pal.line } });
    }
    // Right: objectives then audiences.
    const rx = 5.55;
    const rw = DECK_PAGE.w - DECK_MARGIN - rx;
    let ry = 1.75;
    if (d.objectives.length) {
      s.addText("OBJECTIVES", {
        x: rx, y: ry, w: rw, h: 0.26, fontFace: BODY, fontSize: 8.5,
        color: pal.secondary, charSpacing: 2, bold: true,
      });
      ry += 0.32;
      for (const o of d.objectives) {
        s.addShape("rect", { x: rx + 0.02, y: ry + 0.09, w: 0.14, h: 0.045, fill: { color: pal.secondary } });
        s.addText(o, {
          x: rx + 0.3, y: ry, w: rw - 0.3, h: 0.52, fontFace: BODY, fontSize: 11.5,
          color: pal.ink, valign: "top", fit: "shrink",
        });
        ry += 0.56;
      }
      ry += 0.18;
    }
    if (d.audiences.length) {
      s.addText("WHO WE'RE DESIGNING FOR", {
        x: rx, y: ry, w: rw, h: 0.26, fontFace: BODY, fontSize: 8.5,
        color: pal.secondary, charSpacing: 2, bold: true,
      });
      ry += 0.34;
      for (const a of d.audiences) {
        s.addText(
          [
            { text: a.name, options: { bold: true, color: pal.primary } },
            { text: a.description ? "  —  " + a.description : "", options: { color: pal.muted } },
          ],
          { x: rx, y: ry, w: rw, h: 0.5, fontFace: BODY, fontSize: 10.5, valign: "top", fit: "shrink" },
        );
        ry += 0.5;
      }
    }
  };

  const drawConcept = (s: PptxGenJS.Slide, d: ConceptSlide) => {
    s.addText("THE BIG IDEA", {
      x: DECK_MARGIN, y: 0.55, w: CW, h: 0.3, fontFace: BODY, fontSize: 9,
      color: pal.secondary, charSpacing: 3, bold: true,
    });
    s.addText(d.headline, {
      x: DECK_MARGIN - 0.04, y: 0.9, w: 9.2, h: 1.7, fontFace: HEAD, fontSize: 32,
      color: pal.primary, bold: true, fit: "shrink", valign: "top", lineSpacing: 36,
    });
    let ny = 2.7;
    if (d.subheadline) {
      s.addText(d.subheadline, {
        x: DECK_MARGIN, y: ny, w: 7.2, h: 0.55, fontFace: BODY, fontSize: 14,
        color: pal.secondary, italic: true, fit: "shrink", valign: "top",
      });
      ny += 0.62;
    }
    s.addText(d.narrative, {
      x: DECK_MARGIN, y: ny, w: 7.2, h: 6.55 - ny, fontFace: BODY, fontSize: 12.5,
      color: pal.ink, valign: "top", lineSpacing: 19, fit: "shrink",
    });
    // Supporting points: numbered chips down the right.
    const px = 8.35;
    const pw = DECK_PAGE.w - DECK_MARGIN - px;
    let py = 2.7;
    d.points.forEach((point, i) => {
      s.addShape("ellipse", { x: px, y: py, w: 0.34, h: 0.34, fill: { color: pal.primary } });
      s.addText(String(i + 1), {
        x: px, y: py, w: 0.34, h: 0.34, fontFace: HEAD, fontSize: 11, bold: true,
        color: pal.paper, align: "center", valign: "middle",
      });
      s.addText(point, {
        x: px + 0.5, y: py - 0.03, w: pw - 0.5, h: 1.15, fontFace: BODY, fontSize: 10.5,
        color: pal.ink, valign: "top", fit: "shrink",
      });
      py += 1.28;
    });
  };

  const drawElementGrid = (s: PptxGenJS.Slide, d: ElementGridSlide) => {
    addTitle(s, "The Concept", d.title);
    const cards = d.cards.slice(0, 6);
    const cols = cards.length <= 4 ? 2 : 3;
    const rows = Math.ceil(cards.length / cols);
    const gap = 0.26;
    const cw = (CW - gap * (cols - 1)) / cols;
    const chAvail = 6.85 - 1.62;
    const ch = Math.min(2.42, (chAvail - gap * (rows - 1)) / rows);
    cards.forEach((card, i) => {
      const cx = DECK_MARGIN + (i % cols) * (cw + gap);
      const cy = 1.62 + Math.floor(i / cols) * (ch + gap);
      s.addShape("roundRect", {
        x: cx, y: cy, w: cw, h: ch, rectRadius: 0.08,
        fill: { color: pal.primary, transparency: 95 },
        line: { color: pal.line, width: 0.75 },
      });
      s.addShape("rect", { x: cx + 0.24, y: cy + 0.28, w: 0.42, h: 0.05, fill: { color: pal.secondary } });
      s.addText(card.title, {
        x: cx + 0.2, y: cy + 0.38, w: cw - 0.44, h: 0.5, fontFace: HEAD, fontSize: 13,
        color: pal.primary, bold: true, fit: "shrink", valign: "top",
      });
      s.addText(card.body, {
        x: cx + 0.2, y: cy + 0.88, w: cw - 0.44, h: ch - 1.05, fontFace: BODY, fontSize: 9.5,
        color: mixHex(pal.ink, pal.paper, 0.82), valign: "top", fit: "shrink", lineSpacing: 13,
      });
    });
  };

  const drawSpatial = (s: PptxGenJS.Slide, d: SpatialSlide) => {
    addTitle(s, "The Space", d.title);
    const hasImage = !!d.image;
    const tableX = hasImage ? 7.5 : DECK_MARGIN;
    const tableW = DECK_PAGE.w - DECK_MARGIN - tableX;

    if (d.image) {
      const box = { x: DECK_MARGIN, y: 1.62, w: 6.55, h: 4.75 };
      s.addShape("rect", {
        x: box.x - 0.04, y: box.y - 0.04, w: box.w + 0.08, h: box.h + 0.08,
        fill: { color: pal.paper }, line: { color: pal.line, width: 1 },
      });
      const data = images.get(d.image.url);
      if (data) {
        s.addImage({ data, ...box, sizing: { type: "contain", w: box.w, h: box.h } });
      } else {
        s.addText(d.image.label, { ...box, fontFace: BODY, fontSize: 10, color: pal.muted, align: "center", valign: "middle" });
      }
      s.addText(d.image.label.toUpperCase(), {
        x: box.x, y: box.y + box.h + 0.08, w: box.w, h: 0.28, fontFace: BODY, fontSize: 8.5,
        color: pal.muted, charSpacing: 2,
      });
    }

    // Zone table: header, hairline rows, right-aligned sqft, bold total rule.
    let y = 1.62;
    s.addText("ZONE", {
      x: tableX, y, w: tableW - 1.4, h: 0.26, fontFace: BODY, fontSize: 8.5,
      color: pal.muted, charSpacing: 2, bold: true,
    });
    s.addText("SQ FT", {
      x: tableX + tableW - 1.4, y, w: 1.4, h: 0.26, fontFace: BODY, fontSize: 8.5,
      color: pal.muted, charSpacing: 2, bold: true, align: "right",
    });
    y += 0.32;
    s.addShape("rect", { x: tableX, y, w: tableW, h: 0.014, fill: { color: pal.primary } });
    y += 0.08;
    const rowH = d.zones.length > 6 ? 0.5 : 0.58;
    for (const z of d.zones) {
      s.addText(
        z.note
          ? [
              { text: z.name, options: { bold: true, color: pal.ink } },
              { text: "\n" + z.note, options: { fontSize: 8.5, color: pal.muted } },
            ]
          : z.name,
        { x: tableX, y, w: tableW - 1.4, h: rowH, fontFace: BODY, fontSize: 11, color: pal.ink, valign: "middle", fit: "shrink" },
      );
      s.addText(z.sqft.toLocaleString("en-US"), {
        x: tableX + tableW - 1.4, y, w: 1.4, h: rowH, fontFace: BODY, fontSize: 11,
        color: pal.ink, bold: true, align: "right", valign: "middle",
      });
      y += rowH;
      s.addShape("rect", { x: tableX, y, w: tableW, h: 0.008, fill: { color: pal.line } });
      y += 0.02;
    }
    if (typeof d.totalSqft === "number") {
      y += 0.06;
      s.addText(`${d.boothSize} TOTAL`, {
        x: tableX, y, w: tableW - 1.6, h: 0.4, fontFace: BODY, fontSize: 10,
        color: pal.primary, bold: true, charSpacing: 1, valign: "middle",
      });
      s.addText(d.totalSqft.toLocaleString("en-US"), {
        x: tableX + tableW - 1.6, y, w: 1.6, h: 0.4, fontFace: HEAD, fontSize: 14,
        color: pal.primary, bold: true, align: "right", valign: "middle",
      });
    }
  };

  const drawRenderFull = (s: PptxGenJS.Slide, d: RenderFullSlide) => {
    addCoverImageOr(s, d.image, { x: 0, y: 0, w: DECK_PAGE.w, h: DECK_PAGE.h });
    // Caption plate along the bottom — translucent ink so the render shows through.
    s.addShape("rect", {
      x: 0, y: 6.72, w: DECK_PAGE.w, h: 0.78,
      fill: { color: pal.ink, transparency: 28 },
    });
    s.addShape("rect", { x: DECK_MARGIN, y: 6.98, w: 0.5, h: 0.045, fill: { color: pal.secondary } });
    s.addText(d.caption.toUpperCase(), {
      x: DECK_MARGIN + 0.62, y: 6.86, w: 9.5, h: 0.3, fontFace: BODY, fontSize: 11,
      color: pal.paper, charSpacing: 3, bold: true, valign: "middle",
    });
    s.addText(spec.meta.projectName, {
      x: 9.2, y: 6.86, w: 3.5, h: 0.3, fontFace: BODY, fontSize: 8.5,
      color: mixHex(pal.paper, pal.ink, 0.7), align: "right", valign: "middle", charSpacing: 1,
    });
  };

  const drawRenderGrid = (s: PptxGenJS.Slide, d: RenderGridSlide) => {
    addTitle(s, "The Space", d.title);
    const imgs = d.images.slice(0, 4);
    const gap = 0.26;
    const capH = 0.3;
    if (imgs.length <= 2) {
      // 2-up: two large frames side by side.
      const fw = (CW - gap) / 2;
      const fh = 4.55;
      imgs.forEach((slot, i) => {
        const x = DECK_MARGIN + i * (fw + gap);
        addCoverImageOr(s, slot, { x, y: 1.62, w: fw, h: fh });
        s.addText(slot.label.toUpperCase(), {
          x, y: 1.62 + fh + 0.08, w: fw, h: capH, fontFace: BODY, fontSize: 8.5,
          color: pal.muted, charSpacing: 2,
        });
      });
    } else {
      // 4-up (3 leaves one cell open — the grid stays honest, no stretching).
      const fw = (CW - gap) / 2;
      const fh = 2.28;
      imgs.forEach((slot, i) => {
        const x = DECK_MARGIN + (i % 2) * (fw + gap);
        const y = 1.58 + Math.floor(i / 2) * (fh + capH + 0.18);
        addCoverImageOr(s, slot, { x, y, w: fw, h: fh });
        s.addText(slot.label.toUpperCase(), {
          x, y: y + fh + 0.04, w: fw, h: capH, fontFace: BODY, fontSize: 8.5,
          color: pal.muted, charSpacing: 2,
        });
      });
    }
  };

  const drawBudget = (s: PptxGenJS.Slide, d: BudgetSlide) => {
    addTitle(s, "The Investment", d.title);
    const rows: PptxGenJS.TableRow[] = [];
    const headOpts: PptxGenJS.TableCellProps = {
      fontFace: BODY, fontSize: 8.5, bold: true, color: pal.muted, charSpacing: 2 as never,
      fill: { color: pal.paper }, border: [
        { type: "none" }, { type: "none" },
        { type: "solid", color: pal.primary, pt: 1.5 }, { type: "none" },
      ],
      valign: "middle", margin: [0.06, 0.08, 0.06, 0.08],
    };
    rows.push([
      { text: "CATEGORY", options: { ...headOpts, align: "left" } },
      { text: "SHARE", options: { ...headOpts, align: "right" } },
      { text: "AMOUNT", options: { ...headOpts, align: "right" } },
    ]);
    d.rows.forEach((r, i) => {
      const fill = i % 2 === 1 ? { color: pal.primary, transparency: 96 } : { color: pal.paper };
      const base: PptxGenJS.TableCellProps = {
        fontFace: BODY, fontSize: 11, color: pal.ink, fill, valign: "middle",
        border: [
          { type: "none" }, { type: "none" },
          { type: "solid", color: pal.line, pt: 0.5 }, { type: "none" },
        ],
        margin: [0.06, 0.08, 0.06, 0.08],
      };
      rows.push([
        {
          text: r.description
            ? [
                { text: r.category, options: { bold: true } },
                { text: "   " + r.description, options: { fontSize: 9, color: pal.muted } },
              ]
            : r.category,
          options: { ...base, align: "left" },
        },
        {
          text: typeof r.percentage === "number" ? `${r.percentage}%` : "",
          options: { ...base, align: "right", color: pal.muted, fontSize: 10 },
        },
        {
          text: "$" + r.amount.toLocaleString("en-US"),
          options: { ...base, align: "right", bold: true },
        },
      ]);
    });
    const totalOpts: PptxGenJS.TableCellProps = {
      fontFace: BODY, fontSize: 12.5, bold: true, color: pal.primary,
      fill: { color: pal.primary, transparency: 92 }, valign: "middle",
      border: [
        { type: "solid", color: pal.primary, pt: 1.5 }, { type: "none" },
        { type: "none" }, { type: "none" },
      ],
      margin: [0.08, 0.08, 0.08, 0.08],
    };
    rows.push([
      { text: d.totalLabel.toUpperCase(), options: { ...totalOpts, fontSize: 10, charSpacing: 2 as never, align: "left" } },
      { text: "", options: totalOpts },
      { text: "$" + d.total.toLocaleString("en-US"), options: { ...totalOpts, fontFace: HEAD, fontSize: 15, align: "right" } },
    ]);
    s.addTable(rows, {
      x: DECK_MARGIN, y: 1.6, w: CW,
      colW: [CW - 3.2, 1.2, 2.0],
      rowH: 0.42,
    });
  };

  const drawMaterials = (s: PptxGenJS.Slide, d: MaterialsSlide) => {
    addTitle(s, "The Investment", d.title);
    let y = 1.65;
    s.addShape("rect", { x: DECK_MARGIN, y, w: CW, h: 0.014, fill: { color: pal.primary } });
    y += 0.1;
    const rowH = d.rows.length > 6 ? 0.52 : 0.62;
    for (const r of d.rows) {
      s.addText(
        r.summary
          ? [
              { text: r.category, options: { bold: true, color: pal.ink } },
              { text: "\n" + r.summary, options: { fontSize: 8.5, color: pal.muted } },
            ]
          : r.category,
        { x: DECK_MARGIN, y, w: CW - 1.8, h: rowH, fontFace: BODY, fontSize: 11.5, color: pal.ink, valign: "middle", fit: "shrink" },
      );
      if (typeof r.subtotal === "number") {
        s.addText("$" + r.subtotal.toLocaleString("en-US"), {
          x: DECK_MARGIN + CW - 1.8, y, w: 1.8, h: rowH, fontFace: BODY, fontSize: 11.5,
          color: pal.ink, bold: true, align: "right", valign: "middle",
        });
      }
      y += rowH;
      s.addShape("rect", { x: DECK_MARGIN, y, w: CW, h: 0.008, fill: { color: pal.line } });
      y += 0.03;
    }
    if (typeof d.total === "number") {
      y += 0.08;
      s.addText("ESTIMATED MATERIALS TOTAL", {
        x: DECK_MARGIN, y, w: CW - 2.2, h: 0.45, fontFace: BODY, fontSize: 10,
        color: pal.primary, bold: true, charSpacing: 2, valign: "middle",
      });
      s.addText("$" + d.total.toLocaleString("en-US"), {
        x: DECK_MARGIN + CW - 2.2, y, w: 2.2, h: 0.45, fontFace: HEAD, fontSize: 16,
        color: pal.primary, bold: true, align: "right", valign: "middle",
      });
      y += 0.5;
    }
    if (d.note) {
      s.addText(d.note, {
        x: DECK_MARGIN, y: Math.min(y + 0.05, 6.4), w: CW, h: 0.5, fontFace: BODY, fontSize: 9,
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
        s.addShape("rect", { x: DECK_MARGIN + 0.185, y: y + 0.42, w: 0.012, h: stepH - 0.42, fill: { color: pal.line } });
      }
      s.addShape("ellipse", { x: DECK_MARGIN, y, w: 0.38, h: 0.38, fill: { color: pal.primary } });
      s.addText(String(i + 1), {
        x: DECK_MARGIN, y, w: 0.38, h: 0.38, fontFace: HEAD, fontSize: 12, bold: true,
        color: pal.paper, align: "center", valign: "middle",
      });
      s.addText(step.title, {
        x: DECK_MARGIN + 0.6, y: y - 0.02, w: 5.4, h: 0.4, fontFace: HEAD, fontSize: 14,
        color: pal.primary, bold: true, valign: "top", fit: "shrink",
      });
      if (step.detail) {
        s.addText(step.detail, {
          x: 6.4, y, w: DECK_PAGE.w - DECK_MARGIN - 6.4, h: stepH - 0.1, fontFace: BODY, fontSize: 10.5,
          color: mixHex(pal.ink, pal.paper, 0.8), valign: "top", fit: "shrink",
        });
      }
    });
    if (d.timelineNote) {
      s.addShape("roundRect", {
        x: DECK_MARGIN, y: 6.15, w: CW, h: 0.55, rectRadius: 0.08,
        fill: { color: pal.secondary, transparency: 92 },
      });
      s.addText(d.timelineNote.toUpperCase(), {
        x: DECK_MARGIN + 0.25, y: 6.15, w: CW - 0.5, h: 0.55, fontFace: BODY, fontSize: 10,
        color: mixHex(pal.secondary, pal.ink, 0.85), charSpacing: 2, bold: true, valign: "middle",
      });
    }
  };

  const drawClosing = (s: PptxGenJS.Slide, d: ClosingSlide) => {
    s.addText(d.headline, {
      x: DECK_MARGIN - 0.04, y: 2.35, w: 9.6, h: 1.4, fontFace: HEAD, fontSize: 44,
      color: pal.paper, bold: true, fit: "shrink",
    });
    if (d.subline) {
      s.addShape("rect", { x: DECK_MARGIN + 0.02, y: 3.85, w: 0.9, h: 0.05, fill: { color: pal.secondary } });
      s.addText(d.subline, {
        x: DECK_MARGIN, y: 3.98, w: 8.5, h: 0.5, fontFace: BODY, fontSize: 15,
        color: mixHex(pal.paper, pal.primary, 0.88),
      });
    }
    let y = 4.85;
    for (const c of d.contacts.slice(0, 3)) {
      s.addText(
        [
          { text: c.name, options: { bold: true, color: pal.paper } },
          { text: [c.email, c.phone].filter(Boolean).length ? "   ·   " + [c.email, c.phone].filter(Boolean).join("   ·   ") : "", options: { color: mixHex(pal.paper, pal.primary, 0.72) } },
        ],
        { x: DECK_MARGIN, y, w: 10.5, h: 0.38, fontFace: BODY, fontSize: 12 },
      );
      y += 0.42;
    }
    if (leadLogo) {
      s.addImage({ data: leadLogo, x: DECK_MARGIN, y: 6.55, w: 1.9, h: 0.55, sizing: { type: "contain", w: 1.9, h: 0.55 } });
    }
    if (coLogo) {
      s.addImage({ data: coLogo, x: 10.85, y: 6.55, w: 1.88, h: 0.55, sizing: { type: "contain", w: 1.88, h: 0.55 } });
    }
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
        return MASTER.image;
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
