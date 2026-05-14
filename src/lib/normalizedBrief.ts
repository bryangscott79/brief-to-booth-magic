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
  | { id: "forbidden_items_absent"; status: "pass" | "fail" | "unknown" };

export interface NormalizedBriefCompliance {
  hardConstraints: HardConstraint[];
}

export interface NormalizedBrief {
  project: NormalizedBriefProject;
  brand: NormalizedBriefBrand;
  geometry: NormalizedBriefGeometry;
  zones: NormalizedBriefZone[];
  materials: NormalizedBriefMaterial[];
  hero: NormalizedBriefHero;
  signage: NormalizedBriefSignage;
  creative: NormalizedBriefCreative;
  context: NormalizedBriefContext;
  camera: NormalizedBriefCamera;
  compliance: NormalizedBriefCompliance;
}

// ─────────────────────────────────────────────────────────────────────
// normalizeBrief — deterministic projection from parsedBrief + geometry
// + elements into the canonical NormalizedBrief shape.
// ─────────────────────────────────────────────────────────────────────

import type { ParsedBrief } from "@/types/brief";
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

export function normalizeBrief(input: NormalizeBriefInput): NormalizedBrief {
  const { project, geometry, elements } = input;
  // Apply defense-in-depth defaults so partial / legacy / corrupted
  // briefs don't crash downstream field access. The validator surfaces
  // the missing data as gaps for the clarification UI to ask about.
  const parsedBrief = safeBrief(input.parsedBrief);

  const area = geometry.width * geometry.depth;

  const colors: NormalizedBriefBrandColor[] = (parsedBrief.brand.visualIdentity.colors ?? [])
    .filter((c) => typeof c === "string" && c.trim().length > 0)
    .map((c, i) => ({
      name: c,
      role: (i === 0 ? "primary" : i === 1 ? "secondary" : "accent") as
        | "primary"
        | "secondary"
        | "accent",
    }));

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
  const hero: NormalizedBriefHero = {
    name: heroFromElements?.name ?? "Hero installation",
    physicalForm: heroFromElements?.physicalForm?.structure ?? "",
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
    compliance: { hardConstraints: [] },
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

  // Brand colors missing hex codes
  const colorsMissingHex = normalized.brand.colors.filter((c) => !c.hex);
  if (colorsMissingHex.length > 0) {
    gaps.push({
      field: "brand.colors.hex",
      severity: "helpful",
      question: `Do you have hex codes for ${colorsMissingHex
        .map((c) => c.name)
        .join(", ")}? Adding them produces more brand-accurate renders.`,
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

  // # GEOMETRY
  sections.push(
    [
      "# GEOMETRY (ground truth — all elements must obey)",
      `- Footprint: ${formatNumber(n.geometry.width)} × ${formatNumber(n.geometry.depth)} ${n.geometry.units} (${formatNumber(n.geometry.area)} ${areaU})`,
      `- Maximum structure height: ${formatNumber(n.geometry.height)}${u}`,
      `- Open sides: ${n.geometry.openSides}, must remain unobstructed and visible`,
      `- Human scale: ${formatNumber(n.geometry.humanScale)}${u}`,
      `- Max hero object: ${formatNumber(n.geometry.maxObjectSizePctOfFootprint * n.geometry.area)} ${areaU} (${Math.round(n.geometry.maxObjectSizePctOfFootprint * 100)}% of footprint)`,
      `- Min circulation: ${formatNumber(n.geometry.minCirculationWidth)}${u}`,
      "All layout, objects, and camera framing MUST obey this geometry.",
    ].join("\n"),
  );

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
    sections.push(sa.join("\n"));
  }

  // # COORDINATE LAYOUT
  const coordLines: string[] = [
    "# COORDINATE LAYOUT",
    "Origin: front-left corner. x = width axis (left→right), y = depth axis (front→back). All values in geometry units.",
  ];
  for (const z of n.zones) {
    coordLines.push(
      `- ${z.purpose}: x=${formatNumber(z.x)}, y=${formatNumber(z.y)}, w=${formatNumber(z.width)}, d=${formatNumber(z.depth)}, visibility=${z.visibilityPriority}${z.structuralForm ? `, ${z.structuralForm}` : ""}`,
    );
  }
  sections.push(coordLines.join("\n"));

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
  sections.push(hc.join("\n"));

  // # NEGATIVE — appended at end (gpt-image-2 has no separate negative input)
  if (neg.trim().length > 0) {
    sections.push(`# NEGATIVE\n${neg}`);
  }

  return sections.join("\n\n");
}

export function composePrompt(normalized: NormalizedBrief): ComposerOutput {
  const { failures } = validateBrief(normalized);
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

  return {
    briefJson: { ...normalized, compliance: { hardConstraints: failures } },
    geometrySummary: geometrySummaryText(normalized.geometry),
    renderer,
    negative,
    compliance: failures,
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

const CAMERA_FOR_ANGLE: Record<ViewAngle, string> = {
  front:
    "Camera positioned directly in front of the booth, centered on the main entrance, at eye level (1.7m / 5'8\"). The camera faces the booth head-on (front elevation). Only the front face is visible — no side walls.",
  side_left:
    "Camera positioned to the LEFT side of the booth, at eye level, facing the booth's left wall at exactly 90°. The front of the booth is to the viewer's right. Only the left face is prominent.",
  side_right:
    "Camera positioned to the RIGHT side of the booth, at eye level, facing the booth's right wall at exactly 90°. The front of the booth is to the viewer's left. Only the right face is prominent.",
  back:
    "Camera positioned BEHIND the booth, rotated 180° from the front. The viewer is in the back aisle. The back face is a fully finished visitor-facing entry/exit — branded panels, secondary signage, elegant lighting, same premium materials as the front. NO exposed wiring, structural supports, utility panels, or service elements.",
  top:
    "Camera positioned directly above the booth looking straight down (orthographic plan view). All zones visible from overhead. No perspective distortion.",
  interior:
    "Camera positioned INSIDE the focused zone at eye level (1.7m / 5'8\"). The viewer is surrounded by the zone's walls, ceiling, and furnishings. The booth exterior and convention hall are behind the camera or barely visible at the edges.",
  detail:
    "Camera positioned close to the focused zone at eye level, showing a medium close-up shot of the zone's key features with surrounding context.",
};

export function composeViewPrompt(
  snapshot: HeroSnapshot,
  angle: ViewAngle,
  opts: ComposeViewOptions = {},
): ComposerOutput {
  const n = snapshot.normalizedBrief;
  const sections: string[] = [];

  const zoneForFocus = opts.zoneId ? n.zones.find((z) => z.id === opts.zoneId) : undefined;

  // # SCENE
  if (angle === "interior" && zoneForFocus) {
    sections.push(
      `# SCENE\nA 16:9 photorealistic interior render. Camera stands INSIDE the ${zoneForFocus.purpose} of this same booth, surrounded by that zone's walls, ceiling, and furnishings. Standing inside, not outside looking in. Human room scale.`,
    );
  } else if (angle === "detail" && zoneForFocus) {
    sections.push(
      `# SCENE\nA 4:3 photorealistic medium close-up render. Camera focuses on the ${zoneForFocus.purpose} of this same booth, showing structural detail and finishes.`,
    );
  } else {
    sections.push(
      `# SCENE\nA 16:9 photorealistic render of the SAME booth shown in the hero reference, captured from a different camera angle. The booth's overall design, structure, materials, and brand identity are identical to the hero — only the camera moves.`,
    );
  }

  // # REFERENCE
  sections.push(
    `# REFERENCE (from hero render, MUST honor)\nThe hero render at the attached reference image is the authoritative version of this booth. Materials, palette, structural form, hero installation, signage placement, and lighting all match the hero. The ONLY thing that changes between hero and this view is the camera angle.`,
  );

  // # CAMERA
  sections.push(`# CAMERA\n${CAMERA_FOR_ANGLE[angle]}`);

  // # ZONE FOCUS (interiors + details)
  if (zoneForFocus && (angle === "interior" || angle === "detail")) {
    const zf: string[] = ["# ZONE FOCUS"];
    zf.push(`Zone purpose: ${zoneForFocus.purpose}`);
    if (zoneForFocus.structuralForm) zf.push(`Structural form: ${zoneForFocus.structuralForm}`);
    if (zoneForFocus.materialIds?.length) {
      const matched = n.materials
        .filter((m) => zoneForFocus.materialIds!.includes(m.id))
        .map((m) => `${m.name} (${m.feel})`)
        .join("; ");
      if (matched) zf.push(`Materials: ${matched}`);
    }
    sections.push(zf.join("\n"));
  }

  // # CONSTRAINTS
  const u = n.geometry.units === "metric" ? "m" : "ft";
  sections.push(
    [
      "# CONSTRAINTS",
      `- Booth geometry: identical to hero (${formatNumber(n.geometry.width)} × ${formatNumber(n.geometry.depth)} ${u})`,
      "- No new materials, no palette shifts, no architectural reinvention",
      "- Brand signage placement matches hero",
      `- Forbidden items: ${n.creative.forbiddenItems.join(", ") || "(none specified)"}`,
    ].join("\n"),
  );

  // # NEGATIVE
  const negative = [
    ...n.creative.forbiddenItems,
    "no overlaid annotations",
    "no zone names or room labels on fascia",
    "no dimension callouts",
    "no architectural reinvention from the hero reference",
  ].join(", ");
  if (negative) sections.push(`# NEGATIVE\n${negative}`);

  const renderer = sections.join("\n\n");

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
      // physicalForm lives on interactiveMechanics element data, not on
      // ParsedBrief. Stash the answer on creative.designPhilosophy so
      // it's preserved and surfaced to the model until the host
      // separately persists it via setElementData.
      next.creative.designPhilosophy = next.creative.designPhilosophy
        ? `${next.creative.designPhilosophy} | hero form: ${value}`
        : `hero form: ${value}`;
      break;
    case "brand.colors.hex":
      // Hex codes don't have an exact slot — append in parens to the
      // first color name so the normalizer can pick them up later.
      next.brand.visualIdentity.colors = next.brand.visualIdentity.colors.map((c, i) =>
        i === 0 ? `${c} (${value})` : c,
      );
      break;
    default:
      console.warn(`[applyGapAnswer] no mapping for field: ${field}`);
      return;
  }
  setBrief(next);
}
