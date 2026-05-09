// renderFloorPlanForExport — draws a HIGH-CONTRAST floor plan PNG
// optimized for the AI image model.
//
// The on-screen SpatialCanvas uses a dark theme that looks great in the
// app but reads poorly when an image model "looks at" it as a reference.
// This helper draws to an offscreen <canvas> with:
//   • white background, black booth outline (high contrast)
//   • bold perimeter dimension labels ("30 FT" at top + "30 FT" at side)
//   • each zone filled with a translucent brand-color, thick outline,
//     name + footprint + height label inside
//   • 1' / 1m grid (and major 5' / 5m grid lines)
//   • a scale bar in the corner ("10 FT" reference)
//   • "FRONT (primary aisle)" labeled at the top edge
//
// Output: ~1500×1500px PNG data URL (3× the on-screen size). The image
// model reads dimension labels at this resolution far more reliably than
// at the dark-themed thumbnail size we were capturing before.

import type { BoothGeometry, AbsoluteZone } from "./geometryModel";
import { effectiveShape } from "./geometryModel";

/** Long-side resolution in pixels. Booth aspect ratio is preserved. */
const EXPORT_LONG_SIDE = 1400;
/** Padding on each side, in pixels. */
const EXPORT_PADDING = 96;

/**
 * Draw the export floor plan to an offscreen canvas and return a PNG
 * data URL. Synchronous; no Konva, no React — pure 2D context calls.
 */
export function renderFloorPlanForExport(geometry: BoothGeometry): string {
  const { width: bw, depth: bd, measurementSystem, ceilingHeightFt, zones } = geometry;
  const longest = Math.max(bw, bd);
  const pxPerUnit = (EXPORT_LONG_SIDE - EXPORT_PADDING * 2) / longest;
  const canvasW = Math.round(bw * pxPerUnit + EXPORT_PADDING * 2);
  const canvasH = Math.round(bd * pxPerUnit + EXPORT_PADDING * 2);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback: return an empty 1×1 white PNG so callers don't crash.
    return emptyPng();
  }

  // ── Background: white ────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  const x0 = EXPORT_PADDING;
  const y0 = EXPORT_PADDING;
  const xMax = canvasW - EXPORT_PADDING;
  const yMax = canvasH - EXPORT_PADDING;

  // ── Grid (light gray) ────────────────────────────────────────────
  // Minor grid: every 1' (or 0.5m). Major: every 5'.
  const minorStep = measurementSystem === "metric" ? 0.5 : 1;
  const majorStep = minorStep * 10; // 10' or 5m for major grid
  ctx.lineWidth = 1;

  // Vertical
  for (let x = 0; x <= bw + 1e-6; x += minorStep) {
    const isMajor = Math.abs(x % majorStep) < 1e-6;
    ctx.strokeStyle = isMajor ? "#cbd5e1" : "#eef2f7";
    ctx.lineWidth = isMajor ? 1.5 : 0.6;
    const px = x0 + x * pxPerUnit;
    ctx.beginPath();
    ctx.moveTo(px, y0);
    ctx.lineTo(px, yMax);
    ctx.stroke();
  }
  // Horizontal
  for (let y = 0; y <= bd + 1e-6; y += minorStep) {
    const isMajor = Math.abs(y % majorStep) < 1e-6;
    ctx.strokeStyle = isMajor ? "#cbd5e1" : "#eef2f7";
    ctx.lineWidth = isMajor ? 1.5 : 0.6;
    const py = y0 + y * pxPerUnit;
    ctx.beginPath();
    ctx.moveTo(x0, py);
    ctx.lineTo(xMax, py);
    ctx.stroke();
  }

  // ── Booth outline: thick black ───────────────────────────────────
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, y0, bw * pxPerUnit, bd * pxPerUnit);

  // ── Zones ────────────────────────────────────────────────────────
  for (const zone of zones) {
    drawZone(ctx, zone, geometry, x0, y0, pxPerUnit);
  }

  // ── Perimeter dimension labels (BOLD) ────────────────────────────
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const widthLabel = formatDim(bw, measurementSystem);
  const depthLabel = formatDim(bd, measurementSystem);

  // Top edge (width)
  ctx.fillText(`${widthLabel} WIDE`, x0 + (bw * pxPerUnit) / 2, y0 - 50);
  // Bottom edge (width again, redundant for clarity)
  ctx.fillText(`${widthLabel}`, x0 + (bw * pxPerUnit) / 2, yMax + 50);
  // Left edge (depth) — rotate 90° so text reads vertically
  ctx.save();
  ctx.translate(x0 - 50, y0 + (bd * pxPerUnit) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${depthLabel} DEEP`, 0, 0);
  ctx.restore();
  // Right edge (depth, redundant)
  ctx.save();
  ctx.translate(xMax + 50, y0 + (bd * pxPerUnit) / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(`${depthLabel}`, 0, 0);
  ctx.restore();

  // ── Front-aisle indicator at the BOTTOM (front-at-bottom layout) ─
  // The canvas y-axis is flipped in zone rendering so booth y=0 (front)
  // ends up at the canvas bottom. This label calls out the front edge
  // for the AI model (and any human reading the export).
  ctx.font = "bold 24px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(
    "▲ FRONT (primary aisle) ▲",
    x0 + (bw * pxPerUnit) / 2,
    yMax + 22,
  );
  // Counter-label at the top so the AI sees both edges named.
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    "BACK",
    x0 + (bw * pxPerUnit) / 2,
    y0 - 22,
  );

  // ── Total area + ceiling height in upper-left corner ─────────────
  const areaUnit = measurementSystem === "metric" ? "sqm" : "sq ft";
  const totalArea =
    measurementSystem === "metric"
      ? (bw * bd).toFixed(1)
      : Math.round(bw * bd).toString();
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(`Total: ${totalArea} ${areaUnit}`, 16, 16);
  ctx.fillText(`Ceiling: ${ceilingHeightFt} ft max`, 16, 44);

  // ── Scale bar (10 ft / 5 m reference) ────────────────────────────
  const scaleBarUnits = measurementSystem === "metric" ? 5 : 10;
  const scaleBarPx = scaleBarUnits * pxPerUnit;
  const scaleBarX = canvasW - 16 - scaleBarPx;
  const scaleBarY = canvasH - 32;
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(scaleBarX, scaleBarY);
  ctx.lineTo(scaleBarX + scaleBarPx, scaleBarY);
  ctx.stroke();
  // End ticks
  ctx.beginPath();
  ctx.moveTo(scaleBarX, scaleBarY - 8);
  ctx.lineTo(scaleBarX, scaleBarY + 8);
  ctx.moveTo(scaleBarX + scaleBarPx, scaleBarY - 8);
  ctx.lineTo(scaleBarX + scaleBarPx, scaleBarY + 8);
  ctx.stroke();
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(
    `${scaleBarUnits} ${measurementSystem === "metric" ? "m" : "ft"}`,
    scaleBarX + scaleBarPx,
    scaleBarY - 12,
  );

  return canvas.toDataURL("image/png");
}

/** Draw one zone rectangle + labels.
 *
 * The y-axis is FLIPPED relative to canvas pixels so that the booth's
 * front edge (y=0) appears at the BOTTOM of the export. So a zone whose
 * front edge is at booth y=`zone.y` and depth `zone.depth` has its
 * top-left canvas corner at: `(zone.x, geometry.depth - zone.y - zone.depth)`.
 */
function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: AbsoluteZone,
  geometry: BoothGeometry,
  x0: number,
  y0: number,
  pxPerUnit: number,
) {
  const px = x0 + zone.x * pxPerUnit;
  const py =
    y0 + (geometry.depth - zone.y - zone.depth) * pxPerUnit;
  const pw = zone.width * pxPerUnit;
  const pd = zone.depth * pxPerUnit;

  // Trace the shape's path once, then fill + stroke. Reuses the same
  // path so the AI model sees a consistent footprint outline (filled
  // body + thick zone-color border) regardless of shape kind.
  ctx.beginPath();
  traceZonePath(ctx, zone, px, py, pw, pd);
  ctx.fillStyle = hexWithAlpha(zone.colorHex, 0.25);
  ctx.fill();
  ctx.strokeStyle = zone.colorHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Label inside the zone — name (bold), footprint, height
  const padX = 12;
  const padY = 14;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Name
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px system-ui, sans-serif";
  const nameLine = clipText(ctx, zone.name, pw - padX * 2);
  ctx.fillText(nameLine, px + padX, py + padY);

  // Footprint
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillStyle = "#1e293b";
  const footprint =
    geometry.measurementSystem === "metric"
      ? `${zone.width.toFixed(1)}m × ${zone.depth.toFixed(1)}m`
      : `${Math.round(zone.width)}' × ${Math.round(zone.depth)}'`;
  ctx.fillText(footprint, px + padX, py + padY + 30);

  // Area + height
  const area = zone.width * zone.depth;
  const areaUnit = geometry.measurementSystem === "metric" ? "sqm" : "sq ft";
  const areaLabel =
    geometry.measurementSystem === "metric"
      ? area.toFixed(1)
      : Math.round(area).toString();
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(
    `${areaLabel} ${areaUnit} · ${zone.heightFt} ft tall`,
    px + padX,
    py + padY + 56,
  );
}

/**
 * Trace a path representing the zone's shape inside its bounding box
 * (top-left = `(px, py)`, dims = `pw × pd`). Caller is responsible for
 * `beginPath()` + `fill()` / `stroke()`. The path covers the visible
 * footprint — bounding box for rect, ellipse for circle, L-polygon
 * with the configured corner notched out for L.
 */
function traceZonePath(
  ctx: CanvasRenderingContext2D,
  zone: AbsoluteZone,
  px: number,
  py: number,
  pw: number,
  pd: number,
) {
  const shape = effectiveShape(zone);

  if (shape === "circle") {
    // canvas y in this export is NOT flipped per-zone — the bounding
    // box is already positioned with front-at-bottom in the caller.
    // Ellipse centered in the bounding box.
    ctx.ellipse(px + pw / 2, py + pd / 2, pw / 2, pd / 2, 0, 0, Math.PI * 2);
    return;
  }

  if (shape === "L") {
    // The corner field uses the SCREEN orientation of the zone:
    //   NE = top-right, NW = top-left, SE = bottom-right, SW = bottom-left.
    // Because the floor plan PNG draws each zone with its bounding
    // box's top edge corresponding to the booth's BACK (we flipped
    // y-axis at the booth level, but the zone's local bounding box
    // is still drawn top-down). Notching out NE thus removes the
    // back-right corner of the booth — matches the user's mental
    // model of where the L's empty quadrant is.
    const params = zone.shapeParams ?? {};
    const wRatio = clamp01(params.lNotchWidthRatio ?? 0.5);
    const dRatio = clamp01(params.lNotchDepthRatio ?? 0.5);
    const corner = params.lCorner ?? "NE";
    const nw = pw * wRatio;
    const nd = pd * dRatio;

    if (corner === "NE") {
      ctx.moveTo(px, py);
      ctx.lineTo(px + pw - nw, py);
      ctx.lineTo(px + pw - nw, py + nd);
      ctx.lineTo(px + pw, py + nd);
      ctx.lineTo(px + pw, py + pd);
      ctx.lineTo(px, py + pd);
    } else if (corner === "NW") {
      ctx.moveTo(px + nw, py);
      ctx.lineTo(px + pw, py);
      ctx.lineTo(px + pw, py + pd);
      ctx.lineTo(px, py + pd);
      ctx.lineTo(px, py + nd);
      ctx.lineTo(px + nw, py + nd);
    } else if (corner === "SE") {
      ctx.moveTo(px, py);
      ctx.lineTo(px + pw, py);
      ctx.lineTo(px + pw, py + pd - nd);
      ctx.lineTo(px + pw - nw, py + pd - nd);
      ctx.lineTo(px + pw - nw, py + pd);
      ctx.lineTo(px, py + pd);
    } else {
      // SW
      ctx.moveTo(px, py);
      ctx.lineTo(px + pw, py);
      ctx.lineTo(px + pw, py + pd);
      ctx.lineTo(px + nw, py + pd);
      ctx.lineTo(px + nw, py + pd - nd);
      ctx.lineTo(px, py + pd - nd);
    }
    ctx.closePath();
    return;
  }

  // Default: rectangle.
  ctx.rect(px, py, pw, pd);
}

function clamp01(v: number): number {
  return Math.max(0.1, Math.min(0.9, v));
}

/** Format a dimension as "30 FT" or "9.0 M". */
function formatDim(value: number, system: "imperial" | "metric"): string {
  if (system === "metric") {
    return `${value.toFixed(1)} M`;
  }
  return `${Math.round(value)} FT`;
}

/** Apply alpha to a #rrggbb hex color → "rgba(r, g, b, a)". */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(99, 102, 241, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Truncate text with ellipsis if it overflows maxWidth. */
function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** 1×1 white PNG as a fallback when canvas context isn't available. */
function emptyPng(): string {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8//8/AwAI/AL+rXjj7gAAAABJRU5ErkJggg==";
}
