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

import type {
  BoothGeometry,
  AbsoluteZone,
  BoothFeature,
} from "./geometryModel";
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

  // ── Features ─────────────────────────────────────────────────────
  // Sculptural objects render ON TOP of zones — they're the booth's
  // visual identity, not its functional partitions. The image model
  // reads "TOWER · DICHROIC FILM · 14ft" at the feature's position
  // and uses it as explicit structural language. Without this layer,
  // the model has to invent vertical geometry (which is exactly the
  // failure mode that produced the iridescent ribbon "slide" — a
  // photogenic but architecturally implausible feature).
  for (const feature of geometry.features ?? []) {
    drawFeature(ctx, feature, geometry, x0, y0, pxPerUnit);
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

  // Materials catalog rendered AFTER the scale bar so it can use the
  // scale bar's pixel width to leave room. See block below the scale
  // bar code for the actual draw.

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

  // ── Materials & mood catalog (lower-left, above the scale bar
  //    line). Every approved material from the brand palette listed
  //    compact so the image model knows the full vocabulary even for
  //    zones that didn't bind specific materials. ────────────────
  const catalog = geometry.materialsCatalog ?? [];
  if (catalog.length > 0) {
    const visibleCount = Math.min(catalog.length, 7);
    const blockHeight = (visibleCount + 1) * 18;
    const blockY = canvasH - 36 - blockHeight;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText("MATERIALS & MOOD", 16, blockY);
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "#475569";
    const reservedRight = scaleBarPx + 64; // leave room for the scale bar
    catalog.slice(0, 7).forEach((m, i) => {
      const desc = m.description ? ` — ${m.description}` : "";
      const line = clipText(
        ctx,
        `• ${m.name}${desc}`,
        canvasW - 32 - reservedRight,
      );
      ctx.fillText(line, 16, blockY + 22 + i * 18);
    });
    if (catalog.length > 7) {
      ctx.fillText(`(+${catalog.length - 7} more)`, 16, blockY + 22 + 7 * 18);
    }
  }

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

  // ── Structural metadata, when set. The image model reads these as
  //    explicit visual cues. Order: form (bold uppercase) → visual
  //    brief → materials list. Skip lines that aren't populated so
  //    zones with only function (no structural intent) stay clean. */
  let metaY = py + padY + 80;
  if (zone.structuralForm) {
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.fillStyle = "#7c3aed"; // distinct from the slate body text
    ctx.fillText(
      zone.structuralForm.toUpperCase(),
      px + padX,
      metaY,
    );
    metaY += 22;
  }
  if (zone.featureDescription) {
    ctx.font = "italic 14px system-ui, sans-serif";
    ctx.fillStyle = "#334155";
    const lines = wrapText(ctx, zone.featureDescription, pw - padX * 2);
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, px + padX, metaY);
      metaY += 18;
    }
  }
  if (zone.intent) {
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = "#475569";
    const lines = wrapText(ctx, `→ ${zone.intent}`, pw - padX * 2);
    for (const line of lines.slice(0, 2)) {
      ctx.fillText(line, px + padX, metaY);
      metaY += 18;
    }
  }
  if (zone.materialIds && zone.materialIds.length > 0) {
    const catalog = geometry.materialsCatalog ?? [];
    const names = zone.materialIds
      .map((id) => catalog.find((m) => m.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
    if (names) {
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillStyle = "#64748b";
      const lines = wrapText(ctx, `Materials: ${names}`, pw - padX * 2);
      for (const line of lines.slice(0, 2)) {
        ctx.fillText(line, px + padX, metaY);
        metaY += 16;
      }
    }
  }
}

/**
 * Draw one BoothFeature (tower, ribbon, sculpture, etc.) on top of the
 * zones layer. Each feature gets a colored outline + a label tag that
 * names the form type and (when present) the first material. The
 * image model reads these as discrete sculptural callouts.
 */
function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: BoothFeature,
  geometry: BoothGeometry,
  x0: number,
  y0: number,
  pxPerUnit: number,
) {
  // Anchor in canvas pixels with the y-flip applied (y=0 = front).
  const ax = x0 + feature.x * pxPerUnit;
  const ay = y0 + (geometry.depth - feature.y) * pxPerUnit;

  ctx.save();
  ctx.translate(ax, ay);
  // Local +y in feature shape coords corresponds to "deeper into the
  // booth" which is upward on the canvas (because of the flip), so
  // we mirror y when drawing each shape kind. Drawing math below
  // negates y to land everything correctly.
  ctx.fillStyle = hexWithAlpha(feature.colorHex, 0.45);
  ctx.strokeStyle = feature.colorHex;
  ctx.lineWidth = 3;

  const s = feature.shape;
  ctx.beginPath();
  if (s.kind === "rect") {
    ctx.rect(0, -s.depth * pxPerUnit, s.width * pxPerUnit, s.depth * pxPerUnit);
  } else if (s.kind === "circle") {
    ctx.arc(0, 0, s.radius * pxPerUnit, 0, Math.PI * 2);
  } else if (s.kind === "ellipse") {
    ctx.ellipse(0, 0, s.radiusX * pxPerUnit, s.radiusY * pxPerUnit, 0, 0, Math.PI * 2);
  } else if (s.kind === "polygon" && s.points.length >= 3) {
    ctx.moveTo(s.points[0].x * pxPerUnit, -s.points[0].y * pxPerUnit);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * pxPerUnit, -s.points[i].y * pxPerUnit);
    }
    ctx.closePath();
  } else if (s.kind === "ribbon" && s.path.length >= 2) {
    // Draw the ribbon as a thick polyline. Skip fill (would just be
    // a stroked path); the AI input PNG only needs the centerline
    // and thickness as visual reference.
    ctx.lineWidth = Math.max(4, s.thickness * pxPerUnit);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(s.path[0].x * pxPerUnit, -s.path[0].y * pxPerUnit);
    for (let i = 1; i < s.path.length; i++) {
      ctx.lineTo(s.path[i].x * pxPerUnit, -s.path[i].y * pxPerUnit);
    }
  }
  if (s.kind === "ribbon") {
    ctx.stroke();
  } else {
    ctx.fill();
    ctx.stroke();
  }

  // Label tag — form type in caps (so the model treats it like a
  // discrete object class), feature name, and the first material when
  // bound. Anchored at the feature's anchor with a small offset so
  // it doesn't bury the shape outline.
  const catalog = geometry.materialsCatalog ?? [];
  const matName = (feature.materialIds ?? [])
    .map((id) => catalog.find((m) => m.id === id)?.name)
    .filter(Boolean)[0];
  const label = matName
    ? `${feature.formType.toUpperCase()} · ${feature.name} · ${matName}`
    : `${feature.formType.toUpperCase()} · ${feature.name}`;

  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, 6, 6);

  // Height range — visible as a small subtitle so the model knows
  // base + top in feet.
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(
    `${feature.baseHeightFt}–${feature.topHeightFt} ft`,
    6,
    24,
  );

  ctx.restore();
}

/** Wrap text to a max width using greedy word fits. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
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

  if (shape === "diamond") {
    // Rhombus inscribed in the bounding box: top-mid, right-mid,
    // bottom-mid, left-mid. Same coord frame as the rect branch.
    ctx.moveTo(px + pw / 2, py);
    ctx.lineTo(px + pw, py + pd / 2);
    ctx.lineTo(px + pw / 2, py + pd);
    ctx.lineTo(px, py + pd / 2);
    ctx.closePath();
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
