// conceptAnnotations — the pure half of the CONCEPT FOCUS view: turning
// marks drawn on a rendered concept into (a) prose an image model can act
// on and (b) polygons the mask rasterizer understands.
//
// Everything here is coordinate math and string building, no React and no
// Supabase, so the thing that actually decides what the model is told is
// unit-testable.
//
// Coordinate contract: every annotation is NORMALIZED to the image's own
// box (0..1 on each axis, origin top-left). That survives resizing, the
// modal's fit-to-stage scaling, and rasterizing the mask at the image's
// full natural resolution.

import type { Polygon } from "@/types/brief";
import type { ConceptAnnotation } from "@/lib/planningCanvas";

// ─── GEOMETRY HELPERS ────────────────────────────────────────────────────────

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Normalize a drag into a top-left-anchored rect, clamped to the image.
 *  Dragging up/left is as valid as down/right. */
export function regionFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  const x0 = clamp01(Math.min(start.x, end.x));
  const y0 = clamp01(Math.min(start.y, end.y));
  const x1 = clamp01(Math.max(start.x, end.x));
  const y1 = clamp01(Math.max(start.y, end.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Bounding box of a freehand lasso. */
export function boundsOfPoints(
  points: Array<{ x: number; y: number }>,
): { x: number; y: number; w: number; h: number } {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((p) => clamp01(p.x));
  const ys = points.map((p) => clamp01(p.y));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The single point a note is "about": the pin itself, or the centre of a
 *  region (lasso bounding box included). */
export function annotationAnchor(a: ConceptAnnotation): { x: number; y: number } {
  if (a.kind === "pin") return { x: clamp01(a.x), y: clamp01(a.y) };
  if (a.points && a.points.length > 0) {
    const b = boundsOfPoints(a.points);
    return { x: clamp01(b.x + b.w / 2), y: clamp01(b.y + b.h / 2) };
  }
  return { x: clamp01(a.x + (a.w ?? 0) / 2), y: clamp01(a.y + (a.h ?? 0) / 2) };
}

// ─── COORDINATE → PROSE ──────────────────────────────────────────────────────

/**
 * Where in the frame a normalized point sits, in plain words. Thirds on
 * each axis; the exact centre says so rather than pretending to a corner.
 *
 *   (0.1, 0.9) → "the lower-left of the frame"
 *   (0.5, 0.5) → "the center of the frame"
 *   (0.9, 0.1) → "the upper-right of the frame"
 */
export function describeFramePoint(x: number, y: number): string {
  const col = x < 1 / 3 ? "left" : x < 2 / 3 ? "center" : "right";
  const row = y < 1 / 3 ? "upper" : y < 2 / 3 ? "middle" : "lower";
  if (row === "middle" && col === "center") return "the center of the frame";
  if (col === "center") return `the ${row}-center of the frame`;
  if (row === "middle") return `the ${row}-${col} of the frame`;
  return `the ${row}-${col} of the frame`;
}

/** How far into the scene that height reads — the model needs depth, not
 *  just 2D position, to know which object is meant. */
export function describeSceneDepth(y: number): string {
  if (y >= 2 / 3) return "the foreground, nearest the camera";
  if (y >= 1 / 3) return "the mid-ground of the scene";
  return "the upper area / back of the scene";
}

const pct = (n: number): number => Math.round(clamp01(n) * 100);

/** One note's location, as the sentence fragment that goes into the edit
 *  instruction. Regions also carry their coverage so the model can tell a
 *  detail mark from a half-the-booth mark. */
export function describeAnnotationLocation(a: ConceptAnnotation): string {
  const anchor = annotationAnchor(a);
  const where = `${describeFramePoint(anchor.x, anchor.y)} — ${describeSceneDepth(anchor.y)}`;
  if (a.kind === "pin") return `Pin at ${where}`;
  const bounds = a.points && a.points.length > 0 ? boundsOfPoints(a.points) : { w: a.w ?? 0, h: a.h ?? 0 };
  const shape = a.points && a.points.length > 0 ? "Lassoed region" : "Region";
  return `${shape} centered on ${where}, covering roughly ${pct(bounds.w)}% of the frame width and ${pct(bounds.h)}% of its height`;
}

/** The numbered note lines, in mark order. Marks with no comment are
 *  dropped — a blank pin is an unfinished thought, not an instruction. */
export function annotationNoteLines(annotations: ConceptAnnotation[]): string[] {
  return annotations
    .filter((a) => a.comment.trim().length > 0)
    .map((a, i) => `${i + 1}. ${describeAnnotationLocation(a)}: ${a.comment.trim()}`);
}

// ─── EDIT INSTRUCTION ────────────────────────────────────────────────────────

/**
 * Build the EDIT INSTRUCTION body for generate-hero's edit mode
 * (previousImageUrl + feedback, NO composedPrompt). generate-hero wraps
 * this in its own "IMAGE EDIT TASK — NOT A REGENERATION" template, so
 * this text only has to lock what must not move and name what must.
 *
 * Same locked-instruction style as buildHangingEditInstruction: preserve
 * clause first, then the specific asks, then the output contract.
 *
 * Returns "" when nothing has been written down yet, so callers can gate
 * the run on a falsy instruction.
 */
export function buildAnnotationEditInstruction(
  annotations: ConceptAnnotation[],
  extraNote?: string,
): string {
  const lines = annotationNoteLines(annotations);
  const extra = extraNote?.trim() ?? "";
  if (lines.length === 0 && extra.length === 0) return "";

  const hasRegion = annotations.some(
    (a) => a.kind === "region" && a.comment.trim().length > 0,
  );

  const parts: string[] = [
    "Apply ONLY the numbered notes below to the reference image. Keep the booth design, structure, materials, finishes, colors, brand signage, camera angle, framing, lighting, people, and environment IDENTICAL to the reference — anything not named in a note is locked and must come through unchanged.",
    "",
    "MARKED NOTES (positions are described from the viewer's point of view; the marks themselves are NOT drawn in the reference image):",
    lines.length > 0 ? lines.join("\n") : "(no marks — see the additional note below)",
    "",
    "HOW TO READ A NOTE:",
    [
      '- "move this" — reposition the element at that location within the same booth and the same camera view. Do not redesign it, resize it, or move anything else.',
      '- "this isn\'t buildable" — replace the element at that location with a structurally buildable version of the same size, footprint, and visual weight: real supports, real spans, real attachment points.',
      '- "keep everything but make this round" (and any "keep everything but…" note) — change ONLY the property named, on the element at that location. Its material, color, size, and position, and the whole rest of the image, stay exactly as they are.',
      "- Anything else — a direct instruction about the element at that location and nothing else in the frame.",
    ].join("\n"),
  ];

  if (hasRegion) {
    parts.push(
      "",
      "Where a note marks a REGION, confine that change inside the region described; pixels outside every marked region are unchanged.",
    );
  }

  if (extra.length > 0) {
    parts.push("", "ADDITIONAL NOTE (applies to the same edit):", extra);
  }

  parts.push(
    "",
    "Output: a 16:9 photorealistic image — the reference image with these changes applied and nothing else altered. No overlaid text, pins, numbers, arrows, outlines, or annotation marks of any kind.",
  );

  return parts.join("\n");
}

// ─── MASK ────────────────────────────────────────────────────────────────────

/**
 * The REGION annotations as closed polygons in normalized image coords —
 * the input rasterizePolygonMask expects. Pins contribute nothing: a point
 * comment names an object, it doesn't bound an editable area, and a mask
 * built from pins would lock the model out of everything else.
 *
 * A region with no comment is skipped too — it never made it into the
 * instruction, so it must not constrain the edit either.
 */
export function annotationPolygons(annotations: ConceptAnnotation[]): Polygon[] {
  const out: Polygon[] = [];
  for (const a of annotations) {
    if (a.kind !== "region") continue;
    if (a.comment.trim().length === 0) continue;
    const label = a.comment.trim() || undefined;
    if (a.points && a.points.length >= 3) {
      out.push({ points: a.points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })), label });
      continue;
    }
    const w = a.w ?? 0;
    const h = a.h ?? 0;
    if (w <= 0 || h <= 0) continue;
    const x0 = clamp01(a.x);
    const y0 = clamp01(a.y);
    const x1 = clamp01(a.x + w);
    const y1 = clamp01(a.y + h);
    out.push({
      points: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      label,
    });
  }
  return out;
}

// ─── VERSION NOTE ────────────────────────────────────────────────────────────

/** The one-line note a version carries in the filmstrip. */
export function summarizeAnnotations(annotations: ConceptAnnotation[]): string {
  const commented = annotations.filter((a) => a.comment.trim().length > 0);
  if (commented.length === 0) return "No marks";
  const head = commented[0]!.comment.trim();
  const label = `${commented.length} mark${commented.length === 1 ? "" : "s"}`;
  return `${label} · ${head.length > 60 ? `${head.slice(0, 59).trimEnd()}…` : head}`;
}
