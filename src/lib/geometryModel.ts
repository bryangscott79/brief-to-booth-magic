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

/**
 * Structural form describes the architectural CHARACTER of a zone —
 * not its footprint shape (that's `shape`), but how it reads in
 * three dimensions. The image model uses this to decide what walls,
 * ceilings, and openings to render around the zone footprint.
 *
 *   • open      — no walls; defined by floor pattern / props alone
 *                 (sampling counters, demo islands)
 *   • enclosed  — 4 walls and a ceiling (photo chambers, AV rooms)
 *   • canopy    — overhead structure with open sides (lounges with
 *                 tension fabric, shaded hospitality zones)
 *   • alcove    — 3 walls open on the aisle side (kiosks, welcome
 *                 stations that face the aisle)
 *   • platform  — raised floor, no walls (DJ stages, presentation
 *                 areas, elevated demos)
 *   • tower     — vertical sculpture, footprint << height (brand
 *                 markers, totems, beacon structures)
 */
export type StructuralForm =
  | "open"
  | "enclosed"
  | "canopy"
  | "alcove"
  | "platform"
  | "tower";

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
   * Architectural form of the zone (walls, canopy, alcove, etc.).
   * Drives how the image model imagines the third dimension. Missing
   * = "open" (legacy zones). See `StructuralForm` jsdoc above.
   */
  structuralForm?: StructuralForm;
  /**
   * One- or two-sentence description of what this zone LOOKS like —
   * the visual identity beyond function. Example: "Mirror-clad
   * walkthrough chamber with iridescent LED interior and wing
   * sculpture overhead." Surfaced on the AI input PNG and injected
   * into the per-zone interior prompt so the model has explicit
   * visual language tied to this footprint.
   */
  featureDescription?: string;
  /**
   * The visitor experience that happens here — what people DO in this
   * zone. Example: "Step into the chamber, pose in front of the
   * Infinite Wings, get a branded photo and AirDrop it to share."
   * Distinct from featureDescription (which is what it looks like).
   */
  intent?: string;
  /**
   * IDs (or names) of materials from spatialData.materialsAndMood
   * that apply to this zone. Lets a single materials catalog bind to
   * specific zones rather than being a generic mood board. Empty =
   * inherits the booth's default palette.
   */
  materialIds?: string[];
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

// ─── Booth features (sculptural objects, not functional zones) ────────────

/**
 * Form types for non-zone objects placed in the booth. These
 * describe the FORM of a structural feature — a sculpture, ribbon,
 * tower, screen — independent of what zone they belong to. A "DJ
 * Performance Platform" zone might contain a `platform` feature
 * plus a `screen` feature plus a pair of `totem` features.
 */
export type FeatureFormType =
  | "tower"      // vertical sculpture (height >> footprint)
  | "ribbon"     // curving path-based sculpture (LED ribbon, fabric drape)
  | "archway"    // gateway between zones
  | "canopy"     // overhead shade structure
  | "sculpture"  // freeform 3D object
  | "screen"     // LED wall, projection surface
  | "totem"      // signage column or brand marker
  | "platform"   // raised stage
  | "bar"        // counter or service surface
  | "kiosk";     // small enclosed booth

/**
 * Footprint shape for a feature. Richer than zone `shape` because
 * features express organic / path-based geometry — ribbons curve
 * through space, archways span two anchor points, sculptures have
 * arbitrary outlines. `points` and `path` are in LOCAL coords
 * relative to the feature's anchor (x, y).
 */
export type FeatureShape =
  | { kind: "rect"; width: number; depth: number }
  | { kind: "circle"; radius: number }
  | { kind: "ellipse"; radiusX: number; radiusY: number }
  | { kind: "polygon"; points: Array<{ x: number; y: number }> }
  | { kind: "ribbon"; path: Array<{ x: number; y: number }>; thickness: number };

/**
 * A non-zone structural object in the booth — towers, ribbons,
 * archways, screens, sculptures. Features can be standalone or
 * associated with a zone (zoneId). They contribute to the visual
 * identity of the booth without being functional partitions of the
 * floor plan, and they can express organic shapes that zones can't.
 */
export interface BoothFeature {
  id: string;
  name: string;
  /** Anchor point in booth coords (front-left = 0,0). */
  x: number;
  y: number;
  /** Footprint shape relative to anchor (see FeatureShape). */
  shape: FeatureShape;
  /** Floor offset in feet — typically 0, but a hanging element
   *  could start at 8 ft for an overhead canopy. */
  baseHeightFt: number;
  /** Top of feature in feet. baseHeightFt to topHeightFt is the
   *  feature's vertical extent, which the iso renders as an
   *  extruded prism in 3D. */
  topHeightFt: number;
  /** What KIND of object (tower / ribbon / canopy / etc.). The
   *  image model uses this to render the right material & form. */
  formType: FeatureFormType;
  /** Visual description — the brand-specific look. Example:
   *  "Iridescent dichroic ribbon arching from welcome to photo
   *  chamber, embedded with LED neon that pulses with the music." */
  description?: string;
  /** Materials catalog refs (same shape as zone.materialIds). */
  materialIds?: string[];
  /** Hex color used in the canvas + iso. Visual only — the image
   *  model renders by description, not color. */
  colorHex: string;
  /** If the feature anchors / belongs to a zone, link to it so
   *  prompts and validation can group them. Optional — a feature
   *  can also float free in circulation space. */
  zoneId?: string;
  /** User-editable prompt override (mirrors zone.customPromptOverride). */
  customPromptOverride?: string;
}

// ─── Hanging elements (overhead, suspended-from-ceiling objects) ──────────

/**
 * A hanging / suspended element placed above the booth floor —
 * identity rings, halos, fabric arrays, LED canopies. Unlike zones
 * and features, these don't sit on the floor; they hang from rigging
 * at `suspensionDropFt` below the ceiling.
 *
 * Coordinates note: `x` and `y` are the CENTER of the element's
 * top-down footprint (not the front-left corner as with zones). This
 * matches how rigging is usually specified ("ring centered 3' from
 * the back wall") and makes drag math trivially symmetric.
 */
export interface AbsoluteHangingElement {
  id: string;
  name: string;
  /** Booth-local x coordinate of the element's CENTER, in real units. */
  x: number;
  /** Booth-local y coordinate of the element's CENTER, in real units. */
  y: number;
  /** Footprint width (along x), real units. */
  width: number;
  /** Footprint depth (along y), real units. */
  depth: number;
  /** Vertical thickness of the element, in feet (regardless of measurement system). */
  thicknessFt: number;
  shape: "rect" | "circle" | "oval" | "ring" | "custom";
  /** Distance in feet below the ceiling at which the element hangs. */
  suspensionDropFt: number;
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
  /**
   * Sculptural / structural objects placed in the booth. Optional
   * for backward compat with legacy spatialData payloads that only
   * carried zones. Empty array vs missing both mean "no features."
   */
  features?: BoothFeature[];
  /**
   * Materials & mood catalog. Originates from
   * spatialData.materialsAndMood; carried on geometry so the canvas
   * can show / bind materials to zones + features without
   * round-tripping through the parent component every time.
   */
  materialsCatalog?: MaterialEntry[];
  /**
   * Overhead / suspended elements (rings, halos, fabric arrays, LED
   * canopies). Optional for backward compat — legacy geometry has no
   * hanging concept. Rendered above zones on the top-down canvas as
   * dashed outlines.
   */
  hangingElements?: AbsoluteHangingElement[];
}

/**
 * One entry in the booth's materials & mood catalog. Brands define
 * a small palette of materials (8–12 max) that get referenced from
 * zones and features. The `id` is stable so zones can keep their
 * material refs even if the user renames an entry.
 */
export interface MaterialEntry {
  id: string;
  name: string;
  description?: string;
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
    structuralForm?: StructuralForm;
    featureDescription?: string;
    intent?: string;
    materialIds?: string[];
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
    ...(extras.structuralForm ? { structuralForm: extras.structuralForm } : {}),
    ...(extras.featureDescription
      ? { featureDescription: extras.featureDescription }
      : {}),
    ...(extras.intent ? { intent: extras.intent } : {}),
    ...(Array.isArray(extras.materialIds) && extras.materialIds.length > 0
      ? { materialIds: extras.materialIds }
      : {}),
    ...(extras.customPromptOverride
      ? { customPromptOverride: extras.customPromptOverride }
      : {}),
  };
}

/** Build a full BoothGeometry from the current legacy spatialData shape.
 *
 * Optional `extra` carries data that lives on spatialData but isn't
 * part of the zones array — features, the materials & mood catalog,
 * the ceiling height. Missing extras fall back to sensible defaults
 * so legacy callers (none of these fields populated) keep working. */
export function boothGeometryFromLegacy(
  boothDimensions: BoothDimensions,
  normalizedZones: NormalizedZone[],
  ceilingHeightFt = 12,
  extra: {
    features?: BoothFeature[];
    materialsCatalog?: MaterialEntry[];
    hangingElements?: AbsoluteHangingElement[];
  } = {},
): BoothGeometry {
  return {
    width: boothDimensions.width,
    depth: boothDimensions.depth,
    ceilingHeightFt,
    measurementSystem: boothDimensions.measurementSystem,
    zones: normalizedZones.map((z) => absoluteFromNormalizedZone(z, boothDimensions)),
    ...(extra.features ? { features: extra.features } : {}),
    ...(extra.materialsCatalog
      ? { materialsCatalog: extra.materialsCatalog }
      : {}),
    ...(extra.hangingElements ? { hangingElements: extra.hangingElements } : {}),
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
    // persist keeps every editable attribute alongside the position.
    // Without this, every render would silently drop the user's
    // structural / material / intent edits.
    heightFt: zone.heightFt,
    ...(zone.shape ? { shape: zone.shape } : {}),
    ...(zone.shapeParams ? { shapeParams: zone.shapeParams } : {}),
    ...(zone.structuralForm ? { structuralForm: zone.structuralForm } : {}),
    ...(zone.featureDescription
      ? { featureDescription: zone.featureDescription }
      : {}),
    ...(zone.intent ? { intent: zone.intent } : {}),
    ...(Array.isArray(zone.materialIds) && zone.materialIds.length > 0
      ? { materialIds: zone.materialIds }
      : {}),
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
  // Backed by classifyZoneFunction (which has the full industry-vocab
  // keyword set) so a zone like "Infinite Wings Photo Chamber" lands
  // in the hero bucket and gets placed at the front-center where a
  // visitor can see it from the aisle. Without this the auto-layout
  // would treat it as "other" and place it in scan order.
  type Bucket = "hero" | "lounge" | "service" | "other";
  function classify(name: string): Bucket {
    const fn = classifyZoneFunction(name);
    if (fn === "hero" || fn === "experience") return "hero";
    if (fn === "lounge" || fn === "hospitality") return "lounge";
    if (fn === "storage" || fn === "service" || fn === "command") return "service";
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
 *   1. Grow each zone to MAX(minSqft, minPercentage * boothSqft / 100)
 *      — the industry-defined floor from exhibitConstraints. This
 *      single target satisfies BOTH the "below min sqft" error AND
 *      the "below min percentage" warning in one pass, so re-clicking
 *      auto-fix should never leave behind size-related issues.
 *      Isotropic scaling keeps each zone's aspect ratio; the bounding
 *      box stays roughly the same shape rather than becoming a sliver.
 *   2. If the sum of grown areas exceeds the booth area minus min
 *      circulation (20%), proportionally shrink them all so they fit.
 *      Without this step we could grow zones larger than the booth
 *      can hold and leave a permanent overlap state.
 *   3. Clamp every zone to the booth's outer rectangle.
 *   4. Snap positions + sizes to the unit grid (1' / 0.5m).
 *   5. If any zones still overlap, run autoLayoutZones to redistribute
 *      everything heuristically. The grow pass commonly creates fresh
 *      overlaps; this is the resolution.
 *
 * Returns a NEW BoothGeometry (input is not mutated). Idempotent on
 * already-clean geometry.
 */
export function fixLayoutAutomatically(geometry: BoothGeometry): BoothGeometry {
  const isMetric = geometry.measurementSystem === "metric";
  const SQM_TO_SQFT = 10.76391041671;

  // Booth area in sqft (constraint math always assumes sqft).
  const boothAreaNative = geometry.width * geometry.depth;
  const boothSqft = isMetric ? boothAreaNative * SQM_TO_SQFT : boothAreaNative;

  // Pass 0: grow undersized zones to the COMBINED floor — max of
  // the absolute sqft minimum and the percent-of-booth minimum. This
  // is what kills the "warning: only X% of the booth" issues at the
  // same time as the "error: below sqft minimum" ones.
  const grown = geometry.zones.map((z) => {
    const fn = classifyZoneFunction(z.name);
    const c = ZONE_CONSTRAINTS[fn];
    if (!c) return z;
    const minByPct = (c.minPercentage / 100) * boothSqft;
    const targetSqft = Math.max(c.minSqft, minByPct);
    if (!targetSqft) return z;
    const currentArea = z.width * z.depth;
    const currentSqft = isMetric ? currentArea * SQM_TO_SQFT : currentArea;
    if (currentSqft >= targetSqft) return z;
    const scale = Math.sqrt(targetSqft / Math.max(currentSqft, 1));
    return {
      ...z,
      width: z.width * scale,
      depth: z.depth * scale,
    };
  });

  // Pass 1: if the grown footprint sum would blow past the booth's
  // available floor (booth area minus the 20% circulation reserve),
  // proportionally shrink every zone to fit. Without this the layout
  // engine would land on permanent overlaps because the geometry is
  // simply over-allocated. We aim at 75% of the booth so circulation
  // stays comfortably above the 20% minimum.
  const TARGET_ALLOCATION_PCT = 0.75;
  const grownSumNative = grown.reduce((s, z) => s + z.width * z.depth, 0);
  const allowedNative = boothAreaNative * TARGET_ALLOCATION_PCT;
  let scaledForFit = grown;
  if (grownSumNative > allowedNative) {
    const fitScale = Math.sqrt(allowedNative / grownSumNative);
    scaledForFit = grown.map((z) => ({
      ...z,
      width: z.width * fitScale,
      depth: z.depth * fitScale,
    }));
  }

  // Pass 2: clamp + snap each zone individually.
  const clamped = scaledForFit.map((z) => {
    const c = clampZoneToBooth(z, geometry);
    return {
      ...c,
      x: snapToGrid(c.x, geometry.measurementSystem),
      y: snapToGrid(c.y, geometry.measurementSystem),
      width: snapToGrid(c.width, geometry.measurementSystem),
      depth: snapToGrid(c.depth, geometry.measurementSystem),
    };
  });

  // Pass 3: detect remaining overlaps. Growing zones almost always
  // creates fresh overlaps, so this branch fires often — and that's
  // intended: autoLayoutZones places everything fresh from scratch.
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

/**
 * Round-trip wrapper around fixLayoutAutomatically that operates on
 * the legacy NormalizedZone[] shape (0–100 percent positions). Used
 * by the LayoutVariations engine so each strategy ("Hero-Centric",
 * "Engagement Maximizer") emits zones that are valid by construction
 * — every zone meets MAX(min sqft, min percentage), nothing overlaps,
 * and the booth never over-allocates. Without this, picking a layout
 * option could land the user in a state where validation immediately
 * complained, which is exactly the experience we just fixed.
 */
export function fixNormalizedLayoutAutomatically(
  zones: NormalizedZone[],
  boothDimensions: BoothDimensions,
): NormalizedZone[] {
  const geometry = boothGeometryFromLegacy(boothDimensions, zones);
  const fixed = fixLayoutAutomatically(geometry);
  return fixed.zones.map((abs) =>
    normalizedFromAbsoluteZone(abs, fixed, boothDimensions.totalSqft),
  );
}
