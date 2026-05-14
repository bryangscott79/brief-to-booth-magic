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

// Composer + validator types added in later tasks.
