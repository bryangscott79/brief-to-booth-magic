// deckSlideHtml — DeckSpec + BrandKit (+ DeckStyle) → self-contained HTML
// artboards.
//
// Mirrors the pptxgenjs layouts in deckBuilder.ts 1:1 (same geometry in
// inches, rendered at 96px/in on a 1280×720 artboard) so the on-screen
// preview and the PDF path show exactly what the .pptx will look like.
// If you change slide geometry in deckBuilder.ts, change it here too. Style
// tokens (deckStyle.ts) flow through the same T/B/C/S scale helpers, so the
// resolved sizes are identical in both renderers.
//
// Output is a plain HTML string with inline CSS — no scripts, no external
// requests except the Google-font <link> (screen preview only; the PPTX
// carries font names + pptxFallback instead).

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
  VideoSlide,
  DeckMeta,
} from "./deckSpec";
import { deckScale, resolveDeckStyle, type DeckStyleId, type DeckStyleTokens } from "./deckStyle";
import {
  LOCKUP_RADIUS,
  NO_LOGO_TREATMENTS,
  PLATE_RADIUS,
  fitLogoBox,
  lockupBox,
  logoTreatmentAt,
  plateBox,
  type Box,
  type LogoGround,
  type LogoTreatments,
} from "./logoContrast";
import {
  groundPalette,
  kitGrounds,
  onBodyMaster,
  resolveSlide,
  topBarHex,
  usesGroundPalette,
  type BasePalette,
  type SlideResolution,
} from "./deckGround";
import type { SlideOverrides } from "./deckOps";

// ── Unit + color helpers (kept local so this module stays pptx-free) ─────────

const IN = 96; // px per inch — 13.333in × 96 = 1280, 7.5in × 96 = 720
const px = (inches: number): string => `${Math.round(inches * IN * 10) / 10}px`;
const fs = (pt: number): string => `${Math.round(pt * (IN / 72) * 10) / 10}px`;
/** pptx charSpacing (pt) → CSS letter-spacing */
const ls = (pt: number): string => `${Math.round(pt * (IN / 72) * 100) / 100}px`;
/** pptx fill transparency (%) → CSS hex alpha suffix ("0D" for 95). */
const alpha = (transparency: number): string =>
  Math.round((100 - transparency) * 2.55).toString(16).padStart(2, "0").toUpperCase();

const cssHex = (input: string | null | undefined, fallback: string): string => {
  if (!input) return fallback;
  const c = String(input).replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return "#" + c.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(c))
    return "#" + c.split("").map((ch) => ch + ch).join("").toUpperCase();
  return fallback;
};

const mix = (a: string, b: string, t: number): string => {
  const pa = cssHex(a, "#000000").slice(1);
  const pb = cssHex(b, "#FFFFFF").slice(1);
  const ch = (i: number) =>
    Math.round(
      parseInt(pa.slice(i, i + 2), 16) * t + parseInt(pb.slice(i, i + 2), 16) * (1 - t),
    )
      .toString(16)
      .padStart(2, "0");
  return "#" + (ch(0) + ch(2) + ch(4)).toUpperCase();
};

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const abs = (x: number, y: number, w: number, h: number): string =>
  `position:absolute;left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};`;

// ── Shared geometry (must match deckBuilder.ts) ──────────────────────────────

const PAGE = { w: 13.333, h: 7.5 };

/** Content helpers shared with deckBuilder.ts (kept as local copies so this
 *  module never imports pptxgenjs). Keep the bodies identical. */
const coverMetaCells = (meta: DeckMeta): Array<[string, string]> => {
  const cells: Array<[string, string | undefined]> = [
    ["Client", meta.clientName],
    ["Show", meta.showName],
    ["Footprint", meta.boothSize],
    ["Date", meta.dateLabel],
  ];
  return cells.filter((c): c is [string, string] => !!c[1] && c[1].trim().length > 0);
};
const sectionMetaLine = (meta: DeckMeta): string =>
  [meta.projectName, meta.boothSize, meta.showName]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .join("   ·   ")
    .toUpperCase();
const proseJoin = (items: string[]): string =>
  items
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?…]$/.test(s) ? s : s + "."))
    .join(" ");
const figureCaption = (label: string, i: number, on: boolean): string =>
  on ? `${String(i + 1).padStart(2, "0")} — ${label}` : label;

/** Video slide geometry — keep identical to deckBuilder.videoFrame /
 *  videoFacts / VIDEO_COL_GAP. */
const VIDEO_FRAME_W = 8.6;
const VIDEO_FRAME_Y = 1.62;
const VIDEO_COL_GAP = 0.4;
const videoFrame = (margin: number): Box => ({
  x: margin,
  y: VIDEO_FRAME_Y,
  w: VIDEO_FRAME_W,
  h: Math.round((VIDEO_FRAME_W * 9) / 16 * 1000) / 1000,
});
const videoFacts = (d: Pick<VideoSlide, "durationSec">): Array<[string, string]> => {
  const facts: Array<[string, string]> = [];
  if (typeof d.durationSec === "number" && d.durationSec > 0) {
    facts.push(["Duration", `${d.durationSec} second${d.durationSec === 1 ? "" : "s"}`]);
  }
  facts.push(["Format", "MP4 · 16:9"]);
  return facts;
};

/** Logo boxes — keep identical to the constants in deckBuilder.buildDeckPptx. */
const FOOTER_CO_BOX: Box = { x: 11.35, y: 7.06, w: 1.0, h: 0.3 };
const COVER_CO_BOX: Box = { x: 11.0, y: 6.62, w: 1.73, h: 0.55 };
const CLOSING_CO_BOX: Box = { x: 10.85, y: 6.55, w: 1.88, h: 0.55 };

interface Theme {
  primary: string;
  secondary: string;
  ink: string;
  paper: string;
  muted: string;
  line: string;
  head: string;
  body: string;
  /** style tokens + resolved scale (deckStyle.deckScale) */
  tok: DeckStyleTokens;
  T: (pt: number) => number;
  B: (pt: number) => number;
  C: (pt: number) => number;
  S: (inches: number) => number;
  M: number;
  CW: number;
  hairline: boolean;
  field: boolean;
  /** Logo plate decisions (logoContrast). NO_LOGO_TREATMENTS = bare marks. */
  treat: LogoTreatments;
  /** The slide's effective ground hex (deckGround.resolveSlide). */
  ground: string;
  /** Body-master top bar colour (primary on paper, secondary on dark). */
  topBar: string;
  /** Absolute kit paper / ink — logo plates and letterbox frames never
   *  follow a swapped palette. */
  platePaper: string;
  plateInk: string;
  hideLogo: boolean;
  /** Per-slide resolution: effective cover / section / framing / ground. */
  res: SlideResolution;
}

/** Theme for ONE slide: the kit palette (swapped to ground-relative roles
 *  when a paper-native layout sits on a dark override ground), the slide's
 *  accent-adjusted tokens and scale, and the logo treatments. */
function themeFor(kit: BrandKit, res: SlideResolution, treat: LogoTreatments): Theme {
  const base: BasePalette = {
    primary: cssHex(kit.primary, "#0B1B2B"),
    secondary: cssHex(kit.secondary, "#4F6BE8"),
    ink: cssHex(kit.ink, "#101418"),
    paper: cssHex(kit.paper, "#FFFFFF"),
  };
  const gp = usesGroundPalette(res)
    ? groundPalette(base, res.groundHex)
    : { ...base, muted: mix(base.ink, base.paper, 0.55), line: mix(base.ink, base.paper, 0.14), ground: base.paper, darkGround: false };
  const tok = res.tok;
  const scale = deckScale(tok);
  return {
    treat,
    primary: gp.primary,
    secondary: gp.secondary,
    ink: gp.ink,
    paper: gp.paper,
    muted: gp.muted,
    line: gp.line,
    head: `'${kit.heading.family}','${kit.heading.pptxFallback}',sans-serif`,
    body: `'${kit.body.family}','${kit.body.pptxFallback}',sans-serif`,
    tok,
    ...scale,
    hairline: tok.accent.intensity === "hairline",
    field: tok.accent.intensity === "field",
    ground: res.groundHex,
    topBar: topBarHex(gp, base),
    platePaper: base.paper,
    plateInk: base.ink,
    hideLogo: res.hideLogo,
    res,
  };
}

const fontLink = (kit: BrandKit): string => {
  const families = [kit.heading.googleQuery, kit.body.googleQuery]
    .filter((q, i, a) => a.indexOf(q) === i)
    .map((q) => `family=${q}`)
    .join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`;
};

// ── Fragment helpers ─────────────────────────────────────────────────────────

const imgCover = (slot: ImageSlot, x: number, y: number, w: number, h: number, t: Theme): string =>
  slot.url
    ? `<img src="${esc(slot.url)}" alt="${esc(slot.label)}" style="${abs(x, y, w, h)}object-fit:cover;display:block;">`
    : `<div style="${abs(x, y, w, h)}background:${t.primary}0D;border:1px solid ${t.line};display:flex;align-items:center;justify-content:center;font-size:${fs(t.C(10))};color:${t.muted};">${esc(slot.label)}</div>`;

/** A brand mark in its logo box, plated when logoContrast decided the
 *  ground would swallow it (`lockup` = the field-cover tab). Same fitted
 *  rect + plate geometry as deckBuilder.addLogo. The treatment is looked up
 *  for the slide's EFFECTIVE ground (an override can move a mark onto a
 *  different colour); hideLogo suppresses every mark on the slide. */
const logo = (
  url: string | null,
  box: Box,
  side: "left" | "right" | "center",
  which: "lead" | "co",
  ground: LogoGround,
  t: Theme,
  lockup = false,
): string => {
  if (!url || t.hideLogo) return "";
  const aspect = which === "lead" ? t.treat.leadAspect : t.treat.coAspect;
  const treatment = logoTreatmentAt(t.treat, which, ground, t.ground);
  const fitted = fitLogoBox(box, aspect, side);
  let plate = "";
  if (treatment !== "none") {
    const p = lockup ? lockupBox(fitted) : plateBox(fitted);
    plate = `<div style="${abs(p.x, p.y, p.w, p.h)}background:${treatment === "plate-ink" ? t.plateInk : t.platePaper};border-radius:${px(lockup ? LOCKUP_RADIUS : PLATE_RADIUS)};"></div>`;
  }
  return (
    plate +
    `<img src="${esc(url)}" alt="" style="${abs(fitted.x, fitted.y, fitted.w, fitted.h)}object-fit:contain;object-position:${side} center;">`
  );
};

const kickerStyle = (t: Theme, color?: string): string =>
  `font-family:${t.body};font-size:${fs(t.C(8.5))};font-weight:700;letter-spacing:${ls(2)};text-transform:uppercase;color:${color ?? t.muted};`;

/** Content-slide title block (matches deckBuilder.addTitle). */
const titleBlock = (kicker: string, title: string, t: Theme): string =>
  `<div style="${abs(t.M, 0.42, t.CW, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(9))};letter-spacing:${ls(3)};">${esc(kicker)}</div>` +
  `<div style="${abs(t.M - 0.03, 0.68, t.CW, 0.65)}font-family:${t.head};font-size:${fs(t.T(24))};font-weight:700;color:${t.primary};line-height:1.1;overflow:hidden;">${esc(title)}</div>`;

/** Body-master furniture: (optional) top brand bar + footer. */
const bodyChrome = (meta: DeckMeta, kit: BrandKit, index: number, t: Theme): string => {
  // Aspect known → right-aligned fitted mark (as the pptx places it);
  // unknown → centred contain, matching pptx's own contain sizing.
  const co = logo(kit.coLogoUrl, FOOTER_CO_BOX, t.treat.coAspect ? "right" : "center", "co", "footer", t);
  return (
    (t.tok.accent.topBar ? `<div style="${abs(0, 0, PAGE.w, 0.09)}background:${t.topBar};"></div>` : "") +
    `<div style="${abs(t.M, 7.02, t.CW, 0.01)}background:${t.line};"></div>` +
    `<div style="${abs(t.M, 7.08, 6, 0.3)}${kickerStyle(t)}font-size:${fs(t.C(8))};display:flex;align-items:center;">${esc((kit.leadName ?? meta.agencyName).toUpperCase())}</div>` +
    co +
    `<div style="${abs(12.35, 7.08, 0.6, 0.3)}font-family:${t.body};font-size:${fs(t.C(8))};color:${t.muted};text-align:right;display:flex;align-items:center;justify-content:flex-end;">${index + 1}</div>`
  );
};

/** Cover / closing field geometry (matches the pptx cover masters). */
const fieldGeometry = (t: Theme): string =>
  t.tok.accent.geometry
    ? `<div style="${abs(9.1, -2.9, 7.6, 7.6)}border-radius:50%;background:${t.secondary};opacity:.28;"></div>` +
      `<div style="${abs(10.6, -1.4, 4.6, 4.6)}border-radius:50%;background:${t.secondary};opacity:.45;"></div>` +
      `<div style="${abs(-2.2, 5.6, 5.2, 5.2)}border-radius:50%;background:${t.paper};opacity:.08;"></div>`
    : "";

// ── Layout renderers (geometry mirrors deckBuilder.ts) ───────────────────────

function renderCover(d: CoverSlide, meta: DeckMeta, kit: BrandKit, t: Theme): string {
  const { M, CW } = t;
  const footerText = `${esc(meta.agencyName)}&nbsp;&nbsp;·&nbsp;&nbsp;${esc(meta.dateLabel)}`;
  const leadBox: Box = { x: M, y: 0.55, w: 2.2, h: 0.62 };
  const co = logo(kit.coLogoUrl, COVER_CO_BOX, "right", "co", "cover", t);
  const footerMuted = `<div style="${abs(M, 6.78, 8, 0.35)}font-family:${t.body};font-size:${fs(t.C(10))};letter-spacing:${ls(1)};color:${t.muted};">${footerText}</div>`;
  const bottomRule = `<div style="${abs(M, 6.55, CW, 0.008)}background:${t.line};"></div>`;
  switch (t.res.cover) {
    case "quiet":
      return (
        logo(kit.leadLogoUrl, leadBox, "left", "lead", "cover", t) +
        `<div style="${abs(M, 1.42, CW, 0.02)}background:${t.primary};"></div>` +
        `<div style="${abs(M, 2.78, 10.5, 0.4)}${kickerStyle(t, t.muted)}font-size:${fs(t.C(11))};letter-spacing:${ls(3)};">${esc(d.eyebrow)}</div>` +
        `<div style="${abs(M - 0.05, 3.12, 10.6, 1.95)}font-family:${t.head};font-size:${fs(t.T(44))};font-weight:700;color:${t.primary};line-height:${px(t.T(48) / 72)};overflow:hidden;">${esc(d.title)}</div>` +
        `<div style="${abs(M, 5.1, 9.5, 0.5)}font-family:${t.body};font-size:${fs(t.B(16))};color:${t.ink};">${esc(d.subtitle)}</div>` +
        bottomRule +
        footerMuted +
        co
      );
    case "editorial":
      return (
        `<div style="${abs(M, 0.6, 8, 0.3)}${kickerStyle(t, t.muted)}font-size:${fs(t.C(9))};letter-spacing:${ls(3)};">${esc(d.eyebrow)}</div>` +
        logo(kit.leadLogoUrl, { x: PAGE.w - M - 2.2, y: 0.42, w: 2.2, h: 0.62 }, "right", "lead", "cover", t) +
        `<div style="${abs(M, 0.98, CW, 0.012)}background:${t.ink};"></div>` +
        `<div style="${abs(M - 0.06, 1.3, CW, 3.7)}font-family:${t.head};font-size:${fs(t.T(64))};font-weight:700;color:${t.ink};line-height:${px(t.T(66) / 72)};overflow:hidden;">${esc(d.title)}</div>` +
        `<div style="${abs(M + 0.02, 5.2, 0.9, 0.05)}background:${t.secondary};"></div>` +
        `<div style="${abs(M, 5.35, 9.5, 0.6)}font-family:${t.body};font-size:${fs(t.B(18))};font-style:italic;color:${mix(t.ink, t.paper, 0.72)};">${esc(d.subtitle)}</div>` +
        bottomRule +
        footerMuted +
        co
      );
    case "grid": {
      const cellW = CW / 4;
      const cells = coverMetaCells(meta)
        .map(([label, value], i) => {
          const x = M + i * cellW;
          return (
            (i > 0 ? `<div style="${abs(x - 0.12, 5.48, 0.008, 0.85)}background:${t.line};"></div>` : "") +
            `<div style="${abs(x, 5.48, cellW - 0.24, 0.26)}${kickerStyle(t)}">${esc(label)}</div>` +
            `<div style="${abs(x, 5.74, cellW - 0.24, 0.5)}font-family:${t.head};font-size:${fs(t.T(14))};font-weight:700;color:${t.primary};line-height:1.2;overflow:hidden;">${esc(value)}</div>`
          );
        })
        .join("");
      return (
        `<div style="${abs(0, 0, PAGE.w, 0.09)}background:${t.primary};"></div>` +
        logo(kit.leadLogoUrl, leadBox, "left", "lead", "cover", t) +
        `<div style="${abs(M, 1.95, 10.5, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(10))};letter-spacing:${ls(3)};">${esc(d.eyebrow)}</div>` +
        `<div style="${abs(M - 0.05, 2.3, 10.6, 1.6)}font-family:${t.head};font-size:${fs(t.T(40))};font-weight:700;color:${t.primary};line-height:${px(t.T(44) / 72)};overflow:hidden;">${esc(d.title)}</div>` +
        `<div style="${abs(M, 3.95, 9.5, 0.5)}font-family:${t.body};font-size:${fs(t.B(14))};color:${t.ink};">${esc(d.subtitle)}</div>` +
        `<div style="${abs(M, 5.3, CW, 0.014)}background:${t.primary};"></div>` +
        cells +
        bottomRule +
        footerMuted +
        co
      );
    }
    case "field":
    default:
      return (
        fieldGeometry(t) +
        // Field cover: a plated mark becomes a top-left lockup tab.
        logo(kit.leadLogoUrl, leadBox, "left", "lead", "cover", t, true) +
        `<div style="${abs(M + 0.02, 2.62, 0.9, 0.05)}background:${t.secondary};"></div>` +
        `<div style="${abs(M, 2.78, 10.5, 0.4)}${kickerStyle(t, mix(t.paper, t.ground, 0.78))}font-size:${fs(t.C(11))};letter-spacing:${ls(3)};">${esc(d.eyebrow)}</div>` +
        `<div style="${abs(M - 0.05, 3.12, 10.6, 1.95)}font-family:${t.head};font-size:${fs(t.T(48))};font-weight:700;color:${t.paper};line-height:${px(t.T(52) / 72)};overflow:hidden;">${esc(d.title)}</div>` +
        `<div style="${abs(M, 5.1, 9.5, 0.5)}font-family:${t.body};font-size:${fs(t.B(16))};color:${mix(t.paper, t.ground, 0.9)};">${esc(d.subtitle)}</div>` +
        `<div style="${abs(M, 6.78, 8, 0.35)}font-family:${t.body};font-size:${fs(t.C(10))};letter-spacing:${ls(1)};color:${mix(t.paper, t.ground, 0.65)};">${footerText}</div>` +
        co
      );
  }
}

function renderSection(d: SectionSlide, meta: DeckMeta, t: Theme): string {
  const { M, CW } = t;
  const num = String(d.number).padStart(2, "0");
  const bar =
    t.res.section === "number" || t.res.section === "index"
      ? `<div style="${abs(0, 0, PAGE.w, 0.09)}background:${t.secondary};"></div>`
      : "";
  switch (t.res.section) {
    case "rule":
      return (
        `<div style="${abs(PAGE.w - M - 2.4, 3.42, 2.4, 1.2)}font-family:${t.head};font-size:${fs(t.T(34))};font-weight:700;color:${mix(t.primary, t.paper, 0.3)};display:flex;align-items:center;justify-content:flex-end;">${num}</div>` +
        `<div style="${abs(M, 3.02, 5, 0.3)}${kickerStyle(t, t.muted)}font-size:${fs(t.C(10))};letter-spacing:${ls(4)};">SECTION ${num}</div>` +
        `<div style="${abs(M, 3.38, CW, 0.012)}background:${t.primary};"></div>` +
        `<div style="${abs(M - 0.03, 3.5, 8.2, 1.1)}font-family:${t.head};font-size:${fs(t.T(34))};font-weight:700;color:${t.primary};line-height:1.15;overflow:hidden;">${esc(d.title)}</div>` +
        (d.subtitle
          ? `<div style="${abs(M, 4.6, 7.4, 0.6)}font-family:${t.body};font-size:${fs(t.B(13))};color:${t.muted};">${esc(d.subtitle)}</div>`
          : "")
      );
    case "display":
      return (
        `<div style="${abs(M, 1.2, 5, 0.35)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(10))};letter-spacing:${ls(4)};">SECTION ${num}</div>` +
        `<div style="${abs(M - 0.06, 1.6, CW, 3.6)}font-family:${t.head};font-size:${fs(t.T(64))};font-weight:700;color:${t.paper};line-height:${px(t.T(66) / 72)};overflow:hidden;">${esc(d.title)}</div>` +
        `<div style="${abs(M + 0.02, 5.32, 0.9, 0.05)}background:${t.secondary};"></div>` +
        (d.subtitle
          ? `<div style="${abs(M, 5.48, 9, 0.7)}font-family:${t.body};font-size:${fs(t.B(15))};font-style:italic;color:${mix(t.paper, t.ground, 0.7)};">${esc(d.subtitle)}</div>`
          : "")
      );
    case "index":
      return (
        bar +
        `<div style="${abs(M, 2.85, 0.95, 0.95)}background:${t.secondary};color:${t.paper};font-family:${t.head};font-size:${fs(t.T(28))};font-weight:700;display:flex;align-items:center;justify-content:center;">${num}</div>` +
        `<div style="${abs(M + 1.2, 2.85, 8.5, 0.95)}font-family:${t.head};font-size:${fs(t.T(34))};font-weight:700;color:${t.paper};line-height:1.15;overflow:hidden;display:flex;align-items:center;">${esc(d.title)}</div>` +
        (d.subtitle
          ? `<div style="${abs(M + 1.2, 3.85, 7.4, 0.6)}font-family:${t.body};font-size:${fs(t.B(13))};color:${mix(t.paper, t.ground, 0.62)};">${esc(d.subtitle)}</div>`
          : "") +
        `<div style="${abs(M, 6.3, CW, 0.008)}background:${mix(t.paper, t.ground, 0.25)};"></div>` +
        `<div style="${abs(M, 6.42, CW, 0.35)}${kickerStyle(t, mix(t.paper, t.ground, 0.6))}font-size:${fs(t.C(9))};">${esc(sectionMetaLine(meta))}</div>`
      );
    case "number":
    default:
      return (
        bar +
        `<div style="${abs(6.6, 0.7, 6.4, 6.4)}font-family:${t.head};font-size:${fs(250)};font-weight:700;color:${mix(t.secondary, t.ground, 0.42)};display:flex;align-items:center;justify-content:flex-end;line-height:1;">${num}</div>` +
        `<div style="${abs(M + 0.02, 3.02, 0.9, 0.05)}background:${t.secondary};"></div>` +
        `<div style="${abs(M, 3.18, 5, 0.35)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(10))};letter-spacing:${ls(4)};">SECTION ${num}</div>` +
        `<div style="${abs(M - 0.03, 3.5, 8.2, 1.1)}font-family:${t.head};font-size:${fs(t.T(34))};font-weight:700;color:${t.paper};line-height:1.15;overflow:hidden;">${esc(d.title)}</div>` +
        (d.subtitle
          ? `<div style="${abs(M, 4.6, 7.4, 0.6)}font-family:${t.body};font-size:${fs(t.B(13))};color:${mix(t.paper, t.ground, 0.62)};">${esc(d.subtitle)}</div>`
          : "")
      );
  }
}

function renderBriefSummary(d: BriefSummarySlide, t: Theme): string {
  const { M, S } = t;
  let out = titleBlock("The Ask", d.title, t);
  let y = 1.75;
  for (const f of d.facts.slice(0, 5)) {
    out += `<div style="${abs(M, y, 4.2, 0.26)}${kickerStyle(t)}">${esc(f.label)}</div>`;
    out += `<div style="${abs(M, y + 0.24, 4.2, 0.55)}font-family:${t.body};font-size:${fs(t.B(13.5))};font-weight:700;color:${t.ink};overflow:hidden;">${esc(f.value)}</div>`;
    y += S(0.92);
    out += `<div style="${abs(M, y - 0.12, 4.2, 0.01)}background:${t.line};"></div>`;
  }
  const rx = 5.55;
  const rw = PAGE.w - M - rx;
  let ry = 1.75;
  if (d.objectives.length) {
    out += `<div style="${abs(rx, ry, rw, 0.26)}${kickerStyle(t, t.secondary)}">Objectives</div>`;
    ry += 0.32;
    if (t.tok.prose) {
      const h = S(0.56) * d.objectives.length;
      out += `<div style="${abs(rx, ry, rw, h)}font-family:${t.body};font-size:${fs(t.B(12.5))};color:${t.ink};line-height:${px(t.B(19) / 72)};overflow:hidden;">${esc(proseJoin(d.objectives))}</div>`;
      ry += h;
    } else {
      for (const o of d.objectives) {
        out += `<div style="${abs(rx + 0.02, ry + 0.09, 0.14, 0.045)}background:${t.secondary};"></div>`;
        out += `<div style="${abs(rx + 0.3, ry, rw - 0.3, 0.52)}font-family:${t.body};font-size:${fs(t.B(11.5))};color:${t.ink};line-height:1.3;overflow:hidden;">${esc(o)}</div>`;
        ry += S(0.56);
      }
    }
    ry += 0.18;
  }
  if (d.audiences.length) {
    out += `<div style="${abs(rx, ry, rw, 0.26)}${kickerStyle(t, t.secondary)}">Who we're designing for</div>`;
    ry += 0.34;
    for (const a of d.audiences) {
      out += `<div style="${abs(rx, ry, rw, 0.5)}font-family:${t.body};font-size:${fs(t.B(10.5))};line-height:1.35;overflow:hidden;"><b style="color:${t.primary};">${esc(a.name)}</b><span style="color:${t.muted};">${a.description ? "&nbsp;&nbsp;—&nbsp;&nbsp;" + esc(a.description) : ""}</span></div>`;
      ry += S(0.5);
    }
  }
  return out;
}

function renderConcept(d: ConceptSlide, t: Theme): string {
  const { M, CW, S } = t;
  let out = `<div style="${abs(M, 0.55, CW, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(9))};letter-spacing:${ls(3)};">The Big Idea</div>`;
  out += `<div style="${abs(M - 0.04, 0.9, 9.2, 1.7)}font-family:${t.head};font-size:${fs(t.T(32))};font-weight:700;color:${t.primary};line-height:${px(t.T(36) / 72)};overflow:hidden;">${esc(d.headline)}</div>`;
  let ny = 2.7;
  if (d.subheadline) {
    out += `<div style="${abs(M, ny, 7.2, 0.55)}font-family:${t.body};font-size:${fs(t.B(14))};font-style:italic;color:${t.secondary};overflow:hidden;">${esc(d.subheadline)}</div>`;
    ny += 0.62;
  }
  out += `<div style="${abs(M, ny, 7.2, 6.55 - ny)}font-family:${t.body};font-size:${fs(t.B(12.5))};color:${t.ink};line-height:${px(t.B(19) / 72)};overflow:hidden;">${esc(d.narrative)}</div>`;
  const pxCol = 8.35;
  const pw = PAGE.w - M - pxCol;
  let py = 2.7;
  d.points.forEach((point, i) => {
    if (t.tok.prose) {
      out += `<div style="${abs(pxCol, py, pw, 0.008)}background:${t.line};"></div>`;
      out += `<div style="${abs(pxCol, py + 0.1, 0.5, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(9))};">${String(i + 1).padStart(2, "0")}</div>`;
      out += `<div style="${abs(pxCol + 0.5, py + 0.08, pw - 0.5, 1.05)}font-family:${t.body};font-size:${fs(t.B(11.5))};color:${t.ink};line-height:1.35;overflow:hidden;">${esc(point)}</div>`;
    } else {
      out += `<div style="${abs(pxCol, py, 0.34, 0.34)}border-radius:50%;background:${t.primary};color:${t.paper};font-family:${t.head};font-size:${fs(t.T(11))};font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</div>`;
      out += `<div style="${abs(pxCol + 0.5, py - 0.03, pw - 0.5, 1.15)}font-family:${t.body};font-size:${fs(t.B(10.5))};color:${t.ink};line-height:1.35;overflow:hidden;">${esc(point)}</div>`;
    }
    py += S(1.28);
  });
  return out;
}

function renderElementGrid(d: ElementGridSlide, t: Theme): string {
  const { M, CW, S } = t;
  let out = titleBlock("The Concept", d.title, t);
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
    out += t.hairline
      ? `<div style="${abs(cx, cy, cw, 0.008)}background:${t.line};"></div>`
      : `<div style="${abs(cx, cy, cw, ch)}background:${t.primary}${alpha(t.tok.accent.panelTransparency)};border:1px solid ${t.line};border-radius:${px(0.08)};"></div>`;
    out += `<div style="${abs(cx + 0.24, cy + 0.28, 0.42, 0.05)}background:${t.secondary};"></div>`;
    out += `<div style="${abs(cx + 0.2, cy + 0.38, cw - 0.44, 0.5)}font-family:${t.head};font-size:${fs(t.T(13))};font-weight:700;color:${t.primary};line-height:1.2;overflow:hidden;">${esc(card.title)}</div>`;
    out += `<div style="${abs(cx + 0.2, cy + 0.88, cw - 0.44, ch - 1.05)}font-family:${t.body};font-size:${fs(t.B(9.5))};color:${mix(t.ink, t.paper, 0.82)};line-height:${px(t.B(13) / 72)};overflow:hidden;">${esc(card.body)}</div>`;
  });
  return out;
}

function renderSpatial(d: SpatialSlide, t: Theme): string {
  const { M, S } = t;
  let out = titleBlock("The Space", d.title, t);
  const hasImage = !!d.image;
  const tableX = hasImage ? 7.5 : M;
  const tableW = PAGE.w - M - tableX;
  const lead = t.tok.tables.numbersLead;

  if (d.image) {
    const box = { x: M, y: 1.62, w: 6.55, h: 4.75 };
    out += `<div style="${abs(box.x - 0.04, box.y - 0.04, box.w + 0.08, box.h + 0.08)}background:${t.paper};border:1px solid ${t.line};"></div>`;
    out += d.image.url
      ? `<img src="${esc(d.image.url)}" alt="${esc(d.image.label)}" style="${abs(box.x, box.y, box.w, box.h)}object-fit:contain;">`
      : "";
    out += `<div style="${abs(box.x, box.y + box.h + 0.08, box.w, 0.28)}${kickerStyle(t)}">${esc(d.image.label)}</div>`;
  }

  let y = 1.62;
  if (lead) {
    out += `<div style="${abs(tableX, y, 1.4, 0.26)}${kickerStyle(t)}">Sq Ft</div>`;
    out += `<div style="${abs(tableX + 1.4, y, tableW - 1.4, 0.26)}${kickerStyle(t)}">Zone</div>`;
  } else {
    out += `<div style="${abs(tableX, y, tableW - 1.4, 0.26)}${kickerStyle(t)}">Zone</div>`;
    out += `<div style="${abs(tableX + tableW - 1.4, y, 1.4, 0.26)}${kickerStyle(t)}text-align:right;">Sq Ft</div>`;
  }
  y += 0.32;
  out += `<div style="${abs(tableX, y, tableW, 0.014)}background:${t.primary};"></div>`;
  y += 0.08;
  const rowH = S(d.zones.length > 6 ? 0.5 : 0.58);
  for (const z of d.zones) {
    const name = (x: number, w: number) =>
      `<div style="${abs(x, y, w, rowH)}font-family:${t.body};display:flex;flex-direction:column;justify-content:center;overflow:hidden;"><b style="font-size:${fs(t.B(11))};color:${t.ink};">${esc(z.name)}</b>${z.note ? `<span style="font-size:${fs(t.C(8.5))};color:${t.muted};">${esc(z.note)}</span>` : ""}</div>`;
    const sqft = z.sqft.toLocaleString("en-US");
    if (lead) {
      out += `<div style="${abs(tableX, y, 1.4, rowH)}font-family:${t.head};font-size:${fs(t.T(13))};font-weight:700;color:${t.primary};display:flex;align-items:center;">${sqft}</div>`;
      out += name(tableX + 1.4, tableW - 1.4);
    } else {
      out += name(tableX, tableW - 1.4);
      out += `<div style="${abs(tableX + tableW - 1.4, y, 1.4, rowH)}font-family:${t.body};font-size:${fs(t.B(11))};font-weight:700;color:${t.ink};display:flex;align-items:center;justify-content:flex-end;">${sqft}</div>`;
    }
    y += rowH;
    out += `<div style="${abs(tableX, y, tableW, 0.008)}background:${t.line};"></div>`;
    y += 0.02;
  }
  if (typeof d.totalSqft === "number") {
    y += 0.06;
    const totalText = d.totalSqft.toLocaleString("en-US");
    if (lead) {
      out += `<div style="${abs(tableX, y, 1.6, 0.4)}font-family:${t.head};font-size:${fs(t.T(14))};font-weight:700;color:${t.primary};display:flex;align-items:center;">${totalText}</div>`;
      out += `<div style="${abs(tableX + 1.6, y, tableW - 1.6, 0.4)}${kickerStyle(t, t.primary)}font-size:${fs(t.C(10))};letter-spacing:${ls(1)};display:flex;align-items:center;">${esc(d.boothSize)} TOTAL</div>`;
    } else {
      out += `<div style="${abs(tableX, y, tableW - 1.6, 0.4)}${kickerStyle(t, t.primary)}font-size:${fs(t.C(10))};letter-spacing:${ls(1)};display:flex;align-items:center;">${esc(d.boothSize)} TOTAL</div>`;
      out += `<div style="${abs(tableX + tableW - 1.6, y, 1.6, 0.4)}font-family:${t.head};font-size:${fs(t.T(14))};font-weight:700;color:${t.primary};display:flex;align-items:center;justify-content:flex-end;">${totalText}</div>`;
    }
  }
  return out;
}

function renderRenderFull(d: RenderFullSlide, meta: DeckMeta, t: Theme): string {
  const { M, CW } = t;
  if (t.res.framing === "inset") {
    return (
      imgCover(d.image, M, 0.95, CW, 5.4, t) +
      `<div style="${abs(M, 6.58, 0.5, 0.045)}background:${t.secondary};"></div>` +
      `<div style="${abs(M + 0.62, 6.46, 9.5, 0.3)}${kickerStyle(t, t.primary)}font-size:${fs(t.C(11))};letter-spacing:${ls(3)};display:flex;align-items:center;">${esc(d.caption)}</div>` +
      `<div style="${abs(9.2, 6.46, 3.5, 0.3)}font-family:${t.body};font-size:${fs(t.C(8.5))};letter-spacing:${ls(1)};color:${t.muted};display:flex;align-items:center;justify-content:flex-end;">${esc(meta.projectName)}</div>`
    );
  }
  return (
    imgCover(d.image, 0, 0, PAGE.w, PAGE.h, t) +
    `<div style="${abs(0, 6.72, PAGE.w, 0.78)}background:${t.ink}B8;"></div>` +
    `<div style="${abs(M, 6.98, 0.5, 0.045)}background:${t.secondary};"></div>` +
    `<div style="${abs(M + 0.62, 6.86, 9.5, 0.3)}${kickerStyle(t, t.paper)}font-size:${fs(t.C(11))};letter-spacing:${ls(3)};display:flex;align-items:center;">${esc(d.caption)}</div>` +
    `<div style="${abs(9.2, 6.86, 3.5, 0.3)}font-family:${t.body};font-size:${fs(t.C(8.5))};letter-spacing:${ls(1)};color:${mix(t.paper, t.ink, 0.7)};display:flex;align-items:center;justify-content:flex-end;">${esc(meta.projectName)}</div>`
  );
}

function renderRenderGrid(d: RenderGridSlide, t: Theme): string {
  const { M, CW, S } = t;
  let out = titleBlock("The Space", d.title, t);
  const imgs = d.images.slice(0, 4);
  const gap = S(0.26);
  const capH = 0.3;
  const fig = t.tok.images.figureNumbers;
  if (imgs.length <= 2) {
    const fw = (CW - gap) / 2;
    const fh = 4.55;
    imgs.forEach((slot, i) => {
      const x = M + i * (fw + gap);
      out += imgCover(slot, x, 1.62, fw, fh, t);
      out += `<div style="${abs(x, 1.62 + fh + 0.08, fw, capH)}${kickerStyle(t)}">${esc(figureCaption(slot.label, i, fig))}</div>`;
    });
  } else {
    const fw = (CW - gap) / 2;
    const fh = 2.28;
    imgs.forEach((slot, i) => {
      const x = M + (i % 2) * (fw + gap);
      const y = 1.58 + Math.floor(i / 2) * (fh + capH + 0.18);
      out += imgCover(slot, x, y, fw, fh, t);
      out += `<div style="${abs(x, y + fh + 0.04, fw, capH)}${kickerStyle(t)}">${esc(figureCaption(slot.label, i, fig))}</div>`;
    });
  }
  return out;
}

/** Walkthrough video — mirrors deckBuilder.drawVideo. The frame holds a real
 *  <video> (poster shown until play; the print/PDF path shows the poster);
 *  the meta column carries the caption, facts and a link to the clip. */
function renderVideo(d: VideoSlide, meta: DeckMeta, t: Theme): string {
  const { M, S } = t;
  let out = titleBlock("The Space", d.title, t);
  const frame = videoFrame(M);
  out += `<div style="${abs(frame.x, frame.y, frame.w, frame.h)}background:${t.plateInk};"></div>`;
  out += `<video controls preload="metadata" src="${esc(d.videoUrl)}"${d.posterUrl ? ` poster="${esc(d.posterUrl)}"` : ""} style="${abs(frame.x, frame.y, frame.w, frame.h)}object-fit:contain;background:${t.plateInk};display:block;"></video>`;
  const capY = frame.y + frame.h + 0.08;
  out += `<div style="${abs(frame.x, capY, frame.w / 2, 0.28)}${kickerStyle(t)}">Walkthrough video</div>`;
  out += `<div style="${abs(frame.x + frame.w / 2, capY, frame.w / 2, 0.28)}font-family:${t.body};font-size:${fs(t.C(8.5))};letter-spacing:${ls(1)};color:${t.muted};text-align:right;">${esc(meta.projectName)}</div>`;
  const rx = frame.x + frame.w + VIDEO_COL_GAP;
  const rw = PAGE.w - M - rx;
  out += `<div style="${abs(rx, frame.y, rw, 0.26)}${kickerStyle(t, t.secondary)}">In motion</div>`;
  out += `<div style="${abs(rx - 0.03, frame.y + 0.32, rw, 1.3)}font-family:${t.head};font-size:${fs(t.T(18))};font-weight:700;color:${t.primary};line-height:${px(t.T(22) / 72)};overflow:hidden;">${esc(d.caption)}</div>`;
  let y = frame.y + 1.78;
  out += `<div style="${abs(rx, y, rw, 0.008)}background:${t.line};"></div>`;
  y += 0.16;
  for (const [label, value] of videoFacts(d)) {
    out += `<div style="${abs(rx, y, rw, 0.26)}${kickerStyle(t)}">${esc(label)}</div>`;
    out += `<div style="${abs(rx, y + 0.24, rw, 0.4)}font-family:${t.body};font-size:${fs(t.B(13.5))};font-weight:700;color:${t.ink};overflow:hidden;">${esc(value)}</div>`;
    y += S(0.82);
    out += `<div style="${abs(rx, y - 0.12, rw, 0.008)}background:${t.line};"></div>`;
  }
  out += `<a href="${esc(d.videoUrl)}" target="_blank" rel="noopener" style="${abs(rx, frame.y + frame.h - 0.3, rw, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(t.C(9))};letter-spacing:${ls(3)};display:flex;align-items:center;text-decoration:none;">Open video →</a>`;
  return out;
}

function renderBudget(d: BudgetSlide, t: Theme): string {
  const { M, CW, S } = t;
  let out = titleBlock("The Investment", d.title, t);
  const lead = t.tok.tables.numbersLead;
  const headColor = t.field ? t.paper : undefined;
  const headBg = t.field ? `background:${t.primary};` : "";
  // When numbers lead, the category cell follows the right-aligned share
  // cell; the pptx table separates them with its 0.08in cell margins, so
  // give the category cell the same breathing room here.
  const catPad = lead ? `padding-left:${px(0.16)};` : "";
  const cellCategory = (r: BudgetSlide["rows"][number]) =>
    `<div style="flex:1;${catPad}font-size:${fs(t.B(11))};color:${t.ink};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"><b>${esc(r.category)}</b>${r.description ? `<span style="font-size:${fs(t.C(9))};color:${t.muted};">&nbsp;&nbsp;&nbsp;${esc(r.description)}</span>` : ""}</div>`;
  const cellShare = (r: BudgetSlide["rows"][number]) =>
    `<div style="width:${px(1.2)};text-align:right;font-size:${fs(t.C(10))};color:${t.muted};">${typeof r.percentage === "number" ? r.percentage + "%" : ""}</div>`;
  const cellAmount = (r: BudgetSlide["rows"][number]) =>
    lead
      ? `<div style="width:${px(2.0)};text-align:left;font-family:${t.head};font-size:${fs(t.T(12))};font-weight:700;color:${t.primary};">$${r.amount.toLocaleString("en-US")}</div>`
      : `<div style="width:${px(2.0)};text-align:right;font-size:${fs(t.B(11))};font-weight:700;color:${t.ink};">$${r.amount.toLocaleString("en-US")}</div>`;
  const SEP = "\n        ";
  const rowsHtml = d.rows
    .map(
      (r, i) => `
      <div style="display:flex;align-items:center;min-height:${px(S(0.42))};background:${t.tok.accent.zebra && i % 2 === 1 ? t.primary + alpha(96) : "transparent"};border-bottom:1px solid ${t.line};padding:0 ${px(0.08)};">
        ${(lead ? [cellAmount(r), cellShare(r), cellCategory(r)] : [cellCategory(r), cellShare(r), cellAmount(r)]).join(SEP)}
      </div>`,
    )
    .join("");
  const headCategory = `<div style="flex:1;${catPad}${kickerStyle(t, headColor)}">Category</div>`;
  const headShare = `<div style="width:${px(1.2)};text-align:right;${kickerStyle(t, headColor)}">Share</div>`;
  const headAmount = `<div style="width:${px(2.0)};text-align:${lead ? "left" : "right"};${kickerStyle(t, headColor)}">Amount</div>`;
  const totalLabel = `<div style="flex:1;${catPad}${kickerStyle(t, t.primary)}font-size:${fs(t.C(10))};">${esc(d.totalLabel)}</div>`;
  const totalAmount = lead
    ? `<div style="width:${px(2.0)};text-align:left;font-family:${t.head};font-size:${fs(t.T(15))};font-weight:700;color:${t.primary};">$${d.total.toLocaleString("en-US")}</div><div style="width:${px(1.2)};"></div>`
    : `<div style="width:${px(3.2)};text-align:right;font-family:${t.head};font-size:${fs(t.T(15))};font-weight:700;color:${t.primary};">$${d.total.toLocaleString("en-US")}</div>`;
  out += `
    <div style="${abs(M, 1.6, CW, 5.3)}font-family:${t.body};">
      <div style="display:flex;align-items:center;min-height:${px(S(0.42))};${headBg}border-bottom:2px solid ${t.primary};padding:0 ${px(0.08)};">
        ${(lead ? [headAmount, headShare, headCategory] : [headCategory, headShare, headAmount]).join(SEP)}
      </div>
      ${rowsHtml}
      <div style="display:flex;align-items:center;min-height:${px(0.52)};background:${t.primary}${alpha(92)};border-top:2px solid ${t.primary};padding:0 ${px(0.08)};">
        ${(lead ? [totalAmount, totalLabel] : [totalLabel, totalAmount]).join(SEP)}
      </div>
    </div>`;
  return out;
}

function renderMaterials(d: MaterialsSlide, t: Theme): string {
  const { M, CW, S } = t;
  let out = titleBlock("The Investment", d.title, t);
  const lead = t.tok.tables.numbersLead;
  let y = 1.65;
  out += `<div style="${abs(M, y, CW, 0.014)}background:${t.primary};"></div>`;
  y += 0.1;
  const rowH = S(d.rows.length > 6 ? 0.52 : 0.62);
  for (const r of d.rows) {
    const text = (x: number, w: number) =>
      `<div style="${abs(x, y, w, rowH)}font-family:${t.body};display:flex;flex-direction:column;justify-content:center;overflow:hidden;"><b style="font-size:${fs(t.B(11.5))};color:${t.ink};">${esc(r.category)}</b>${r.summary ? `<span style="font-size:${fs(t.C(8.5))};color:${t.muted};white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${esc(r.summary)}</span>` : ""}</div>`;
    const hasSub = typeof r.subtotal === "number";
    const sub = hasSub ? "$" + (r.subtotal as number).toLocaleString("en-US") : "";
    if (lead) {
      if (hasSub) {
        out += `<div style="${abs(M, y, 1.8, rowH)}font-family:${t.head};font-size:${fs(t.T(13))};font-weight:700;color:${t.primary};display:flex;align-items:center;">${sub}</div>`;
      }
      out += text(M + 1.8, CW - 1.8);
    } else {
      out += text(M, CW - 1.8);
      if (hasSub) {
        out += `<div style="${abs(M + CW - 1.8, y, 1.8, rowH)}font-family:${t.body};font-size:${fs(t.B(11.5))};font-weight:700;color:${t.ink};display:flex;align-items:center;justify-content:flex-end;">${sub}</div>`;
      }
    }
    y += rowH;
    out += `<div style="${abs(M, y, CW, 0.008)}background:${t.line};"></div>`;
    y += 0.03;
  }
  if (typeof d.total === "number") {
    y += 0.08;
    const totalText = "$" + d.total.toLocaleString("en-US");
    if (lead) {
      out += `<div style="${abs(M, y, 2.2, 0.45)}font-family:${t.head};font-size:${fs(t.T(16))};font-weight:700;color:${t.primary};display:flex;align-items:center;">${totalText}</div>`;
      out += `<div style="${abs(M + 2.2, y, CW - 2.2, 0.45)}${kickerStyle(t, t.primary)}font-size:${fs(t.C(10))};display:flex;align-items:center;">Estimated materials total</div>`;
    } else {
      out += `<div style="${abs(M, y, CW - 2.2, 0.45)}${kickerStyle(t, t.primary)}font-size:${fs(t.C(10))};display:flex;align-items:center;">Estimated materials total</div>`;
      out += `<div style="${abs(M + CW - 2.2, y, 2.2, 0.45)}font-family:${t.head};font-size:${fs(t.T(16))};font-weight:700;color:${t.primary};display:flex;align-items:center;justify-content:flex-end;">${totalText}</div>`;
    }
    y += 0.5;
  }
  if (d.note) {
    out += `<div style="${abs(M, Math.min(y + 0.05, 6.4), CW, 0.5)}font-family:${t.body};font-size:${fs(t.C(9))};font-style:italic;color:${t.muted};">${esc(d.note)}</div>`;
  }
  return out;
}

function renderNextSteps(d: NextStepsSlide, t: Theme): string {
  const { M, CW } = t;
  let out = titleBlock("Next Steps", d.title, t);
  const steps = d.steps.slice(0, 5);
  const startY = 1.7;
  const availH = (d.timelineNote ? 6.0 : 6.6) - startY;
  const stepH = availH / steps.length;
  steps.forEach((step, i) => {
    const y = startY + i * stepH;
    if (i < steps.length - 1) {
      out += `<div style="${abs(M + 0.185, y + 0.42, 0.012, stepH - 0.42)}background:${t.line};"></div>`;
    }
    out += `<div style="${abs(M, y, 0.38, 0.38)}border-radius:50%;background:${t.primary};color:${t.paper};font-family:${t.head};font-size:${fs(t.T(12))};font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</div>`;
    out += `<div style="${abs(M + 0.6, y - 0.02, 5.4, 0.4)}font-family:${t.head};font-size:${fs(t.T(14))};font-weight:700;color:${t.primary};overflow:hidden;">${esc(step.title)}</div>`;
    if (step.detail) {
      out += `<div style="${abs(6.4, y, PAGE.w - M - 6.4, stepH - 0.1)}font-family:${t.body};font-size:${fs(t.B(10.5))};color:${mix(t.ink, t.paper, 0.8)};line-height:1.4;overflow:hidden;">${esc(step.detail)}</div>`;
    }
  });
  if (d.timelineNote) {
    const noteStyle = `${kickerStyle(t, mix(t.secondary, t.ink, 0.85))}font-size:${fs(t.C(10))};`;
    out += t.hairline
      ? `<div style="${abs(M, 6.15, CW, 0.008)}background:${t.line};"></div>` +
        `<div style="${abs(M, 6.15, CW, 0.55)}display:flex;align-items:center;${noteStyle}">${esc(d.timelineNote)}</div>`
      : `<div style="${abs(M, 6.15, CW, 0.55)}background:${t.secondary}${alpha(92)};border-radius:${px(0.08)};display:flex;align-items:center;padding:0 ${px(0.25)};box-sizing:border-box;${noteStyle}">${esc(d.timelineNote)}</div>`;
  }
  return out;
}

function renderClosing(d: ClosingSlide, kit: BrandKit, t: Theme): string {
  const { M, S } = t;
  const onPaper = t.res.onPaper;
  const lead = logo(kit.leadLogoUrl, { x: M, y: 6.55, w: 1.9, h: 0.55 }, "left", "lead", "closing", t);
  const co = logo(kit.coLogoUrl, CLOSING_CO_BOX, "right", "co", "closing", t);
  let out =
    fieldGeometry(t) +
    `<div style="${abs(M - 0.04, 2.35, 9.6, 1.4)}font-family:${t.head};font-size:${fs(t.T(44))};font-weight:700;color:${onPaper ? t.primary : t.paper};overflow:hidden;">${esc(d.headline)}</div>`;
  if (d.subline) {
    out += `<div style="${abs(M + 0.02, 3.85, 0.9, 0.05)}background:${t.secondary};"></div>`;
    out += `<div style="${abs(M, 3.98, 8.5, 0.5)}font-family:${t.body};font-size:${fs(t.B(15))};color:${onPaper ? t.ink : mix(t.paper, t.ground, 0.88)};">${esc(d.subline)}</div>`;
  }
  let y = 4.85;
  for (const c of d.contacts.slice(0, 3)) {
    const rest = [c.email, c.phone].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
    out += `<div style="${abs(M, y, 10.5, 0.38)}font-family:${t.body};font-size:${fs(t.B(12))};"><b style="color:${onPaper ? t.primary : t.paper};">${esc(c.name)}</b><span style="color:${onPaper ? t.muted : mix(t.paper, t.ground, 0.72)};">${rest ? "&nbsp;&nbsp;·&nbsp;&nbsp;" + rest : ""}</span></div>`;
    y += S(0.42);
  }
  return out + lead + co;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** One slide → a self-contained 1280×720 artboard HTML string.
 *  `logoTreatments` (logoContrast.computeLogoTreatments) must be the same
 *  object handed to buildDeckPptx for the preview to match the download;
 *  omitted → bare marks, today's output. `overrides` (deckOps
 *  SlideOverrides) force the ground / logo / accent for this slide; omitted
 *  → the style's own answer. */
export function renderSlideHtml(
  slide: SlideSpec,
  kit: BrandKit,
  index: number,
  total: number,
  meta?: DeckMeta,
  style?: DeckStyleId | DeckStyleTokens | null,
  logoTreatments?: LogoTreatments | null,
  overrides?: SlideOverrides | null,
): string {
  const tok = typeof style === "object" && style ? style : resolveDeckStyle(style);
  const res = resolveSlide(slide, tok, kitGrounds(kit), overrides);
  const t = themeFor(kit, res, logoTreatments ?? NO_LOGO_TREATMENTS);
  const m: DeckMeta = meta ?? {
    projectName: "",
    clientName: kit.client.name ?? "",
    agencyName: kit.agency.name ?? kit.leadName ?? "",
    boothSize: "",
    dateLabel: "",
  };
  let inner = "";
  switch (slide.layout) {
    case "cover": inner = renderCover(slide, m, kit, t); break;
    case "section": inner = renderSection(slide, m, t); break;
    case "briefSummary": inner = renderBriefSummary(slide, t); break;
    case "concept": inner = renderConcept(slide, t); break;
    case "elementGrid": inner = renderElementGrid(slide, t); break;
    case "spatial": inner = renderSpatial(slide, t); break;
    case "renderFull": inner = renderRenderFull(slide, m, t); break;
    case "renderGrid": inner = renderRenderGrid(slide, t); break;
    case "video": inner = renderVideo(slide, m, t); break;
    case "budget": inner = renderBudget(slide, t); break;
    case "materials": inner = renderMaterials(slide, t); break;
    case "nextSteps": inner = renderNextSteps(slide, t); break;
    case "closing": inner = renderClosing(slide, kit, t); break;
  }
  // Body-master chrome for content layouts (matches MASTER.body in the pptx).
  const chrome = onBodyMaster(slide.layout, res) ? bodyChrome(m, kit, index, t) : "";
  void total;
  return (
    fontLink(kit) +
    `<div class="deck-slide" data-layout="${slide.layout}" data-ground="${res.ground}" style="position:relative;width:1280px;height:720px;overflow:hidden;background:${t.ground};font-family:${t.body};-webkit-font-smoothing:antialiased;">` +
    chrome +
    inner +
    `</div>`
  );
}

/** Whole deck → one HTML document body (for preview scroll / print-to-PDF).
 *  `overrides` is the deck's per-slide override map keyed by slide index. */
export function renderDeckHtml(
  spec: DeckSpec,
  kit: BrandKit,
  style?: DeckStyleId | DeckStyleTokens | null,
  logoTreatments?: LogoTreatments | null,
  overrides?: Record<string, SlideOverrides> | null,
): string {
  const slides = spec.slides
    .map((s, i) =>
      renderSlideHtml(s, kit, i, spec.slides.length, spec.meta, style, logoTreatments, overrides?.[String(i)] ?? null),
    )
    .join('\n<div style="height:24px"></div>\n');
  return (
    fontLink(kit) +
    `<div class="deck-preview" style="display:flex;flex-direction:column;align-items:center;background:#E8EAED;padding:24px 0;">` +
    slides +
    `</div>`
  );
}
