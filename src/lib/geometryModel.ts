/**
 * Geometry Model — absolute-units booth + zones for the interactive
 * spatial canvas and the geometry-reference PNG pipeline.
 *
 * Why this exists: the legacy zone shape (`{x, y, width, height}` in
 * 0–100 percent of booth) is correct math but disconnected from
 * physical space — the user can't drag a "12-foot lounge", and the
 * image model can't ground its render in concrete geometry. This
 * module replaces percentages with **real-unit coordinates** (feet
 * for imperial, meters for metric) and adds a `heightFt` per zone so
 * we can extrude into a 3D volume for the isometric reference.
 *
 * Two-way conversion with the legacy shape is intentional: existing
 * AI-generated zones, persisted projects, and the SpatialPlanner UI
 * keep working unchanged. New code writes absolute, reads either.
 */

import type { NormalizedZone, BoothDimensions } from "./spatialUtils";
import { ZONE_CONSTRAINTS, classifyZoneFunction } from "./exhibitConstraints";

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Available zone shapes. The `width` × `depth` bounding box still
 * controls where the zone sits and how it interacts with overlap /
 * clamp logic; the shape only changes how the footprint is drawn
 * inside that box.
 *
 *   • rect    — solid rectangle (default)
 *   • diamond — rhombus inscribed in the bounding box (a 45°-rotated
 *               square when width === depth). Reads as a diagonal-
 *               feature: angled bars, gem-shaped islands, pivot demos.
 *   • L       — L-shape: rectangle minus a notch in one corner. Useful
 *               for corner counters that wrap around a column or
 *               demarcate two zone halves.
 *   • circle  — filled ellipse (a perfect circle when width === depth).
 *               Used for round bars, pedestals, central display rounds.
 */
export type ZoneShape = "rect" | "L" | "circle" | "diamond";

export type LCorner = "NE" | "NW" | "SE" | "SW";

/**
 * Shape-specific extra parameters. Stored as an object so future
 * shapes can add their own fields without breaking the discriminated
 * union (and so persisting + parsing stays robust).
 */
export interface ZoneShapeParams {
  /** Only meaningful for L shapes. Which corner of the bounding box
   *  is "notched out" (i.e., empty). */
  lCorner?: LCorner;
  /** L-shape notch width as a fraction of the zone's width (0.1–0.9).
   *  Default 0.5 (half-width notch → equal-leg L). */
  lNotchWidthRatio?: number;
  /** L-shape notch depth as a fraction of the zone's depth (0.1–0.9). */
  lNotchDepthRatio?: number;
}

/** A zone expressed in real units (ft for imperial, m for metric). */
export interface AbsoluteZone {
  id: string;
  name: string;
  /** Origin = front-left corner of booth. x runs left→right along WIDTH. */
  x: number;
  /** Origin = front-left corner. y runs front→back along DEPTH. */
  y: number;
  /** Footprint width (along x). Real units. */
  width: number;
  /** Footprint depth (along y). Real units. */
  depth: number;
  /**
   * Drawing shape inside the bounding box. Defaults to "rect" when
   * unset (legacy zones from before the shape system shipped).
   */
  shape?: ZoneShape;
  /** Shape-specific extras (notch geometry for L shapes, etc.). */
  shapeParams?: ZoneShapeParams;
  /**
   * Wall/ceiling height in FEET regardless of measurement system.
   * Image generation contexts always think in feet for height — most
   * trade-show booths cite ceiling clearances in feet even on metric
   * floor plans. Default 9' (open zone) to 12' (enclosed feature).
   * Minimum 0.5' to allow floor-only elements (decals, low platforms).
   */
  heightFt: number;
  /** Hex color for the zone in both top-down + iso. */
  colorHex: string;
  /** Optional notes / requirements that may be surfaced in prompts. */
  notes?: string;
  /**
   * User-edited prompt override for the zone-interior render of this
   * zone. When set, replaces the auto-generated zone interior prompt
   * verbatim. Surfaced via "Edit prompt" in the SpatialCanvas; cleared
   * with "Reset to default" returns to system-generated prompt.
   *
   * Scope: zone-interior renders only. Hero/exterior renders are not
   * affected (they describe zones via SPATIAL LAYOUT, not by full
   * prompts per zone).
   */
  customPromptOverride?: string;
}

/**
 * Full booth geometry: outer footprint + ceiling height + an array of
 * zones. This is the single source of truth the canvas edits and the
 * reference PNGs render from.
 */
export interface BoothGeometry {
  /** Outer width (along x). Real units. */
  width: number;
  /** Outer depth (along y). Real units. */
  depth: number;
  /** Maximum structure height in feet. */
  ceilingHeightFt: number;
  /** "imperial" → ft / sqft. "metric" → m / sqm. */
  measurementSystem: "imperial" | "metric";
  /** Zones inside the booth, in absolute coords. */
  zones: AbsoluteZone[];
}

// ─── Shape helpers ────────────────────────────────────────────────────────

/**
 * Resolve the effective shape for a zone. Legacy zones (before the
 * shape system shipped) have no `shape` field — they're treated as
 * rectangles.
 */
export function effectiveShape(zone: AbsoluteZone): ZoneShape {
  return zone.shape ?? "rect";
}

/**
 * Compute the L-shape notch in real units (ft / m). The notch is the
 * "empty" corner — the zone footprint is the bounding box MINUS this
 * rectangle. Defaults to a quarter-quarter notch if params are absent.
 */
export function resolveLNotch(zone: AbsoluteZone): {
  corner: LCorner;
  notchWidth: number;
  notchDepth: number;
} {
  const params = zone.shapeParams ?? {};
  const corner = params.lCorner ?? "NE";
  const wRatio = clamp01(params.lNotchWidthRatio ?? 0.5);
  const dRatio = clamp01(params.lNotchDepthRatio ?? 0.5);
  return {
    corner,
    notchWidth: zone.width * wRatio,
    notchDepth: zone.depth * dRatio,
  };
}

function clamp01(value: number): number {
  return Math.max(0.1, Math.min(0.9, value));
}

// ─── Conversion: legacy normalized zone (% based) → absolute ──────────────

const DEFAULT_HEIGHT_FT_BY_KIND: Array<{ match: RegExp; height: number }> = [
  { match: /\b(hero|apex|feature|installation|core)\b/i, height: 14 },
  { match: /\b(suite|meeting|conference|private|bd)\b/i, height: 10 },
  { match: /\b(reception|welcome|entry|check)\b/i, height: 10 },
  { match: /\b(demo|product|station|workshop)\b/i, height: 10 },
  { match: /\b(lounge|hub|hospitality|cafe|bar)\b/i, height: 9 },
  { match: /\b(storage|service|command|back|ops)\b/i, height: 8 },
];

function defaultHeightForZone(name: string): number {
  for (const { match, height } of DEFAULT_HEIGHT_FT_BY_KIND) {
    if (match.test(name)) return height;
  }
  return 10; // sensible booth default
}

/**
 * Convert a percent-based NormalizedZone into an AbsoluteZone using the
 * booth dimensions for scaling. Heights are inferred from zone names —
 * users can override post-conversion via the canvas.
 */
export function absoluteFromNormalizedZone(
  zone: NormalizedZone,
  boothDimensions: BoothDimensions,
): AbsoluteZone {
  const { width: bw, depth: bd } = boothDimensions;
  const p = zone.position;
  // Read fields that may have been persisted on the legacy zone but
  // aren't part of NormalizedZone proper (heightFt, shape, etc.).
  // Spread-cast lets us pick them up without changing the legacy type.
  const extras = zone as unknown as {
    heightFt?: number;
    shape?: ZoneShape;
    shapeParams?: ZoneShapeParams;
    customPromptOverride?: string;
  };
  return {
    id: zone.id,
    name: zone.name,
    x: (p.x / 100) * bw,
    y: (p.y / 100) * bd,
    width: (p.width / 100) * bw,
    depth: (p.height / 100) * bd,
    heightFt: typeof extras.heightFt === "number" ? extras.heightFt : defaultHeightForZone(zone.name),
    colorHex: zone.colorCode,
    notes: zone.notes,
    ...(extras.shape ? { shape: extras.shape } : {}),
    ...(extras.shapeParams ? { shapeParams: extras.shapeParams } : {}),
    ...(extras.customPromptOverride
      ? { customPromptOverride: extras.customPromptOverride }
      : {}),
  };
}

/** Build a full BoothGeometry from the current legacy spatialData shape. */
export function boothGeometryFromLegacy(
  boothDimensions: BoothDimensions,
  normalizedZones: NormalizedZone[],
  ceilingHeightFt = 12,
): BoothGeometry {
  return {
    width: boothDimensions.width,
    depth: boothDimensions.depth,
    ceilingHeightFt,
    measurementSystem: boothDimensions.measurementSystem,
    zones: normalizedZones.map((z) => absoluteFromNormalizedZone(z, boothDimensions)),
  };
}

// ─── Conversion: absolute → legacy normalized (for persistence + downstream) ──

/**
 * Round-trip an absolute zone back to the legacy percent shape so the
 * existing prompt builder, persistence, and validators keep working
 * unchanged. Future code paths can read absolute directly.
 */
export function normalizedFromAbsoluteZone(
  zone: AbsoluteZone,
  geometry: BoothGeometry,
  totalSqft: number,
): NormalizedZone {
  const { width: bw, depth: bd } = geometry;
  const xPct = (zone.x / bw) * 100;
  const yPct = (zone.y / bd) * 100;
  const widthPct = (zone.width / bw) * 100;
  const heightPct = (zone.depth / bd) * 100;
  const areaRatio = (widthPct / 100) * (heightPct / 100);
  const sqft = Math.round(areaRatio * totalSqft);
  const percentage = Math.round(areaRatio * 100);
  return {
    id: zone.id,
    name: zone.name,
    percentage,
    sqft,
    colorCode: zone.colorHex,
    position: { x: xPct, y: yPct, width: widthPct, height: heightPct },
    requirements: [],
    adjacencies: [],
    notes: zone.notes ?? "",
    // Pass canvas-owned fields straight through so the legacy zone we
    // persist keeps height/shape/override alongside the position. The
    // SpatialPlanner round-trip ALSO writes these explicitly, but
    // including them here makes the conversion lossless on its own
    // and protects callers that don't merge with the original zone.
    heightFt: zone.heightFt,
    ...(zone.shape ? { shape: zone.shape } : {}),
    ...(zone.shapeParams ? { shapeParams: zone.shapeParams } : {}),
    ...(zone.customPromptOverride
      ? { customPromptOverride: zone.customPromptOverride }
      : {}),
  };
}

// ─── Validation + math helpers ────────────────────────────────────────────

/** Clamp a zone so it can't extend past the booth's outer rectangle. */
export function clampZoneToBooth(zone: AbsoluteZone, geometry: BoothGeometry): AbsoluteZone {
  const minSize = unitSnap(geometry.measurementSystem); // floor at 1 grid step
  const clampedW = Math.max(minSize, Math.min(zone.width, geometry.width));
  const clampedD = Math.max(minSize, Math.min(zone.depth, geometry.depth));
  return {
    ...zone,
    width: clampedW,
    depth: clampedD,
    x: Math.max(0, Math.min(zone.x, geometry.width - clampedW)),
    y: Math.max(0, Math.min(zone.y, geometry.depth - clampedD)),
  };
}

/** Smallest unit step for snapping/sizing. Imperial → 1 ft, metric → 0.5 m. */
export function unitSnap(system: "imperial" | "metric"): number {
  return system === "metric" ? 0.5 : 1;
}

/** Snap a value to the unit grid. */
export function snapToGrid(value: number, system: "imperial" | "metric"): number {
  const step = unitSnap(system);
  return Math.round(value / step) * step;
}

/** Booth area in the project's native unit. */
export function boothArea(geometry: BoothGeometry): number {
  return geometry.width * geometry.depth;
}

/** Sum of zone areas (overlap-aware: simple sum, validation flags overlap). */
export function totalZoneArea(geometry: BoothGeometry): number {
  return geometry.zones.reduce((s, z) => s + z.width * z.depth, 0);
}

/** True when two zones overlap (positive intersection area). */
export function zonesOverlap(a: AbsoluteZone, b: AbsoluteZone): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x ||
           a.y + a.depth <= b.y || b.y + b.depth <= a.y);
}

/** Pretty area label for a zone. "120 sq ft (13%)" or "11.2 sqm (12%)". */
export function formatZoneArea(zone: AbsoluteZone, geometry: BoothGeometry): string {
  const area = zone.width * zone.depth;
  const pct = Math.round((area / boothArea(geometry)) * 100);
  const unit = geometry.measurementSystem === "metric" ? "sqm" : "sq ft";
  const rounded = geometry.measurementSystem === "metric"
    ? area.toFixed(1)
    : Math.round(area).toString();
  return `${rounded} ${unit} (${pct}%)`;
}

/** "12' × 10'" / "3.5m × 3m". */
export function formatZoneFootprint(zone: AbsoluteZone, system: "imperial" | "metric"): string {
  if (system === "metric") {
    return `${zone.width.toFixed(1)}m × ${zone.depth.toFixed(1)}m`;
  }
  return `${Math.round(zone.width)}' × ${Math.round(zone.depth)}'`;
}

// ─── Auto-layout heuristic ────────────────────────────────────────────────

/**
 * Greedy heuristic placement. Used when the user clicks "Auto-arrange".
 * Rules:
 *   - Hero/feature zones go front-and-center near the primary aisle (y=0).
 *   - Lounges go in corners.
 *   - Service / storage / command go at the back (y = booth.depth - z.depth).
 *   - Everything else fills remaining space row-by-row.
 *   - User-locked zones (passed in `lockedIds`) keep their placement.
 *
 * This is deterministic, rules-based — no AI call. Good enough for 80%
 * of layouts; users can drag to refine.
 */
export interface AutoLayoutOptions {
  geometry: BoothGeometry;
  /** Zones to place (will not be mutated). Existing positions are ignored except for locked. */
  zones: AbsoluteZone[];
  lockedIds?: string[];
}

export function autoLayoutZones(opts: AutoLayoutOptions): AbsoluteZone[] {
  const { geometry, zones, lockedIds = [] } = opts;
  const lockedSet = new Set(lockedIds);
  const step = unitSnap(geometry.measurementSystem);

  // Categorize each zone by name pattern → priority bucket.
  type Bucket = "hero" | "lounge" | "service" | "other";
  function classify(name: string): Bucket {
    const n = name.toLowerCase();
    if (/\b(hero|apex|feature|installation|core|experience)\b/.test(n)) return "hero";
    if (/\b(lounge|hub|hospitality|cafe|bar|social)\b/.test(n)) return "lounge";
    if (/\b(storage|service|command|back|ops|prep)\b/.test(n)) return "service";
    return "other";
  }

  const placed: AbsoluteZone[] = [];

  // Pass 1: keep locked zones where they are.
  for (const z of zones) {
    if (lockedSet.has(z.id)) placed.push({ ...z });
  }

  function fits(candidate: AbsoluteZone): boolean {
    if (candidate.x < 0 || candidate.y < 0) return false;
    if (candidate.x + candidate.width > geometry.width + 1e-6) return false;
    if (candidate.y + candidate.depth > geometry.depth + 1e-6) return false;
    return placed.every((p) => !zonesOverlap(p, candidate));
  }

  function tryPlace(zone: AbsoluteZone, preferredX: number, preferredY: number): AbsoluteZone | null {
    // Snap initial guess.
    let candidate = clampZoneToBooth(
      { ...zone, x: snapToGrid(preferredX, geometry.measurementSystem), y: snapToGrid(preferredY, geometry.measurementSystem) },
      geometry,
    );
    if (fits(candidate)) return candidate;

    // Walk the grid row-by-row looking for an empty slot.
    for (let y = 0; y <= geometry.depth - zone.depth + 1e-6; y += step) {
      for (let x = 0; x <= geometry.width - zone.width + 1e-6; x += step) {
        candidate = { ...zone, x, y };
        if (fits(candidate)) return candidate;
      }
    }
    return null;
  }

  // Pass 2: hero zones at front-center.
  const remaining = zones.filter((z) => !lockedSet.has(z.id));
  const heroes = remaining.filter((z) => classify(z.name) === "hero");
  for (const z of heroes) {
    const preferredX = (geometry.width - z.width) / 2;
    const placedZone = tryPlace(z, preferredX, 0);
    if (placedZone) placed.push(placedZone);
  }

  // Pass 3: lounges at corners (alternate front-left, back-right, front-right, back-left).
  const lounges = remaining.filter((z) => classify(z.name) === "lounge");
  const corners = [
    () => ({ x: 0, y: 0 }),
    () => (z: AbsoluteZone) => ({ x: geometry.width - z.width, y: geometry.depth - z.depth }),
    () => (z: AbsoluteZone) => ({ x: geometry.width - z.width, y: 0 }),
    () => (z: AbsoluteZone) => ({ x: 0, y: geometry.depth - z.depth }),
  ];
  lounges.forEach((z, i) => {
    const cornerFn = corners[i % corners.length]();
    const corner = typeof cornerFn === "function" ? cornerFn(z) : cornerFn;
    const placedZone = tryPlace(z, corner.x, corner.y);
    if (placedZone) placed.push(placedZone);
  });

  // Pass 4: service/storage at back.
  const services = remaining.filter((z) => classify(z.name) === "service");
  for (const z of services) {
    const placedZone = tryPlace(z, 0, geometry.depth - z.depth);
    if (placedZone) placed.push(placedZone);
  }

  // Pass 5: everything else — row-by-row scan from front.
  const others = remaining.filter((z) => classify(z.name) === "other");
  for (const z of others) {
    const placedZone = tryPlace(z, 0, 0);
    if (placedZone) placed.push(placedZone);
  }

  // Pass 6: any zone that didn't fit gets its original position back as
  // a last resort — the user will see overlap warnings in the UI.
  for (const z of remaining) {
    if (!placed.find((p) => p.id === z.id)) {
      placed.push({ ...z });
    }
  }

  // Preserve original input order so React keys + UI lists stay stable.
  return zones.map((z) => placed.find((p) => p.id === z.id) ?? z);
}

/**
 * One-click layout repair. Called by the "Fix layout" CTA in the
 * Validate tab when the user wants to bring the booth to a clean state
 * without manually dragging zones.
 *
 * Steps, in order:
 *   1. Grow each zone to the industry minimum for its function — the
 *      constraints in exhibitConstraints.ZONE_CONSTRAINTS define
 *      minSqft per zone type (welcome=64, meeting=100, hero=100, etc.).
 *      A zone smaller than its min gets scaled up isotropically so
 *      width × depth meets the floor; the bounding box stays roughly
 *      the same shape instead of becoming a sliver.
 *   2. Clamp every zone to the booth's outer rectangle (resolves any
 *      "extends past edge" errors that step 1 may have introduced).
 *   3. Snap positions + sizes to the unit grid (1' / 0.5m).
 *   4. If any zones still overlap or under/over-allocate the booth,
 *      run autoLayoutZones to redistribute everything heuristically.
 *      This may move zones; users can drag-fine-tune afterward.
 *
 * Returns a NEW BoothGeometry (input is not mutated). Idempotent on
 * already-clean geometry (zones at or above their minimum stay put).
 */
export function fixLayoutAutomatically(geometry: BoothGeometry): BoothGeometry {
  const isMetric = geometry.measurementSystem === "metric";

  // Pass 0: grow undersized zones to meet their function's min sqft.
  // Zones are sized in native units; constraints are in sqft. For
  // metric we convert: the math is "ratio = minSqft / currentSqft"
  // applied to width × depth so the units cancel out either way.
  const SQM_TO_SQFT = 10.76391041671;
  const grown = geometry.zones.map((z) => {
    const fn = classifyZoneFunction(z.name);
    const minSqft = ZONE_CONSTRAINTS[fn]?.minSqft ?? 0;
    if (!minSqft) return z;
    const currentArea = z.width * z.depth;
    const currentSqft = isMetric ? currentArea * SQM_TO_SQFT : currentArea;
    if (currentSqft >= minSqft) return z;
    // Isotropic scale: keep the aspect ratio, grow until the area
    // hits the minimum. √(min/current) on each side does it.
    const scale = Math.sqrt(minSqft / Math.max(currentSqft, 1));
    return {
      ...z,
      width: z.width * scale,
      depth: z.depth * scale,
    };
  });

  // Pass 1: clamp + snap each zone individually.
  const clamped = grown.map((z) => {
    const c = clampZoneToBooth(z, geometry);
    return {
      ...c,
      x: snapToGrid(c.x, geometry.measurementSystem),
      y: snapToGrid(c.y, geometry.measurementSystem),
      width: snapToGrid(c.width, geometry.measurementSystem),
      depth: snapToGrid(c.depth, geometry.measurementSystem),
    };
  });

  // Pass 2: detect remaining overlaps. If any, run auto-layout to
  // redistribute. If none, we're done. Note: growing zones in pass 0
  // commonly creates new overlaps, so this branch fires often — and
  // that's intended (autoLayoutZones places everything fresh).
  let hasOverlap = false;
  outer: for (let i = 0; i < clamped.length; i++) {
    for (let j = i + 1; j < clamped.length; j++) {
      if (zonesOverlap(clamped[i], clamped[j])) {
        hasOverlap = true;
        break outer;
      }
    }
  }

  const finalZones = hasOverlap
    ? autoLayoutZones({ geometry: { ...geometry, zones: clamped }, zones: clamped })
    : clamped;

  return { ...geometry, zones: finalZones };
}
