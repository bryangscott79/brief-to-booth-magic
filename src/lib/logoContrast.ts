// logoContrast — never let a brand mark sit invisibly on a deck ground.
//
// The trigger: an orange agency logo landed on an orange pitch cover and
// vanished. This module reads a logo off a canvas (dominant colour, mean
// luminance, light-vs-dark, transparency, aspect), measures WCAG contrast
// between the mark's significant colours and every ground the deck puts a
// logo on (cover, footer, closing), and decides a treatment: nothing, a
// paper plate, or an ink plate behind the mark. Both renderers
// (deckBuilder → pptx, deckSlideHtml → preview / PDF) draw the same plate
// geometry from the same decision, so the preview is exactly what ships.
//
// Contrast rules (all thresholds are exported so tests pin them):
//   · A mark needs ≥ 3.0:1 against its ground (WCAG's large-graphic floor)
//     between the ground and EVERY significant colour in the mark — a
//     two-colour mark is only as visible as its weakest colour.
//   · Below that, plate it. Light marks (mean luminance ≥ 0.5) get an ink
//     plate; dark and coloured marks get a paper plate — the context most
//     logos were designed for. The plate only swaps to the other colour when
//     the preferred one is itself unreadable (< 2.0:1) and the other is
//     better.
//   · A plate has to EARN its place: if it doesn't beat the ground by ≥ 15%
//     the mark stays bare (an orange mark on a white cover is 2.84:1 — under
//     the floor, but a white plate on white would change nothing; that is
//     the logo's native context).
//   · A logo that can't be analysed (CORS, decode failure, no DOM) gets
//     "none" — exactly today's behaviour — so a failure never changes a deck.
//
// Logo URLs from the brand hooks are short-lived SIGNED URLs (private
// buckets). Analyses are cached and persisted by a STABLE key (the storage
// ref, or the URL itself for external logos), never by the signed URL.

import type { BrandKit } from "./brandKit";
import {
  closingOnPaper,
  coverOnPaper,
  resolveDeckStyle,
  type DeckStyleId,
  type DeckStyleTokens,
} from "./deckStyle";
import { parseStorageRef, resolveImageUrl } from "./signedImageUrl";

// ── Analysis model ────────────────────────────────────────────────────────────

export interface LogoAnalysis {
  /** Most common colour in the mark (background excluded), "#RRGGBB". */
  dominantHex: string;
  /** Mean WCAG relative luminance across the mark's pixels, 0 (black) – 1 (white). */
  meanLuminance: number;
  /** meanLuminance ≥ LIGHT_MARK_LUMINANCE — a mark designed for dark grounds. */
  isLightMark: boolean;
  /** Any pixel below ~98% alpha. Opaque logos are usually on a baked-in white. */
  hasTransparency: boolean;
  /** Natural width / height — lets plates hug the fitted mark, not the whole logo box. */
  aspect: number;
  /** Significant colour clusters (share ≥ PALETTE_MIN_SHARE), dominant first. */
  palette: Array<{ hex: string; share: number }>;
}

export type LogoTreatment = "none" | "plate-paper" | "plate-ink";

/** Minimum mark-vs-ground contrast before a plate is required. */
export const PLATE_MIN_CONTRAST = 3.0;
/** Below this the preferred plate is unreadable and the other plate wins. */
export const PLATE_SWAP_BELOW = 2.0;
/** A plate must improve on the bare ground by this factor or it's skipped. */
export const PLATE_MIN_GAIN = 1.15;
/** Mean luminance at/above which a mark counts as light (ink plate). */
export const LIGHT_MARK_LUMINANCE = 0.5;
/** Colour clusters smaller than this share of the mark are ignored. */
export const PALETTE_MIN_SHARE = 0.08;

export const DEFAULT_PAPER = "#FFFFFF";
export const DEFAULT_INK = "#101418";

// ── Colour math (WCAG 2.x) ────────────────────────────────────────────────────

/** '#8FD3F4' | '8FD3F4' | '#f0a' → '#8FD3F4'; anything else → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const c = String(input).replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return "#" + c.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(c)) return "#" + c.split("").map((ch) => ch + ch).join("").toUpperCase();
  return null;
}

/** sRGB channel (0–255) → linear light. Table-driven: analysis runs per pixel. */
const LINEAR: number[] = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

const luminanceOf = (r: number, g: number, b: number): number =>
  0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];

export function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex);
  if (!h) return 0;
  return luminanceOf(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
}

/** WCAG contrast ratio between two colours, 1–21, rounded to 2 dp. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Worst-case contrast between the mark's significant colours and a ground. */
export function logoContrastOn(analysis: LogoAnalysis, groundHex: string): number {
  const colors = analysis.palette.length ? analysis.palette.map((p) => p.hex) : [analysis.dominantHex];
  return Math.min(...colors.map((c) => contrastRatio(c, groundHex)));
}

/** The treatment a mark needs on a given ground. */
export function logoTreatmentFor(
  analysis: LogoAnalysis | null | undefined,
  groundHex: string,
  plates: { paper: string; ink: string } = { paper: DEFAULT_PAPER, ink: DEFAULT_INK },
): LogoTreatment {
  if (!analysis) return "none";
  const onGround = logoContrastOn(analysis, groundHex);
  if (onGround >= PLATE_MIN_CONTRAST) return "none";
  const onPaper = logoContrastOn(analysis, plates.paper);
  const onInk = logoContrastOn(analysis, plates.ink);
  let chosen: LogoTreatment = analysis.isLightMark ? "plate-ink" : "plate-paper";
  let chosenRatio = chosen === "plate-ink" ? onInk : onPaper;
  const otherRatio = chosen === "plate-ink" ? onPaper : onInk;
  if (chosenRatio < PLATE_SWAP_BELOW && otherRatio > chosenRatio) {
    chosen = chosen === "plate-ink" ? "plate-paper" : "plate-ink";
    chosenRatio = otherRatio;
  }
  // The plate has to beat the bare ground, or it's decoration.
  if (chosenRatio < onGround * PLATE_MIN_GAIN) return "none";
  return chosen;
}

// ── Pixel analysis (pure — the canvas step just feeds it) ─────────────────────

/** Analyse RGBA pixels. `aspect` is the natural width/height when the pixels
 *  come from a downscaled canvas. Returns null when nothing is left to read. */
export function analyzePixels(data: Uint8ClampedArray | number[], w: number, h: number, aspect?: number): LogoAnalysis | null {
  const n = w * h;
  if (n <= 0 || data.length < n * 4) return null;

  let hasTransparency = false;
  for (let i = 3; i < n * 4; i += 4) {
    if (data[i] < 250) {
      hasTransparency = true;
      break;
    }
  }

  // Opaque logos usually carry a baked-in background (white JPEG, brand-colour
  // tile). Guess it from the corners and drop pixels near it so the MARK is
  // what gets measured — unless that leaves almost nothing (a flat image).
  const cornerIdx = [0, w - 1, (h - 1) * w, n - 1];
  let bg: [number, number, number] | null = null;
  if (!hasTransparency) {
    let r = 0, g = 0, b = 0;
    for (const p of cornerIdx) {
      r += data[p * 4];
      g += data[p * 4 + 1];
      b += data[p * 4 + 2];
    }
    bg = [r / 4, g / 4, b / 4];
  }
  const isBackground = (r: number, g: number, b: number): boolean => {
    if (!bg) return false;
    const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
    return dr * dr + dg * dg + db * db < 40 * 40;
  };

  const collect = (skipBackground: boolean) => {
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    let count = 0;
    let lum = 0;
    for (let p = 0; p < n; p++) {
      const o = p * 4;
      const a = data[o + 3];
      if (a < 128) continue;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      if (skipBackground && isBackground(r, g, b)) continue;
      count += 1;
      lum += luminanceOf(r, g, b);
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
    return { buckets, count, lum };
  };

  let sample = collect(true);
  // Background removal ate (nearly) everything → the image IS one flat
  // colour; measure it as-is.
  if (bg && sample.count < n * 0.03) sample = collect(false);
  if (sample.count === 0) return null;

  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0").toUpperCase();
  const sorted = [...sample.buckets.values()].sort((x, y) => y.count - x.count);
  const palette = sorted
    .map((bk) => ({
      hex: "#" + toHex(bk.r / bk.count) + toHex(bk.g / bk.count) + toHex(bk.b / bk.count),
      share: Math.round((bk.count / sample.count) * 1000) / 1000,
    }))
    .filter((p) => p.share >= PALETTE_MIN_SHARE)
    .slice(0, 4);
  const dominantHex = palette[0]?.hex ?? (() => {
    const bk = sorted[0];
    return "#" + toHex(bk.r / bk.count) + toHex(bk.g / bk.count) + toHex(bk.b / bk.count);
  })();
  const meanLuminance = Math.round((sample.lum / sample.count) * 1000) / 1000;

  return {
    dominantHex,
    meanLuminance,
    isLightMark: meanLuminance >= LIGHT_MARK_LUMINANCE,
    hasTransparency,
    aspect: aspect ?? w / h,
    palette,
  };
}

// ── Canvas loading (browser only, cached) ─────────────────────────────────────

/** Stable identity for a logo: its storage ref when it lives in one of our
 *  private buckets (signed URLs rotate), else the URL itself. */
export function logoCacheKey(url: string): string {
  const ref = parseStorageRef(url);
  return ref ? `${ref.bucket}/${ref.path}` : url;
}

const analysisCache = new Map<string, LogoAnalysis>();
const inflight = new Map<string, Promise<LogoAnalysis | null>>();

const MAX_SAMPLE_EDGE = 96;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo image failed to load"));
    img.src = src;
  });
}

async function analyzeUncached(url: string): Promise<LogoAnalysis | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const resolved = await resolveImageUrl(url);
  if (!resolved) return null;
  const img = await loadImage(resolved);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return null;
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(nw, nh));
  const cw = Math.max(1, Math.round(nw * scale));
  const ch = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  // Throws on a tainted canvas (no CORS headers) → caller maps to null.
  const { data } = ctx.getImageData(0, 0, cw, ch);
  return analyzePixels(data, cw, ch, nw / nh);
}

/** Analyse a logo image. Successful analyses are cached per stable key;
 *  failures (CORS, decode, non-browser) resolve to null and are NOT cached
 *  so a later attempt (fresh signed URL, network back) can succeed. */
export async function analyzeLogo(url: string | null | undefined): Promise<LogoAnalysis | null> {
  if (!url) return null;
  const key = logoCacheKey(url);
  const hit = analysisCache.get(key);
  if (hit) return hit;
  let pending = inflight.get(key);
  if (!pending) {
    pending = analyzeUncached(url)
      .catch(() => null)
      .then((result) => {
        inflight.delete(key);
        if (result) analysisCache.set(key, result);
        return result;
      });
    inflight.set(key, pending);
  }
  return pending;
}

/** Test / dev hook: forget cached analyses. */
export function clearLogoAnalysisCache(): void {
  analysisCache.clear();
  inflight.clear();
}

// ── Treatments per deck ground ────────────────────────────────────────────────

/** Where the deck puts logos. cover → lead (large) + co (bottom-right);
 *  footer → co on the body master; closing → both. */
export type LogoGround = "cover" | "footer" | "closing";
export const LOGO_GROUNDS: readonly LogoGround[] = ["cover", "footer", "closing"] as const;

export type LogoTreatmentSet = Record<LogoGround, LogoTreatment>;

export interface LogoTreatments {
  lead: LogoTreatmentSet;
  co: LogoTreatmentSet;
  /** width / height of each mark when known — plates hug the fitted mark. */
  leadAspect?: number;
  coAspect?: number;
  /** Stable keys (logoCacheKey) of the marks these were computed for. */
  leadKey?: string | null;
  coKey?: string | null;
  /** Grounds depend on the style (field cover vs paper cover). */
  styleId?: DeckStyleId;
}

export const NONE_TREATMENT_SET: LogoTreatmentSet = Object.freeze({
  cover: "none",
  footer: "none",
  closing: "none",
}) as LogoTreatmentSet;

/** Legacy behaviour — every mark drawn bare. Renderers default to this. */
export const NO_LOGO_TREATMENTS: LogoTreatments = Object.freeze({
  lead: NONE_TREATMENT_SET,
  co: NONE_TREATMENT_SET,
}) as LogoTreatments;

/** The ground colour behind a logo in a given context for a style. Mirrors
 *  the master grounds in deckBuilder / groundFor in deckSlideHtml. */
export function logoGroundHex(
  kit: Pick<BrandKit, "primary" | "paper">,
  tok: DeckStyleTokens,
  ground: LogoGround,
): string {
  const paper = normalizeHex(kit.paper) ?? DEFAULT_PAPER;
  const primary = normalizeHex(kit.primary) ?? "#0B1B2B";
  switch (ground) {
    case "cover":
      return coverOnPaper(tok) ? paper : primary;
    case "closing":
      return closingOnPaper(tok) ? paper : primary;
    case "footer":
    default:
      return paper;
  }
}

const treatmentSetFor = (
  analysis: LogoAnalysis | null,
  kit: Pick<BrandKit, "primary" | "paper" | "ink">,
  tok: DeckStyleTokens,
): LogoTreatmentSet => {
  const plates = {
    paper: normalizeHex(kit.paper) ?? DEFAULT_PAPER,
    ink: normalizeHex(kit.ink) ?? DEFAULT_INK,
  };
  const set = { ...NONE_TREATMENT_SET };
  for (const ground of LOGO_GROUNDS) {
    set[ground] = logoTreatmentFor(analysis, logoGroundHex(kit, tok, ground), plates);
  }
  return set;
};

/** Pure half of computeLogoTreatments — build the treatments from analyses
 *  already in hand (tests feed synthetic analyses here). */
export function treatmentsFromAnalyses(
  kit: Pick<BrandKit, "primary" | "paper" | "ink" | "leadLogoUrl" | "coLogoUrl">,
  style: DeckStyleId | DeckStyleTokens | null | undefined,
  lead: LogoAnalysis | null,
  co: LogoAnalysis | null,
): LogoTreatments {
  const tok = typeof style === "object" && style ? style : resolveDeckStyle(style);
  return {
    lead: treatmentSetFor(lead, kit, tok),
    co: treatmentSetFor(co, kit, tok),
    leadAspect: lead?.aspect,
    coAspect: co?.aspect,
    leadKey: kit.leadLogoUrl ? logoCacheKey(kit.leadLogoUrl) : null,
    coKey: kit.coLogoUrl ? logoCacheKey(kit.coLogoUrl) : null,
    styleId: tok.id,
  };
}

/** Analyse both kit marks and decide their treatments for every ground.
 *  Never throws — an unreadable logo simply gets "none". */
export async function computeLogoTreatments(
  kit: BrandKit,
  style: DeckStyleId | DeckStyleTokens | null | undefined,
): Promise<LogoTreatments> {
  const [lead, co] = await Promise.all([analyzeLogo(kit.leadLogoUrl), analyzeLogo(kit.coLogoUrl)]);
  return treatmentsFromAnalyses(kit, style, lead, co);
}

/** Were these treatments computed for THIS kit's marks and THIS style?
 *  Signed URLs rotate, so compare stable keys, never URLs. */
export function logoTreatmentsMatch(
  treatments: LogoTreatments | null | undefined,
  kit: Pick<BrandKit, "leadLogoUrl" | "coLogoUrl">,
  styleId: DeckStyleId,
): boolean {
  if (!treatments) return false;
  const leadKey = kit.leadLogoUrl ? logoCacheKey(kit.leadLogoUrl) : null;
  const coKey = kit.coLogoUrl ? logoCacheKey(kit.coLogoUrl) : null;
  return (
    (treatments.leadKey ?? null) === leadKey &&
    (treatments.coKey ?? null) === coKey &&
    (treatments.styleId ?? "pitch") === styleId
  );
}

// ── Plate geometry (inches — shared by both renderers) ────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Padding around the fitted mark, and the plate's corner radius. */
export const PLATE_PAD = 0.12;
export const PLATE_RADIUS = 0.08;
/** Field-cover lockup: a paper (or ink) tab hanging from the slide's top edge. */
export const LOCKUP_PAD = 0.24;
export const LOCKUP_RADIUS = 0.14;
export const LOCKUP_BLEED = 0.3;

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** The rect a contain-fitted mark actually occupies inside its logo box,
 *  aligned to `side`, vertically centred. Unknown aspect → the box itself
 *  (renderers then fall back to their own contain behaviour). */
export function fitLogoBox(box: Box, aspect: number | undefined, side: "left" | "right" | "center"): Box {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return box;
  let w = box.w;
  let h = w / aspect;
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  const x = side === "left" ? box.x : side === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  return { x: r3(x), y: r3(y), w: r3(w), h: r3(h) };
}

/** Rounded plate hugging a fitted mark. */
export function plateBox(fitted: Box, pad: number = PLATE_PAD): Box {
  return { x: r3(fitted.x - pad), y: r3(fitted.y - pad), w: r3(fitted.w + pad * 2), h: r3(fitted.h + pad * 2) };
}

/** Field-cover lockup: the plate starts above the slide (top corners clip
 *  off-canvas) so only its bottom corners read rounded — a designed tab
 *  rather than a patch. */
export function lockupBox(fitted: Box): Box {
  return {
    x: r3(fitted.x - LOCKUP_PAD),
    y: r3(-LOCKUP_BLEED),
    w: r3(fitted.w + LOCKUP_PAD * 2),
    h: r3(fitted.y + fitted.h + LOCKUP_PAD + LOCKUP_BLEED),
  };
}
