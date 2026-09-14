/**
 * boothSolids — BoothGeometry → a flat list of named, extruded solids in
 * METRES. This is the shared decomposition consumed by BOTH model outputs:
 *
 *   • src/lib/blenderScript.ts — emits Blender Python that rebuilds these
 *     solids as real mesh objects inside collections.
 *   • src/lib/gltfExport.ts    — emits the same solids as a minimal glTF 2.0
 *     document so the step is useful with zero infrastructure.
 *
 * Keeping the decomposition in one place means the .blend and the .gltf are
 * the SAME model — a zone that notches in one notches in the other.
 *
 * ── UNIT CONVENTION (read this before touching anything) ──────────────────
 * The model is authored in METRES, always, whatever the project's
 * measurement system is.
 *
 *   • Plan units (BoothGeometry.width/depth, zone x/y/width/depth, feature
 *     anchors and shapes) are FEET for `measurementSystem: "imperial"` and
 *     METRES for `"metric"`. Multiply by `planScale` (FT_TO_M or 1).
 *   • Heights are ALWAYS FEET in this codebase — ceilingHeightFt,
 *     zone.heightFt, feature base/topHeightFt, hanging thicknessFt and
 *     suspensionDropFt — regardless of measurement system. Always multiply
 *     by FT_TO_M.
 *
 * ── COORDINATE CONVENTION ─────────────────────────────────────────────────
 * Booth-local, Z-up (Blender native):
 *   • origin (0,0,0) = booth FRONT-LEFT corner at floor level
 *   • +x = left → right along the booth WIDTH
 *   • +y = front (aisle) → back along the booth DEPTH
 *   • +z = up
 * Zones and rect features are CORNER-anchored at (x, y). Circle/ellipse
 * features and every hanging element are CENTER-anchored — do not mix them
 * up; the hanging drag math in geometryModel.ts hit-tests ±w/2, ±d/2.
 * glTF's Y-up conversion happens in gltfExport.ts, not here.
 */

import type {
  AbsoluteZone,
  BoothFeature,
  BoothGeometry,
  StructuralForm,
} from "./geometryModel";
import { effectiveShape, resolveLNotch } from "./geometryModel";

// ─── Units ────────────────────────────────────────────────────────────────

/** One foot in metres. The only length conversion constant in the pipeline. */
export const FT_TO_M = 0.3048;

/** Heights are always feet in this codebase — this is the only height path. */
export function feetToMetres(ft: number): number {
  return ft * FT_TO_M;
}

/**
 * Plan-unit length → metres. Imperial plans are in feet; metric plans are
 * already in metres and pass through untouched.
 */
export function planToMetres(value: number, system: "imperial" | "metric"): number {
  return system === "metric" ? value : value * FT_TO_M;
}

/** 4-decimal rounding — sub-tenth-of-a-millimetre, and keeps emitted text stable. */
export function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

// ─── Construction constants (metres) ──────────────────────────────────────

const CARPET_THICKNESS_M = 0.01;
const PAD_THICKNESS_M = 0.02;
const WALL_THICKNESS_M = 0.08;
const POST_SIZE_M = 0.1;
const CANOPY_THICKNESS_M = 0.08;
const CEILING_THICKNESS_M = 0.05;
const SCREEN_THICKNESS_M = 0.12;
const LINTEL_THICKNESS_M = 0.25;
/** A "platform" zone is a raised floor, not a wall — 1 ft rise, capped by its own height. */
const PLATFORM_RISE_FT = 1;
/** Segment counts for curved footprints. */
const CIRCLE_SEGMENTS = 32;
const RING_SEGMENTS = 24;

// ─── Palette (glTF needs a colour for every material) ─────────────────────

const COLOR_FLOOR = "#E7E9EC";
const COLOR_STRUCTURE = "#9AA3AE";
const COLOR_CATALOG_MATERIAL = "#B8BEC7";
const COLOR_HANGING = "#6366F1";
const COLOR_FEATURE_FALLBACK = "#C084FC";

/**
 * "#RRGGBB" → linear-space RGB in 0–1. Both Blender material base colours
 * and glTF `baseColorFactor` are LINEAR, while design hex is sRGB, so the
 * transfer function has to be undone or every surface renders washed out.
 */
export function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = (hex ?? "").replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const channel = (offset: number) => {
    const srgb = parseInt(full.slice(offset, offset + 2), 16) / 255;
    const value = Number.isFinite(srgb) ? srgb : 0;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return [round4(channel(0)), round4(channel(2)), round4(channel(4))];
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export type SolidRole =
  | "floor"
  | "pad"
  | "wall"
  | "upright"
  | "canopy"
  | "ceiling"
  | "solid"
  | "platform"
  | "screen"
  | "lintel"
  | "ribbon"
  | "hanging";

/**
 * One extruded prism: a closed CCW footprint polygon in metres, swept from
 * z0 to z1. Every piece of booth geometry reduces to this — rectangles,
 * L-notches, circles and diamonds are all just different polygons.
 */
export interface BoothSolid {
  /** Unique, Blender-safe object name. */
  name: string;
  /** Collection path from the scene root, e.g. ["Booth","Zones","Zone_Lounge"]. */
  collection: string[];
  /** Footprint polygon in metres, booth-local, counter-clockwise. */
  points: Vec2[];
  /** Bottom of the sweep, metres. */
  z0: number;
  /** Top of the sweep, metres. */
  z1: number;
  /** Material name — always present in `BoothModelPlan.materials`. */
  material: string;
  role: SolidRole;
  /** Originating zone / feature / hanging-element id, for traceability. */
  sourceId?: string;
}

export interface PlanMaterial {
  name: string;
  colorHex: string;
}

export interface PlanLight {
  name: string;
  /** Area lights only — the whole rig is soft boxes. */
  x: number;
  y: number;
  z: number;
  /** Watts. */
  energy: number;
  /** Emitter size in metres. */
  sizeM: number;
}

export interface PlanCamera {
  name: string;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Focal length in mm (perspective cameras). */
  lens: number;
  /** Top-down plan camera is orthographic. */
  ortho?: boolean;
  orthoScale?: number;
}

export interface BoothModelPlan {
  units: "m";
  boothWidthM: number;
  boothDepthM: number;
  ceilingHeightM: number;
  measurementSystem: "imperial" | "metric";
  solids: BoothSolid[];
  materials: PlanMaterial[];
  cameras: PlanCamera[];
  lights: PlanLight[];
  /** Every camera and light aims here (booth centre, a third of the way up). */
  target: { x: number; y: number; z: number };
  /** Every collection path in creation order, parents before children. */
  collections: string[][];
  stats: { zones: number; features: number; hangingElements: number; solids: number };
}

// ─── Naming ───────────────────────────────────────────────────────────────

/** Blender-safe slug: alphanumerics + underscore, never empty, never huge. */
export function slugify(input: string, fallback = "Item"): string {
  const cleaned = (input ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : fallback;
}

function makeNamer() {
  const used = new Set<string>();
  return (candidate: string): string => {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    let i = 2;
    while (used.has(`${candidate}_${i}`)) i += 1;
    const name = `${candidate}_${i}`;
    used.add(name);
    return name;
  };
}

// ─── Footprint polygons (plan units in, plan units out) ───────────────────

function rectPoints(x: number, y: number, w: number, d: number): Vec2[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = CIRCLE_SEGMENTS,
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

function diamondPoints(x: number, y: number, w: number, d: number): Vec2[] {
  // Rhombus inscribed in the bounding box — edge midpoints, CCW.
  return [
    { x: x + w / 2, y },
    { x: x + w, y: y + d / 2 },
    { x: x + w / 2, y: y + d },
    { x, y: y + d / 2 },
  ];
}

/**
 * L-shape: the bounding box minus a notch at one corner. Corner names
 * follow the top-down canvas (SpatialCanvasTopDown), where screen-top is
 * the booth FRONT (y = 0):
 *   NE = max x / min y · NW = min x / min y · SE = max x / max y · SW = min x / max y
 */
function lPoints(zone: AbsoluteZone): Vec2[] {
  const { x, y, width: w, depth: d } = zone;
  const { corner, notchWidth: nw, notchDepth: nd } = resolveLNotch(zone);
  switch (corner) {
    case "NE":
      return [
        { x, y },
        { x: x + w - nw, y },
        { x: x + w - nw, y: y + nd },
        { x: x + w, y: y + nd },
        { x: x + w, y: y + d },
        { x, y: y + d },
      ];
    case "NW":
      return [
        { x: x + nw, y },
        { x: x + w, y },
        { x: x + w, y: y + d },
        { x, y: y + d },
        { x, y: y + nd },
        { x: x + nw, y: y + nd },
      ];
    case "SE":
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + d - nd },
        { x: x + w - nw, y: y + d - nd },
        { x: x + w - nw, y: y + d },
        { x, y: y + d },
      ];
    case "SW":
    default:
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + d },
        { x: x + nw, y: y + d },
        { x: x + nw, y: y + d - nd },
        { x, y: y + d - nd },
      ];
  }
}

/** Zone footprint in PLAN units, honouring `shape` (rect / L / circle / diamond). */
export function zoneFootprint(zone: AbsoluteZone): Vec2[] {
  switch (effectiveShape(zone)) {
    case "circle":
      return ellipsePoints(zone.x + zone.width / 2, zone.y + zone.depth / 2, zone.width / 2, zone.depth / 2);
    case "diamond":
      return diamondPoints(zone.x, zone.y, zone.width, zone.depth);
    case "L":
      return lPoints(zone);
    case "rect":
    default:
      return rectPoints(zone.x, zone.y, zone.width, zone.depth);
  }
}

/**
 * Feature footprint in PLAN units. Matches SpatialCanvasIso exactly:
 * rect is CORNER-anchored at (x, y); circle / ellipse are CENTRE-anchored
 * on the anchor; polygon and ribbon points are local offsets from it.
 */
export function featureFootprint(feature: BoothFeature): Vec2[] | null {
  const s = feature.shape;
  switch (s.kind) {
    case "rect":
      return rectPoints(feature.x, feature.y, s.width, s.depth);
    case "circle":
      return ellipsePoints(feature.x, feature.y, s.radius, s.radius);
    case "ellipse":
      return ellipsePoints(feature.x, feature.y, s.radiusX, s.radiusY);
    case "polygon":
      return s.points.length >= 3
        ? s.points.map((p) => ({ x: feature.x + p.x, y: feature.y + p.y }))
        : null;
    case "ribbon":
      return null; // handled segment-by-segment
    default:
      return null;
  }
}

// ─── Polygon helpers ──────────────────────────────────────────────────────

/** Twice the signed area. Positive = counter-clockwise in a +x/+y frame. */
export function signedArea2(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** Force counter-clockwise winding so top caps face +z everywhere. */
export function ensureCCW(points: Vec2[]): Vec2[] {
  return signedArea2(points) < 0 ? [...points].reverse() : points;
}

function boundingBox(points: Vec2[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Inset wall quad for one polygon edge. For a CCW polygon the interior is
 * to the LEFT of travel, so the wall grows inward from the edge.
 */
function wallQuad(a: Vec2, b: Vec2, thickness: number): Vec2[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const nx = (-dy / len) * thickness;
  const ny = (dx / len) * thickness;
  return [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }];
}

/** Square post footprint centred on a point. */
function postPoints(cx: number, cy: number, size: number): Vec2[] {
  const h = size / 2;
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ];
}

/** The four bounding-box corners of a footprint, inset so posts sit inside it. */
function cornerPosts(points: Vec2[], size: number): Vec2[] {
  const bb = boundingBox(points);
  const i = size / 2;
  return [
    { x: bb.minX + i, y: bb.minY + i },
    { x: bb.maxX - i, y: bb.minY + i },
    { x: bb.maxX - i, y: bb.maxY - i },
    { x: bb.minX + i, y: bb.maxY - i },
  ];
}

// ─── Plan builder ─────────────────────────────────────────────────────────

export interface BuildPlanOptions {
  /** Extra stills beyond the hero camera. Default true. */
  includePlanCamera?: boolean;
}

export function buildBoothModelPlan(
  geometry: BoothGeometry,
  options: BuildPlanOptions = {},
): BoothModelPlan {
  const system = geometry.measurementSystem;
  /** Plan-unit length → metres. */
  const u = (v: number) => round4(planToMetres(v, system));
  /** Feet → metres (all heights). */
  const h = (ft: number) => round4(feetToMetres(ft));
  const toM = (pts: Vec2[]): Vec2[] =>
    ensureCCW(pts).map((p) => ({ x: u(p.x), y: u(p.y) }));

  const boothWidthM = u(geometry.width);
  const boothDepthM = u(geometry.depth);
  const ceilingHeightM = h(geometry.ceilingHeightFt);

  const name = makeNamer();
  const solids: BoothSolid[] = [];
  const materials = new Map<string, PlanMaterial>();
  const collections: string[][] = [];
  const seenCollections = new Set<string>();

  const addCollection = (path: string[]) => {
    for (let i = 1; i <= path.length; i++) {
      const sub = path.slice(0, i);
      const key = sub.join("/");
      if (!seenCollections.has(key)) {
        seenCollections.add(key);
        collections.push(sub);
      }
    }
  };
  const addMaterial = (matName: string, colorHex: string): string => {
    if (!materials.has(matName)) materials.set(matName, { name: matName, colorHex });
    return matName;
  };
  const addSolid = (s: BoothSolid) => {
    if (s.points.length >= 3 && s.z1 - s.z0 > 1e-5) solids.push(s);
  };

  // Namespaced root so a re-run can delete exactly the previous build and
  // never touch a collection the user made themselves.
  const ROOT = "CANOPY_Booth";
  addCollection([ROOT, "Shell"]);

  addMaterial("Booth_Floor", COLOR_FLOOR);
  addMaterial("Structure", COLOR_STRUCTURE);

  // Catalog materials first, so their names win over generated ones.
  for (const entry of geometry.materialsCatalog ?? []) {
    addMaterial(`Mat_${slugify(entry.name, entry.id)}`, COLOR_CATALOG_MATERIAL);
  }
  const catalogMaterialName = (ids: string[] | undefined): string | null => {
    const catalog = geometry.materialsCatalog ?? [];
    for (const id of ids ?? []) {
      const entry = catalog.find((m) => m.id === id || m.name === id);
      if (entry) return `Mat_${slugify(entry.name, entry.id)}`;
    }
    return null;
  };

  // ── Shell: the carpet at the exact footprint ────────────────────────────
  addSolid({
    name: name("Booth_Floor"),
    collection: [ROOT, "Shell"],
    points: toM(rectPoints(0, 0, geometry.width, geometry.depth)),
    z0: -CARPET_THICKNESS_M,
    z1: 0,
    material: "Booth_Floor",
    role: "floor",
  });

  // ── Zones ───────────────────────────────────────────────────────────────
  const zones = geometry.zones ?? [];
  if (zones.length > 0) addCollection([ROOT, "Zones"]);

  for (const zone of zones) {
    const slug = slugify(zone.name, zone.id);
    const zoneCollection = [ROOT, "Zones", `Zone_${slug}`];
    addCollection(zoneCollection);

    const surfaceMaterial =
      catalogMaterialName(zone.materialIds) ??
      addMaterial(`Zone_${slug}`, zone.colorHex || COLOR_FEATURE_FALLBACK);

    const footprint = toM(zoneFootprint(zone));
    const topM = h(Math.max(zone.heightFt, 0.5));
    const form: StructuralForm = zone.structuralForm ?? "open";
    const base = `Zone_${slug}`;

    const addPad = () =>
      addSolid({
        name: name(`${base}_Pad`),
        collection: zoneCollection,
        points: footprint,
        z0: 0,
        z1: PAD_THICKNESS_M,
        material: surfaceMaterial,
        role: "pad",
        sourceId: zone.id,
      });

    const addUprights = (z1: number) => {
      cornerPosts(footprint, POST_SIZE_M).forEach((c, i) => {
        addSolid({
          name: name(`${base}_Upright_${i + 1}`),
          collection: zoneCollection,
          points: postPoints(c.x, c.y, POST_SIZE_M),
          z0: 0,
          z1,
          material: "Structure",
          role: "upright",
          sourceId: zone.id,
        });
      });
    };

    const addWalls = (skipAisleEdge: boolean) => {
      // The aisle-facing edge is the one whose midpoint sits closest to the
      // booth front (y = 0) — that's the side an alcove opens onto.
      let skipIndex = -1;
      if (skipAisleEdge) {
        let best = Infinity;
        for (let i = 0; i < footprint.length; i++) {
          const a = footprint[i];
          const b = footprint[(i + 1) % footprint.length];
          const midY = (a.y + b.y) / 2;
          if (midY < best) {
            best = midY;
            skipIndex = i;
          }
        }
      }
      for (let i = 0; i < footprint.length; i++) {
        if (i === skipIndex) continue;
        const quad = wallQuad(footprint[i], footprint[(i + 1) % footprint.length], WALL_THICKNESS_M);
        if (!quad) continue;
        addSolid({
          name: name(`${base}_Wall_${i + 1}`),
          collection: zoneCollection,
          points: ensureCCW(quad),
          z0: 0,
          z1: topM,
          material: surfaceMaterial,
          role: "wall",
          sourceId: zone.id,
        });
      }
    };

    switch (form) {
      case "enclosed":
        addPad();
        addWalls(false);
        addSolid({
          name: name(`${base}_Ceiling`),
          collection: zoneCollection,
          points: footprint,
          z0: topM - CEILING_THICKNESS_M,
          z1: topM,
          material: surfaceMaterial,
          role: "ceiling",
          sourceId: zone.id,
        });
        break;

      case "alcove":
        addPad();
        addWalls(true);
        break;

      case "canopy":
        addPad();
        addUprights(topM - CANOPY_THICKNESS_M);
        addSolid({
          name: name(`${base}_Canopy`),
          collection: zoneCollection,
          points: footprint,
          z0: topM - CANOPY_THICKNESS_M,
          z1: topM,
          material: surfaceMaterial,
          role: "canopy",
          sourceId: zone.id,
        });
        break;

      case "platform":
        addSolid({
          name: name(`${base}_Platform`),
          collection: zoneCollection,
          points: footprint,
          z0: 0,
          z1: h(Math.min(zone.heightFt, PLATFORM_RISE_FT)),
          material: surfaceMaterial,
          role: "platform",
          sourceId: zone.id,
        });
        break;

      case "tower":
        addSolid({
          name: name(`${base}_Tower`),
          collection: zoneCollection,
          points: footprint,
          z0: 0,
          z1: topM,
          material: surfaceMaterial,
          role: "solid",
          sourceId: zone.id,
        });
        break;

      case "open":
      default:
        addPad();
        addUprights(topM);
        break;
    }
  }

  // ── Features ────────────────────────────────────────────────────────────
  const features = geometry.features ?? [];
  if (features.length > 0) addCollection([ROOT, "Features"]);

  for (const feature of features) {
    const slug = slugify(feature.name, feature.id);
    const base = `Feature_${slug}`;
    const material =
      catalogMaterialName(feature.materialIds) ??
      addMaterial(base, feature.colorHex || COLOR_FEATURE_FALLBACK);
    const z0 = h(feature.baseHeightFt);
    const z1 = h(feature.topHeightFt);
    if (z1 <= z0) continue;

    // Multi-part features (ribbons, archways, canopies) get their own
    // sub-collection so the outliner stays navigable.
    const multiPart =
      feature.shape.kind === "ribbon" ||
      feature.formType === "archway" ||
      feature.formType === "canopy";
    const collection = multiPart ? [ROOT, "Features", base] : [ROOT, "Features"];
    if (multiPart) addCollection(collection);

    if (feature.shape.kind === "ribbon") {
      const path = feature.shape.path;
      const thickness = feature.shape.thickness;
      for (let i = 0; i < path.length - 1; i++) {
        const a = { x: feature.x + path[i].x, y: feature.y + path[i].y };
        const b = { x: feature.x + path[i + 1].x, y: feature.y + path[i + 1].y };
        const quad = wallQuad(
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
          thickness,
        );
        if (!quad) continue;
        // Centre the band on the path rather than offsetting to one side.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = ((dy / len) * thickness) / 2;
        const oy = ((-dx / len) * thickness) / 2;
        addSolid({
          name: name(`${base}_Seg_${String(i + 1).padStart(2, "0")}`),
          collection,
          points: toM(quad.map((p) => ({ x: p.x + ox, y: p.y + oy }))),
          z0,
          z1,
          material,
          role: "ribbon",
          sourceId: feature.id,
        });
      }
      continue;
    }

    const footprintPlan = featureFootprint(feature);
    if (!footprintPlan) continue;
    const footprint = toM(footprintPlan);
    const bb = boundingBox(footprint);

    switch (feature.formType) {
      case "canopy": {
        cornerPosts(footprint, POST_SIZE_M).forEach((c, i) => {
          addSolid({
            name: name(`${base}_Post_${i + 1}`),
            collection,
            points: postPoints(c.x, c.y, POST_SIZE_M),
            z0: 0,
            z1: z1 - CANOPY_THICKNESS_M,
            material: "Structure",
            role: "upright",
            sourceId: feature.id,
          });
        });
        addSolid({
          name: name(`${base}_Plane`),
          collection,
          points: footprint,
          z0: z1 - CANOPY_THICKNESS_M,
          z1,
          material,
          role: "canopy",
          sourceId: feature.id,
        });
        break;
      }

      case "archway": {
        const legWidth = Math.min(0.3, Math.max(0.12, (bb.maxX - bb.minX) * 0.12));
        const legDepth = Math.max(bb.maxY - bb.minY, legWidth);
        const lintelBottom = Math.max(z0, z1 - LINTEL_THICKNESS_M);
        [bb.minX + legWidth / 2, bb.maxX - legWidth / 2].forEach((cx, i) => {
          addSolid({
            name: name(`${base}_Leg_${i + 1}`),
            collection,
            points: rectPoints(cx - legWidth / 2, bb.minY, legWidth, legDepth),
            z0,
            z1: lintelBottom,
            material,
            role: "upright",
            sourceId: feature.id,
          });
        });
        addSolid({
          name: name(`${base}_Lintel`),
          collection,
          points: footprint,
          z0: lintelBottom,
          z1,
          material,
          role: "lintel",
          sourceId: feature.id,
        });
        break;
      }

      case "screen": {
        // A screen is a panel: keep the long axis, thin the short one.
        const w = bb.maxX - bb.minX;
        const d = bb.maxY - bb.minY;
        const points =
          d <= w
            ? rectPoints(bb.minX, (bb.minY + bb.maxY) / 2 - SCREEN_THICKNESS_M / 2, w, SCREEN_THICKNESS_M)
            : rectPoints((bb.minX + bb.maxX) / 2 - SCREEN_THICKNESS_M / 2, bb.minY, SCREEN_THICKNESS_M, d);
        addSolid({
          name: name(`${base}_Panel`),
          collection,
          points: ensureCCW(points),
          z0,
          z1,
          material,
          role: "screen",
          sourceId: feature.id,
        });
        break;
      }

      default:
        addSolid({
          name: name(base),
          collection,
          points: footprint,
          z0,
          z1,
          material,
          role: "solid",
          sourceId: feature.id,
        });
        break;
    }
  }

  // ── Hanging elements (CENTRE-anchored, suspended below the ceiling) ─────
  const hanging = geometry.hangingElements ?? [];
  if (hanging.length > 0) {
    addCollection([ROOT, "Hanging"]);
    addMaterial("Rigging", COLOR_HANGING);
  }

  for (const el of hanging) {
    const slug = slugify(el.name, el.id);
    const base = `Hanging_${slug}`;
    // Same vertical convention as SpatialCanvasIso: the element's BOTTOM
    // sits at (ceilingHeightFt - suspensionDropFt), clamped at the floor,
    // and it extends upward by its thickness.
    const bottomFt = Math.max(geometry.ceilingHeightFt - el.suspensionDropFt, 0);
    const z0 = h(bottomFt);
    const z1 = h(bottomFt + el.thicknessFt);
    // x / y are the CENTRE of the footprint — not the corner.
    const cx = el.x;
    const cy = el.y;

    if (el.shape === "ring") {
      const collection = [ROOT, "Hanging", base];
      addCollection(collection);
      const rxOuter = el.width / 2;
      const ryOuter = el.depth / 2;
      const rxInner = rxOuter * 0.7;
      const ryInner = ryOuter * 0.7;
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a0 = (2 * Math.PI * i) / RING_SEGMENTS;
        const a1 = (2 * Math.PI * (i + 1)) / RING_SEGMENTS;
        const quad: Vec2[] = [
          { x: cx + rxInner * Math.cos(a0), y: cy + ryInner * Math.sin(a0) },
          { x: cx + rxOuter * Math.cos(a0), y: cy + ryOuter * Math.sin(a0) },
          { x: cx + rxOuter * Math.cos(a1), y: cy + ryOuter * Math.sin(a1) },
          { x: cx + rxInner * Math.cos(a1), y: cy + ryInner * Math.sin(a1) },
        ];
        addSolid({
          name: name(`${base}_Seg_${String(i + 1).padStart(2, "0")}`),
          collection,
          points: toM(quad),
          z0,
          z1,
          material: "Rigging",
          role: "hanging",
          sourceId: el.id,
        });
      }
      continue;
    }

    const points =
      el.shape === "circle" || el.shape === "oval"
        ? ellipsePoints(cx, cy, el.width / 2, el.depth / 2)
        : rectPoints(cx - el.width / 2, cy - el.depth / 2, el.width, el.depth);

    addSolid({
      name: name(base),
      collection: [ROOT, "Hanging"],
      points: toM(points),
      z0,
      z1,
      material: "Rigging",
      role: "hanging",
      sourceId: el.id,
    });
  }

  // ── Rig: camera(s) + 3-point lights ────────────────────────────────────
  addCollection([ROOT, "Rig"]);
  const target = {
    x: round4(boothWidthM / 2),
    y: round4(boothDepthM / 2),
    z: round4(ceilingHeightM / 3),
  };
  const span = Math.max(boothWidthM, boothDepthM);

  const cameras: PlanCamera[] = [
    {
      name: "Camera_Hero",
      label: "Hero three-quarter",
      x: round4(boothWidthM / 2 + span * 0.95),
      y: round4(-span * 1.15),
      z: round4(Math.max(ceilingHeightM * 1.15, 2.4)),
      lens: 35,
    },
    {
      name: "Camera_Front",
      label: "Front elevation",
      x: round4(boothWidthM / 2),
      y: round4(-span * 1.35),
      z: round4(Math.max(ceilingHeightM * 0.55, 1.7)),
      lens: 50,
    },
  ];
  if (options.includePlanCamera !== false) {
    cameras.push({
      name: "Camera_Plan",
      label: "Plan (orthographic)",
      x: target.x,
      y: target.y,
      z: round4(Math.max(ceilingHeightM * 3, span * 1.6)),
      lens: 50,
      ortho: true,
      orthoScale: round4(span * 1.25),
    });
  }

  const lights: PlanLight[] = [
    {
      name: "Key_Light",
      x: round4(boothWidthM / 2 + span * 0.8),
      y: round4(-span * 0.7),
      z: round4(Math.max(ceilingHeightM * 1.6, 4)),
      energy: round4(Math.max(600, span * span * 12)),
      sizeM: round4(Math.max(span * 0.6, 2)),
    },
    {
      name: "Fill_Light",
      x: round4(boothWidthM / 2 - span * 0.8),
      y: round4(-span * 0.55),
      z: round4(Math.max(ceilingHeightM * 1.1, 3)),
      energy: round4(Math.max(240, span * span * 5)),
      sizeM: round4(Math.max(span * 0.8, 2.5)),
    },
    {
      name: "Rim_Light",
      x: round4(boothWidthM / 2),
      y: round4(boothDepthM + span * 0.7),
      z: round4(Math.max(ceilingHeightM * 1.7, 4.5)),
      energy: round4(Math.max(420, span * span * 8)),
      sizeM: round4(Math.max(span * 0.5, 2)),
    },
  ];

  return {
    units: "m",
    boothWidthM,
    boothDepthM,
    ceilingHeightM,
    measurementSystem: system,
    solids,
    materials: [...materials.values()],
    cameras,
    lights,
    target,
    collections,
    stats: {
      zones: zones.length,
      features: features.length,
      hangingElements: hanging.length,
      solids: solids.length,
    },
  };
}
