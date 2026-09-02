// deckSlideHtml — DeckSpec + BrandKit → self-contained HTML artboards.
//
// Mirrors the pptxgenjs layouts in deckBuilder.ts 1:1 (same geometry in
// inches, rendered at 96px/in on a 1280×720 artboard) so the on-screen
// preview and the PDF path show exactly what the .pptx will look like.
// If you change slide geometry in deckBuilder.ts, change it here too.
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
  DeckMeta,
} from "./deckSpec";

// ── Unit + color helpers (kept local so this module stays pptx-free) ─────────

const IN = 96; // px per inch — 13.333in × 96 = 1280, 7.5in × 96 = 720
const px = (inches: number): string => `${Math.round(inches * IN * 10) / 10}px`;
const fs = (pt: number): string => `${Math.round(pt * (IN / 72) * 10) / 10}px`;
/** pptx charSpacing (pt) → CSS letter-spacing */
const ls = (pt: number): string => `${Math.round(pt * (IN / 72) * 100) / 100}px`;

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
const M = 0.6;
const CW = PAGE.w - M * 2;

interface Theme {
  primary: string;
  secondary: string;
  ink: string;
  paper: string;
  muted: string;
  line: string;
  head: string;
  body: string;
}

function themeFrom(kit: BrandKit): Theme {
  const ink = cssHex(kit.ink, "#101418");
  const paper = cssHex(kit.paper, "#FFFFFF");
  return {
    primary: cssHex(kit.primary, "#0B1B2B"),
    secondary: cssHex(kit.secondary, "#4F6BE8"),
    ink,
    paper,
    muted: mix(ink, paper, 0.55),
    line: mix(ink, paper, 0.14),
    head: `'${kit.heading.family}','${kit.heading.pptxFallback}',sans-serif`,
    body: `'${kit.body.family}','${kit.body.pptxFallback}',sans-serif`,
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
    : `<div style="${abs(x, y, w, h)}background:${t.primary}0D;border:1px solid ${t.line};display:flex;align-items:center;justify-content:center;font-size:${fs(10)};color:${t.muted};">${esc(slot.label)}</div>`;

const kickerStyle = (t: Theme, color?: string): string =>
  `font-family:${t.body};font-size:${fs(8.5)};font-weight:700;letter-spacing:${ls(2)};text-transform:uppercase;color:${color ?? t.muted};`;

/** Content-slide title block (matches deckBuilder.addTitle). */
const titleBlock = (kicker: string, title: string, t: Theme): string =>
  `<div style="${abs(M, 0.42, CW, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(9)};letter-spacing:${ls(3)};">${esc(kicker)}</div>` +
  `<div style="${abs(M - 0.03, 0.68, CW, 0.65)}font-family:${t.head};font-size:${fs(24)};font-weight:700;color:${t.primary};line-height:1.1;overflow:hidden;">${esc(title)}</div>`;

/** Body-master furniture: top brand bar + footer. */
const bodyChrome = (meta: DeckMeta, kit: BrandKit, index: number, t: Theme): string => {
  const co = kit.coLogoUrl
    ? `<img src="${esc(kit.coLogoUrl)}" alt="" style="${abs(11.35, 7.06, 1.0, 0.3)}object-fit:contain;">`
    : "";
  return (
    `<div style="${abs(0, 0, PAGE.w, 0.09)}background:${t.primary};"></div>` +
    `<div style="${abs(M, 7.02, CW, 0.01)}background:${t.line};"></div>` +
    `<div style="${abs(M, 7.08, 6, 0.3)}${kickerStyle(t)}font-size:${fs(8)};display:flex;align-items:center;">${esc((kit.leadName ?? meta.agencyName).toUpperCase())}</div>` +
    co +
    `<div style="${abs(12.35, 7.08, 0.6, 0.3)}font-family:${t.body};font-size:${fs(8)};color:${t.muted};text-align:right;display:flex;align-items:center;justify-content:flex-end;">${index + 1}</div>`
  );
};

// ── Layout renderers (geometry mirrors deckBuilder.ts) ───────────────────────

function renderCover(d: CoverSlide, meta: DeckMeta, kit: BrandKit, t: Theme): string {
  const lead = kit.leadLogoUrl
    ? `<img src="${esc(kit.leadLogoUrl)}" alt="" style="${abs(M, 0.55, 2.2, 0.62)}object-fit:contain;object-position:left center;">`
    : "";
  const co = kit.coLogoUrl
    ? `<img src="${esc(kit.coLogoUrl)}" alt="" style="${abs(11.0, 6.62, 1.73, 0.55)}object-fit:contain;object-position:right center;">`
    : "";
  return (
    `<div style="${abs(9.1, -2.9, 7.6, 7.6)}border-radius:50%;background:${t.secondary};opacity:.28;"></div>` +
    `<div style="${abs(10.6, -1.4, 4.6, 4.6)}border-radius:50%;background:${t.secondary};opacity:.45;"></div>` +
    `<div style="${abs(-2.2, 5.6, 5.2, 5.2)}border-radius:50%;background:${t.paper};opacity:.08;"></div>` +
    lead +
    `<div style="${abs(M + 0.02, 2.62, 0.9, 0.05)}background:${t.secondary};"></div>` +
    `<div style="${abs(M, 2.78, 10.5, 0.4)}${kickerStyle(t, mix(t.paper, t.primary, 0.78))}font-size:${fs(11)};letter-spacing:${ls(3)};">${esc(d.eyebrow)}</div>` +
    `<div style="${abs(M - 0.05, 3.12, 10.6, 1.95)}font-family:${t.head};font-size:${fs(48)};font-weight:700;color:${t.paper};line-height:${px(52 / 72)};overflow:hidden;">${esc(d.title)}</div>` +
    `<div style="${abs(M, 5.1, 9.5, 0.5)}font-family:${t.body};font-size:${fs(16)};color:${mix(t.paper, t.primary, 0.9)};">${esc(d.subtitle)}</div>` +
    `<div style="${abs(M, 6.78, 8, 0.35)}font-family:${t.body};font-size:${fs(10)};letter-spacing:${ls(1)};color:${mix(t.paper, t.primary, 0.65)};">${esc(meta.agencyName)}&nbsp;&nbsp;·&nbsp;&nbsp;${esc(meta.dateLabel)}</div>` +
    co
  );
}

function renderSection(d: SectionSlide, t: Theme): string {
  const num = String(d.number).padStart(2, "0");
  return (
    `<div style="${abs(0, 0, PAGE.w, 0.09)}background:${t.secondary};"></div>` +
    `<div style="${abs(6.6, 0.7, 6.4, 6.4)}font-family:${t.head};font-size:${fs(250)};font-weight:700;color:${mix(t.secondary, t.ink, 0.42)};display:flex;align-items:center;justify-content:flex-end;line-height:1;">${num}</div>` +
    `<div style="${abs(M + 0.02, 3.02, 0.9, 0.05)}background:${t.secondary};"></div>` +
    `<div style="${abs(M, 3.18, 5, 0.35)}${kickerStyle(t, t.secondary)}font-size:${fs(10)};letter-spacing:${ls(4)};">SECTION ${num}</div>` +
    `<div style="${abs(M - 0.03, 3.5, 8.2, 1.1)}font-family:${t.head};font-size:${fs(34)};font-weight:700;color:${t.paper};line-height:1.15;overflow:hidden;">${esc(d.title)}</div>` +
    (d.subtitle
      ? `<div style="${abs(M, 4.6, 7.4, 0.6)}font-family:${t.body};font-size:${fs(13)};color:${mix(t.paper, t.ink, 0.62)};">${esc(d.subtitle)}</div>`
      : "")
  );
}

function renderBriefSummary(d: BriefSummarySlide, t: Theme): string {
  let out = titleBlock("The Ask", d.title, t);
  let y = 1.75;
  for (const f of d.facts.slice(0, 5)) {
    out += `<div style="${abs(M, y, 4.2, 0.26)}${kickerStyle(t)}">${esc(f.label)}</div>`;
    out += `<div style="${abs(M, y + 0.24, 4.2, 0.55)}font-family:${t.body};font-size:${fs(13.5)};font-weight:700;color:${t.ink};overflow:hidden;">${esc(f.value)}</div>`;
    y += 0.92;
    out += `<div style="${abs(M, y - 0.12, 4.2, 0.01)}background:${t.line};"></div>`;
  }
  const rx = 5.55;
  const rw = PAGE.w - M - rx;
  let ry = 1.75;
  if (d.objectives.length) {
    out += `<div style="${abs(rx, ry, rw, 0.26)}${kickerStyle(t, t.secondary)}">Objectives</div>`;
    ry += 0.32;
    for (const o of d.objectives) {
      out += `<div style="${abs(rx + 0.02, ry + 0.09, 0.14, 0.045)}background:${t.secondary};"></div>`;
      out += `<div style="${abs(rx + 0.3, ry, rw - 0.3, 0.52)}font-family:${t.body};font-size:${fs(11.5)};color:${t.ink};line-height:1.3;overflow:hidden;">${esc(o)}</div>`;
      ry += 0.56;
    }
    ry += 0.18;
  }
  if (d.audiences.length) {
    out += `<div style="${abs(rx, ry, rw, 0.26)}${kickerStyle(t, t.secondary)}">Who we're designing for</div>`;
    ry += 0.34;
    for (const a of d.audiences) {
      out += `<div style="${abs(rx, ry, rw, 0.5)}font-family:${t.body};font-size:${fs(10.5)};line-height:1.35;overflow:hidden;"><b style="color:${t.primary};">${esc(a.name)}</b><span style="color:${t.muted};">${a.description ? "&nbsp;&nbsp;—&nbsp;&nbsp;" + esc(a.description) : ""}</span></div>`;
      ry += 0.5;
    }
  }
  return out;
}

function renderConcept(d: ConceptSlide, t: Theme): string {
  let out = `<div style="${abs(M, 0.55, CW, 0.3)}${kickerStyle(t, t.secondary)}font-size:${fs(9)};letter-spacing:${ls(3)};">The Big Idea</div>`;
  out += `<div style="${abs(M - 0.04, 0.9, 9.2, 1.7)}font-family:${t.head};font-size:${fs(32)};font-weight:700;color:${t.primary};line-height:${px(36 / 72)};overflow:hidden;">${esc(d.headline)}</div>`;
  let ny = 2.7;
  if (d.subheadline) {
    out += `<div style="${abs(M, ny, 7.2, 0.55)}font-family:${t.body};font-size:${fs(14)};font-style:italic;color:${t.secondary};overflow:hidden;">${esc(d.subheadline)}</div>`;
    ny += 0.62;
  }
  out += `<div style="${abs(M, ny, 7.2, 6.55 - ny)}font-family:${t.body};font-size:${fs(12.5)};color:${t.ink};line-height:${px(19 / 72)};overflow:hidden;">${esc(d.narrative)}</div>`;
  const pxCol = 8.35;
  const pw = PAGE.w - M - pxCol;
  let py = 2.7;
  d.points.forEach((point, i) => {
    out += `<div style="${abs(pxCol, py, 0.34, 0.34)}border-radius:50%;background:${t.primary};color:${t.paper};font-family:${t.head};font-size:${fs(11)};font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</div>`;
    out += `<div style="${abs(pxCol + 0.5, py - 0.03, pw - 0.5, 1.15)}font-family:${t.body};font-size:${fs(10.5)};color:${t.ink};line-height:1.35;overflow:hidden;">${esc(point)}</div>`;
    py += 1.28;
  });
  return out;
}

function renderElementGrid(d: ElementGridSlide, t: Theme): string {
  let out = titleBlock("The Concept", d.title, t);
  const cards = d.cards.slice(0, 6);
  const cols = cards.length <= 4 ? 2 : 3;
  const rows = Math.ceil(cards.length / cols);
  const gap = 0.26;
  const cw = (CW - gap * (cols - 1)) / cols;
  const chAvail = 6.85 - 1.62;
  const ch = Math.min(2.42, (chAvail - gap * (rows - 1)) / rows);
  cards.forEach((card, i) => {
    const cx = M + (i % cols) * (cw + gap);
    const cy = 1.62 + Math.floor(i / cols) * (ch + gap);
    out += `<div style="${abs(cx, cy, cw, ch)}background:${t.primary}0D;border:1px solid ${t.line};border-radius:${px(0.08)};"></div>`;
    out += `<div style="${abs(cx + 0.24, cy + 0.28, 0.42, 0.05)}background:${t.secondary};"></div>`;
    out += `<div style="${abs(cx + 0.2, cy + 0.38, cw - 0.44, 0.5)}font-family:${t.head};font-size:${fs(13)};font-weight:700;color:${t.primary};line-height:1.2;overflow:hidden;">${esc(card.title)}</div>`;
    out += `<div style="${abs(cx + 0.2, cy + 0.88, cw - 0.44, ch - 1.05)}font-family:${t.body};font-size:${fs(9.5)};color:${mix(t.ink, t.paper, 0.82)};line-height:${px(13 / 72)};overflow:hidden;">${esc(card.body)}</div>`;
  });
  return out;
}

function renderSpatial(d: SpatialSlide, t: Theme): string {
  let out = titleBlock("The Space", d.title, t);
  const hasImage = !!d.image;
  const tableX = hasImage ? 7.5 : M;
  const tableW = PAGE.w - M - tableX;

  if (d.image) {
    const box = { x: M, y: 1.62, w: 6.55, h: 4.75 };
    out += `<div style="${abs(box.x - 0.04, box.y - 0.04, box.w + 0.08, box.h + 0.08)}background:${t.paper};border:1px solid ${t.line};"></div>`;
    out += d.image.url
      ? `<img src="${esc(d.image.url)}" alt="${esc(d.image.label)}" style="${abs(box.x, box.y, box.w, box.h)}object-fit:contain;">`
      : "";
    out += `<div style="${abs(box.x, box.y + box.h + 0.08, box.w, 0.28)}${kickerStyle(t)}">${esc(d.image.label)}</div>`;
  }

  let y = 1.62;
  out += `<div style="${abs(tableX, y, tableW - 1.4, 0.26)}${kickerStyle(t)}">Zone</div>`;
  out += `<div style="${abs(tableX + tableW - 1.4, y, 1.4, 0.26)}${kickerStyle(t)}text-align:right;">Sq Ft</div>`;
  y += 0.32;
  out += `<div style="${abs(tableX, y, tableW, 0.014)}background:${t.primary};"></div>`;
  y += 0.08;
  const rowH = d.zones.length > 6 ? 0.5 : 0.58;
  for (const z of d.zones) {
    out += `<div style="${abs(tableX, y, tableW - 1.4, rowH)}font-family:${t.body};display:flex;flex-direction:column;justify-content:center;overflow:hidden;"><b style="font-size:${fs(11)};color:${t.ink};">${esc(z.name)}</b>${z.note ? `<span style="font-size:${fs(8.5)};color:${t.muted};">${esc(z.note)}</span>` : ""}</div>`;
    out += `<div style="${abs(tableX + tableW - 1.4, y, 1.4, rowH)}font-family:${t.body};font-size:${fs(11)};font-weight:700;color:${t.ink};display:flex;align-items:center;justify-content:flex-end;">${z.sqft.toLocaleString("en-US")}</div>`;
    y += rowH;
    out += `<div style="${abs(tableX, y, tableW, 0.008)}background:${t.line};"></div>`;
    y += 0.02;
  }
  if (typeof d.totalSqft === "number") {
    y += 0.06;
    out += `<div style="${abs(tableX, y, tableW - 1.6, 0.4)}${kickerStyle(t, t.primary)}font-size:${fs(10)};letter-spacing:${ls(1)};display:flex;align-items:center;">${esc(d.boothSize)} TOTAL</div>`;
    out += `<div style="${abs(tableX + tableW - 1.6, y, 1.6, 0.4)}font-family:${t.head};font-size:${fs(14)};font-weight:700;color:${t.primary};display:flex;align-items:center;justify-content:flex-end;">${d.totalSqft.toLocaleString("en-US")}</div>`;
  }
  return out;
}

function renderRenderFull(d: RenderFullSlide, meta: DeckMeta, t: Theme): string {
  return (
    imgCover(d.image, 0, 0, PAGE.w, PAGE.h, t) +
    `<div style="${abs(0, 6.72, PAGE.w, 0.78)}background:${t.ink}B8;"></div>` +
    `<div style="${abs(M, 6.98, 0.5, 0.045)}background:${t.secondary};"></div>` +
    `<div style="${abs(M + 0.62, 6.86, 9.5, 0.3)}${kickerStyle(t, t.paper)}font-size:${fs(11)};letter-spacing:${ls(3)};display:flex;align-items:center;">${esc(d.caption)}</div>` +
    `<div style="${abs(9.2, 6.86, 3.5, 0.3)}font-family:${t.body};font-size:${fs(8.5)};letter-spacing:${ls(1)};color:${mix(t.paper, t.ink, 0.7)};display:flex;align-items:center;justify-content:flex-end;">${esc(meta.projectName)}</div>`
  );
}

function renderRenderGrid(d: RenderGridSlide, t: Theme): string {
  let out = titleBlock("The Space", d.title, t);
  const imgs = d.images.slice(0, 4);
  const gap = 0.26;
  const capH = 0.3;
  if (imgs.length <= 2) {
    const fw = (CW - gap) / 2;
    const fh = 4.55;
    imgs.forEach((slot, i) => {
      const x = M + i * (fw + gap);
      out += imgCover(slot, x, 1.62, fw, fh, t);
      out += `<div style="${abs(x, 1.62 + fh + 0.08, fw, capH)}${kickerStyle(t)}">${esc(slot.label)}</div>`;
    });
  } else {
    const fw = (CW - gap) / 2;
    const fh = 2.28;
    imgs.forEach((slot, i) => {
      const x = M + (i % 2) * (fw + gap);
      const y = 1.58 + Math.floor(i / 2) * (fh + capH + 0.18);
      out += imgCover(slot, x, y, fw, fh, t);
      out += `<div style="${abs(x, y + fh + 0.04, fw, capH)}${kickerStyle(t)}">${esc(slot.label)}</div>`;
    });
  }
  return out;
}

function renderBudget(d: BudgetSlide, t: Theme): string {
  let out = titleBlock("The Investment", d.title, t);
  const rowsHtml = d.rows
    .map(
      (r, i) => `
      <div style="display:flex;align-items:center;min-height:${px(0.42)};background:${i % 2 === 1 ? t.primary + "0A" : "transparent"};border-bottom:1px solid ${t.line};padding:0 ${px(0.08)};">
        <div style="flex:1;font-size:${fs(11)};color:${t.ink};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"><b>${esc(r.category)}</b>${r.description ? `<span style="font-size:${fs(9)};color:${t.muted};">&nbsp;&nbsp;&nbsp;${esc(r.description)}</span>` : ""}</div>
        <div style="width:${px(1.2)};text-align:right;font-size:${fs(10)};color:${t.muted};">${typeof r.percentage === "number" ? r.percentage + "%" : ""}</div>
        <div style="width:${px(2.0)};text-align:right;font-size:${fs(11)};font-weight:700;color:${t.ink};">$${r.amount.toLocaleString("en-US")}</div>
      </div>`,
    )
    .join("");
  out += `
    <div style="${abs(M, 1.6, CW, 5.3)}font-family:${t.body};">
      <div style="display:flex;align-items:center;min-height:${px(0.42)};border-bottom:2px solid ${t.primary};padding:0 ${px(0.08)};">
        <div style="flex:1;${kickerStyle(t)}">Category</div>
        <div style="width:${px(1.2)};text-align:right;${kickerStyle(t)}">Share</div>
        <div style="width:${px(2.0)};text-align:right;${kickerStyle(t)}">Amount</div>
      </div>
      ${rowsHtml}
      <div style="display:flex;align-items:center;min-height:${px(0.52)};background:${t.primary}14;border-top:2px solid ${t.primary};padding:0 ${px(0.08)};">
        <div style="flex:1;${kickerStyle(t, t.primary)}font-size:${fs(10)};">${esc(d.totalLabel)}</div>
        <div style="width:${px(3.2)};text-align:right;font-family:${t.head};font-size:${fs(15)};font-weight:700;color:${t.primary};">$${d.total.toLocaleString("en-US")}</div>
      </div>
    </div>`;
  return out;
}

function renderMaterials(d: MaterialsSlide, t: Theme): string {
  let out = titleBlock("The Investment", d.title, t);
  let y = 1.65;
  out += `<div style="${abs(M, y, CW, 0.014)}background:${t.primary};"></div>`;
  y += 0.1;
  const rowH = d.rows.length > 6 ? 0.52 : 0.62;
  for (const r of d.rows) {
    out += `<div style="${abs(M, y, CW - 1.8, rowH)}font-family:${t.body};display:flex;flex-direction:column;justify-content:center;overflow:hidden;"><b style="font-size:${fs(11.5)};color:${t.ink};">${esc(r.category)}</b>${r.summary ? `<span style="font-size:${fs(8.5)};color:${t.muted};white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">${esc(r.summary)}</span>` : ""}</div>`;
    if (typeof r.subtotal === "number") {
      out += `<div style="${abs(M + CW - 1.8, y, 1.8, rowH)}font-family:${t.body};font-size:${fs(11.5)};font-weight:700;color:${t.ink};display:flex;align-items:center;justify-content:flex-end;">$${r.subtotal.toLocaleString("en-US")}</div>`;
    }
    y += rowH;
    out += `<div style="${abs(M, y, CW, 0.008)}background:${t.line};"></div>`;
    y += 0.03;
  }
  if (typeof d.total === "number") {
    y += 0.08;
    out += `<div style="${abs(M, y, CW - 2.2, 0.45)}${kickerStyle(t, t.primary)}font-size:${fs(10)};display:flex;align-items:center;">Estimated materials total</div>`;
    out += `<div style="${abs(M + CW - 2.2, y, 2.2, 0.45)}font-family:${t.head};font-size:${fs(16)};font-weight:700;color:${t.primary};display:flex;align-items:center;justify-content:flex-end;">$${d.total.toLocaleString("en-US")}</div>`;
    y += 0.5;
  }
  if (d.note) {
    out += `<div style="${abs(M, Math.min(y + 0.05, 6.4), CW, 0.5)}font-family:${t.body};font-size:${fs(9)};font-style:italic;color:${t.muted};">${esc(d.note)}</div>`;
  }
  return out;
}

function renderNextSteps(d: NextStepsSlide, t: Theme): string {
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
    out += `<div style="${abs(M, y, 0.38, 0.38)}border-radius:50%;background:${t.primary};color:${t.paper};font-family:${t.head};font-size:${fs(12)};font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</div>`;
    out += `<div style="${abs(M + 0.6, y - 0.02, 5.4, 0.4)}font-family:${t.head};font-size:${fs(14)};font-weight:700;color:${t.primary};overflow:hidden;">${esc(step.title)}</div>`;
    if (step.detail) {
      out += `<div style="${abs(6.4, y, PAGE.w - M - 6.4, stepH - 0.1)}font-family:${t.body};font-size:${fs(10.5)};color:${mix(t.ink, t.paper, 0.8)};line-height:1.4;overflow:hidden;">${esc(step.detail)}</div>`;
    }
  });
  if (d.timelineNote) {
    out += `<div style="${abs(M, 6.15, CW, 0.55)}background:${t.secondary}14;border-radius:${px(0.08)};display:flex;align-items:center;padding:0 ${px(0.25)};box-sizing:border-box;${kickerStyle(t, mix(t.secondary, t.ink, 0.85))}font-size:${fs(10)};">${esc(d.timelineNote)}</div>`;
  }
  return out;
}

function renderClosing(d: ClosingSlide, kit: BrandKit, t: Theme): string {
  const lead = kit.leadLogoUrl
    ? `<img src="${esc(kit.leadLogoUrl)}" alt="" style="${abs(M, 6.55, 1.9, 0.55)}object-fit:contain;object-position:left center;">`
    : "";
  const co = kit.coLogoUrl
    ? `<img src="${esc(kit.coLogoUrl)}" alt="" style="${abs(10.85, 6.55, 1.88, 0.55)}object-fit:contain;object-position:right center;">`
    : "";
  let out =
    `<div style="${abs(9.1, -2.9, 7.6, 7.6)}border-radius:50%;background:${t.secondary};opacity:.28;"></div>` +
    `<div style="${abs(10.6, -1.4, 4.6, 4.6)}border-radius:50%;background:${t.secondary};opacity:.45;"></div>` +
    `<div style="${abs(-2.2, 5.6, 5.2, 5.2)}border-radius:50%;background:${t.paper};opacity:.08;"></div>` +
    `<div style="${abs(M - 0.04, 2.35, 9.6, 1.4)}font-family:${t.head};font-size:${fs(44)};font-weight:700;color:${t.paper};overflow:hidden;">${esc(d.headline)}</div>`;
  if (d.subline) {
    out += `<div style="${abs(M + 0.02, 3.85, 0.9, 0.05)}background:${t.secondary};"></div>`;
    out += `<div style="${abs(M, 3.98, 8.5, 0.5)}font-family:${t.body};font-size:${fs(15)};color:${mix(t.paper, t.primary, 0.88)};">${esc(d.subline)}</div>`;
  }
  let y = 4.85;
  for (const c of d.contacts.slice(0, 3)) {
    const rest = [c.email, c.phone].filter(Boolean).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
    out += `<div style="${abs(M, y, 10.5, 0.38)}font-family:${t.body};font-size:${fs(12)};"><b style="color:${t.paper};">${esc(c.name)}</b><span style="color:${mix(t.paper, t.primary, 0.72)};">${rest ? "&nbsp;&nbsp;·&nbsp;&nbsp;" + rest : ""}</span></div>`;
    y += 0.42;
  }
  return out + lead + co;
}

// ── Public API ───────────────────────────────────────────────────────────────

const groundFor = (slide: SlideSpec, t: Theme): string => {
  switch (slide.layout) {
    case "cover":
    case "closing":
      return t.primary;
    case "section":
    case "renderFull":
      return t.ink;
    default:
      return t.paper;
  }
};

/** One slide → a self-contained 1280×720 artboard HTML string. */
export function renderSlideHtml(
  slide: SlideSpec,
  kit: BrandKit,
  index: number,
  total: number,
  meta?: DeckMeta,
): string {
  const t = themeFrom(kit);
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
    case "section": inner = renderSection(slide, t); break;
    case "briefSummary": inner = renderBriefSummary(slide, t); break;
    case "concept": inner = renderConcept(slide, t); break;
    case "elementGrid": inner = renderElementGrid(slide, t); break;
    case "spatial": inner = renderSpatial(slide, t); break;
    case "renderFull": inner = renderRenderFull(slide, m, t); break;
    case "renderGrid": inner = renderRenderGrid(slide, t); break;
    case "budget": inner = renderBudget(slide, t); break;
    case "materials": inner = renderMaterials(slide, t); break;
    case "nextSteps": inner = renderNextSteps(slide, t); break;
    case "closing": inner = renderClosing(slide, kit, t); break;
  }
  // Body-master chrome for content layouts (matches MASTER.body in the pptx).
  const isBody = !["cover", "closing", "section", "renderFull"].includes(slide.layout);
  const chrome = isBody ? bodyChrome(m, kit, index, t) : "";
  void total;
  return (
    fontLink(kit) +
    `<div class="deck-slide" data-layout="${slide.layout}" style="position:relative;width:1280px;height:720px;overflow:hidden;background:${groundFor(slide, t)};font-family:${t.body};-webkit-font-smoothing:antialiased;">` +
    chrome +
    inner +
    `</div>`
  );
}

/** Whole deck → one HTML document body (for preview scroll / print-to-PDF). */
export function renderDeckHtml(spec: DeckSpec, kit: BrandKit): string {
  const slides = spec.slides
    .map((s, i) => renderSlideHtml(s, kit, i, spec.slides.length, spec.meta))
    .join('\n<div style="height:24px"></div>\n');
  return (
    fontLink(kit) +
    `<div class="deck-preview" style="display:flex;flex-direction:column;align-items:center;background:#E8EAED;padding:24px 0;">` +
    slides +
    `</div>`
  );
}
