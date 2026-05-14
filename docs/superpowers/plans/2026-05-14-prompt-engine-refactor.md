# Prompt Engine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the prompt-generation pipeline to produce clean, structured, brief-driven renderer prompts for gpt-image-2, with a single source of truth (NormalizedBrief), interactive clarification of gaps, and hero-derived view consistency.

**Architecture:** Six phases. Phases 1-2 build a pure-function library (NormalizedBrief schema, normalizer, validator, composer). Phase 3 wires the library into the edge functions and ships "production goes live" — auxiliary views derive from a persisted `heroSnapshot`. Phases 4-5 add UI (clarification cards + debug panel). Phase 6 migrates the project_type vocabulary.

**Tech Stack:** TypeScript (strict), React 18 + Vite (client), Deno (Supabase edge functions), Vitest + jsdom (tests), Zustand (state), Supabase Postgres + Edge Functions.

**Spec:** `docs/superpowers/specs/2026-05-14-prompt-engine-refactor-design.md`

**Production-goes-live milestone:** end of Task 14 (Phase 3 complete). Before that, all changes are dark / behind tests / not yet called by the live UI.

---

## File Map

### New files

- `src/lib/normalizedBrief.ts` — schema (types), `normalizeBrief()`, `validateBrief()`, `composePrompt()`, `composeViewPrompt()`
- `src/lib/__fixtures__/eqvilent-icml.ts` — fixture data for Eqvilent ICML brief shape
- `src/lib/__fixtures__/us-cabinet-depot.ts` — fixture data for US Cabinet Depot brief shape
- `src/lib/normalizedBrief.test.ts` — fixture + snapshot tests
- `src/components/prompts/BriefClarification.tsx` — gap-question UI
- `src/components/prompts/BriefClarification.test.tsx` — component tests
- `src/components/prompts/PromptDebugPanel.tsx` — collapsed debug panel showing 5 stages
- `supabase/migrations/20260514000000_normalize_project_types.sql` — type vocabulary + prompt_artifacts column

### Modified files

- `src/store/renderStore.ts` — accept `ComposerOutput` for hero, `heroSnapshot + angle` for views; forward to edge functions
- `src/components/prompts/PromptGenerator.tsx` — call normalize → validate → compose; mount clarification + debug panel; remove old designContext wiring
- `src/components/brief/BriefUpload.tsx` (or wherever brief review lives) — mount BriefClarification post-parse
- `supabase/functions/generate-hero/index.ts` — receive renderer text directly; persist heroSnapshot; strip inline structured-prompt logic
- `supabase/functions/generate-view/index.ts` — receive renderer text directly; strip inline structured-prompt logic
- `supabase/functions/parse-brief/index.ts` — emit new project_type values

### Deprecated / removed

- `src/lib/designContextBuilder.ts` — responsibilities subsumed by `normalizedBrief.ts`
- Large sections of `src/lib/promptBuilder.ts` — `generatePrompt`, `generateZoneInteriorPrompt`, `buildBriefComplianceBlock` collapse into the new composer

---

## Phase 1 — Schema, normalizer, validator (pure library; no production impact)

### Task 1: Type definitions for NormalizedBrief

**Files:**
- Create: `src/lib/normalizedBrief.ts`

- [ ] **Step 1: Create the file with type definitions**

```ts
// src/lib/normalizedBrief.ts
//
// Single source of truth for all brief, geometry, and design data used
// downstream by the prompt composer. The normalizer projects loose
// parsedBrief + spatialData + elements into this canonical shape; the
// validator surfaces gaps + failures; the composer reads it and emits
// the 5 output stages.

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

// Composer + validator types come in later tasks.
```

- [ ] **Step 2: Type-check passes**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Expected: zero output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/normalizedBrief.ts
git commit -m "feat(prompt-engine): add NormalizedBrief type definitions"
```

---

### Task 2: Fixture data for Eqvilent ICML

**Files:**
- Create: `src/lib/__fixtures__/eqvilent-icml.ts`

- [ ] **Step 1: Build the fixture from real shapes (parsedBrief + spatialData + elements)**

```ts
// src/lib/__fixtures__/eqvilent-icml.ts
//
// Realistic fixture matching how parsedBrief / spatialData / elements
// would look for Eqvilent's ICML 2025 booth project. Used by the
// normalizer + validator + composer test suites. Values mirror what
// parse-brief would actually emit for the Eqvilent brief PDF.

import type { ParsedBrief } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

export const eqvilentParsedBrief: ParsedBrief = {
  brand: {
    name: "Eqvilent",
    category: "Quantitative trading",
    pov: "We find order in chaos, opportunity in complexity.",
    personality: ["intelligent", "precise", "confident"],
    competitors: ["HRT", "Citadel", "Jane Street", "Susquehanna"],
    visualIdentity: {
      colors: ["orange", "black"],
      avoidColors: [],
      avoidImagery: ["stock photography"],
    },
    tagline: "Quantitative trading",
  },
  objectives: {
    primary: "Recruit ML researchers and engineers at ICML 2025",
    secondary: ["Showcase technical brand", "Drive 1:1 conversations"],
    competitiveContext: "Adjacent to HRT, Citadel, Jane Street booths",
    differentiationGoals: ["Premium architectural feel", "Sculptural visual identity"],
  },
  events: {
    shows: [
      {
        name: "ICML 2025",
        location: "COEX Convention & Exhibition Center, Seoul",
        dates: "2025-07-06 to 2025-07-11",
        audienceProfile: "AI researchers, engineers, PhD students",
      },
    ],
    primaryShow: "ICML 2025",
  },
  spatial: {
    footprints: [
      { size: "6m x 6m", sqft: 388, priority: "primary" },
    ],
    modular: false,
    reuseRequirement: "single show",
    trafficRequirements: "highly visible from any point in the exhibition hall",
    boothType: "island",
    openSides: 4,
  },
  audiences: [
    {
      name: "AI Researchers",
      description: "Top AI/ML researchers and scientists",
      priority: 1,
      characteristics: ["technical", "intellectually rigorous"],
      engagementNeeds: "Deep conversations, technical depth",
    },
  ],
  creative: {
    avoid: [
      "Bar stools and high cocktail tables",
      "Branding applied as stickers",
      "temporary booth feel",
      "open access to shelves with merchandise",
    ],
    embrace: [
      "WOW",
      "non-standard",
      "premium booth",
      "light, waves, and lines as structural and architectural components",
      "lighting solutions",
      "Premium materials and finishes",
    ],
    coreStrategy: "Express data flow as architecture",
    thinkingFramework: ["sculptural", "data-as-form"],
    designPhilosophy: "The Apex of Alpha",
    visualLanguage: ["light", "waves", "lines", "round element"],
    referenceLabels: ["Emphasis on lines", "A round element"],
  },
  experience: {
    hero: {
      required: true,
      description: "Central sculptural installation expressing data flow",
      attributes: ["WOW moment", "sculptural", "branded"],
    },
    storytelling: { required: true, description: "", audienceAdaptation: true },
    humanConnection: {
      required: true,
      capacity: "lounge for 4-6 people",
      integrationRequirement: "comfortable, full-size seating",
    },
    adjacentActivations: { required: false, count: "0", criteria: [] },
  },
  budget: {
    perShow: 150000,
    inclusions: ["build", "installation", "removal"],
    exclusions: ["travel", "staff"],
    efficiencyNotes: "single-show build",
  },
  requiredDeliverables: ["wordmark visible from all four sides", "Quantitative trading descriptor"],
  winningCriteria: ["WOW factor", "premium feel", "brand alignment"],
};

export const eqvilentGeometry: BoothGeometry = {
  width: 6,
  depth: 6,
  ceilingHeightFt: 13,
  measurementSystem: "metric",
  zones: [
    {
      id: "welcome",
      name: "Welcome Point",
      x: 0.5,
      y: 0.5,
      width: 2.5,
      depth: 2.0,
      heightFt: 4,
      colorHex: "#E6E6E6",
      structuralForm: "open",
      featureDescription: "Sculptural podium with Eqvilent wordmark + descriptor",
      intent: "Greet visitors, route to lounge or hero",
    },
    {
      id: "hero",
      name: "Central Architectural Hub",
      x: 1.75,
      y: 2.5,
      width: 2.5,
      depth: 2.5,
      heightFt: 13,
      colorHex: "#FF6B1A",
      structuralForm: "canopy",
      featureDescription: "Sculptural infinity-ribbon expressing data flow",
      intent: "Hero focal area — primary WOW moment",
      materialIds: ["matte-black-aluminum", "edge-lit-orange-acrylic"],
    },
    {
      id: "narrative",
      name: "Brand Narrative Wall",
      x: 1.5,
      y: 0.5,
      width: 3.0,
      depth: 1.5,
      heightFt: 10,
      colorHex: "#1A1A1A",
      structuralForm: "enclosed",
      featureDescription: "Architectural feature wall, back-lit lines",
      intent: "Tell the brand story",
    },
    {
      id: "lounge",
      name: "Relaxed Consultation Area",
      x: 3.5,
      y: 3.0,
      width: 2.5,
      depth: 3.0,
      heightFt: 8,
      colorHex: "#2E2E2E",
      structuralForm: "alcove",
      featureDescription: "Lounge with full-size armchairs",
      intent: "Deep 1:1 conversations",
      materialIds: ["charcoal-felt"],
    },
    {
      id: "merch",
      name: "Secure Merch & Storage",
      x: 0.0,
      y: 4.5,
      width: 1.5,
      depth: 1.5,
      heightFt: 8,
      colorHex: "#0D0D0D",
      structuralForm: "enclosed",
      featureDescription: "Glass-fronted merchandise display + concealed storage",
      intent: "Merchandise behind physical barrier",
    },
  ],
  materialsCatalog: [
    { id: "matte-black-aluminum", name: "Matte Black Anodized Aluminum", description: "Technical, precise, premium" },
    { id: "edge-lit-orange-acrylic", name: "Edge-lit Orange Acrylic", description: "Vibrant, energetic, brand color" },
    { id: "polished-concrete", name: "Polished Concrete", description: "Architectural, solid, clean base" },
    { id: "charcoal-felt", name: "Charcoal Grey Felt / Kvadrat", description: "Comfortable, sophisticated, acoustic" },
  ],
};

export const eqvilentInteractiveMechanicsHero = {
  name: "The Apex of Alpha",
  concept: "A sculptural infinity ribbon expressing high-frequency data flow as form.",
  physicalForm: {
    structure: "Suspended mobius ribbon in matte-black aluminum frame with edge-lit orange acrylic inlays",
    dimensions: "4.5m diameter × 1.5m vertical depth, suspended 2.8m from floor",
    materials: ["Lightweight carbon fiber", "Bead-blasted aluminum", "Diffused matte-finish acrylic"],
    visualLanguage: "fluid, sculptural, data-flow",
  },
};

export const eqvilentProjectMeta = {
  id: "test-eqvilent",
  name: "Eqvilent — ICML 2025",
  projectType: "exhibition_booth" as const, // after migration
};
```

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__fixtures__/eqvilent-icml.ts
git commit -m "test(prompt-engine): add Eqvilent ICML fixture data"
```

---

### Task 3: Fixture data for US Cabinet Depot

**Files:**
- Create: `src/lib/__fixtures__/us-cabinet-depot.ts`

- [ ] **Step 1: Build the second fixture**

```ts
// src/lib/__fixtures__/us-cabinet-depot.ts
//
// Fixture for a cabinet-maker booth — five thematic room sets
// ("The Study / Sanctuary / Hearth / Retreat / Workshop"). The poetic
// zone names are what's already in spatialData; the normalizer must
// map these to functional descriptors before they reach the prompt.

import type { ParsedBrief } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

export const usCabinetDepotParsedBrief: ParsedBrief = {
  brand: {
    name: "US Cabinet Depot",
    category: "Cabinetry & millwork",
    pov: "Premium American-made cabinetry for designers and builders.",
    personality: ["warm", "premium", "considered"],
    competitors: ["KraftMaid", "Wellborn", "Wolf"],
    visualIdentity: {
      colors: ["walnut", "off-white", "matte-black"],
      avoidColors: [],
      avoidImagery: ["builder-grade construction"],
    },
    tagline: undefined,
  },
  objectives: {
    primary: "Showcase 5 cabinet collections in immersive room sets",
    secondary: ["Generate trade leads", "Highlight craftsmanship"],
    competitiveContext: "KBIS show floor",
    differentiationGoals: ["Curated room experiences", "Premium positioning"],
  },
  events: {
    shows: [{ name: "KBIS 2025", location: "Las Vegas Convention Center" }],
    primaryShow: "KBIS 2025",
  },
  spatial: {
    footprints: [{ size: "40 ft x 30 ft", sqft: 1200, priority: "primary" }],
    modular: true,
    reuseRequirement: "multi-show",
    trafficRequirements: "five distinct room walkthroughs",
    boothType: "island",
    openSides: 4,
  },
  audiences: [
    { name: "Designers", description: "Interior designers, kitchen designers", priority: 1, characteristics: ["taste-driven"], engagementNeeds: "see, touch, evaluate finishes" },
    { name: "Builders", description: "Custom and production builders", priority: 2, characteristics: ["practical"], engagementNeeds: "spec sheets, pricing" },
  ],
  creative: {
    avoid: ["builder-grade displays", "fluorescent lighting"],
    embrace: ["warm wood tones", "room-set immersion", "natural light"],
    coreStrategy: "Five room sets the visitor walks through",
    thinkingFramework: ["domestic", "immersive"],
    designPhilosophy: "The House Tour",
    visualLanguage: ["wood grain", "millwork", "shaker", "natural"],
    referenceLabels: ["Domestic warmth", "Walnut prominence"],
  },
  experience: {
    hero: {
      required: true,
      description: "Central kitchen island with surrounding room sets",
      attributes: ["functional", "premium"],
    },
    storytelling: { required: true, description: "", audienceAdaptation: false },
    humanConnection: { required: true, capacity: "consultation seating", integrationRequirement: "" },
    adjacentActivations: { required: false, count: "0", criteria: [] },
  },
  budget: { perShow: 280000, inclusions: [], exclusions: [], efficiencyNotes: "" },
  requiredDeliverables: ["five room sets", "central kitchen hero"],
  winningCriteria: ["lead quality", "designer engagement"],
};

export const usCabinetDepotGeometry: BoothGeometry = {
  width: 40,
  depth: 30,
  ceilingHeightFt: 16,
  measurementSystem: "imperial",
  zones: [
    {
      id: "study",
      name: "The Study",
      x: 2,
      y: 2,
      width: 7,
      depth: 7,
      heightFt: 10,
      colorHex: "#5C4A35",
      structuralForm: "enclosed",
      featureDescription: "Home office cabinetry set — built-in desk, library wall",
      intent: "Showcase office millwork collection",
    },
    {
      id: "sanctuary",
      name: "The Sanctuary",
      x: 11,
      y: 2,
      width: 7,
      depth: 7,
      heightFt: 10,
      colorHex: "#8B7355",
      structuralForm: "enclosed",
      featureDescription: "Bath & dressing room cabinetry",
      intent: "Showcase bath cabinetry collection",
    },
    {
      id: "hearth",
      name: "The Hearth",
      x: 16,
      y: 11,
      width: 10,
      depth: 9,
      heightFt: 12,
      colorHex: "#A66E33",
      structuralForm: "open",
      featureDescription: "Central kitchen island with surrounding cabinetry — the hero",
      intent: "Hero focal area; primary kitchen showcase",
      materialIds: ["walnut", "matte-stone"],
    },
    {
      id: "retreat",
      name: "The Retreat",
      x: 28,
      y: 2,
      width: 8,
      depth: 8,
      heightFt: 10,
      colorHex: "#6B5B45",
      structuralForm: "alcove",
      featureDescription: "Lounge / living room media wall with built-ins",
      intent: "Casual seating, consultation area",
    },
    {
      id: "workshop",
      name: "The Workshop",
      x: 28,
      y: 18,
      width: 10,
      depth: 10,
      heightFt: 10,
      colorHex: "#3D2F1F",
      structuralForm: "open",
      featureDescription: "Garage / workshop millwork — tool cabinets, mudroom",
      intent: "Showcase mudroom/garage collection",
    },
  ],
  materialsCatalog: [
    { id: "walnut", name: "American Walnut", description: "Warm, premium, signature" },
    { id: "matte-stone", name: "Honed Quartzite", description: "Quiet, premium counter surface" },
    { id: "shaker-paint", name: "Shaker Painted Door", description: "Traditional, off-white" },
  ],
};

export const usCabinetDepotInteractiveMechanicsHero = {
  name: "The Central Kitchen Island",
  concept: "A working kitchen vignette with the full Hearth collection on display.",
  physicalForm: {
    structure: "Functional kitchen island with overhead pot rack, surrounding cabinetry on all four sides",
    dimensions: "12 ft × 6 ft island; 10 ft ceiling fascia",
    materials: ["American Walnut", "Honed Quartzite", "Brushed brass hardware"],
    visualLanguage: "domestic, warm, considered",
  },
};

export const usCabinetDepotProjectMeta = {
  id: "test-uscd",
  name: "US Cabinet Depot — KBIS 2025",
  projectType: "exhibition_booth" as const,
};
```

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__fixtures__/us-cabinet-depot.ts
git commit -m "test(prompt-engine): add US Cabinet Depot fixture data"
```

---

### Task 4: `normalizeBrief()` — failing test first

**Files:**
- Modify: `src/lib/normalizedBrief.ts`
- Create: `src/lib/normalizedBrief.test.ts`

- [ ] **Step 1: Write the failing test for `normalizeBrief()`**

```ts
// src/lib/normalizedBrief.test.ts
import { describe, it, expect } from "vitest";
import { normalizeBrief } from "./normalizedBrief";
import {
  eqvilentParsedBrief,
  eqvilentGeometry,
  eqvilentInteractiveMechanicsHero,
  eqvilentProjectMeta,
} from "./__fixtures__/eqvilent-icml";

describe("normalizeBrief — Eqvilent ICML", () => {
  const normalized = normalizeBrief({
    project: eqvilentProjectMeta,
    parsedBrief: eqvilentParsedBrief,
    geometry: eqvilentGeometry,
    elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
  });

  it("carries project identity verbatim", () => {
    expect(normalized.project.id).toBe("test-eqvilent");
    expect(normalized.project.type).toBe("exhibition_booth");
  });

  it("captures brand colors with primary/secondary roles", () => {
    expect(normalized.brand.name).toBe("Eqvilent");
    expect(normalized.brand.descriptor).toBe("Quantitative trading");
    expect(normalized.brand.colors[0]).toMatchObject({ name: "orange", role: "primary" });
    expect(normalized.brand.colors[1]).toMatchObject({ name: "black", role: "secondary" });
  });

  it("emits a single canonical geometry block", () => {
    expect(normalized.geometry.width).toBe(6);
    expect(normalized.geometry.depth).toBe(6);
    expect(normalized.geometry.area).toBe(36);
    expect(normalized.geometry.units).toBe("metric");
    expect(normalized.geometry.openSides).toBe(4);
    expect(normalized.geometry.humanScale).toBe(1.7);
    expect(normalized.geometry.maxObjectSizePctOfFootprint).toBe(0.30);
  });

  it("maps zones to functional purposes (NOT proper names)", () => {
    const purposes = normalized.zones.map((z) => z.purpose);
    expect(purposes).not.toContain("Central Architectural Hub");
    expect(purposes).not.toContain("Relaxed Consultation Area");
    expect(purposes).toContain("hero focal area");
    expect(purposes).toContain("lounge / informal seating area");
  });

  it("preserves zone coordinates in geometry units", () => {
    const heroZone = normalized.zones.find((z) => z.purpose === "hero focal area")!;
    expect(heroZone.x).toBe(1.75);
    expect(heroZone.y).toBe(2.5);
    expect(heroZone.width).toBe(2.5);
    expect(heroZone.depth).toBe(2.5);
  });

  it("pulls hero physical form from interactiveMechanics", () => {
    expect(normalized.hero.physicalForm).toContain("mobius ribbon");
  });

  it("captures signage requirements with descriptor", () => {
    const signage = normalized.signage.required;
    const wordmark = signage.find((s) => s.type === "wordmark");
    const descriptor = signage.find((s) => s.type === "descriptor");
    expect(wordmark?.content).toBe("Eqvilent");
    expect(descriptor?.content).toBe("Quantitative trading");
    expect(wordmark?.visibilityRequirement).toBe("all_sides");
  });

  it("carries visualLanguage and forbiddenItems on creative", () => {
    expect(normalized.creative.visualLanguage).toContain("waves");
    expect(normalized.creative.visualLanguage).toContain("lines");
    expect(normalized.creative.forbiddenItems).toContain("Bar stools and high cocktail tables");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: FAIL with "normalizeBrief is not exported" or similar.

- [ ] **Step 3: Implement `normalizeBrief` to make tests pass**

Append to `src/lib/normalizedBrief.ts`:

```ts
import type { ParsedBrief } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

interface NormalizeBriefInput {
  project: { id: string; name: string; projectType: ProjectType | string };
  parsedBrief: ParsedBrief;
  geometry: BoothGeometry;
  elements: { interactiveMechanics?: { data?: { hero?: any } } } | null | undefined;
}

const HERO_KEYWORDS = ["hero", "experience", "apex", "digital", "core", "central", "architectural", "sculptural", "hearth"];
const LOUNGE_KEYWORDS = ["lounge", "hub", "casual", "connection", "retreat", "sanctuary", "sofa"];
const MEETING_KEYWORDS = ["suite", "meeting", "bd", "consultation", "private", "study"];
const RECEPTION_KEYWORDS = ["reception", "welcome", "entry"];
const DEMO_KEYWORDS = ["demo", "product", "workshop", "hands.?on"];
const MERCH_KEYWORDS = ["merch", "storefront", "retail", "store"];
const NARRATIVE_KEYWORDS = ["brand.?narrative", "storytelling", "future", "vision", "wall", "story"];
const SERVICE_KEYWORDS = ["command", "storage", "service", "back.?of.?house", "utility"];
const MEDIA_KEYWORDS = ["screen", "media", "theater", "theatre"];

export function zoneNameToPurpose(zone: { id?: string; name?: string }): string {
  const blob = `${zone.id ?? ""} ${zone.name ?? ""}`.toLowerCase();
  if (HERO_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "hero focal area";
  if (LOUNGE_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "lounge / informal seating area";
  if (MEETING_KEYWORDS.some((k) => new RegExp(k).test(blob))) return "private meeting / consultation area";
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
  const costPerSqft = budget / Math.max(area * 10.7639, 1);
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
  const { project, parsedBrief, geometry, elements } = input;

  const area = (geometry.measurementSystem === "metric")
    ? geometry.width * geometry.depth
    : geometry.width * geometry.depth;

  const colors: NormalizedBriefBrandColor[] = (parsedBrief.brand.visualIdentity.colors ?? [])
    .filter((c) => typeof c === "string" && c.trim().length > 0)
    .map((c, i) => ({
      name: c,
      role: (i === 0 ? "primary" : i === 1 ? "secondary" : "accent") as "primary" | "secondary" | "accent",
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
      visibilityRequirement: (geometry.zones.length > 0 && (parsedBrief.spatial.openSides ?? 1) >= 3)
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
    type: "convention_center", // refined by clarification
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
      height: geometry.measurementSystem === "metric"
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
      forbiddenItems: parsedBrief.creative.avoid ?? [], // alias for now; explicit forbiddens added via clarification
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
    camera: { angle: "hero_34", eyeLevel: geometry.measurementSystem === "metric" ? 1.7 : 5.58, framing: "wide" },
    compliance: { hardConstraints: [] }, // populated by validateBrief
  };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all `normalizeBrief — Eqvilent ICML` tests pass.

- [ ] **Step 5: Add US Cabinet Depot tests to the same file**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
import {
  usCabinetDepotParsedBrief,
  usCabinetDepotGeometry,
  usCabinetDepotInteractiveMechanicsHero,
  usCabinetDepotProjectMeta,
} from "./__fixtures__/us-cabinet-depot";

describe("normalizeBrief — US Cabinet Depot", () => {
  const normalized = normalizeBrief({
    project: usCabinetDepotProjectMeta,
    parsedBrief: usCabinetDepotParsedBrief,
    geometry: usCabinetDepotGeometry,
    elements: { interactiveMechanics: { data: { hero: usCabinetDepotInteractiveMechanicsHero } } },
  });

  it("maps poetic zone names to functional purposes", () => {
    const purposes = normalized.zones.map((z) => z.purpose);
    expect(purposes).not.toContain("The Sanctuary");
    expect(purposes).not.toContain("The Hearth");
    expect(purposes).not.toContain("The Retreat");
    expect(purposes).not.toContain("The Workshop");
    // Hearth = central kitchen island = hero
    expect(purposes.filter((p) => p === "hero focal area").length).toBeGreaterThan(0);
  });

  it("preserves imperial units and area", () => {
    expect(normalized.geometry.units).toBe("imperial");
    expect(normalized.geometry.width).toBe(40);
    expect(normalized.geometry.depth).toBe(30);
    expect(normalized.geometry.area).toBe(1200);
    expect(normalized.geometry.humanScale).toBeCloseTo(5.58);
    expect(normalized.geometry.minCirculationWidth).toBe(3);
  });

  it("treats absence of tagline as no descriptor signage", () => {
    const descriptor = normalized.signage.required.find((s) => s.type === "descriptor");
    expect(descriptor).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run all tests**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: every test passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "feat(prompt-engine): implement normalizeBrief with fixture tests"
```

---

### Task 5: `validateBrief()` — gaps and failures

**Files:**
- Modify: `src/lib/normalizedBrief.ts`
- Modify: `src/lib/normalizedBrief.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
import { validateBrief } from "./normalizedBrief";

describe("validateBrief — gaps", () => {
  it("flags missing brand color hex codes as a helpful gap", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    const colorGap = gaps.find((g) => g.field === "brand.colors.hex");
    expect(colorGap).toBeDefined();
    expect(colorGap?.severity).toBe("helpful");
    expect(colorGap?.question).toMatch(/hex/i);
  });

  it("flags missing venue type as a blocking gap when default applied", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: { ...eqvilentParsedBrief, events: { shows: [], primaryShow: undefined } },
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    expect(gaps.some((g) => g.field === "context.venue.name")).toBe(true);
  });

  it("does not flag missing descriptor when brand has none", () => {
    const normalized = normalizeBrief({
      project: usCabinetDepotProjectMeta,
      parsedBrief: usCabinetDepotParsedBrief,
      geometry: usCabinetDepotGeometry,
      elements: { interactiveMechanics: { data: { hero: usCabinetDepotInteractiveMechanicsHero } } },
    });
    const { failures } = validateBrief(normalized);
    expect(failures.some((f) => f.id === "descriptor_present" && f.status === "fail")).toBe(false);
  });
});

describe("validateBrief — failures", () => {
  it("flags hero scale exceeding 30% of footprint as failure", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief,
      geometry: {
        ...eqvilentGeometry,
        zones: eqvilentGeometry.zones.map((z) =>
          z.id === "hero" ? { ...z, width: 5, depth: 5 } : z, // 25 sqm of 36 = 69%
        ),
      },
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { failures } = validateBrief(normalized);
    const heroFailure = failures.find((f) => f.id === "hero_scale_ok");
    expect(heroFailure?.status).toBe("fail");
    if (heroFailure?.status === "fail" && "actualPct" in heroFailure) {
      expect(heroFailure.actualPct).toBeGreaterThan(0.30);
    }
  });

  it("flags missing required signage", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: { ...eqvilentParsedBrief, brand: { ...eqvilentParsedBrief.brand, name: "" } },
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { failures } = validateBrief(normalized);
    expect(failures.some((f) => f.id === "signage_present" && f.status === "fail")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify failures**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: 5 new tests fail with "validateBrief is not a function".

- [ ] **Step 3: Implement `validateBrief`**

Append to `src/lib/normalizedBrief.ts`:

```ts
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

  // footprint_match — pass if width/depth/area are present and area = w*d
  const expectedArea = normalized.geometry.width * normalized.geometry.depth;
  failures.push({
    id: "footprint_match",
    status: Math.abs(expectedArea - normalized.geometry.area) < 0.01 ? "pass" : "fail",
    message: Math.abs(expectedArea - normalized.geometry.area) < 0.01
      ? undefined
      : `Geometry area ${normalized.geometry.area} doesn't match width × depth (${expectedArea}).`,
  });

  // open_sides_clear — informational; we cannot verify visually, just check declared value
  failures.push({
    id: "open_sides_clear",
    status: normalized.geometry.openSides >= 1 && normalized.geometry.openSides <= 4 ? "pass" : "fail",
  });

  // signage_present — wordmark required
  const hasWordmark = normalized.signage.required.some(
    (s) => s.type === "wordmark" && s.content.trim().length > 0,
  );
  failures.push({
    id: "signage_present",
    status: hasWordmark ? "pass" : "fail",
  });

  // descriptor_present — only fails if descriptor is in signage list but content is empty
  const descriptor = normalized.signage.required.find((s) => s.type === "descriptor");
  failures.push({
    id: "descriptor_present",
    status: descriptor
      ? descriptor.content.trim().length > 0 ? "pass" : "fail"
      : "pass",
  });

  // hero_scale_ok — hero footprint must be <= maxObjectSizePctOfFootprint of total area
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

  // forbidden_items_absent — informational; the prompt restrictions section handles enforcement
  failures.push({
    id: "forbidden_items_absent",
    status: normalized.creative.forbiddenItems.length === 0 ? "unknown" : "pass",
  });

  // ── Gaps ──

  // Brand colors with no hex
  const colorsMissingHex = normalized.brand.colors.filter((c) => !c.hex);
  if (colorsMissingHex.length > 0) {
    gaps.push({
      field: "brand.colors.hex",
      severity: "helpful",
      question: `Do you have hex codes for ${colorsMissingHex.map((c) => c.name).join(", ")}? Adding them produces more brand-accurate renders.`,
      fallback: null,
      source: "schema",
    });
  }

  // Venue name + type
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
      options: ["B2B executives", "Designers / specifiers", "Consumers / general public", "Technical practitioners"],
      fallback: ["general"],
      source: "schema",
    });
  }

  // Hero physical form
  if (!normalized.hero.physicalForm || normalized.hero.physicalForm.trim().length < 10) {
    gaps.push({
      field: "hero.physicalForm",
      severity: "helpful",
      question: "Briefly describe the hero installation's structural form (one sentence — e.g. 'suspended mobius ribbon').",
      fallback: "central sculptural feature",
      source: "schema",
    });
  }

  // Hero scale failure → suggest correction as gap
  const heroFailure = failures.find((f) => f.id === "hero_scale_ok");
  if (heroFailure?.status === "fail" && "actualPct" in heroFailure && heroFailure.actualPct) {
    gaps.push({
      field: "hero.dimensions",
      severity: "blocking",
      question: `The hero is currently ${Math.round(heroFailure.actualPct * 100)}% of the footprint, exceeding the ${Math.round(
        normalized.geometry.maxObjectSizePctOfFootprint * 100,
      )}% ceiling. Resize the hero zone, or accept this scale for this project?`,
      options: ["Resize hero", "Accept override"],
      fallback: "Resize hero",
      source: "schema",
    });
  }

  return { failures, gaps };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all tests pass (8+ total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "feat(prompt-engine): add validateBrief returning gaps and failures"
```

---

## Phase 2 — Composer (pure functions; no production impact)

### Task 6: `composePrompt()` — failing test first

**Files:**
- Modify: `src/lib/normalizedBrief.ts`
- Modify: `src/lib/normalizedBrief.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
import { composePrompt } from "./normalizedBrief";

describe("composePrompt — 5 output stages", () => {
  const normalized = normalizeBrief({
    project: eqvilentProjectMeta,
    parsedBrief: eqvilentParsedBrief,
    geometry: eqvilentGeometry,
    elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
  });

  it("returns all 5 named outputs", () => {
    const out = composePrompt(normalized);
    expect(out.briefJson).toBeDefined();
    expect(typeof out.geometrySummary).toBe("string");
    expect(typeof out.renderer).toBe("string");
    expect(typeof out.negative).toBe("string");
    expect(Array.isArray(out.compliance)).toBe(true);
  });

  it("renderer prompt leads with # SCENE and # GEOMETRY", () => {
    const out = composePrompt(normalized);
    const lines = out.renderer.split("\n").filter((l) => l.startsWith("#"));
    expect(lines[0]).toBe("# SCENE");
    expect(lines[1]).toBe("# GEOMETRY (ground truth — all elements must obey)");
  });

  it("renderer prompt never includes poetic zone names", () => {
    const out = composePrompt(normalized);
    expect(out.renderer).not.toContain("Central Architectural Hub");
    expect(out.renderer).not.toContain("Relaxed Consultation Area");
    expect(out.renderer).not.toContain("Brand Narrative Wall");
  });

  it("renderer prompt includes # STRUCTURAL APPROACH when visualLanguage present", () => {
    const out = composePrompt(normalized);
    expect(out.renderer).toContain("# STRUCTURAL APPROACH");
    expect(out.renderer.toLowerCase()).toContain("waves");
    expect(out.renderer.toLowerCase()).toContain("lines");
  });

  it("emits coordinate layout with x/y/w/d in geometry units", () => {
    const out = composePrompt(normalized);
    expect(out.renderer).toContain("# COORDINATE LAYOUT");
    expect(out.renderer).toContain("Origin: front-left corner");
    expect(out.renderer).toMatch(/x=1\.75/); // hero zone x
  });

  it("includes HARD CONSTRAINTS with footprint and signage rules", () => {
    const out = composePrompt(normalized);
    expect(out.renderer).toContain("# HARD CONSTRAINTS");
    expect(out.renderer).toMatch(/Footprint: exactly 6 × 6 metric/);
    expect(out.renderer).toContain("Eqvilent");
    expect(out.renderer).toContain("Quantitative trading");
  });

  it("renderer prompt geometry appears exactly once (no duplication)", () => {
    const out = composePrompt(normalized);
    const widthMentions = out.renderer.match(/Footprint: 6 × 6 metric/g) ?? [];
    expect(widthMentions.length).toBe(1);
  });

  it("design intent is capped at 300 chars", () => {
    const out = composePrompt(normalized);
    const intentMatch = out.renderer.match(/# DESIGN INTENT\n([\s\S]+?)\n#/);
    if (intentMatch) {
      expect(intentMatch[1].length).toBeLessThanOrEqual(300);
    }
  });

  it("negative output contains forbidden items", () => {
    const out = composePrompt(normalized);
    expect(out.negative).toContain("Bar stools and high cocktail tables");
  });

  it("compliance array matches validateBrief failures", () => {
    const out = composePrompt(normalized);
    expect(out.compliance.length).toBeGreaterThan(0);
    expect(out.compliance.some((c) => c.id === "footprint_match")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: 10 new tests fail with "composePrompt is not a function".

- [ ] **Step 3: Implement `composePrompt`**

Append to `src/lib/normalizedBrief.ts`:

```ts
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

function geometrySummary(g: NormalizedBriefGeometry): string {
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

  // # STRUCTURAL APPROACH
  if (n.creative.visualLanguage.length > 0 || n.hero.physicalForm.length > 0 || n.creative.embrace.length > 0) {
    const sa: string[] = ["# STRUCTURAL APPROACH"];
    sa.push(
      "This section defines the booth's actual architecture — its physical form. The brand's visual language must be expressed AS the structure (canopy shape, fascia geometry, column form, surface curvature), NOT as surface decoration. The structure IS a sculptural form; brand graphics are secondary.",
    );
    if (n.creative.visualLanguage.length > 0) {
      sa.push(`Brand visual language to express AS architecture: ${n.creative.visualLanguage.join(", ")}.`);
    }
    if (n.creative.referenceLabels.length > 0) {
      sa.push(`Reference themes: ${n.creative.referenceLabels.join(" · ")}.`);
    }
    if (n.hero.physicalForm.length > 0) {
      sa.push(`Authored hero physical form: ${n.hero.physicalForm}. This is the dominant architectural element.`);
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
    ctxLines.push(`Venue: ${n.context.venue.name}, ${n.context.venue.type.replace(/_/g, " ")}, ${n.context.venue.ambientLight.replace(/_/g, " ")}`);
  }
  if (n.context.audience.length > 0) {
    ctxLines.push(`Audience: ${n.context.audience.join(", ")}`);
  }
  ctxLines.push(`Time of day: ${n.context.timeOfDay}`);
  ctxLines.push(`Staffing: ${n.context.staffing.count} ${n.context.staffing.attire.replace(/_/g, " ")}, roles: ${n.context.staffing.roles.join(", ")}`);
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
  hc.push(`- Footprint: exactly ${formatNumber(n.geometry.width)} × ${formatNumber(n.geometry.depth)} ${n.geometry.units}`);
  hc.push(`- Open sides: ${n.geometry.openSides}, unobstructed and visible`);
  const sigContents = n.signage.required.map((s) => `"${s.content}"`).join(" + ");
  if (sigContents) hc.push(`- Required signage visible: ${sigContents}`);
  hc.push(`- Hero scale: ≤ ${Math.round(n.geometry.maxObjectSizePctOfFootprint * 100)}% of footprint`);
  if (n.creative.forbiddenItems.length > 0) {
    hc.push(`- Forbidden items: ${n.creative.forbiddenItems.join(", ")}`);
  }
  sections.push(hc.join("\n"));

  // Negative concatenated at end (gpt-image-2 has no separate negative input)
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
    geometrySummary: geometrySummary(normalized.geometry),
    renderer,
    negative,
    compliance: failures,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all composer tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "feat(prompt-engine): implement composePrompt with 5 output stages"
```

---

### Task 7: `composeViewPrompt()` — hero-derived view rendering

**Files:**
- Modify: `src/lib/normalizedBrief.ts`
- Modify: `src/lib/normalizedBrief.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
import { composeViewPrompt } from "./normalizedBrief";
import type { HeroSnapshot } from "./normalizedBrief";

describe("composeViewPrompt — views derive from heroSnapshot", () => {
  const normalized = normalizeBrief({
    project: eqvilentProjectMeta,
    parsedBrief: eqvilentParsedBrief,
    geometry: eqvilentGeometry,
    elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
  });
  const heroComposer = composePrompt(normalized);
  const heroSnapshot: HeroSnapshot = {
    composerOutput: heroComposer,
    normalizedBrief: normalized,
    imageUrl: "https://example.test/hero.png",
    generatedAt: "2026-05-14T10:00:00Z",
  };

  it("returns ComposerOutput for an exterior angle", () => {
    const out = composeViewPrompt(heroSnapshot, "front");
    expect(typeof out.renderer).toBe("string");
    expect(out.renderer).toContain("# SCENE");
    expect(out.renderer).toContain("# REFERENCE (from hero render");
  });

  it("front view scene mentions front-elevation camera", () => {
    const out = composeViewPrompt(heroSnapshot, "front");
    expect(out.renderer.toLowerCase()).toMatch(/front[- ]elevation|front face|head-on/);
  });

  it("interior view scene mentions standing inside a zone", () => {
    const out = composeViewPrompt(heroSnapshot, "interior", { zoneId: "hero" });
    expect(out.renderer.toLowerCase()).toContain("standing inside");
    expect(out.renderer.toLowerCase()).toContain("hero focal area");
  });

  it("never re-emits the full # GEOMETRY block — geometry is referenced from hero", () => {
    const out = composeViewPrompt(heroSnapshot, "front");
    // Geometry should be implied by the hero reference, not re-stated as ground truth
    const geomHeaders = out.renderer.match(/# GEOMETRY \(ground truth/g) ?? [];
    expect(geomHeaders.length).toBe(0);
  });

  it("forbids architectural reinvention in CONSTRAINTS", () => {
    const out = composeViewPrompt(heroSnapshot, "side_left");
    expect(out.renderer).toMatch(/identical to hero/i);
    expect(out.renderer).toMatch(/no architectural reinvention|no palette shifts/i);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement `composeViewPrompt` + `HeroSnapshot`**

Append to `src/lib/normalizedBrief.ts`:

```ts
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

  const zoneForFocus = opts.zoneId
    ? n.zones.find((z) => z.id === opts.zoneId)
    : undefined;

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

  // Negative — concatenated
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
```

- [ ] **Step 4: Run all tests**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all tests pass (~25 total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "feat(prompt-engine): implement composeViewPrompt deriving from heroSnapshot"
```

---

## Phase 3 — Edge function refactor (PRODUCTION GOES LIVE at end of this phase)

### Task 8: DB migration — add `prompt_artifacts` column to project_images

**Files:**
- Create: `supabase/migrations/20260514000000_prompt_artifacts.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260514000000_prompt_artifacts.sql
--
-- Add prompt_artifacts JSONB column to project_images so we can persist
-- the full ComposerOutput (5 stages: briefJson, geometrySummary,
-- renderer, negative, compliance) alongside each render. Used as the
-- heroSnapshot contract — auxiliary views read from project_images
-- where angle_id = 'hero_34' and pull the snapshot for composition.

ALTER TABLE public.project_images
  ADD COLUMN IF NOT EXISTS prompt_artifacts JSONB;

COMMENT ON COLUMN public.project_images.prompt_artifacts IS
  'ComposerOutput JSON for this render — { briefJson, geometrySummary, renderer, negative, compliance }. Hero renders also include the normalized brief snapshot, used as heroSnapshot by auxiliary view composition.';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

```
mcp__bd13ad03-...__apply_migration  name="prompt_artifacts"  query=<contents of file above>
```

Or via local Supabase CLI: `supabase db push`.

Expected: migration applies cleanly, column is queryable.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514000000_prompt_artifacts.sql
git commit -m "feat(prompt-engine): add prompt_artifacts column to project_images"
```

---

### Task 9: Edge function — `generate-hero` accepts pre-composed renderer text

**Files:**
- Modify: `supabase/functions/generate-hero/index.ts`

- [ ] **Step 1: Add `composedPrompt` field to request interface, deprecate internal composer**

Locate the `GenerateHeroRequest` interface in `supabase/functions/generate-hero/index.ts` and add the new field at the top of the interface:

```ts
interface GenerateHeroRequest {
  /**
   * NEW (Phase 3 of prompt-engine refactor): the pre-composed renderer
   * prompt produced by the client's composePrompt(normalizedBrief).
   * When present, the edge function uses this verbatim and skips its
   * internal structured-prompt builder. The old `prompt` field is still
   * accepted for backward compatibility but is treated as the input to
   * the deprecated path.
   */
  composedPrompt?: {
    renderer: string;
    negative: string;
    /**
     * The full ComposerOutput JSON. Persisted to
     * project_images.prompt_artifacts so auxiliary views can read the
     * hero snapshot when composing themselves.
     */
    artifacts: {
      briefJson: unknown;
      geometrySummary: string;
      renderer: string;
      negative: string;
      compliance: unknown[];
    };
  };

  prompt: string; // legacy path — kept for backward compat
  // ... rest of existing fields ...
}
```

- [ ] **Step 2: Bump deploy token + branch logic**

Change the top-of-file deploy token comment:

```ts
// generate-hero — DEPLOY TOKEN: 2026-05-14-composer-driven
```

Locate the prompt-assembly section (the one that calls `buildStructuredHeroPrompt`) and replace it with:

```ts
// Composer-driven path. When the client sent `composedPrompt`, use its
// renderer text verbatim — no edge-side prompt assembly. This is the
// new pipeline; the inline builder below is kept only for legacy
// callers that haven't migrated yet.
let flattenedPrompt: string;
if (body.composedPrompt && body.composedPrompt.renderer) {
  flattenedPrompt = body.composedPrompt.renderer;
  console.log(`[generate-hero] Using client-composed renderer prompt (${flattenedPrompt.length} chars)`);
} else if (previousImageUrl && feedback) {
  // ── EDIT MODE (legacy preserved as-is) ──
  flattenedPrompt = `IMAGE EDIT TASK — NOT A REGENERATION
[... existing edit-mode prompt unchanged ...]`;
} else {
  // ── LEGACY composer path (kept until all clients migrate) ──
  const structured = buildStructuredHeroPrompt(body, { ragBlock });
  flattenedPrompt = prompt && prompt.trim().length > 50
    ? `${structured}\n\n# NARRATIVE CONTEXT (additional designer prose)\n${prompt.slice(0, 1500).trim()}`
    : structured;
}
```

- [ ] **Step 3: Persist `prompt_artifacts` after successful render**

Locate the response-success block (where `generatedImageUrl` is built and the function returns). Before the `return new Response(...)`, add the artifact persistence:

```ts
// Persist composer output to project_images.prompt_artifacts so views
// can read it as heroSnapshot. This is the contract between hero and
// auxiliary view renders — views derive from this object.
if (body.composedPrompt?.artifacts && body.project_id) {
  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await adminClient
      .from("project_images")
      .update({ prompt_artifacts: body.composedPrompt.artifacts })
      .eq("project_id", body.project_id)
      .eq("angle_id", "hero_34")
      .eq("is_current", true);
  } catch (e) {
    console.warn("[generate-hero] failed to persist prompt_artifacts:", e);
  }
}
```

- [ ] **Step 4: Type-check via Deno**

Run: `deno check supabase/functions/generate-hero/index.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-hero/index.ts
git commit -m "feat(prompt-engine): generate-hero accepts pre-composed renderer + persists heroSnapshot"
```

---

### Task 10: Edge function — `generate-view` accepts pre-composed renderer text

**Files:**
- Modify: `supabase/functions/generate-view/index.ts`

- [ ] **Step 1: Add `composedPrompt` field, bump deploy token**

Top of file:

```ts
// generate-view — DEPLOY TOKEN: 2026-05-14-composer-driven
```

Add to `GenerateViewRequest`:

```ts
/**
 * NEW (Phase 3 of prompt-engine refactor): pre-composed renderer
 * prompt produced by the client via composeViewPrompt(heroSnapshot,
 * angle). When present, the edge function uses this verbatim and
 * skips its internal builder. Legacy fields remain for backward
 * compat.
 */
composedPrompt?: { renderer: string; negative: string };
```

- [ ] **Step 2: Branch on composedPrompt in the prompt-assembly section**

Replace the `const editPrompt = buildStructuredViewPrompt(...)` call with:

```ts
let editPrompt: string;
if (body.composedPrompt && body.composedPrompt.renderer) {
  editPrompt = body.composedPrompt.renderer;
  console.log(`[generate-view] Using client-composed renderer prompt for ${viewName} (${editPrompt.length} chars)`);
} else {
  editPrompt = buildStructuredViewPrompt({
    req: body,
    isInterior,
    zoneName,
    cameraDir,
    heroPromptText,
    ragBlock,
    consistencyTokens,
  });
}
```

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/generate-view/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-view/index.ts
git commit -m "feat(prompt-engine): generate-view accepts pre-composed renderer"
```

---

### Task 11: renderStore — accept composer output + heroSnapshot for views

**Files:**
- Modify: `src/store/renderStore.ts`

- [ ] **Step 1: Add `composedPrompt` to action params**

Open `src/store/renderStore.ts`. Find the `generateHeroImage` action signature and add a `composedPrompt` field:

```ts
generateHeroImage: (params: {
  // ... existing fields ...
  /**
   * Pre-composed renderer prompt + artifacts from composePrompt().
   * When present, the edge function uses it verbatim. Required for
   * the new pipeline; the old `prompt` field becomes a fallback.
   */
  composedPrompt?: {
    renderer: string;
    negative: string;
    artifacts: import("@/lib/normalizedBrief").ComposerOutput;
  };
  prompt: string;
  // ... rest unchanged ...
}) => Promise<void>;
```

Do the same for `generateAllViews`, `regenerateView`, **and** `cascadeRegenerateViews` — all three view-generating actions need the same field:

```ts
/**
 * Per-angle composed prompts. Keys are angle ids; values are the
 * output of composeViewPrompt(heroSnapshot, angle). When present, the
 * edge function uses the renderer verbatim per-view.
 */
composedPrompts?: Record<string, { renderer: string; negative: string }>;
```

- [ ] **Step 2: Forward `composedPrompt` to edge functions**

In `generateHeroImage` action implementation, where `body` is built:

```ts
const body: Record<string, unknown> = {
  prompt,                          // legacy fallback
  composedPrompt: composedPrompt   // new path
    ? { renderer: composedPrompt.renderer, negative: composedPrompt.negative, artifacts: composedPrompt.artifacts }
    : undefined,
  // ... rest unchanged ...
};
```

In all three view actions (`generateAllViews`, `regenerateView`, `cascadeRegenerateViews`), when building `viewBody`:

```ts
viewBody.composedPrompt = composedPrompts?.[angle.id]
  ? { renderer: composedPrompts[angle.id].renderer, negative: composedPrompts[angle.id].negative }
  : undefined;
```

- [ ] **Step 3: Type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Expected: zero output.

- [ ] **Step 4: Commit**

```bash
git add src/store/renderStore.ts
git commit -m "feat(prompt-engine): renderStore forwards composedPrompt to edge functions"
```

---

### Task 12: PromptGenerator — call normalize → validate → compose

**Files:**
- Modify: `src/components/prompts/PromptGenerator.tsx`

- [ ] **Step 1: Import new helpers**

At top of `PromptGenerator.tsx`:

```ts
import {
  normalizeBrief,
  validateBrief,
  composePrompt,
  composeViewPrompt,
  type HeroSnapshot,
  type ViewAngle,
} from "@/lib/normalizedBrief";
```

- [ ] **Step 2: Build normalized brief + composer output as a memo**

Add after the existing `designContext` memo:

```ts
// New pipeline (Phase 3 of prompt-engine refactor): build the
// normalized brief, validate it, and compose the renderer prompt.
// The composer output is the contract sent to the edge function via
// renderStore.generateHeroImage({ composedPrompt: { ... } }).
const composerInput = useMemo(() => {
  if (!brief || !currentProject) return null;
  return normalizeBrief({
    project: {
      id: currentProject.id,
      name: currentProject.name,
      projectType: currentProject.projectType ?? "exhibition_booth",
    },
    parsedBrief: brief,
    geometry,
    elements,
  });
}, [brief, currentProject, geometry, elements]);

const composerOutput = useMemo(() => {
  if (!composerInput) return null;
  return composePrompt(composerInput);
}, [composerInput]);

const validation = useMemo(() => {
  if (!composerInput) return { failures: [], gaps: [] };
  return validateBrief(composerInput);
}, [composerInput]);
```

- [ ] **Step 3: Forward composedPrompt to renderStore.generateHeroImage**

In `handleGenerateHeroImage`, where `renderStore.generateHeroImage({ ... })` is called, add:

```ts
await renderStore.generateHeroImage({
  prompt,
  composedPrompt: composerOutput
    ? {
        renderer: composerOutput.renderer,
        negative: composerOutput.negative,
        artifacts: composerOutput,
      }
    : undefined,
  // ... rest unchanged ...
});
```

- [ ] **Step 4: Build per-view composedPrompts using heroSnapshot**

In `handleGenerateAllViews`, before calling `renderStore.generateAllViews(...)`:

```ts
const composedViewPrompts: Record<string, { renderer: string; negative: string }> = {};
if (composerOutput && heroImage) {
  const heroSnapshot: HeroSnapshot = {
    composerOutput,
    normalizedBrief: composerInput!,
    imageUrl: heroImage,
    generatedAt: new Date().toISOString(),
  };
  for (const angle of allAngles) {
    if (angle.id === "hero_34") continue;
    const viewAngle: ViewAngle = mapAngleIdToViewAngle(angle.id);
    // Zone-interior angles encode the zoneId in their angle.id
    // ("zone_interior_<zoneId>"). Strip the prefix to pass it to the
    // composer. Detail angles (detail_hero / detail_lounge) resolve
    // their zone by keyword inside the composer, so no zoneId needed.
    const zoneId = angle.id.startsWith("zone_interior_")
      ? angle.id.slice("zone_interior_".length)
      : undefined;
    const viewOut = composeViewPrompt(heroSnapshot, viewAngle, { zoneId });
    composedViewPrompts[angle.id] = {
      renderer: viewOut.renderer,
      negative: viewOut.negative,
    };
  }
}
```

Add helper near top of file (above the component):

```ts
function mapAngleIdToViewAngle(angleId: string): ViewAngle {
  if (angleId === "front") return "front";
  if (angleId === "left") return "side_left";
  if (angleId === "right") return "side_right";
  if (angleId === "back") return "back";
  if (angleId === "top") return "top";
  if (angleId === "detail_hero" || angleId === "detail_lounge") return "detail";
  if (angleId.startsWith("zone_interior_")) return "interior";
  return "front"; // safe fallback
}
```

Then in the `renderStore.generateAllViews(...)` call:

```ts
renderStore.generateAllViews({
  // ... existing fields ...
  composedPrompts: composedViewPrompts,
});
```

- [ ] **Step 5: Type-check**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Expected: zero output.

- [ ] **Step 6: Commit**

```bash
git add src/components/prompts/PromptGenerator.tsx
git commit -m "feat(prompt-engine): PromptGenerator wires new compose pipeline through to renderStore"
```

---

### Task 13: Manual verification on Eqvilent + US Cabinet Depot

**Files:**
- None (verification only)

- [ ] **Step 1: Run a hero generation on Eqvilent project in dev**

Run: `npm run dev`
In browser: open Eqvilent project → Prompts step → click Generate hero.
Open the Network panel; locate the POST to `/functions/v1/generate-hero`.
Expected: request body contains `composedPrompt.renderer` starting with `# SCENE`.

- [ ] **Step 2: Check the rendered image**

Confirm:
- No "Z1 / Z2 / Z3" labels on fascia
- No "The Sanctuary / Hearth / Retreat" wayfinding signs
- Booth has organic / sculptural form (not flat rectangular pavilion)
- Eqvilent wordmark + "Quantitative trading" descriptor visible

If any of these fail, capture the actual renderer prompt sent (Network panel) and the rendered image, file as a regression, and iterate before declaring Phase 3 done.

- [ ] **Step 3: Run all views from the same Eqvilent hero**

Click Generate all views. After completion:
- Front view: same booth, head-on
- Back view: finished branded back, not service area
- Side views: same materials/palette as hero
- Interior views: room scale, matching hero materials
- Detail views: zone-focused, no wayfinding bleed

- [ ] **Step 4: Repeat for US Cabinet Depot**

Same drill. Specifically verify:
- The five room-set zones don't render as labeled rooms
- Kitchen island (hero) is the focal point
- Lounge zone has armchairs, not bar stools

- [ ] **Step 5: Inspect project_images.prompt_artifacts**

Run via Supabase SQL editor:

```sql
SELECT angle_id, prompt_artifacts->'compliance' AS compliance
FROM project_images
WHERE project_id = '<eqvilent project id>'
ORDER BY created_at DESC LIMIT 5;
```

Expected: hero row has non-null prompt_artifacts; compliance lists the 6 HardConstraint statuses.

- [ ] **Step 6: PRODUCTION GOES LIVE — tag this commit**

```bash
git tag -a v-prompt-engine-live -m "Prompt engine refactor: new compose pipeline live for hero + views"
```

---

## Phase 4 — Interactive clarification UI

### Task 14: BriefClarification component

**Files:**
- Create: `src/components/prompts/BriefClarification.tsx`
- Create: `src/components/prompts/BriefClarification.test.tsx`

- [ ] **Step 1: Write a failing test**

```tsx
// src/components/prompts/BriefClarification.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefClarification } from "./BriefClarification";
import type { Gap } from "@/lib/normalizedBrief";

const gaps: Gap[] = [
  {
    field: "context.venue.name",
    severity: "blocking",
    question: "Where will this booth be shown?",
    fallback: "Unknown venue",
    source: "schema",
  },
  {
    field: "context.audience",
    severity: "helpful",
    question: "Who's the primary audience?",
    options: ["B2B execs", "Designers", "Consumers"],
    fallback: ["general"],
    source: "schema",
  },
];

describe("BriefClarification", () => {
  it("renders one card per gap", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    expect(screen.getByText("Where will this booth be shown?")).toBeInTheDocument();
    expect(screen.getByText("Who's the primary audience?")).toBeInTheDocument();
  });

  it("renders quick-pick chips when options are present", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole("button", { name: "B2B execs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Designers" })).toBeInTheDocument();
  });

  it("calls onAnswer with field + value when chip clicked", () => {
    const onAnswer = vi.fn();
    render(<BriefClarification gaps={gaps} onAnswer={onAnswer} onSkip={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Designers" }));
    expect(onAnswer).toHaveBeenCalledWith("context.audience", "Designers");
  });

  it("calls onSkip with the field when skip clicked", () => {
    const onSkip = vi.fn();
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={onSkip} />);
    const skipButtons = screen.getAllByText(/skip/i);
    fireEvent.click(skipButtons[0]);
    expect(onSkip).toHaveBeenCalledWith("context.venue.name");
  });

  it("prioritizes blocking gaps before helpful gaps", () => {
    render(<BriefClarification gaps={gaps} onAnswer={() => {}} onSkip={() => {}} />);
    const cards = screen.getAllByRole("group");
    expect(cards[0]).toHaveTextContent("Where will this booth");
    expect(cards[1]).toHaveTextContent("Who's the primary audience");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `./node_modules/.bin/vitest run src/components/prompts/BriefClarification.test.tsx`
Expected: 5 tests fail with "Cannot find module".

- [ ] **Step 3: Implement the component**

```tsx
// src/components/prompts/BriefClarification.tsx
//
// Shared gap-question UI. Mounted at the Brief Review step (primary)
// and the Prompts step (safety net). Renders one card per gap; on
// answer, calls onAnswer(field, value); on skip, calls onSkip(field).
// The host component handles writing the answer back to parsedBrief
// and re-running validateBrief.

import { useState } from "react";
import type { Gap } from "@/lib/normalizedBrief";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface BriefClarificationProps {
  gaps: Gap[];
  onAnswer: (field: string, value: unknown) => void;
  onSkip: (field: string) => void;
  /** Max visible gaps before collapsing remaining behind a "show all" toggle. Default 5. */
  visibleCap?: number;
}

export function BriefClarification({
  gaps,
  onAnswer,
  onSkip,
  visibleCap = 5,
}: BriefClarificationProps) {
  const [showAll, setShowAll] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Blocking first, then helpful.
  const sorted = [...gaps].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1,
  );
  const visible = showAll ? sorted : sorted.slice(0, visibleCap);
  const hiddenCount = sorted.length - visible.length;

  if (gaps.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">A few clarifications to sharpen the brief</h3>
        <Badge variant="outline">{gaps.length}</Badge>
      </div>
      {visible.map((gap) => (
        <Card key={gap.field} role="group">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{gap.question}</p>
              <Badge
                variant={gap.severity === "blocking" ? "destructive" : "secondary"}
                className="text-xs"
              >
                {gap.severity}
              </Badge>
            </div>
            {gap.options && gap.options.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {gap.options.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onAnswer(gap.field, opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Type your answer…"
                  value={drafts[gap.field] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [gap.field]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (drafts[gap.field] ?? "").trim().length > 0) {
                      onAnswer(gap.field, drafts[gap.field]);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!(drafts[gap.field] ?? "").trim()}
                  onClick={() => onAnswer(gap.field, drafts[gap.field])}
                >
                  Save
                </Button>
              </div>
            )}
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSkip(gap.field)}
            >
              Skip with default
            </button>
          </CardContent>
        </Card>
      ))}
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show {hiddenCount} more
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `./node_modules/.bin/vitest run src/components/prompts/BriefClarification.test.tsx`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/prompts/BriefClarification.tsx src/components/prompts/BriefClarification.test.tsx
git commit -m "feat(prompt-engine): add BriefClarification component for gap resolution"
```

---

### Task 15: Mount BriefClarification on Brief Review step

**Files:**
- Modify: whichever component renders the brief review step (locate via `grep -l "parsedBrief" src/components/brief/`)

- [ ] **Step 1: Locate the brief review host component**

Run: `grep -rln "parsedBrief" src/components/brief/ | head -5`
Identify the component that shows the parsed brief after upload.

- [ ] **Step 2: Wire BriefClarification**

In that component, near the top render:

```tsx
import { BriefClarification } from "@/components/prompts/BriefClarification";
import { normalizeBrief, validateBrief } from "@/lib/normalizedBrief";

// inside the component:
const normalized = useMemo(() => {
  if (!parsedBrief || !geometry) return null;
  return normalizeBrief({
    project: { id: projectId, name: projectName, projectType },
    parsedBrief,
    geometry,
    elements,
  });
}, [parsedBrief, geometry, projectId, projectName, projectType, elements]);

const gaps = useMemo(() => normalized ? validateBrief(normalized).gaps : [], [normalized]);

const handleAnswer = useCallback((field: string, value: unknown) => {
  applyGapAnswer(parsedBrief, field, value, updateParsedBrief);
}, [parsedBrief, updateParsedBrief]);

const handleSkip = useCallback((field: string) => {
  const gap = gaps.find((g) => g.field === field);
  if (gap) applyGapAnswer(parsedBrief, field, gap.fallback, updateParsedBrief);
}, [parsedBrief, gaps, updateParsedBrief]);
```

Render the component:

```tsx
{gaps.length > 0 && (
  <BriefClarification gaps={gaps} onAnswer={handleAnswer} onSkip={handleSkip} />
)}
```

- [ ] **Step 3: Add the `applyGapAnswer` helper**

Add to `src/lib/normalizedBrief.ts`:

```ts
/**
 * Write a gap answer back to the ParsedBrief by dot-path. Centralizes
 * the field → parsedBrief mapping so the host doesn't have to know
 * the parsedBrief shape. Mutates a clone and passes it back; never
 * mutates the input.
 */
export function applyGapAnswer(
  brief: import("@/types/brief").ParsedBrief,
  field: string,
  value: unknown,
  setBrief: (next: import("@/types/brief").ParsedBrief) => void,
): void {
  const next = structuredClone(brief);
  switch (field) {
    case "context.venue.name":
      // Map to events.shows[0].location, creating the show entry if needed.
      if (next.events.shows.length === 0) {
        next.events.shows.push({ name: "Unknown", location: String(value) });
      } else {
        next.events.shows[0].location = String(value);
      }
      break;
    case "context.audience":
      next.audiences = next.audiences.length > 0
        ? next.audiences
        : [{ name: String(value), description: "", priority: 1, characteristics: [], engagementNeeds: "" }];
      if (next.audiences[0]) next.audiences[0].name = String(value);
      break;
    case "hero.physicalForm":
      // Stored on elements.interactiveMechanics.data.hero.physicalForm.structure
      // — this update isn't possible directly on ParsedBrief, so we
      // record it as a creative note instead. The host should pick
      // this up and persist via setElementData.
      next.creative.designPhilosophy = next.creative.designPhilosophy
        ? `${next.creative.designPhilosophy} | hero form: ${value}`
        : `hero form: ${value}`;
      break;
    case "brand.colors.hex":
      // Hex codes don't have an exact parsedBrief slot; store on brand.visualIdentity.colors
      // by appending hex in parens to the existing name.
      next.brand.visualIdentity.colors = next.brand.visualIdentity.colors.map((c, i) =>
        i === 0 ? `${c} (${value})` : c,
      );
      break;
    default:
      // For unknown fields, no-op for now — the field map grows as gaps grow.
      console.warn(`[applyGapAnswer] no mapping for field: ${field}`);
      return;
  }
  setBrief(next);
}
```

- [ ] **Step 4: Type-check + run component tests**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Run: `./node_modules/.bin/vitest run src/`
Expected: zero TS errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalizedBrief.ts src/components/brief/
git commit -m "feat(prompt-engine): mount BriefClarification on brief review step"
```

---

### Task 16: Mount BriefClarification on Prompts step (safety net)

**Files:**
- Modify: `src/components/prompts/PromptGenerator.tsx`

- [ ] **Step 1: Render clarification above Generate button when gaps exist**

In `PromptGenerator.tsx`, after the existing memos:

```tsx
import { BriefClarification } from "./BriefClarification";
import { applyGapAnswer } from "@/lib/normalizedBrief";

const handleClarificationAnswer = useCallback((field: string, value: unknown) => {
  if (!brief || !currentProject) return;
  applyGapAnswer(brief, field, value, (next) => {
    useProjectStore.getState().updateParsedBrief(currentProject.id, next);
  });
}, [brief, currentProject]);

const handleClarificationSkip = useCallback((field: string) => {
  const gap = validation.gaps.find((g) => g.field === field);
  if (gap && brief && currentProject) {
    applyGapAnswer(brief, field, gap.fallback, (next) => {
      useProjectStore.getState().updateParsedBrief(currentProject.id, next);
    });
  }
}, [validation.gaps, brief, currentProject]);
```

Render above the Generate hero button:

```tsx
{validation.gaps.length > 0 && (
  <BriefClarification
    gaps={validation.gaps}
    onAnswer={handleClarificationAnswer}
    onSkip={handleClarificationSkip}
  />
)}
```

- [ ] **Step 2: Type-check + visual smoke test**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Open a project with an incomplete brief in dev; verify clarification cards appear above the Generate button.

- [ ] **Step 3: Commit**

```bash
git add src/components/prompts/PromptGenerator.tsx
git commit -m "feat(prompt-engine): mount BriefClarification safety net on Prompts step"
```

---

## Phase 5 — Prompt debug panel

### Task 17: PromptDebugPanel component

**Files:**
- Create: `src/components/prompts/PromptDebugPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/prompts/PromptDebugPanel.tsx
//
// Collapsed-by-default panel on the Prompts step showing the 5
// composer output stages for the current hero composition. Each
// stage has a copy-to-clipboard button. Useful for understanding
// what's actually being sent to gpt-image-2 and why.

import { useState } from "react";
import type { ComposerOutput } from "@/lib/normalizedBrief";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";

export interface PromptDebugPanelProps {
  output: ComposerOutput | null;
}

export function PromptDebugPanel({ output }: PromptDebugPanelProps) {
  const [open, setOpen] = useState(false);
  if (!output) return null;

  const sections: Array<{ label: string; content: string }> = [
    { label: "A. Normalized Brief JSON", content: JSON.stringify(output.briefJson, null, 2) },
    { label: "B. Geometry Summary", content: output.geometrySummary },
    { label: "C. Renderer Prompt", content: output.renderer },
    { label: "D. Negative", content: output.negative },
    { label: "E. Compliance", content: JSON.stringify(output.compliance, null, 2) },
  ];

  return (
    <div className="border rounded-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Prompt Debug
      </button>
      {open && (
        <div className="p-3 space-y-3 border-t">
          {sections.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(s.content)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre className="text-xs bg-muted/30 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                {s.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in PromptGenerator**

In `PromptGenerator.tsx`, near the bottom of the prompts panel render:

```tsx
import { PromptDebugPanel } from "./PromptDebugPanel";

// in render, somewhere near the bottom of the Prompts step content:
<PromptDebugPanel output={composerOutput} />
```

- [ ] **Step 3: Type-check + visual smoke**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Open a project; expand the Prompt Debug section; verify all 5 stages render and copy-to-clipboard works.

- [ ] **Step 4: Commit**

```bash
git add src/components/prompts/PromptDebugPanel.tsx src/components/prompts/PromptGenerator.tsx
git commit -m "feat(prompt-engine): add PromptDebugPanel showing 5 composer output stages"
```

---

## Phase 6 — Project type migration + cleanup

### Task 18: DB migration for project_type vocabulary

**Files:**
- Create: `supabase/migrations/20260514000001_normalize_project_types.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260514000001_normalize_project_types.sql
--
-- Migrate project_type column to the 5 canonical values:
--   exhibition_booth | brand_activation | permanent_interior |
--   retail_environment | architectural_installation
-- Old values map forward; film_premiere + game_release_activation
-- collapse into brand_activation as the closest fit.

UPDATE public.projects SET project_type = CASE project_type
  WHEN 'trade_show_booth'         THEN 'exhibition_booth'
  WHEN 'live_brand_activation'    THEN 'brand_activation'
  WHEN 'permanent_installation'   THEN 'permanent_interior'
  WHEN 'architectural_brief'      THEN 'architectural_installation'
  WHEN 'film_premiere'            THEN 'brand_activation'
  WHEN 'game_release_activation'  THEN 'brand_activation'
  ELSE project_type
END
WHERE project_type IN (
  'trade_show_booth',
  'live_brand_activation',
  'permanent_installation',
  'architectural_brief',
  'film_premiere',
  'game_release_activation'
);

-- Drop the old CHECK constraint if it exists; add the new one.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN (
    'exhibition_booth',
    'brand_activation',
    'permanent_interior',
    'retail_environment',
    'architectural_installation'
  ));
```

- [ ] **Step 2: Apply migration**

Apply via Supabase MCP or `supabase db push`.

- [ ] **Step 3: Verify no rows violate the new constraint**

```sql
SELECT project_type, COUNT(*) FROM public.projects GROUP BY project_type;
```

Expected: all rows in the 5 canonical buckets.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514000001_normalize_project_types.sql
git commit -m "feat(prompt-engine): migrate project_type values to canonical 5"
```

---

### Task 19: parse-brief emits new project_type values

**Files:**
- Modify: `supabase/functions/parse-brief/index.ts`

- [ ] **Step 1: Locate where projectType is inferred/returned**

Run: `grep -n "project_type\|projectType" supabase/functions/parse-brief/index.ts | head -10`

- [ ] **Step 2: Replace the type-suggestion logic to emit the canonical 5**

Add a normalization helper near the top of the file:

```ts
type ProjectType =
  | "exhibition_booth"
  | "brand_activation"
  | "permanent_interior"
  | "retail_environment"
  | "architectural_installation";

function canonicalProjectType(raw: string | null | undefined): ProjectType {
  const map: Record<string, ProjectType> = {
    trade_show_booth: "exhibition_booth",
    live_brand_activation: "brand_activation",
    permanent_installation: "permanent_interior",
    architectural_brief: "architectural_installation",
    film_premiere: "brand_activation",
    game_release_activation: "brand_activation",
    exhibition_booth: "exhibition_booth",
    brand_activation: "brand_activation",
    permanent_interior: "permanent_interior",
    retail_environment: "retail_environment",
    architectural_installation: "architectural_installation",
  };
  return raw && map[raw] ? map[raw] : "exhibition_booth";
}
```

Wrap any projectType the function returns:

```ts
const projectType = canonicalProjectType(detectedType);
```

- [ ] **Step 3: Type-check**

Run: `deno check supabase/functions/parse-brief/index.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/parse-brief/index.ts
git commit -m "feat(prompt-engine): parse-brief emits canonical project_type values"
```

---

### Task 20: Update UI labels + remove deprecated files

**Files:**
- Modify: any UI where project_type is selected/displayed (locate)
- Delete: `src/lib/designContextBuilder.ts`
- Significantly trim: `src/lib/promptBuilder.ts`

- [ ] **Step 1: Update project type selector labels**

Run: `grep -rln "trade_show_booth\|live_brand_activation\|architectural_brief" src --include="*.tsx" --include="*.ts" | head -10`

For each surface, update the label map to:

```ts
const PROJECT_TYPE_LABELS: Record<string, string> = {
  exhibition_booth: "Exhibition booth",
  brand_activation: "Brand activation",
  permanent_interior: "Permanent interior",
  retail_environment: "Retail environment",
  architectural_installation: "Architectural installation",
};
```

Remove any references to the old values from the option lists.

- [ ] **Step 2: Delete designContextBuilder.ts**

The new pipeline subsumes its responsibilities.

```bash
git rm src/lib/designContextBuilder.ts
```

Then update any remaining importers — they should now import from `@/lib/normalizedBrief` instead. Run:

```
grep -rln "designContextBuilder" src --include="*.ts" --include="*.tsx"
```

Replace each importer to use `normalizeBrief` / `composePrompt` instead.

- [ ] **Step 3: Trim promptBuilder.ts**

Remove the now-unused functions:
- `generatePrompt` — replaced by `composePrompt`
- `generateZoneInteriorPrompt` — replaced by `composeViewPrompt` with `angle="interior"`
- `buildBriefComplianceBlock` — compliance is now in `ComposerOutput.compliance`

Keep only:
- `ANGLE_CONFIG` (still used by UI for angle metadata)
- `getCameraInstructions` if any UI surfaces still display camera notes

Run: `grep -n "from.*promptBuilder" src --include="*.ts" --include="*.tsx" -r | head -10` to find remaining importers and update.

- [ ] **Step 4: Full type-check + test run**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
Run: `./node_modules/.bin/vitest run`
Run: `deno check supabase/functions/generate-hero/index.ts supabase/functions/generate-view/index.ts supabase/functions/parse-brief/index.ts`

Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(prompt-engine): UI label cleanup; delete designContextBuilder; trim promptBuilder"
```

---

## Done

After Task 20, the prompt engine refactor is complete:
- All renders go through the new normalize → validate → compose pipeline
- Hero is the authoritative render; views derive from heroSnapshot
- Gaps surface as interactive clarification at brief upload and prompt generation
- Prompt Debug panel exposes all 5 composer stages
- Project type vocabulary is canonical
- Deprecated files removed; promptBuilder.ts trimmed

Run a final regression on Eqvilent + US Cabinet Depot to confirm renders match the success criteria in the spec.
