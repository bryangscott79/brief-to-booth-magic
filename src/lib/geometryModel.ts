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

// ─── Types ────────────────────────────────────────────────────────────────

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
  return {
    id: zone.id,
    name: zone.name,
    x: (p.x / 100) * bw,
    y: (p.y / 100) * bd,
    width: (p.width / 100) * bw,
    depth: (p.height / 100) * bd,
    heightFt: defaultHeightForZone(zone.name),
    colorHex: zone.colorCode,
    notes: zone.notes,
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
