// src/lib/normalizedBrief.ts
//
// Single source of truth for all brief, geometry, and design data used
// downstream by the prompt composer. The normalizer projects loose
// parsedBrief + spatialData + elements into this canonical shape; the
// validator surfaces gaps + failures; the composer reads it and emits
// the 5 output stages (briefJson, geometrySummary, renderer, negative,
// compliance).
//
// Spec: docs/superpowers/specs/2026-05-14-prompt-engine-refactor-design.md
// Plan: docs/superpowers/plans/2026-05-14-prompt-engine-refactor.md

export type ProjectType =
  | "exhibition_booth"
  | "brand_activation"
  | "permanent_interior"
  | "retail_environment"
  | "architectural_installation";

export interface NormalizedBriefProject {
  id: string;
  name: string;
  type: ProjectType;
}

export interface NormalizedBriefBrandColor {
  name: string;
  hex?: string;
  role: "primary" | "secondary" | "accent";
}

export interface NormalizedBriefBrand {
  name: string;
  descriptor?: string;
  colors: NormalizedBriefBrandColor[];
  voice?: string;
  industry?: string;
}

export interface NormalizedBriefGeometry {
  width: number;
  depth: number;
  area: number;
  height: number;
  units: "metric" | "imperial";
  openSides: 1 | 2 | 3 | 4;
  humanScale: number;
  maxObjectSizePctOfFootprint: number;
  minCirculationWidth: number;
}

export interface NormalizedBriefZone {
  id: string;
  purpose: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height?: number;
  visibilityPriority: 1 | 2 | 3;
  structuralForm?: "open" | "enclosed" | "canopy" | "alcove" | "platform" | "tower";
  materialIds?: string[];
}

export interface NormalizedBriefMaterial {
  id: string;
  name: string;
  feel: string;
  finish?: string;
}

export interface NormalizedBriefHero {
  name: string;
  physicalForm: string;
  dimensions?: { width: number; height: number; depth: number };
  materials: string[];
  placementZoneId: string;
}

export interface NormalizedBriefSignageRequirement {
  content: string;
  type: "wordmark" | "descriptor" | "tagline";
  visibilityRequirement: "all_sides" | "front_and_back" | "front_only";
}

export interface NormalizedBriefSignage {
  required: NormalizedBriefSignageRequirement[];
}

export interface NormalizedBriefCreative {
  visualLanguage: string[];
  referenceLabels: string[];
  embrace: string[];
  avoid: string[];
  forbiddenItems: string[];
  designIntent: string;
}

export interface NormalizedBriefVenue {
  name: string;
  type:
    | "convention_center"
    | "arena"
    | "outdoor_plaza"
    | "retail_space"
    | "flagship_storefront"
    | "gallery";
  ambientLight:
    | "bright_daylit"
    | "controlled_indoor"
    | "dim_theatrical"
    | "outdoor_daylight"
    | "mixed";
  ceilingType?: string;
}

export interface NormalizedBriefShow {
  name: string;
  duration: "single_day" | "multi_day" | "permanent";
  neighborhood?: string;
}

export interface NormalizedBriefStaffing {
  count: number;
  roles: string[];
  attire: "business" | "business_casual" | "casual" | "branded";
}

export interface NormalizedBriefContext {
  audience: string[];
  venue: NormalizedBriefVenue;
  show?: NormalizedBriefShow;
  goals: string[];
  budgetTier: "standard" | "premium" | "ultra";
  timeOfDay: "morning" | "midday" | "evening" | "controlled";
  staffing: NormalizedBriefStaffing;
  interactiveTech: string[];
  sustainability?: string[];
}

export interface NormalizedBriefCamera {
  angle:
    | "hero_34"
    | "front"
    | "side_left"
    | "side_right"
    | "back"
    | "top"
    | "interior"
    | "detail";
  eyeLevel: number;
  framing: "wide" | "medium" | "detail";
}

export type HardConstraint =
  | { id: "footprint_match"; status: "pass" | "fail" | "unknown"; message?: string }
  | { id: "open_sides_clear"; status: "pass" | "fail" | "unknown" }
  | { id: "signage_present"; status: "pass" | "fail" | "unknown" }
  | { id: "descriptor_present"; status: "pass" | "fail" | "unknown" }
  | { id: "hero_scale_ok"; status: "pass" | "fail" | "unknown"; actualPct?: number }
  | { id: "forbidden_items_absent"; status: "pass" | "fail" | "unknown" }
  | { id: "hanging_elements_aloft"; status: "pass" | "fail" | "unknown"; message?: string };

export interface NormalizedBriefCompliance {
  hardConstraints: HardConstraint[];
}

/**
 * Single source of truth for the five hanging-element shape names.
 * Used both as a type-level union (HangingShape) and as a runtime
 * guard in normalizeHangingElement — keeping the list in one place
 * means future shape additions only need to touch one literal.
 */
const HANGING_SHAPES = ["rect", "circle", "oval", "ring", "custom"] as const;
export type HangingShape = (typeof HANGING_SHAPES)[number];

export interface NormalizedHangingElement {
  /** Stable identifier; used for canvas drag-edit and prompt anchoring. */
  id: string;
  /** Short label, e.g. "Primary identity ring". */
  name: string;
  /**
   * 1-2 sentence sculptural description. Same role as
   * NormalizedBriefHero.physicalForm — drives the model's mental
   * image of the form.
   */
  physicalForm: string;
  /**
   * Top-down outline shape. `ring` is a top-level enum (not "custom")
   * because it's the dominant hanging form and benefits from explicit
   * geometry.
   */
  shape: HangingShape;
  /**
   * Top-down dimensions. `width` and `depth` are in the same units
   * as NormalizedBriefGeometry. `thicknessFt` is the element's own
   * vertical thickness (flat banner ≈ 0.1ft, ring/truss ≈ 1-3ft).
   */
  dimensions: { width: number; depth: number; thicknessFt: number };
  /**
   * Distance from venue ceiling DOWN to the bottom of the element,
   * in feet. The element's bottom face sits at
   * (ceilingHeightFt - suspensionDropFt) from the floor.
   */
  suspensionDropFt: number;
  /**
   * Top-down center position in booth-local coords (same space as
   * NormalizedBriefZone.x/y — feet/meters from booth front-left).
   */
  position: { x: number; y: number };
  /** Materials list, e.g. ["brushed aluminum", "tensioned white fabric"]. */
  materials: string[];
  /**
   * Surface descriptions per face, e.g. ["front face: white LED
   * wordmark", "underside: matte black", "back: brushed aluminum"].
   * Free-form strings.
   */
  surfaces: string[];
  /**
   * Lighting attributes, e.g. ["edge-lit perimeter glow",
   * "internally backlit", "downcast 4000K wash on booth"].
   */
  lighting: string[];
  /**
   * Printed graphics, e.g. ["front: brand logotype", "back: hashtag"].
   * Separate from `surfaces` because printed content must be rendered
   * accurately by the image model.
   */
  printed: string[];
}

export interface NormalizedBriefHanging {
  elements: NormalizedHangingElement[];
}

// Use `interface` (not `type X = Y`) to match every other NormalizedBrief*
// shape in this module — keeps the cross-cutting "find all normalized
// shapes" pattern intact. Currently a structural pass-through; Task 6
// will add normalized-only fields (rasterized mask URL, photo aspect
// ratio) inside the braces.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NormalizedBriefExistingSpace extends ParsedBriefExistingSpace {}

export interface NormalizedBrief {
  project: NormalizedBriefProject;
  brand: NormalizedBriefBrand;
  geometry: NormalizedBriefGeometry;
  zones: NormalizedBriefZone[];
  materials: NormalizedBriefMaterial[];
  hero: NormalizedBriefHero;
  signage: NormalizedBriefSignage;
  hanging: NormalizedBriefHanging;
  /**
   * Optional existing-space block for interior-design projects.
   * Presence/absence is semantically meaningful: presence means
   * "this is an existing-space project (photo + annotations)";
   * absence means "this is a spatial-canvas project". The normalizer
   * intentionally does not fabricate an empty default — see
   * safeBrief() for the why.
   */
  existingSpace?: NormalizedBriefExistingSpace;
  creative: NormalizedBriefCreative;
  context: NormalizedBriefContext;
  camera: NormalizedBriefCamera;
  compliance: NormalizedBriefCompliance;
  /**
   * UI-state passthrough — the set of gap field paths the user has
   * explicitly dismissed (clicked the "No / not applicable" option
   * on). Validator consults this to suppress helpful gaps that would
   * otherwise re-fire because their "filled" state and "initial"
   * state look identical (e.g. hanging.elements with length 0 means
   * both "we haven't asked yet" AND "user said no"). Underscored to
   * mark it as out-of-band metadata, not part of the canonical
   * brief shape used by the composer.
   */
  _dismissedGaps?: string[];
}

// ─────────────────────────────────────────────────────────────────────
// normalizeBrief — deterministic projection from parsedBrief + geometry
// + elements into the canonical NormalizedBrief shape.
// ─────────────────────────────────────────────────────────────────────

import type { ParsedBrief, ParsedBriefExistingSpace, Polygon } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

interface NormalizeBriefInput {
  project: { id: string; name: string; projectType: ProjectType | string };
  parsedBrief: ParsedBrief;
  geometry: BoothGeometry;
  elements: { interactiveMechanics?: { data?: { hero?: any } } } | null | undefined;
}

/**
 * Fill a possibly-partial ParsedBrief with empty defaults for every
 * required field. Defense-in-depth — the rest of the normalizer can
 * then access nested fields without worrying that an older schema
 * version, a corrupted DB row, or a half-finished parse left a hole.
 *
 * Without this guard, accessing e.g. `parsedBrief.brand.visualIdentity
 * .colors` throws a TypeError when `visualIdentity` is undefined,
 * which propagates up to React, trips the app-level error boundary,
 * and looks to users like the app crashed.
 *
 * Returns a NEW object; never mutates the input.
 */
function safeBrief(brief: Partial<ParsedBrief> | null | undefined): ParsedBrief {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = brief ?? {};
  return {
    brand: {
      name: b.brand?.name ?? "",
      category: b.brand?.category ?? "",
      pov: b.brand?.pov ?? "",
      personality: Array.isArray(b.brand?.personality) ? b.brand.personality : [],
      competitors: Array.isArray(b.brand?.competitors) ? b.brand.competitors : [],
      visualIdentity: {
        colors: Array.isArray(b.brand?.visualIdentity?.colors)
          ? b.brand.visualIdentity.colors
          : [],
        avoidColors: Array.isArray(b.brand?.visualIdentity?.avoidColors)
          ? b.brand.visualIdentity.avoidColors
          : [],
        avoidImagery: Array.isArray(b.brand?.visualIdentity?.avoidImagery)
          ? b.brand.visualIdentity.avoidImagery
          : [],
      },
      tagline: b.brand?.tagline,
    },
    objectives: {
      primary: b.objectives?.primary ?? "",
      secondary: Array.isArray(b.objectives?.secondary) ? b.objectives.secondary : [],
      competitiveContext: b.objectives?.competitiveContext ?? "",
      differentiationGoals: Array.isArray(b.objectives?.differentiationGoals)
        ? b.objectives.differentiationGoals
        : [],
    },
    events: {
      shows: Array.isArray(b.events?.shows) ? b.events.shows : [],
      primaryShow: b.events?.primaryShow,
    },
    spatial: {
      footprints: Array.isArray(b.spatial?.footprints) ? b.spatial.footprints : [],
      modular: b.spatial?.modular ?? false,
      reuseRequirement: b.spatial?.reuseRequirement ?? "",
      trafficRequirements: b.spatial?.trafficRequirements ?? "",
      boothType: b.spatial?.boothType,
      openSides: b.spatial?.openSides,
    },
    audiences: Array.isArray(b.audiences) ? b.audiences : [],
    creative: {
      avoid: Array.isArray(b.creative?.avoid) ? b.creative.avoid : [],
      embrace: Array.isArray(b.creative?.embrace) ? b.creative.embrace : [],
      coreStrategy: b.creative?.coreStrategy ?? "",
      thinkingFramework: Array.isArray(b.creative?.thinkingFramework)
        ? b.creative.thinkingFramework
        : [],
      designPhilosophy: b.creative?.designPhilosophy ?? "",
      visualLanguage: Array.isArray(b.creative?.visualLanguage) ? b.creative.visualLanguage : [],
      referenceLabels: Array.isArray(b.creative?.referenceLabels)
        ? b.creative.referenceLabels
        : [],
    },
    experience: {
      hero: {
        required: b.experience?.hero?.required ?? false,
        description: b.experience?.hero?.description ?? "",
        attributes: Array.isArray(b.experience?.hero?.attributes)
          ? b.experience.hero.attributes
          : [],
      },
      storytelling: {
        required: b.experience?.storytelling?.required ?? false,
        description: b.experience?.storytelling?.description ?? "",
        audienceAdaptation: b.experience?.storytelling?.audienceAdaptation ?? false,
      },
      humanConnection: {
        required: b.experience?.humanConnection?.required ?? false,
        capacity: b.experience?.humanConnection?.capacity ?? "",
        integrationRequirement: b.experience?.humanConnection?.integrationRequirement ?? "",
      },
      adjacentActivations: {
        required: b.experience?.adjacentActivations?.required ?? false,
        count: b.experience?.adjacentActivations?.count ?? "",
        criteria: Array.isArray(b.experience?.adjacentActivations?.criteria)
          ? b.experience.adjacentActivations.criteria
          : [],
      },
    },
    budget: {
      perShow: b.budget?.perShow,
      range: b.budget?.range,
      inclusions: Array.isArray(b.budget?.inclusions) ? b.budget.inclusions : [],
      exclusions: Array.isArray(b.budget?.exclusions) ? b.budget.exclusions : [],
      efficiencyNotes: b.budget?.efficiencyNotes ?? "",
    },
    requiredDeliverables: Array.isArray(b.requiredDeliverables) ? b.requiredDeliverables : [],
    winningCriteria: Array.isArray(b.winningCriteria) ? b.winningCriteria : [],
    // hangingElements is on the ParsedBrief type now, but legacy DB
    // rows + the parser's free-form JSON output may omit it. Default
    // to [] so any caller that accesses safeBrief(...).hangingElements
    // never has to null-check.
    hangingElements: Array.isArray(b.hangingElements)
      ? (b.hangingElements as ParsedHangingElement[])
      : [],
    // existingSpace is INTENTIONALLY not defaulted — its presence/
    // absence has semantic meaning (existing-space vs spatial-canvas
    // project). An empty-shell default would erase that distinction.
    // Preserve when present, leave undefined when absent.
    existingSpace: b.existingSpace as ParsedBriefExistingSpace | undefined,
    // _dismissedGaps is the sentinel set used to suppress helpful
    // gaps when the user has already answered "No" / dismissed the
    // prompt. Without this, gaps whose "filled" state is identical
    // to their "initial" state (e.g. hanging.elements with length 0
    // meaning both "we haven't asked yet" AND "the user said no")
    // would re-fire on every validation pass. Carrying it through
    // safeBrief means the validator can read it safely on any
    // partial/legacy brief.
    _dismissedGaps: Array.isArray(b._dismissedGaps)
      ? (b._dismissedGaps as string[])
      : [],
  };
}

const HERO_KEYWORDS = [
  "hero",
  "experience",
  "apex",
  "digital",
  "core",
  "central",
  "architectural",
  "sculptural",
  "hearth",
];
const LOUNGE_KEYWORDS = ["lounge", "hub", "casual", "connection", "retreat", "sanctuary", "sofa"];
const MEETING_KEYWORDS = ["suite", "meeting", "consultation", "private", "study"];
const RECEPTION_KEYWORDS = ["reception", "welcome", "entry"];
const DEMO_KEYWORDS = ["demo", "product", "workshop", "hands.?on"];
const MERCH_KEYWORDS = ["merch", "storefront", "retail", "store"];
const NARRATIVE_KEYWORDS = ["brand.?narrative", "storytelling", "future", "vision", "story"];
const SERVICE_KEYWORDS = ["command", "storage", "service", "back.?of.?house", "utility"];
const MEDIA_KEYWORDS = ["screen", "media", "theater", "theatre"];

/**
 * Map a zone's id + name to a functional purpose descriptor. Poetic
 * names like "The Sanctuary" never reach the image model — only the
 * function ("lounge / informal seating area") does. Why: image models
 * read proper-noun zone names as labels to render on the booth
 * fascia (the wayfinding-sign hallucination).
 */
export function zoneNameToPurpose(zone: { id?: string; name?: string }): string {
  const blob = `${zone.id ?? ""} ${zone.name ?? ""}`.toLowerCase();
  if (HERO_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "hero focal area";
  if (LOUNGE_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "lounge / informal seating area";
  if (MEETING_KEYWORDS.some((k) => new RegExp(k).test(blob)))
    return "private meeting / consultation area";
  if (RECEPTION_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "welcome / entry point";
  if (DEMO_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "product demo / hands-on station";
  if (MERCH_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "merchandise display area";
  if (NARRATIVE_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "brand narrative / media wall";
  if (SERVICE_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "back-of-house / service area";
  if (MEDIA_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "large-screen media area";
  return "supporting area";
}

function projectTypeOrDefault(raw: string | ProjectType): ProjectType {
  const valid: ProjectType[] = [
    "exhibition_booth",
    "brand_activation",
    "permanent_interior",
    "retail_environment",
    "architectural_installation",
  ];
  if (valid.includes(raw as ProjectType)) return raw as ProjectType;
  // Backward-compat map from legacy values.
  const legacyMap: Record<string, ProjectType> = {
    trade_show_booth: "exhibition_booth",
    live_brand_activation: "brand_activation",
    permanent_installation: "permanent_interior",
    architectural_brief: "architectural_installation",
    film_premiere: "brand_activation",
    game_release_activation: "brand_activation",
  };
  return legacyMap[raw as string] ?? "exhibition_booth";
}

function inferBudgetTier(parsed: ParsedBrief, area: number): "standard" | "premium" | "ultra" {
  const perShow = parsed.budget?.perShow;
  const budget = perShow || (parsed.budget?.range?.max ?? 0);
  if (budget <= 0) return "premium";
  // area is in sqm for metric, sq ft for imperial — convert sqm to sqft
  // for the cost calc since budget is in $ and we want $/sqft as the heuristic.
  // The fixtures use sqft for imperial geometries already; we approximate by
  // using a coarse 10.7639 factor when needed. For composition we keep area
  // in native units.
  const sqftEquivalent = parsed.budget && area < 200 ? area * 10.7639 : area;
  const costPerSqft = budget / Math.max(sqftEquivalent, 1);
  if (costPerSqft >= 400) return "ultra";
  if (costPerSqft >= 250) return "premium";
  return "standard";
}

/**
 * Strip a trailing "(#hex)" suffix from a color name string. The
 * clarification UI writes hex codes in this format ("orange
 * (#E67E22)") because parsedBrief.brand.visualIdentity.colors is a
 * string[] without a dedicated hex slot. The normalizer parses the
 * hex back out into NormalizedBriefBrandColor.hex; this helper
 * returns just the readable name without the parenthesized hex.
 */
function stripHexSuffix(name: string): string {
  return name.replace(/\s*\(#[0-9a-fA-F]{3,8}\)\s*$/, "").trim();
}

function visibilityFromPosition(
  z: { x: number; y: number; depth: number },
  depth: number,
): 1 | 2 | 3 {
  const centerY = z.y + z.depth / 2;
  const ratio = centerY / depth;
  if (ratio < 0.4) return 1;
  if (ratio < 0.7) return 2;
  return 3;
}

/**
 * Shape of a single hanging element as it arrives from the parse-brief
 * edge function. Free-text dimensions and positional hints; numeric
 * coercion happens in normalizeHangingElement.
 *
 * `id` is optional on the parsed input: when the loose ParsedBrief
 * already carries an id (e.g. an element created via the Brief Review
 * "Add" button or seeded via applyGapAnswer), the normalizer
 * preserves it. When the field is absent, the normalizer generates a
 * fresh uuid. See `normalizeHangingElement` for the preservation
 * contract.
 */
export interface ParsedHangingElement {
  id?: string;
  name?: string;
  physicalForm?: string;
  shape?: string;
  estimatedDimensions?: string;
  suspensionHint?: string;
  materials?: string[];
  surfaces?: string[];
  lighting?: string[];
  printed?: string[];
}

/**
 * Convert a parsed-brief hanging entry into a NormalizedHangingElement.
 * Parser gives us free-text dimensions and positional hints; this is
 * where we coerce to numeric coordinates with sensible defaults.
 *
 * ID contract: the normalizer **preserves** `raw.id` when it's a
 * non-empty string and **generates** a fresh `crypto.randomUUID()`
 * when missing. This is what canvas drag-edit and prompt anchoring
 * rely on — once an id is assigned (by the Add button on the Brief
 * Review card, by SpatialPlanner.addHangingElement, or by
 * applyGapAnswer's "Yes" seed), it stays stable across every
 * subsequent normalize call.
 *
 * Earlier versions used index-based ids (`hang_${idx}`). That was
 * deterministic on the same input array, but on delete-then-add it
 * could hand a newly-added element the same id as a previously-deleted
 * one — colliding React keys downstream. UUIDs make every creation
 * site collision-free; preservation keeps the stability property the
 * canvas needs.
 *
 * Note: `raw.estimatedDimensions` and `raw.suspensionHint` are
 * intentionally ignored at this stage — the v1 normalizer uses pure
 * geometric defaults so downstream tasks can reason about a stable
 * shape. Free-text interpretation is a future task; the parser
 * captures the strings so we don't lose data, but they don't
 * influence the numeric output here.
 *
 * Defaults when fields are missing:
 *   - shape: "ring" (most common authored form)
 *   - position: booth center
 *   - dimensions: width = 1/3 of booth width, depth = same, thickness 1ft
 *   - suspensionDropFt: 3 (typical clearance for visibility from across hall)
 */
function normalizeHangingElement(
  raw: ParsedHangingElement,
  geometry: BoothGeometry,
  idx: number,
): NormalizedHangingElement {
  // Preserve incoming id when present; generate a uuid otherwise. The
  // `idx` parameter is retained only for the default human-readable
  // name ("Hanging element N") — it no longer drives the id.
  const id =
    typeof raw.id === "string" && raw.id.trim().length > 0
      ? raw.id
      : crypto.randomUUID();
  const defaultDim = geometry.width / 3;
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : `Hanging element ${idx + 1}`,
    physicalForm: typeof raw.physicalForm === "string" ? raw.physicalForm.trim() : "",
    shape: (HANGING_SHAPES as readonly string[]).includes(raw.shape as string)
      ? (raw.shape as HangingShape)
      : "ring",
    dimensions: {
      width: defaultDim,
      depth: defaultDim,
      thicknessFt: 1,
    },
    suspensionDropFt: 3,
    position: { x: geometry.width / 2, y: geometry.depth / 2 },
    materials: Array.isArray(raw.materials) ? raw.materials.map(String) : [],
    surfaces: Array.isArray(raw.surfaces) ? raw.surfaces.map(String) : [],
    lighting: Array.isArray(raw.lighting) ? raw.lighting.map(String) : [],
    printed: Array.isArray(raw.printed) ? raw.printed.map(String) : [],
  };
}

/**
 * Close a polygon's point list if the last point isn't equal to the
 * first. Downstream consumers (mask rasterization, SVG <polygon>)
 * either tolerate open paths or silently misbehave; explicit closure
 * removes the ambiguity.
 */
function closePolygon(poly: Polygon): Polygon {
  if (poly.points.length === 0) return poly;
  const first = poly.points[0];
  const last = poly.points[poly.points.length - 1];
  if (first.x === last.x && first.y === last.y) return poly;
  return { ...poly, points: [...poly.points, { ...first }] };
}

/**
 * Convert a parsed-brief existingSpace block to the normalized shape.
 * Currently mostly pass-through, but with two real normalizations:
 *   1. Auto-close any open polygons.
 *   2. Defensive array/object defaults so a sparse parsed block
 *      doesn't produce undefined downstream.
 */
function normalizeExistingSpace(
  raw: ParsedBriefExistingSpace,
): NormalizedBriefExistingSpace {
  return {
    photoUrl: raw.photoUrl,
    annotations: {
      keep: Array.isArray(raw.annotations?.keep) ? raw.annotations.keep.map(closePolygon) : [],
      change: Array.isArray(raw.annotations?.change) ? raw.annotations.change.map(closePolygon) : [],
    },
    analysis: {
      estimatedDimensions: raw.analysis?.estimatedDimensions,
      features: Array.isArray(raw.analysis?.features) ? raw.analysis.features.map(String) : [],
      existingMaterials: raw.analysis?.existingMaterials ?? {},
      lighting: raw.analysis?.lighting ?? {},
      summary: raw.analysis?.summary,
    },
  };
}

export function normalizeBrief(input: NormalizeBriefInput): NormalizedBrief {
  const { project, geometry, elements } = input;
  // Apply defense-in-depth defaults so partial / legacy / corrupted
  // briefs don't crash downstream field access. The validator surfaces
  // the missing data as gaps for the clarification UI to ask about.
  const parsedBrief = safeBrief(input.parsedBrief);

  const area = geometry.width * geometry.depth;

  // Parse colors from parsedBrief. Each entry can carry an embedded
  // hex code in the form "orange (#E67E22)" — written by the
  // clarification UI's hex gap. We split that out into the c.hex
  // field so the validator's "missing hex" gap can detect resolution.
  const colors: NormalizedBriefBrandColor[] = (parsedBrief.brand.visualIdentity.colors ?? [])
    .filter((c) => typeof c === "string" && c.trim().length > 0)
    .map((c, i) => {
      const hexMatch = c.match(/\(#([0-9a-fA-F]{3,8})\)/);
      const name = stripHexSuffix(c);
      return {
        name,
        hex: hexMatch ? `#${hexMatch[1]}` : undefined,
        role: (i === 0 ? "primary" : i === 1 ? "secondary" : "accent") as
          | "primary"
          | "secondary"
          | "accent",
      };
    });

  const zones: NormalizedBriefZone[] = geometry.zones.map((z) => ({
    id: z.id,
    purpose: zoneNameToPurpose({ id: z.id, name: z.name }),
    x: z.x,
    y: z.y,
    width: z.width,
    depth: z.depth,
    height: z.heightFt,
    visibilityPriority: visibilityFromPosition(z, geometry.depth),
    structuralForm: z.structuralForm,
    materialIds: z.materialIds,
  }));

  const materials: NormalizedBriefMaterial[] = (geometry.materialsCatalog ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    feel: m.description ?? "",
  }));

  const heroFromElements = elements?.interactiveMechanics?.data?.hero;
  const heroZone = zones.find((z) => z.purpose === "hero focal area");
  // Hero physicalForm precedence:
  //   1. The authored interactiveMechanics element (rich physical form
  //      from the element generation step)
  //   2. parsedBrief.experience.hero.description (where the
  //      BriefClarification UI writes the user's answer when they
  //      describe the hero's form before element generation)
  // This dual-source pattern lets the gap-clarification answer actually
  // resolve the validator's gap, instead of getting stuck in an
  // infinite-save state where the user types but the gap persists
  // because the write target doesn't feed the read target.
  const heroPhysicalFormFromElements = heroFromElements?.physicalForm?.structure ?? "";
  const heroPhysicalFormFromBrief = parsedBrief.experience.hero.description ?? "";
  const hero: NormalizedBriefHero = {
    name: heroFromElements?.name ?? "Hero installation",
    physicalForm:
      heroPhysicalFormFromElements.trim().length > 0
        ? heroPhysicalFormFromElements
        : heroPhysicalFormFromBrief,
    materials: heroFromElements?.physicalForm?.materials ?? [],
    placementZoneId: heroZone?.id ?? zones[0]?.id ?? "",
  };

  const signageRequired: NormalizedBriefSignageRequirement[] = [
    {
      content: parsedBrief.brand.name,
      type: "wordmark",
      visibilityRequirement:
        geometry.zones.length > 0 && (parsedBrief.spatial.openSides ?? 1) >= 3
          ? "all_sides"
          : "front_and_back",
    },
  ];
  if (parsedBrief.brand.tagline && parsedBrief.brand.tagline.trim().length > 0) {
    signageRequired.push({
      content: parsedBrief.brand.tagline,
      type: "descriptor",
      visibilityRequirement: "front_only",
    });
  }

  const venue: NormalizedBriefVenue = {
    name: parsedBrief.events.shows[0]?.location ?? "",
    type: "convention_center",
    ambientLight: "controlled_indoor",
  };

  const show: NormalizedBriefShow | undefined = parsedBrief.events.primaryShow
    ? {
        name: parsedBrief.events.primaryShow,
        duration: "multi_day",
      }
    : undefined;

  // Read from the post-safeBrief() parsedBrief — safeBrief() already
  // guarantees `hangingElements: []` when the upstream brief omitted
  // the field, so null-handling lives in one place (safeBrief) and
  // not at every call site. The inline Array.isArray check below is
  // belt-and-suspenders against a corrupted shape (e.g. a string
  // somehow landing in the field).
  const rawHanging = parsedBrief.hangingElements;
  const hangingElements: NormalizedHangingElement[] = Array.isArray(rawHanging)
    ? rawHanging.map((raw, idx) => normalizeHangingElement(raw, geometry, idx))
    : [];

  // Assemble hard-constraint defaults emitted at normalize-time.
  // Most constraints are derived inside validateBrief from the
  // composed brief, but hanging_elements_aloft is purely structural:
  // it only matters when hanging elements exist, and there's no
  // automated verifier yet — status is "unknown" until a future
  // post-render CV pass evaluates it.
  const hardConstraints: HardConstraint[] = [];
  if (hangingElements.length > 0) {
    hardConstraints.push({
      id: "hanging_elements_aloft",
      status: "unknown",
      message:
        "Hanging elements must appear clearly above and visually detached from the booth structure.",
    });
  }

  // _dismissedGaps round-trip: same belt-and-suspenders shape check as
  // hangingElements above. safeBrief already guarantees the field is
  // an array, but defending against a corrupted shape costs nothing.
  const rawDismissed = parsedBrief._dismissedGaps;
  const dismissedGaps: string[] = Array.isArray(rawDismissed)
    ? rawDismissed.filter((v): v is string => typeof v === "string")
    : [];

  // existingSpace is INTENTIONALLY left undefined when absent.
  // Presence on the normalized brief signals "this is an existing-space
  // (interior-design) project"; absence signals "this is a spatial-
  // canvas project". An empty-shell default would erase that
  // distinction and force every downstream consumer to disambiguate
  // by sniffing nested fields.
  const existingSpace: NormalizedBriefExistingSpace | undefined =
    parsedBrief.existingSpace && typeof parsedBrief.existingSpace.photoUrl === "string"
      ? normalizeExistingSpace(parsedBrief.existingSpace)
      : undefined;

  return {
    project: {
      id: project.id,
      name: project.name,
      type: projectTypeOrDefault(project.projectType),
    },
    brand: {
      name: parsedBrief.brand.name,
      descriptor: parsedBrief.brand.tagline,
      colors,
      voice: parsedBrief.brand.pov,
      industry: parsedBrief.brand.category,
    },
    geometry: {
      width: geometry.width,
      depth: geometry.depth,
      area,
      height:
        geometry.measurementSystem === "metric"
          ? geometry.ceilingHeightFt * 0.3048
          : geometry.ceilingHeightFt,
      units: geometry.measurementSystem,
      openSides: (parsedBrief.spatial.openSides ?? 4) as 1 | 2 | 3 | 4,
      humanScale: geometry.measurementSystem === "metric" ? 1.7 : 5.58,
      maxObjectSizePctOfFootprint: 0.30,
      minCirculationWidth: geometry.measurementSystem === "metric" ? 0.9 : 3,
    },
    zones,
    materials,
    hero,
    signage: { required: signageRequired },
    hanging: { elements: hangingElements },
    existingSpace,
    creative: {
      visualLanguage: parsedBrief.creative.visualLanguage ?? [],
      referenceLabels: parsedBrief.creative.referenceLabels ?? [],
      embrace: parsedBrief.creative.embrace ?? [],
      avoid: parsedBrief.creative.avoid ?? [],
      forbiddenItems: parsedBrief.creative.avoid ?? [],
      designIntent: (parsedBrief.creative.designPhilosophy ?? "").slice(0, 300),
    },
    context: {
      audience: parsedBrief.audiences.map((a) => a.name),
      venue,
      show,
      goals: [parsedBrief.objectives.primary, ...parsedBrief.objectives.secondary].filter(Boolean),
      budgetTier: inferBudgetTier(parsedBrief, area),
      timeOfDay: "controlled",
      staffing: { count: 4, roles: ["sales", "engineer"], attire: "business" },
      interactiveTech: [],
    },
    camera: {
      angle: "hero_34",
      eyeLevel: geometry.measurementSystem === "metric" ? 1.7 : 5.58,
      framing: "wide",
    },
    compliance: { hardConstraints },
    _dismissedGaps: dismissedGaps,
  };
}

// ─────────────────────────────────────────────────────────────────────
// validateBrief — surfaces hard-constraint failures + clarification gaps
// ─────────────────────────────────────────────────────────────────────

export interface Gap {
  field: string;
  severity: "blocking" | "helpful";
  question: string;
  options?: string[];
  fallback: unknown;
  source: "schema" | "ai";
}

export interface ValidationResult {
  failures: HardConstraint[];
  gaps: Gap[];
}

export function validateBrief(normalized: NormalizedBrief): ValidationResult {
  const failures: HardConstraint[] = [];
  const gaps: Gap[] = [];

  // ── Hard constraints ──

  // footprint_match
  const expectedArea = normalized.geometry.width * normalized.geometry.depth;
  failures.push({
    id: "footprint_match",
    status: Math.abs(expectedArea - normalized.geometry.area) < 0.01 ? "pass" : "fail",
    message:
      Math.abs(expectedArea - normalized.geometry.area) < 0.01
        ? undefined
        : `Geometry area ${normalized.geometry.area} doesn't match width × depth (${expectedArea}).`,
  });

  // open_sides_clear
  failures.push({
    id: "open_sides_clear",
    status:
      normalized.geometry.openSides >= 1 && normalized.geometry.openSides <= 4 ? "pass" : "fail",
  });

  // signage_present
  const hasWordmark = normalized.signage.required.some(
    (s) => s.type === "wordmark" && s.content.trim().length > 0,
  );
  failures.push({
    id: "signage_present",
    status: hasWordmark ? "pass" : "fail",
  });

  // descriptor_present — only fails if descriptor exists but content is empty
  const descriptor = normalized.signage.required.find((s) => s.type === "descriptor");
  failures.push({
    id: "descriptor_present",
    status: descriptor ? (descriptor.content.trim().length > 0 ? "pass" : "fail") : "pass",
  });

  // hero_scale_ok
  const heroZone = normalized.zones.find((z) => z.id === normalized.hero.placementZoneId);
  if (heroZone) {
    const heroArea = heroZone.width * heroZone.depth;
    const actualPct = heroArea / normalized.geometry.area;
    failures.push({
      id: "hero_scale_ok",
      status: actualPct <= normalized.geometry.maxObjectSizePctOfFootprint ? "pass" : "fail",
      actualPct,
    });
  } else {
    failures.push({ id: "hero_scale_ok", status: "unknown" });
  }

  // forbidden_items_absent
  failures.push({
    id: "forbidden_items_absent",
    status: normalized.creative.forbiddenItems.length === 0 ? "unknown" : "pass",
  });

  // ── Gaps ──

  // Brand colors missing hex codes. We fire the gap when the PRIMARY
  // color has no hex — that's the one that matters most for render
  // fidelity. Secondaries/accents are nice-to-have but shouldn't keep
  // the gap open after the user provides the primary. (Without this,
  // the user types orange's hex, color[0].hex fills, but color[1]
  // still has no hex, so the gap fires forever — the infinite-save
  // UX problem in a different costume.)
  const primary = normalized.brand.colors[0];
  if (primary && !primary.hex) {
    gaps.push({
      field: "brand.colors.hex",
      severity: "helpful",
      question: `Do you have a hex code for the primary brand color (${primary.name})? Adding it produces a more brand-accurate render.`,
      fallback: null,
      source: "schema",
    });
  }

  // Venue name
  if (!normalized.context.venue.name || normalized.context.venue.name.trim().length === 0) {
    gaps.push({
      field: "context.venue.name",
      severity: "blocking",
      question: "Where will this booth be shown? (e.g. COEX Convention Center, KBIS Las Vegas)",
      fallback: "Unknown venue",
      source: "schema",
    });
  }

  // Audience
  if (normalized.context.audience.length === 0) {
    gaps.push({
      field: "context.audience",
      severity: "helpful",
      question: "Who's the primary audience at this activation?",
      options: [
        "B2B executives",
        "Designers / specifiers",
        "Consumers / general public",
        "Technical practitioners",
      ],
      fallback: ["general"],
      source: "schema",
    });
  }

  // Hero physical form
  if (!normalized.hero.physicalForm || normalized.hero.physicalForm.trim().length < 10) {
    gaps.push({
      field: "hero.physicalForm",
      severity: "helpful",
      question:
        "Briefly describe the hero installation's structural form (one sentence — e.g. 'suspended mobius ribbon').",
      fallback: "central sculptural feature",
      source: "schema",
    });
  }

  // Hanging element — helpful, non-blocking. Island/peninsula booths
  // almost always carry a hanging overhead identifier (ring, banner,
  // truss-mounted halo); island visibility across a hall is the main
  // reason it exists. Surface a one-click "add a default ring" path
  // when the brief doesn't mention one. Suppressed by either
  //   - the brief already having a hanging element authored, or
  //   - the user previously answering "No — floor-only booth", which
  //     applyGapAnswer records in `_dismissedGaps`. Without the
  //     dismissal sentinel the gap re-fires forever (empty array is
  //     both the "we haven't asked" and the "no thanks" state).
  const dismissed = normalized._dismissedGaps ?? [];
  if (
    normalized.hanging.elements.length === 0 &&
    !dismissed.includes("hanging.elements")
  ) {
    gaps.push({
      field: "hanging.elements",
      severity: "helpful",
      question:
        "Will this booth have a hanging overhead structure visible from across the hall? It's a common identifier on island booths.",
      options: ["Yes — add one", "No — floor-only booth"],
      fallback: [],
      source: "schema",
    });
  }

  // Hero scale failure → suggest correction as gap
  const heroFailure = failures.find((f) => f.id === "hero_scale_ok");
  if (
    heroFailure?.status === "fail" &&
    "actualPct" in heroFailure &&
    heroFailure.actualPct !== undefined
  ) {
    gaps.push({
      field: "hero.dimensions",
      severity: "blocking",
      question: `The hero is currently ${Math.round(
        heroFailure.actualPct * 100,
      )}% of the footprint, exceeding the ${Math.round(
        normalized.geometry.maxObjectSizePctOfFootprint * 100,
      )}% ceiling. Resize the hero zone, or accept this scale for this project?`,
      options: ["Resize hero", "Accept override"],
      fallback: "Resize hero",
      source: "schema",
    });
  }

  return { failures, gaps };
}

// ─────────────────────────────────────────────────────────────────────
// composePrompt — produces the 5 output stages from a NormalizedBrief
// ─────────────────────────────────────────────────────────────────────

export interface ComposerOutput {
  briefJson: NormalizedBrief;
  geometrySummary: string;
  renderer: string;
  negative: string;
  compliance: HardConstraint[];
}

const PROJECT_TYPE_SCENE: Record<ProjectType, string> = {
  exhibition_booth:
    "A 16:9 photorealistic 3/4 perspective render of a trade-show exhibition booth on a convention center floor, photographed at eye level (1.7m / 5'8\") from the front-left at 45°. Editorial architectural photography quality — confident, premium, photoreal.",
  brand_activation:
    "A 16:9 photorealistic 3/4 perspective render of an outdoor brand activation, photographed at eye level (1.7m / 5'8\") from the front-left at 45°. Open-air event environment with crowd energy. Editorial photography quality — cinematic, premium, photoreal.",
  permanent_interior:
    "A 16:9 photorealistic 3/4 perspective render of a permanent branded interior space, photographed at eye level (1.7m / 5'8\") from the front-left at 45°. Architectural construction quality designed for daily use over years. Architectural photography quality — Iwan Baan / Hufton+Crow lineage.",
  retail_environment:
    "A 16:9 photorealistic 3/4 perspective render of a retail environment, photographed at eye level (1.7m / 5'8\") from the front-left at 45°. Curated commercial space with merchandise on display. Editorial retail photography quality — premium, considered, photoreal.",
  architectural_installation:
    "A 16:9 photorealistic 3/4 perspective render of a permanent architectural installation, photographed at eye level (1.7m / 5'8\") from the front-left at 45°. Designed for long lifespan. Architectural photography quality — Snøhetta / Foster + Partners lineage.",
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Convert a hanging element's top-down position into a natural-
 * language phrase the renderer model can use ("centered above",
 * "above the front-left quadrant of", etc.). The booth's
 * front-left corner is (0, 0) and y grows toward the back.
 */
function positionPhraseFor(
  el: NormalizedHangingElement,
  geometry: NormalizedBriefGeometry,
): string {
  const xFrac = el.position.x / geometry.width;
  const yFrac = el.position.y / geometry.depth;
  const xZone = xFrac < 0.33 ? "left" : xFrac > 0.67 ? "right" : "center";
  const yZone = yFrac < 0.33 ? "front" : yFrac > 0.67 ? "back" : "center";
  if (xZone === "center" && yZone === "center") return "centered above";
  if (xZone === "center") return `above the ${yZone} of`;
  if (yZone === "center") return `above the ${xZone} side of`;
  return `above the ${yZone}-${xZone} quadrant of`;
}

function geometrySummaryText(g: NormalizedBriefGeometry): string {
  const u = g.units === "metric" ? "m" : "ft";
  const areaU = g.units === "metric" ? "sqm" : "sq ft";
  const maxHero = g.maxObjectSizePctOfFootprint * g.area;
  return `Geometry: ${formatNumber(g.width)}${u} × ${formatNumber(g.depth)}${u} (${formatNumber(g.area)} ${areaU}). ${g.openSides} open sides. Max structure height: ${formatNumber(g.height)}${u}. Human scale: ${formatNumber(g.humanScale)}${u}. Max hero footprint: ${formatNumber(maxHero)} ${areaU} (${Math.round(g.maxObjectSizePctOfFootprint * 100)}% of total). Min circulation: ${formatNumber(g.minCirculationWidth)}${u}.`;
}

function rendererPrompt(n: NormalizedBrief, neg: string): string {
  const sections: string[] = [];
  const u = n.geometry.units === "metric" ? "m" : "ft";
  const areaU = n.geometry.units === "metric" ? "sqm" : "sq ft";

  // # SCENE
  sections.push(`# SCENE\n${PROJECT_TYPE_SCENE[n.project.type]}`);

  // # SPACE
  // Constraints the design must operate WITHIN, not a layout blueprint.
  // We deliberately dropped the explicit per-zone coordinate grid that
  // used to live in `# COORDINATE LAYOUT` — placing rectangles at exact
  // (x, y, w, d) coordinates forced the model into a layout-solver
  // mindset and produced rectangular pavilions with formulaic zone
  // arrangement. Now we describe the SPACE (dimensions, openings, max
  // height, human reference) and let the model design organically
  // within it. The zone data still lives on NormalizedBrief.zones for
  // downstream documentation (project brief sheet, view composition);
  // it just doesn't get printed into the image prompt as a grid.
  sections.push(
    [
      "# SPACE",
      // Floor footprint is the venue's allocated rectangle — the
      // carpet/platform/base outline on the convention floor. This
      // is ALWAYS rectangular because that's what venues sell.
      // Calling it out explicitly stopped the model from rendering
      // organic ovular floors (the Eqvilent oval-carpet bug).
      `- Floor footprint: ${formatNumber(n.geometry.width)} × ${formatNumber(n.geometry.depth)} ${n.geometry.units} (${formatNumber(n.geometry.area)} ${areaU}) — a RECTANGULAR carpet/platform allocation on the convention floor. The base outline of the booth is always a rectangle matching these dimensions.`,
      `- Maximum structure height: ${formatNumber(n.geometry.height)}${u}`,
      `- Open sides: ${n.geometry.openSides}, unobstructed and visible`,
      `- Human scale: ${formatNumber(n.geometry.humanScale)}${u}`,
      `- Min circulation between elements: ${formatNumber(n.geometry.minCirculationWidth)}${u}`,
      // The "design organically" instruction now scopes to STRUCTURES
      // ABOVE the floor, not the floor itself. Without this scope the
      // model interpreted "organic" as "make the carpet curvy too".
      "Above the floor, design organically — walls, ceilings, fascia, hero installations, and any hanging features express the brand's structural language freely. Don't default to rectangular bays or repeated identical modules for structures. The FLOOR/CARPET OUTLINE stays rectangular regardless.",
    ].join("\n"),
  );

  // # HANGING ELEMENTS — only present when elements exist. Section
  // teaches the model that these structures hang from venue rigging
  // and are NOT supported by the booth, so render visible separation.
  if (n.hanging.elements.length > 0) {
    const heLines: string[] = [
      "# HANGING ELEMENTS",
      "These structures are SUSPENDED from the venue rigging/ceiling above the booth. They are NOT attached to the booth structure below — the booth does not bear their weight. Render them as truly suspended overhead with visible separation from the booth structure beneath.",
      "",
    ];
    for (const el of n.hanging.elements) {
      const phrase = positionPhraseFor(el, n.geometry);
      heLines.push(`- ${el.name}`);
      if (el.physicalForm) heLines.push(`  Form: ${el.physicalForm}`);
      // Width × depth carry the geometry units (`u`), but thickness
      // is committed in feet by the schema field name (thicknessFt) —
      // hardcode `ft` to avoid a 3.28× scale error on metric briefs.
      // Suspension drop on the same line is already hardcoded `ft`;
      // match that pattern.
      heLines.push(
        `  Geometry: ${formatNumber(el.dimensions.width)} × ${formatNumber(el.dimensions.depth)} ${u} × ${formatNumber(el.dimensions.thicknessFt)} ft, ${el.shape} outline, positioned ${phrase} the booth, ${formatNumber(el.suspensionDropFt)}ft below the venue ceiling.`,
      );
      if (el.materials.length > 0) heLines.push(`  Materials: ${el.materials.join(", ")}`);
      if (el.surfaces.length > 0) heLines.push(`  Surfaces: ${el.surfaces.join("; ")}`);
      if (el.lighting.length > 0) heLines.push(`  Lighting: ${el.lighting.join(", ")}`);
      if (el.printed.length > 0) heLines.push(`  Printed: ${el.printed.join("; ")}`);
      heLines.push("");
    }
    sections.push(heLines.join("\n").trimEnd());
  }

  // # STRUCTURAL APPROACH (only when there's structural intent to express)
  if (
    n.creative.visualLanguage.length > 0 ||
    n.hero.physicalForm.length > 0 ||
    n.creative.embrace.length > 0
  ) {
    const sa: string[] = ["# STRUCTURAL APPROACH"];
    sa.push(
      "This section defines the booth's actual architecture — its physical form. The brand's visual language must be expressed AS the structure (canopy shape, fascia geometry, column form, surface curvature), NOT as surface decoration. The structure IS a sculptural form; brand graphics are secondary.",
    );
    if (n.creative.visualLanguage.length > 0) {
      sa.push(
        `Brand visual language to express AS architecture: ${n.creative.visualLanguage.join(", ")}.`,
      );
    }
    if (n.creative.referenceLabels.length > 0) {
      sa.push(`Reference themes: ${n.creative.referenceLabels.join(" · ")}.`);
    }
    if (n.hero.physicalForm.length > 0) {
      sa.push(
        `Authored hero physical form: ${n.hero.physicalForm}. This is the dominant architectural element.`,
      );
    }
    if (n.creative.embrace.length > 0) {
      sa.push(`Embrace: ${n.creative.embrace.join(", ")}.`);
    }
    sa.push(
      "What this section is NOT asking for: a rectangular pavilion with flat horizontal fascia, repeated identical bay modules, or a standard trade-show truss top.",
    );
    if (n.hanging.elements.length > 0) {
      sa.push(
        "Floor-supported structures (walls, fascia, hero installation) are visually distinct from the hanging elements above — there is open air between them.",
      );
    }
    sections.push(sa.join("\n"));
  }

  // # ZONE PROGRAM
  // What the booth needs to CONTAIN — not WHERE things go. The model
  // composes the layout. This replaces the old `# COORDINATE LAYOUT`
  // grid that was over-constraining design. Zones are listed by their
  // functional purpose; deduplicate so the model doesn't see "lounge,
  // lounge, lounge" when the spatial canvas has multiple lounge zones.
  if (n.zones.length > 0) {
    const purposes = Array.from(new Set(n.zones.map((z) => z.purpose)));
    const programLines: string[] = ["# ZONE PROGRAM (what the booth needs to contain — let the design place them organically)"];
    for (const purpose of purposes) {
      programLines.push(`- ${purpose}`);
    }
    sections.push(programLines.join("\n"));
  }

  // # BRAND
  const bLines: string[] = ["# BRAND"];
  bLines.push(`${n.brand.name}${n.brand.descriptor ? ` — ${n.brand.descriptor}` : ""}`);
  if (n.brand.colors.length > 0) {
    bLines.push("Colors:");
    for (const c of n.brand.colors) {
      bLines.push(`- ${c.role}: ${c.name}${c.hex ? ` (${c.hex})` : ""}`);
    }
  }
  if (n.signage.required.length > 0) {
    bLines.push("Required signage:");
    for (const s of n.signage.required) {
      bLines.push(`- "${s.content}" (${s.type}) — ${s.visibilityRequirement}`);
    }
  }
  sections.push(bLines.join("\n"));

  // # CONTEXT
  const ctxLines: string[] = ["# CONTEXT"];
  if (n.context.venue.name) {
    ctxLines.push(
      `Venue: ${n.context.venue.name}, ${n.context.venue.type.replace(/_/g, " ")}, ${n.context.venue.ambientLight.replace(/_/g, " ")}`,
    );
  }
  if (n.context.audience.length > 0) {
    ctxLines.push(`Audience: ${n.context.audience.join(", ")}`);
  }
  ctxLines.push(`Time of day: ${n.context.timeOfDay}`);
  ctxLines.push(
    `Staffing: ${n.context.staffing.count} ${n.context.staffing.attire.replace(/_/g, " ")}, roles: ${n.context.staffing.roles.join(", ")}`,
  );
  if (n.context.interactiveTech.length > 0) {
    ctxLines.push(`Interactive tech: ${n.context.interactiveTech.join(", ")}`);
  }
  sections.push(ctxLines.join("\n"));

  // # DESIGN INTENT
  if (n.creative.designIntent.trim().length > 0) {
    sections.push(`# DESIGN INTENT\n${n.creative.designIntent.slice(0, 300)}`);
  }

  // # HARD CONSTRAINTS
  const hc: string[] = ["# HARD CONSTRAINTS (output MUST satisfy)"];
  hc.push(
    `- Footprint: exactly ${formatNumber(n.geometry.width)} × ${formatNumber(n.geometry.depth)} ${n.geometry.units}`,
  );
  hc.push(`- Open sides: ${n.geometry.openSides}, unobstructed and visible`);
  const sigContents = n.signage.required.map((s) => `"${s.content}"`).join(" + ");
  if (sigContents) hc.push(`- Required signage visible: ${sigContents}`);
  hc.push(`- Hero scale: ≤ ${Math.round(n.geometry.maxObjectSizePctOfFootprint * 100)}% of footprint`);
  if (n.creative.forbiddenItems.length > 0) {
    hc.push(`- Forbidden items: ${n.creative.forbiddenItems.join(", ")}`);
  }
  if (n.hanging.elements.length > 0) {
    hc.push(
      "- Hanging elements appear clearly above and detached from the booth structure (open air between them).",
    );
  }
  sections.push(hc.join("\n"));

  // # NEGATIVE — appended at end (gpt-image-2 has no separate negative input)
  if (neg.trim().length > 0) {
    sections.push(`# NEGATIVE\n${neg}`);
  }

  return sections.join("\n\n");
}

export function composePrompt(normalized: NormalizedBrief): ComposerOutput {
  const { failures } = validateBrief(normalized);
  // validateBrief rebuilds `failures` from scratch and never reads
  // normalized.compliance.hardConstraints, so normalize-time
  // constraints (e.g. hanging_elements_aloft) would be silently
  // dropped at compose time. Merge them in here so the structured
  // compliance object stays consistent with the in-memory
  // NormalizedBrief and so downstream consumers (PromptDebugPanel,
  // composeViewPrompt, future post-render CV checks) see the rule.
  const composedFailures: HardConstraint[] = [
    ...failures,
    ...normalized.compliance.hardConstraints,
  ];
  const negative = [
    ...normalized.creative.forbiddenItems,
    "no overlaid annotations",
    "no zone names or room labels on fascia",
    "no dimension callouts or percentage labels",
    "no flat horizontal rectangular fascia / generic trade-show truss",
    "no cartoon, no over-saturation, no obvious AI artifacts",
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(", ");

  const renderer = rendererPrompt(normalized, negative);

  // Strip _dismissedGaps before emitting briefJson — it's a UX sentinel
  // for "user already answered this clarification", not part of the
  // canonical brief shape the composer consumes. Without this destructure
  // the spread would leak it into the JSON payload.
  const { _dismissedGaps: _omitted, ...canonicalNormalized } = normalized as
    NormalizedBrief & { _dismissedGaps?: string[] };

  return {
    briefJson: { ...canonicalNormalized, compliance: { hardConstraints: composedFailures } },
    geometrySummary: geometrySummaryText(normalized.geometry),
    renderer,
    negative,
    compliance: composedFailures,
  };
}

// ─────────────────────────────────────────────────────────────────────
// composeViewPrompt — hero-derived view composition
// ─────────────────────────────────────────────────────────────────────

export interface HeroSnapshot {
  composerOutput: ComposerOutput;
  normalizedBrief: NormalizedBrief;
  imageUrl: string;
  generatedAt: string;
}

export type ViewAngle =
  | "front"
  | "side_left"
  | "side_right"
  | "back"
  | "top"
  | "interior"
  | "detail";

interface ComposeViewOptions {
  /** Required when angle === "interior" or "detail"; the zone the view focuses on. */
  zoneId?: string;
}

/**
 * Single-sentence edit instructions per view angle. The hero image
 * carries all of the visual signal (materials, palette, signage,
 * architectural form). All the prompt needs to do is tell the model
 * what camera move to make. Mirrors the way ChatGPT does it when you
 * give it an image and say "top down view of this".
 *
 * Why so terse: a long structured "SCENE / REFERENCE / CAMERA /
 * CONSTRAINTS" block was making gpt-image-2 treat the prompt as a
 * fresh generation rather than an edit. The model would produce a
 * NEW booth that loosely matched the description, ignoring the hero
 * pixels. Short prompts + hero-as-only-reference flip it into
 * edit-mode behavior where the hero is the source of truth and the
 * instruction is the modification.
 */
function viewInstruction(
  angle: ViewAngle,
  zoneForFocus: NormalizedBriefZone | undefined,
): string {
  switch (angle) {
    case "front":
      return "Show me the FRONT ELEVATION (head-on, eye-level view) of THIS exact booth shown in the reference image. Camera directly in front, facing the booth straight on. Only the front face is visible — no side walls.";
    case "side_left":
      return "Show me the LEFT SIDE view of THIS exact booth shown in the reference image. Camera 90° to the left side, eye level, looking at the left face of the booth. The front is to the viewer's right.";
    case "side_right":
      return "Show me the RIGHT SIDE view of THIS exact booth shown in the reference image. Camera 90° to the right side, eye level, looking at the right face of the booth. The front is to the viewer's left.";
    case "back":
      return "Show me the BACK VIEW of THIS exact booth shown in the reference image. Camera behind the booth, eye level. The back face is a fully finished visitor-facing surface with the same materials, signage, and lighting as the front — NOT a service area. No exposed wiring or utility panels.";
    case "top":
      return "Show me the TOP-DOWN (bird's eye, orthographic) view of THIS exact booth shown in the reference image. Camera directly overhead, looking straight down. Show the full floor plan layout. No perspective distortion.";
    case "interior":
      if (zoneForFocus) {
        return `Show me the INTERIOR of the ${zoneForFocus.purpose} of THIS exact booth shown in the reference image. Camera standing INSIDE that zone at eye level, surrounded by the zone's walls, ceiling, and furnishings. Same materials, finishes, palette, and lighting style as the reference. Include 3-5 visitors naturally using the space.`;
      }
      return "Show me an INTERIOR view of THIS exact booth shown in the reference image. Camera inside the booth at eye level, surrounded by walls, ceiling, and furnishings. Same materials, finishes, palette, and lighting style as the reference.";
    case "detail":
      if (zoneForFocus) {
        return `Show me a CLOSE-UP DETAIL SHOT focused on the ${zoneForFocus.purpose} of THIS exact booth shown in the reference image. Medium framing, eye level, showing structural detail and finishes. Same materials, palette, and brand signage as the reference.`;
      }
      return "Show me a CLOSE-UP DETAIL SHOT of THIS exact booth shown in the reference image. Medium framing, eye level. Same materials, palette, and brand signage as the reference.";
  }
}

export function composeViewPrompt(
  snapshot: HeroSnapshot,
  angle: ViewAngle,
  opts: ComposeViewOptions = {},
): ComposerOutput {
  const n = snapshot.normalizedBrief;
  const zoneForFocus = opts.zoneId ? n.zones.find((z) => z.id === opts.zoneId) : undefined;

  // Single short edit instruction + minimal consistency guard +
  // concise restriction. Total ~80-150 tokens. The model reads this as
  // an edit, not a generation.
  const instruction = viewInstruction(angle, zoneForFocus);
  const consistency =
    "Treat the reference image as the canonical source. Match its materials, palette, architectural form, brand signage placement, and lighting exactly. Only the camera angle changes.";
  const restrictions =
    "No overlaid text annotations, no zone names or wayfinding labels on the booth. Only brand signage that already exists on the physical booth in the reference image is allowed.";

  const renderer = `${instruction}\n\n${consistency}\n\n${restrictions}`;

  const negative = [
    ...n.creative.forbiddenItems,
    "no overlaid annotations",
    "no zone names or room labels on fascia",
    "no architectural reinvention from the hero reference",
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(", ");

  return {
    briefJson: snapshot.normalizedBrief,
    geometrySummary: snapshot.composerOutput.geometrySummary,
    renderer,
    negative,
    compliance: snapshot.composerOutput.compliance,
  };
}

// ─────────────────────────────────────────────────────────────────────
// validateParsedBriefForReview — content-only gap detection that does
// NOT require a populated geometry/spatial canvas. Surfaced on the
// Brief Review step (BEFORE spatial is filled out). Synthesizes a
// minimal placeholder geometry from brief.spatial.footprints so the
// downstream normalizer still produces a NormalizedBrief; the
// geometry-dependent gaps (footprint_match, hero_scale_ok) collapse to
// neutral statuses because there are no zones yet.
// ─────────────────────────────────────────────────────────────────────

function parseFootprintSize(label: string | undefined): {
  width: number;
  depth: number;
  units: "metric" | "imperial";
} {
  if (!label) return { width: 30, depth: 30, units: "imperial" };
  const m = label.match(
    /(\d+(?:\.\d+)?)\s*(?:m|ft|')?\s*[x×X]\s*(\d+(?:\.\d+)?)\s*(?:m|ft|')?/i,
  );
  if (!m) return { width: 30, depth: 30, units: "imperial" };
  const w = parseFloat(m[1]);
  const d = parseFloat(m[2]);
  const units: "metric" | "imperial" =
    /m\b/i.test(label) && !/ft|'/.test(label) ? "metric" : "imperial";
  return { width: w, depth: d, units };
}

export function validateParsedBriefForReview(
  parsedBrief: ParsedBrief,
): ValidationResult {
  // Defense-in-depth — even though normalizeBrief applies safeBrief
  // itself, we call it here too so the parseFootprintSize lookup below
  // is safe against an entirely-missing spatial block.
  const safe = safeBrief(parsedBrief);
  const fp = parseFootprintSize(safe.spatial.footprints[0]?.size);
  const placeholderGeometry: BoothGeometry = {
    width: fp.width,
    depth: fp.depth,
    ceilingHeightFt: fp.units === "metric" ? 13 : 14,
    measurementSystem: fp.units,
    zones: [],
    materialsCatalog: [],
  };
  const normalized = normalizeBrief({
    project: { id: "review-tmp", name: "review", projectType: "exhibition_booth" },
    parsedBrief,
    geometry: placeholderGeometry,
    elements: null,
  });
  return validateBrief(normalized);
}

// ─────────────────────────────────────────────────────────────────────
// applyGapAnswer — writes a clarification answer back to ParsedBrief
// ─────────────────────────────────────────────────────────────────────

/**
 * Apply a gap answer to a ParsedBrief by dot-path. Centralizes the
 * field → parsedBrief mapping so the host UI doesn't have to know the
 * parsedBrief shape. Clones the input, mutates the clone, passes it
 * back via setBrief. Never mutates the original.
 *
 * Unknown fields are logged and ignored — the field map grows as the
 * gap catalog grows. This is safe because gap.fallback is always a
 * sensible default the validator can use even without a write-through.
 */
export function applyGapAnswer(
  brief: import("@/types/brief").ParsedBrief,
  field: string,
  value: unknown,
  setBrief: (next: import("@/types/brief").ParsedBrief) => void,
): void {
  // Apply defense-in-depth defaults so writing back works even when
  // the source brief is missing fields the gap is trying to fill.
  // structuredClone after safeBrief gives us a deep-mutable copy with
  // every required field present, so the switch arms below can mutate
  // freely without "Cannot read properties of undefined" crashes.
  const next = structuredClone(safeBrief(brief));
  switch (field) {
    case "context.venue.name":
      if (next.events.shows.length === 0) {
        next.events.shows.push({ name: "Unknown", location: String(value) });
      } else {
        next.events.shows[0].location = String(value);
      }
      break;
    case "context.audience": {
      const name = String(value);
      if (next.audiences.length > 0 && next.audiences[0]) {
        next.audiences[0].name = name;
      } else {
        next.audiences.push({
          name,
          description: "",
          priority: 1,
          characteristics: [],
          engagementNeeds: "",
        });
      }
      break;
    }
    case "hero.physicalForm":
      // Write the answer to parsedBrief.experience.hero.description.
      // normalizeBrief uses this as the fallback for hero.physicalForm
      // when interactiveMechanics element data hasn't been generated
      // yet (or hasn't been re-generated since the answer). This
      // closes the round trip: the validator's gap check reads
      // hero.physicalForm, the normalizer fills it from this brief
      // field, the gap resolves, the clarification card disappears.
      //
      // Previously this wrote to creative.designPhilosophy, which the
      // normalizer never read for physicalForm — so the gap stayed
      // open and the user could click Save infinitely.
      next.experience.hero.description = String(value);
      break;
    case "hanging.elements": {
      // The clarification UI offers two options:
      //   - "Yes — add one" → seed a default hanging element (a ring
      //     with brand-wordmark surfaces + edge-lit perimeter). The
      //     user refines materials, dimensions, and position in the
      //     Brief Review step and on the spatial canvas (later tasks).
      //   - anything else (typically "No — floor-only booth") → record
      //     the dismissal so the gap doesn't re-fire on the next
      //     validation pass. Without this, "No" looks identical to
      //     "we never asked" because both leave hangingElements empty.
      //
      // hangingElements + _dismissedGaps are now first-class fields on
      // ParsedBrief; we alias `next` to a local for readability but no
      // longer cast through `as unknown as`.
      const nextLoose = next;
      if (typeof value === "string" && value.startsWith("Yes")) {
        // This seed is intentionally RICH (populated physicalForm,
        // materials, surfaces, lighting, printed) — the clarification
        // flow is "show me an example I can refine." Contrast with
        // BriefHangingCard.tsx::makeDefaultElement, the Add-button
        // default, which is intentionally BARE because that flow is
        // "give me a blank canvas to author from scratch."
        nextLoose.hangingElements = [
          {
            id: crypto.randomUUID(),
            name: "Primary identity sign",
            physicalForm:
              "Overhead branded structure visible from across the hall — typically a ring or halo silhouette with internal lighting.",
            shape: "ring",
            materials: [
              "brushed aluminum frame",
              "internally backlit white acrylic",
            ],
            surfaces: ["front-facing edge: brand wordmark"],
            lighting: ["edge-lit perimeter glow"],
            printed: ["front: brand logotype"],
          },
        ];
        // If the user previously dismissed and then changed their
        // mind, clear the dismissal so the brief view doesn't show
        // a stale "skipped" marker.
        if (Array.isArray(nextLoose._dismissedGaps)) {
          nextLoose._dismissedGaps = nextLoose._dismissedGaps.filter(
            (f) => f !== "hanging.elements",
          );
        }
      } else {
        // "No — floor-only booth" must both record the dismissal AND
        // clear any element seeded by a prior "Yes" answer. Without
        // the clear, toggling No → Yes → No would leave the seeded
        // hanging element behind: validateBrief masks the regression
        // (length > 0 suppresses the gap), but downstream consumers
        // (composer, canvas, prompt anchoring in Tasks 3-6) would
        // treat the stale seed as authored intent. "No" means no
        // hanging elements, full stop.
        nextLoose.hangingElements = [];
        const list = Array.isArray(nextLoose._dismissedGaps)
          ? nextLoose._dismissedGaps
          : [];
        if (!list.includes("hanging.elements")) list.push("hanging.elements");
        nextLoose._dismissedGaps = list;
      }
      break;
    }
    case "brand.colors.hex":
      // Encode the hex in the color name string so the normalizer can
      // parse it back out into c.hex on the NormalizedBriefBrandColor.
      // Format: "orange (#E67E22)" — the normalizer's color split
      // routine reads this back. Writing only the first color for
      // simplicity; a richer multi-color UX would address each
      // color individually with separate gap fields.
      next.brand.visualIdentity.colors = next.brand.visualIdentity.colors.map((c, i) =>
        i === 0 ? `${stripHexSuffix(c)} (${value})` : c,
      );
      break;
    default:
      console.warn(`[applyGapAnswer] no mapping for field: ${field}`);
      return;
  }
  setBrief(next);
}
