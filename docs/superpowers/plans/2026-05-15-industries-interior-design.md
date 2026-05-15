# Industries v2 + Interior Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow Canopy from a single working vertical (experiential) to a multi-vertical platform. Add Interior Design as the first new industry with its signature input mode: upload a photo of an existing space, annotate keep/change regions, brief drives the redesign. All without forking the shared normalizer / composer / render engine.

**Architecture:** Six surfaces touched in dependency order: (1) `BuiltinIndustry` interface extended with `briefSections` / `inputMode` / `defaultRenderAngles`, populated for all 6 industries; (2) `existingSpace` block on ParsedBrief + NormalizedBrief; (3) new `analyze-existing-space` edge function (Gemini 2.5 Pro vision); (4) new `BriefExistingSpace` component with photo upload + SVG annotation canvas; (5) composer dispatches on `inputMode` and emits an `existing-space-photo` prompt scaffold for ID; (6) generate-hero / generate-view branch to gpt-image-2 `/v1/images/edits` with the photo as source + optional alpha mask from "change" polygons. Industry `industry_slug` column on the projects table drives the dispatch. Spec at `docs/superpowers/specs/2026-05-15-industries-interior-design-design.md`.

**Tech Stack:** React 18 + Vite + TypeScript (strict) + Supabase + Deno edge functions. Vitest + jsdom for client tests. Existing fixture pattern (Eqvilent + US Cabinet Depot) extends with a new Interior Design fixture. SVG-based annotation canvas using pure React (no Konva — overlay-on-img is light enough for this).

---

## Task 1: Industries v2 schema — briefSections / inputMode / defaultRenderAngles

**Files:**
- Modify: `src/lib/builtinIndustries.ts` (extend interface + populate all 6 industries)
- Create: `src/lib/industryFields.ts` (BriefSectionId, RenderAngleId enums + helpers)
- Modify: `src/lib/builtinIndustries.test.ts` (or create) — schema completeness fixtures

- [ ] **Step 1: Write the failing test**

Create `src/lib/builtinIndustries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BUILTIN_INDUSTRIES, type BuiltinIndustry } from "./builtinIndustries";

describe("BUILTIN_INDUSTRIES", () => {
  it("has exactly 6 industries", () => {
    expect(BUILTIN_INDUSTRIES).toHaveLength(6);
  });

  it("includes interior_design", () => {
    const id = BUILTIN_INDUSTRIES.find((i) => i.slug === "interior_design");
    expect(id).toBeDefined();
    expect(id?.label).toMatch(/interior/i);
  });

  it.each(BUILTIN_INDUSTRIES.map((i) => i.slug))(
    "industry %s declares briefSections / inputMode / defaultRenderAngles",
    (slug) => {
      const i = BUILTIN_INDUSTRIES.find((x) => x.slug === slug)!;
      expect(i.briefSections.length).toBeGreaterThan(0);
      expect(["spatial-canvas", "existing-space-photo", "hybrid"]).toContain(i.inputMode);
      expect(i.defaultRenderAngles.length).toBeGreaterThan(0);
    },
  );

  it("interior_design uses existing-space-photo input mode", () => {
    const id = BUILTIN_INDUSTRIES.find((i) => i.slug === "interior_design")!;
    expect(id.inputMode).toBe("existing-space-photo");
    expect(id.briefSections).toContain("existing-space");
  });

  it("experiential keeps spatial-canvas input mode (backward compat)", () => {
    const ex = BUILTIN_INDUSTRIES.find((i) => i.slug === "experiential")!;
    expect(ex.inputMode).toBe("spatial-canvas");
    expect(ex.briefSections).toContain("spatial-zones");
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

```
./node_modules/.bin/vitest run src/lib/builtinIndustries.test.ts
```
Expected: 5 tests fail — the new fields don't exist yet on the interface.

- [ ] **Step 3: Create the field enums**

Create `src/lib/industryFields.ts`:

```ts
// Field enums shared by builtinIndustries.ts + BriefReview render logic.
// Living here (not inline in builtinIndustries) so the Brief Review page
// can import the BriefSectionId type without pulling in the full
// industries constant.

export const BRIEF_SECTION_IDS = [
  "brand",
  "audience",
  "objectives",
  "spatial-zones",
  "existing-space",
  "creative",
  "hero-installation",
  "signage",
  "hanging-elements",
  "finish-schedule",
  "furniture-inventory",
  "lighting-plan",
  "palette",
  "budget",
] as const;
export type BriefSectionId = typeof BRIEF_SECTION_IDS[number];

export const RENDER_ANGLE_IDS = [
  "hero_34",
  "front",
  "back",
  "left",
  "right",
  "top",
  "iso",
  "wide_shot",
  "focal_detail",
  "alternate_light",
  "before_after",
] as const;
export type RenderAngleId = typeof RENDER_ANGLE_IDS[number];

export const INPUT_MODES = [
  "spatial-canvas",
  "existing-space-photo",
  "hybrid",
] as const;
export type IndustryInputMode = typeof INPUT_MODES[number];
```

- [ ] **Step 4: Extend BuiltinIndustry interface**

In `src/lib/builtinIndustries.ts`, add imports at top:

```ts
import type { BriefSectionId, RenderAngleId, IndustryInputMode } from "./industryFields";
```

Extend the interface (insert above `BUILTIN_INDUSTRIES`):

```ts
export interface BuiltinIndustry {
  slug: string;
  label: string;
  description: string;
  icon: string;
  vocabulary: Record<string, string>;
  sort_order: number;
  /**
   * Which sections of the brief schema apply to projects in this
   * industry, in canonical display order. A section appearing here
   * means it shows up in Brief Review for projects tagged with
   * this industry. Sections NOT listed are hidden — they may still
   * exist in the schema (e.g. for cross-industry compat) but the
   * UI won't surface them for this vertical.
   */
  briefSections: BriefSectionId[];
  /**
   * Input mode used at project creation:
   * - "spatial-canvas" → existing zone-layout flow (experiential)
   * - "existing-space-photo" → interior design photo + annotation
   * - "hybrid" → user picks at project creation (architecture: renovation vs new build)
   * Drives which Spatial-step UI mounts.
   */
  inputMode: IndustryInputMode;
  /**
   * Default render angles populated on the Prompts step's view list.
   */
  defaultRenderAngles: RenderAngleId[];
}
```

- [ ] **Step 5: Populate all 6 industries**

Replace `BUILTIN_INDUSTRIES` with the full declaration. Existing entries gain the three new fields; interior_design is appended.

```ts
export const BUILTIN_INDUSTRIES: BuiltinIndustry[] = [
  {
    slug: "experiential",
    label: "Experiential & Trade Show",
    description: "Brand activations, trade show booths, pop-ups, event marketing.",
    icon: "Sparkles",
    vocabulary: {
      project_type: "Activation type",
      project_types: "Activation types",
      project: "Activation",
      projects: "Activations",
      deliverable: "Render package",
      render: "Booth render",
      spatial_plan: "Floor plan",
      brief: "Brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "spatial-zones", "hero-installation", "hanging-elements", "signage",
      "creative", "palette", "budget",
    ],
    inputMode: "spatial-canvas",
    defaultRenderAngles: ["hero_34", "front", "back", "left", "right", "top"],
    sort_order: 10,
  },
  {
    slug: "architecture",
    label: "Architecture & Construction",
    description: "Residential, commercial, hospitality, and civic buildings — new builds and renovations.",
    icon: "Building2",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Project",
      projects: "Projects",
      deliverable: "Drawing set",
      render: "Architectural rendering",
      spatial_plan: "Floor plan",
      brief: "Project brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "existing-space", "spatial-zones",
      "creative", "palette", "finish-schedule", "lighting-plan", "budget",
    ],
    inputMode: "hybrid",
    defaultRenderAngles: ["hero_34", "front", "iso", "focal_detail"],
    sort_order: 20,
  },
  {
    slug: "landscape",
    label: "Landscape & Site Design",
    description: "Gardens, parks, plazas, streetscapes, restoration, and site planning.",
    icon: "TreePine",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Site",
      projects: "Sites",
      deliverable: "Site plan package",
      render: "Site rendering",
      spatial_plan: "Site plan",
      brief: "Site brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "spatial-zones",
      "creative", "palette", "lighting-plan", "budget",
    ],
    inputMode: "spatial-canvas",
    defaultRenderAngles: ["hero_34", "top", "iso", "wide_shot"],
    sort_order: 30,
  },
  {
    slug: "interior_design",
    label: "Interior Design",
    description: "Residential, hospitality, restaurant, retail — redesigns of existing spaces.",
    icon: "Sofa",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Project",
      projects: "Projects",
      deliverable: "Concept package",
      render: "Concept render",
      spatial_plan: "Floor plan",
      brief: "Design brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "existing-space",
      "creative", "palette",
      "finish-schedule", "furniture-inventory", "lighting-plan", "budget",
    ],
    inputMode: "existing-space-photo",
    defaultRenderAngles: ["wide_shot", "focal_detail", "alternate_light", "before_after"],
    sort_order: 35,
  },
  {
    slug: "entertainment",
    label: "Entertainment & Production",
    description: "Film sets, stage design, event production, themed environments.",
    icon: "Film",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Production",
      projects: "Productions",
      deliverable: "Production package",
      render: "Set render",
      spatial_plan: "Set plan",
      brief: "Production brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "spatial-zones", "hero-installation", "hanging-elements",
      "creative", "palette", "lighting-plan", "budget",
    ],
    inputMode: "hybrid",
    defaultRenderAngles: ["hero_34", "wide_shot", "focal_detail", "alternate_light"],
    sort_order: 40,
  },
  {
    slug: "audio_visual",
    label: "Audio Visual & Broadcast",
    description: "Broadcast studios, control rooms, AV integration, immersive venues.",
    icon: "Speaker",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Build",
      projects: "Builds",
      deliverable: "Integration package",
      render: "Studio render",
      spatial_plan: "Floor plan",
      brief: "Integration brief",
      client: "Client",
    },
    briefSections: [
      "brand", "objectives", "audience",
      "spatial-zones",
      "creative", "lighting-plan", "budget",
    ],
    inputMode: "hybrid",
    defaultRenderAngles: ["hero_34", "front", "iso", "focal_detail"],
    sort_order: 50,
  },
];
```

- [ ] **Step 6: Run tests, verify pass**

```
./node_modules/.bin/vitest run src/lib/builtinIndustries.test.ts
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```
Expected: all 5 industry tests pass. Full suite still green. TS strict clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/builtinIndustries.ts src/lib/builtinIndustries.test.ts src/lib/industryFields.ts
git commit -m "$(cat <<'EOF'
feat(industries): v2 schema with briefSections + inputMode + render angles

Task 1 of the Industries v2 + Interior Design feature. Adds three
fields to BuiltinIndustry so each vertical declares which brief
cards to surface, which Spatial-step UI to mount, and which render
angles to populate by default.

- briefSections: ordered list of BriefSectionId, e.g. experiential
  has ["brand", "objectives", "audience", "spatial-zones",
  "hero-installation", "hanging-elements", "signage", ...].
- inputMode: "spatial-canvas" | "existing-space-photo" | "hybrid".
  Drives which Spatial-step UI mounts on a project. Existing 5
  industries keep their spatial-canvas behavior (architecture and
  audio_visual go hybrid since they support both new-build and
  renovation flows).
- defaultRenderAngles: per-industry default view list. Interior
  design uses wide_shot/focal_detail/alternate_light/before_after
  instead of the hero_34/front/back/sides set experiential uses.

Adds interior_design as the 6th built-in industry — the first to
declare inputMode "existing-space-photo". Its render pipeline lands
in later tasks; this task is the type + data layer.

New file industryFields.ts holds the BriefSectionId / RenderAngleId
/ IndustryInputMode literal-tuple enums so consumers (Brief Review,
project creation, composer) can type-check against them without
pulling in the full industries constant.

Test coverage: 5 tests asserting schema completeness for every
industry, interior_design presence, and backward compat for
experiential.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then `git pull --rebase origin main && git push origin main`. STOP on rebase conflicts.

---

## Task 2: ExistingSpace schema on ParsedBrief + NormalizedBrief

**Files:**
- Modify: `src/types/brief.ts` (add ParsedBriefExistingSpace + field on ParsedBrief)
- Modify: `src/lib/normalizedBrief.ts` (NormalizedBriefExistingSpace + normalizer + safeBrief default)
- Modify: `src/lib/normalizedBrief.test.ts` (3 tests)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
describe("existingSpace block (interior design)", () => {
  const samplePhoto = "https://example.com/photo.jpg";
  const sampleExistingSpace = {
    photoUrl: samplePhoto,
    annotations: {
      keep: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }] }],
      change: [{ points: [{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.9 }] }],
    },
    analysis: {
      estimatedDimensions: { width: 12, depth: 16, ceilingHeightFt: 9 },
      features: ["double-hung windows on north wall", "stone fireplace on east wall"],
      existingMaterials: { floors: "oak hardwood, original", walls: "off-white painted drywall" },
      lighting: { naturalLightDirection: "north" as const, timeOfDayInferred: "midday" as const },
      summary: "Bright 12' × 16' living room with original hardwood and a stone fireplace.",
    },
  };

  it("normalizes a parsed brief with an existingSpace block", () => {
    const parsed = { ...eqvilentParsedBrief, existingSpace: sampleExistingSpace } as unknown as typeof eqvilentParsedBrief;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(n.existingSpace).toBeDefined();
    expect(n.existingSpace?.photoUrl).toBe(samplePhoto);
    expect(n.existingSpace?.annotations.keep).toHaveLength(1);
    expect(n.existingSpace?.annotations.change).toHaveLength(1);
    expect(n.existingSpace?.analysis.features).toContain("stone fireplace on east wall");
  });

  it("returns existingSpace undefined when not in parsed brief", () => {
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(n.existingSpace).toBeUndefined();
  });

  it("auto-closes annotation polygons (last point ≠ first)", () => {
    // Parsed polygons may not be self-closed; the normalizer ensures
    // they are so downstream rasterization doesn't draw open paths.
    const openPolygon = {
      photoUrl: samplePhoto,
      annotations: {
        keep: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }], // 3 points, not closed
        change: [],
      },
      analysis: { features: [], existingMaterials: {}, lighting: {} },
    };
    const parsed = { ...eqvilentParsedBrief, existingSpace: openPolygon } as unknown as typeof eqvilentParsedBrief;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const poly = n.existingSpace?.annotations.keep[0];
    expect(poly?.points.length).toBe(4); // 3 + 1 closing duplicate
    expect(poly?.points[3]).toEqual(poly?.points[0]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```
./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts
```
Expected: 3 new tests fail.

- [ ] **Step 3: Add ParsedBriefExistingSpace type**

In `src/types/brief.ts`, add above the `ParsedBrief` interface:

```ts
export interface Polygon {
  /**
   * Closed polygon in NORMALIZED PHOTO COORDS (0..1 on each axis).
   * Normalization survives photo resizing; the same mask renders
   * correctly at any display size or for full-resolution mask
   * rasterization at render time.
   */
  points: Array<{ x: number; y: number }>;
  /** Optional user-typed label ("fireplace", "old flooring"). */
  label?: string;
}

export interface ParsedBriefExistingSpace {
  /**
   * Single canonical photo URL of the existing space. Stored in the
   * project-images bucket under existing-space/<projectId>/<ts>.<ext>.
   * Re-uploads replace; the previous URL is dropped from the brief
   * (storage cleanup happens via a separate sweep).
   */
  photoUrl: string;
  /** User-drawn keep/change annotations. */
  annotations: {
    /** Regions to preserve in the redesign (fixtures, windows, etc.). */
    keep: Polygon[];
    /** Regions the redesign should transform (flooring, paint, furniture). */
    change: Polygon[];
  };
  /**
   * Vision-model output. Auto-populated by analyze-existing-space on
   * photo upload; user-editable via BriefExistingSpace card.
   */
  analysis: {
    estimatedDimensions?: { width: number; depth: number; ceilingHeightFt: number };
    features: string[];
    existingMaterials: {
      floors?: string;
      walls?: string;
      ceiling?: string;
      trim?: string;
      [zone: string]: string | undefined;
    };
    lighting: {
      naturalLightDirection?: "north" | "south" | "east" | "west" | "skylight" | "none";
      existingFixtures?: string[];
      timeOfDayInferred?: "morning" | "midday" | "evening" | "night" | "controlled";
    };
    summary?: string;
  };
}
```

Add to the `ParsedBrief` interface:

```ts
existingSpace?: ParsedBriefExistingSpace;
```

- [ ] **Step 4: Add NormalizedBriefExistingSpace + normalizer**

In `src/lib/normalizedBrief.ts`, add above the `NormalizedBrief` interface:

```ts
export interface NormalizedBriefExistingSpace extends ParsedBriefExistingSpace {
  // Currently a pass-through. Reserved for future normalized-only
  // derived fields (e.g. rasterized mask URL, photo aspect ratio).
}
```

Add `existingSpace?: NormalizedBriefExistingSpace` to `NormalizedBrief`.

Import the parsed type:

```ts
import type { ParsedBriefExistingSpace, Polygon } from "@/types/brief";
```

Add a normalizer helper above `normalizeBrief`:

```ts
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
```

Wire into `normalizeBrief` (search for where `hanging.elements` was wired in Task 1 of the hanging feature; add this block right after):

```ts
const existingSpace: NormalizedBriefExistingSpace | undefined =
  parsedBrief.existingSpace && typeof parsedBrief.existingSpace.photoUrl === "string"
    ? normalizeExistingSpace(parsedBrief.existingSpace)
    : undefined;
```

Add `existingSpace,` to the returned object alongside `hanging`.

Update `safeBrief` to leave `existingSpace` as `undefined` when missing (don't fabricate one — its presence has semantic meaning).

- [ ] **Step 5: Run tests, verify pass**

```
./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```
Expected: all 3 new tests pass; full suite green; TS strict clean.

- [ ] **Step 6: Commit**

```bash
git add src/types/brief.ts src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "$(cat <<'EOF'
feat(existing-space): schema + normalizer for interior design input

Task 2 of the Industries v2 + Interior Design feature. Adds the
ParsedBriefExistingSpace block (photo URL + keep/change polygon
annotations + vision-model analysis) and its NormalizedBrief
counterpart.

- Polygon points are stored in normalized 0..1 coords so masks
  survive photo resizing.
- Normalizer auto-closes polygons whose last point ≠ first so
  downstream mask rasterization sees explicit closed paths.
- analysis (dimensions, features, materials, lighting, summary)
  is the structured-output target for analyze-existing-space (Task
  3) — pass-through here, all user-editable in Task 4's UI.
- existingSpace is INTENTIONALLY undefined when not present (no
  empty-shell default in safeBrief) — presence has semantic meaning
  ("this is an existing-space project"); absence ("this is a
  spatial-canvas project") must be distinguishable.

Test coverage: 3 tests covering populated normalization, undefined
default, and polygon auto-closure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Then `git pull --rebase origin main && git push origin main`.

---

## Task 3: `analyze-existing-space` edge function

**Files:**
- Create: `supabase/functions/analyze-existing-space/index.ts`
- Modify: `supabase/config.toml` (register the new function with `verify_jwt = true`)

- [ ] **Step 1: Create the edge function**

```ts
// analyze-existing-space — vision-model pass over an uploaded photo of
// an existing space. Returns structured analysis the BriefExistingSpace
// card surfaces (and lets the user edit).
//
// Called once per photo upload. Uses gemini-2.5-pro (with image_url
// parts via the existing ai-gateway). Re-runs cleanly on a re-upload
// — the client replaces the analysis block wholesale.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzeRequest {
  photoUrl: string;
}

const SYSTEM_PROMPT = `You are analyzing a photo of an interior space for redesign. Extract structured information about the existing space.

Be conservative. Only report what you can confidently see. Return null/empty for fields you can't determine — the user will fill in gaps via the brief.

Pay attention to:
- Approximate dimensions (width × depth × ceiling height in feet — estimate from human-scale objects, door heights, etc.)
- Architectural features that should be preserved or referenced (windows, fireplaces, exposed beams, built-ins)
- Existing materials on floors, walls, ceilings, trim
- Lighting: natural-light direction, existing fixtures, time of day inferred
- A one-sentence summary suitable for a designer's brief.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    estimatedDimensions: {
      type: "object",
      properties: {
        width: { type: "number" },
        depth: { type: "number" },
        ceilingHeightFt: { type: "number" },
      },
      required: ["width", "depth", "ceilingHeightFt"],
    },
    features: { type: "array", items: { type: "string" } },
    existingMaterials: {
      type: "object",
      properties: {
        floors: { type: "string" },
        walls: { type: "string" },
        ceiling: { type: "string" },
        trim: { type: "string" },
      },
    },
    lighting: {
      type: "object",
      properties: {
        naturalLightDirection: { type: "string", enum: ["north", "south", "east", "west", "skylight", "none"] },
        existingFixtures: { type: "array", items: { type: "string" } },
        timeOfDayInferred: { type: "string", enum: ["morning", "midday", "evening", "night", "controlled"] },
      },
    },
    summary: { type: "string" },
  },
  required: ["features", "existingMaterials", "lighting"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: AnalyzeRequest = await req.json();
    if (!body.photoUrl || typeof body.photoUrl !== "string") {
      return new Response(JSON.stringify({ error: "photoUrl is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callGemini({
      // deno-lint-ignore no-explicit-any
      model: "google/gemini-2.5-pro" as any,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this space and return the structured analysis matching the schema." },
            { type: "image_url", image_url: { url: body.photoUrl } },
          ],
          // deno-lint-ignore no-explicit-any
        } as any,
      ],
      // deno-lint-ignore no-explicit-any
      responseSchema: RESPONSE_SCHEMA as any,
      usage: await buildUsageContext(req, "analyze-existing-space").catch(() => undefined),
    });

    // callGemini returns { text, ... } — when responseSchema is supplied,
    // text contains the JSON-stringified structured output.
    let analysis: unknown = {};
    try {
      analysis = result.text ? JSON.parse(result.text) : {};
    } catch (e) {
      console.error("[analyze-existing-space] failed to parse model output:", e, "raw:", result.text);
      throw new Error("Vision model returned unparseable output");
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[analyze-existing-space] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to analyze photo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Verify callGemini supports responseSchema**

```
grep -n "responseSchema\|response_schema\|GeminiOptions" supabase/functions/_shared/ai-gateway.ts | head -10
```

If `callGemini` already supports `responseSchema` (it should — other parser-style edge functions use structured output), the code above works as-is. If not, the implementer must either extend `callGemini` to plumb `responseSchema` through to Google's `generationConfig.responseSchema`, OR fall back to prompting the model to return JSON and parsing without the schema. Document whichever path you take in the commit.

- [ ] **Step 3: Register the function**

In `supabase/config.toml`, add a new section (model on existing entries):

```toml
[functions.analyze-existing-space]
verify_jwt = true
```

- [ ] **Step 4: Deno typecheck**

```
deno check supabase/functions/analyze-existing-space/index.ts
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-existing-space/index.ts supabase/config.toml
git commit -m "$(cat <<'EOF'
feat(existing-space): analyze-existing-space edge function

Task 3 of the Industries v2 + Interior Design feature. New edge
function that runs a vision-model pass over an uploaded photo of
an existing space and returns structured analysis (dimensions,
features, materials, lighting, summary).

Called once per photo upload from the BriefExistingSpace card.
Uses gemini-2.5-pro via the existing ai-gateway with structured-
output schema matching ParsedBriefExistingSpace.analysis. The
model is instructed to be conservative — null/empty for anything
it can't confidently see — so the user always gets a clean
starting point to edit rather than hallucinated content.

Auth: verify_jwt = true (registered in supabase/config.toml).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BriefExistingSpace component (photo upload + annotation canvas + analysis panel)

**Files:**
- Create: `src/components/brief/BriefExistingSpace.tsx`
- Create: `src/components/brief/BriefExistingSpace.test.tsx`
- Create: `src/components/brief/PhotoAnnotationCanvas.tsx` (extracted child component — annotation surface only)
- Modify: `src/components/brief/BriefReview.tsx` (mount when industry.inputMode === "existing-space-photo")
- Modify: `src/components/spatial/SpatialPlanner.tsx` (delegate to BriefExistingSpace OR show a routing message when inputMode demands it)

- [ ] **Step 1: Write failing tests**

Create `src/components/brief/BriefExistingSpace.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefExistingSpace } from "./BriefExistingSpace";
import type { ParsedBriefExistingSpace } from "@/types/brief";

const SAMPLE: ParsedBriefExistingSpace = {
  photoUrl: "https://example.com/room.jpg",
  annotations: { keep: [], change: [] },
  analysis: {
    estimatedDimensions: { width: 12, depth: 16, ceilingHeightFt: 9 },
    features: ["windows on north wall"],
    existingMaterials: { floors: "oak hardwood" },
    lighting: { naturalLightDirection: "north" },
    summary: "12 × 16 living room, north-facing windows.",
  },
};

describe("BriefExistingSpace", () => {
  it("shows the empty state with an upload zone when no photo", () => {
    render(<BriefExistingSpace value={null} onChange={() => {}} projectId="p1" />);
    expect(screen.getByText(/upload.*photo|drop.*photo/i)).toBeInTheDocument();
  });

  it("renders the photo + analysis summary when populated", () => {
    render(<BriefExistingSpace value={SAMPLE} onChange={() => {}} projectId="p1" />);
    expect(screen.getByRole("img", { name: /existing space/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/12 × 16/i)).toBeInTheDocument();
  });

  it("calls onChange when the user edits the summary", () => {
    const onChange = vi.fn();
    render(<BriefExistingSpace value={SAMPLE} onChange={onChange} projectId="p1" />);
    const ta = screen.getByDisplayValue(/12 × 16/i);
    fireEvent.change(ta, { target: { value: "Updated summary" } });
    expect(onChange).toHaveBeenCalled();
    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0] as ParsedBriefExistingSpace;
    expect(latest.analysis.summary).toBe("Updated summary");
  });

  it("clears the photo when Replace photo is clicked", () => {
    const onChange = vi.fn();
    render(<BriefExistingSpace value={SAMPLE} onChange={onChange} projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /replace photo/i }));
    // Replace photo resets the entire block so the user gets a fresh upload + analysis.
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```
./node_modules/.bin/vitest run src/components/brief/BriefExistingSpace.test.tsx
```
Expected: 4 tests fail (module not found).

- [ ] **Step 3: Create PhotoAnnotationCanvas**

Create `src/components/brief/PhotoAnnotationCanvas.tsx`:

```tsx
// PhotoAnnotationCanvas — SVG overlay over an <img>. Lets the user draw
// closed polygons in two colors:
//   - "keep" (green): regions to preserve in the redesign
//   - "change" (red): regions the redesign should transform
//
// Polygons stored in NORMALIZED 0..1 coords so the same data renders
// correctly at any display size. Click adds a vertex; double-click
// closes the polygon. Esc cancels the in-progress polygon. Click an
// existing polygon to delete it (only when no in-progress polygon).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Brush, Eraser, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Polygon } from "@/types/brief";

export interface PhotoAnnotationCanvasProps {
  photoUrl: string;
  keep: Polygon[];
  change: Polygon[];
  onChange: (keep: Polygon[], change: Polygon[]) => void;
}

type Tool = "keep" | "change" | "erase";

export function PhotoAnnotationCanvas({ photoUrl, keep, change, onChange }: PhotoAnnotationCanvasProps) {
  const [tool, setTool] = useState<Tool>("keep");
  const [drawing, setDrawing] = useState<Array<{ x: number; y: number }>>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute the normalized coords of a mouse event relative to the SVG.
  const toNorm = useCallback((e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (tool === "erase") return;
    const pt = toNorm(e);
    if (!pt) return;
    setDrawing((d) => [...d, pt]);
  };

  const handleCanvasDoubleClick = () => {
    if (drawing.length < 3) {
      setDrawing([]);
      return;
    }
    const next: Polygon = { points: [...drawing, drawing[0]] };
    if (tool === "keep") onChange([...keep, next], change);
    if (tool === "change") onChange(keep, [...change, next]);
    setDrawing([]);
  };

  const handlePolygonClick = (kind: "keep" | "change", idx: number) => {
    if (tool !== "erase") return;
    if (kind === "keep") onChange(keep.filter((_, i) => i !== idx), change);
    if (kind === "change") onChange(keep, change.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawing([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tool === "keep" ? "default" : "outline"}
          onClick={() => setTool("keep")}
        >
          <Brush className="h-3 w-3 mr-1" />
          Keep
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "change" ? "default" : "outline"}
          onClick={() => setTool("change")}
        >
          <Brush className="h-3 w-3 mr-1" />
          Change
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "erase" ? "default" : "outline"}
          onClick={() => setTool("erase")}
        >
          <Eraser className="h-3 w-3 mr-1" />
          Erase
        </Button>
        {drawing.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setDrawing([])}>
            <Undo2 className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {tool === "erase"
            ? "Click a polygon to delete"
            : drawing.length === 0
              ? "Click to start drawing; double-click to close"
              : `${drawing.length} points — double-click to close`}
        </span>
      </div>
      <div className="relative inline-block w-full">
        <img
          src={photoUrl}
          alt="Existing space"
          className="w-full rounded-lg border border-border block"
          draggable={false}
        />
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 w-full h-full",
            tool !== "erase" && drawing.length === 0 ? "cursor-crosshair" : tool === "erase" ? "cursor-pointer" : "cursor-crosshair",
          )}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          {keep.map((p, i) => (
            <polygon
              key={`k-${i}`}
              points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="rgba(34, 197, 94, 0.30)"
              stroke="rgb(34, 197, 94)"
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                e.stopPropagation();
                handlePolygonClick("keep", i);
              }}
              style={{ cursor: tool === "erase" ? "pointer" : "default" }}
            />
          ))}
          {change.map((p, i) => (
            <polygon
              key={`c-${i}`}
              points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="rgba(239, 68, 68, 0.30)"
              stroke="rgb(239, 68, 68)"
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                e.stopPropagation();
                handlePolygonClick("change", i);
              }}
              style={{ cursor: tool === "erase" ? "pointer" : "default" }}
            />
          ))}
          {/* In-progress polygon: line strip + visible vertices. */}
          {drawing.length > 0 && (
            <>
              <polyline
                points={drawing.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                fill="none"
                stroke={tool === "keep" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                strokeWidth={0.004}
                vectorEffect="non-scaling-stroke"
                strokeDasharray="0.01 0.005"
              />
              {drawing.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={0.006}
                  fill={tool === "keep" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                />
              ))}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create BriefExistingSpace**

Create `src/components/brief/BriefExistingSpace.tsx`:

```tsx
// BriefExistingSpace — authoring surface for Interior Design (and any
// industry whose inputMode is "existing-space-photo"). Replaces the
// spatial canvas: user uploads ONE photo, draws keep/change masks,
// reviews and edits the auto-extracted analysis.
//
// On photo upload: storage upload to project-images bucket at
// existing-space/<projectId>/<ts>.<ext>, then call
// analyze-existing-space and merge the response into analysis.

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ParsedBriefExistingSpace } from "@/types/brief";
import { PhotoAnnotationCanvas } from "./PhotoAnnotationCanvas";

export interface BriefExistingSpaceProps {
  value: ParsedBriefExistingSpace | null;
  onChange: (next: ParsedBriefExistingSpace | null) => void;
  projectId: string;
}

export function BriefExistingSpace({ value, onChange, projectId }: BriefExistingSpaceProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setIsUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `existing-space/${projectId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("project-images")
          .upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("project-images").getPublicUrl(path);

        // Optimistically commit the photo so the user sees it immediately.
        const initial: ParsedBriefExistingSpace = {
          photoUrl: publicUrl,
          annotations: { keep: [], change: [] },
          analysis: { features: [], existingMaterials: {}, lighting: {} },
        };
        onChange(initial);

        // Kick off vision analysis. Failure here doesn't block the
        // user from authoring — they can still annotate + edit by
        // hand. We just don't get the auto-populated analysis.
        setIsAnalyzing(true);
        const { data, error } = await supabase.functions.invoke("analyze-existing-space", {
          body: { photoUrl: publicUrl },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        onChange({ ...initial, analysis: { ...initial.analysis, ...data.analysis } });
      } catch (e) {
        toast({
          title: "Couldn't process photo",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
        setIsAnalyzing(false);
      }
    },
    [projectId, onChange, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp"] },
    maxFiles: 1,
  });

  const handleAnnotationsChange = (keep: ParsedBriefExistingSpace["annotations"]["keep"], change: ParsedBriefExistingSpace["annotations"]["change"]) => {
    if (!value) return;
    onChange({ ...value, annotations: { keep, change } });
  };

  const updateAnalysis = (patch: Partial<ParsedBriefExistingSpace["analysis"]>) => {
    if (!value) return;
    onChange({ ...value, analysis: { ...value.analysis, ...patch } });
  };

  if (!value) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-primary" />
            Existing space
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm">Drop a photo of the existing space, or click to upload</p>
                <p className="text-xs text-muted-foreground">
                  JPG / PNG / WebP. One photo per project.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4 text-primary" />
          Existing space
          {isAnalyzing && (
            <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing…
            </span>
          )}
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
          <X className="h-3 w-3 mr-1" />
          Replace photo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <PhotoAnnotationCanvas
          photoUrl={value.photoUrl}
          keep={value.annotations.keep}
          change={value.annotations.change}
          onChange={handleAnnotationsChange}
        />

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Width (ft)</Label>
            <Input
              type="number"
              value={value.analysis.estimatedDimensions?.width ?? ""}
              onChange={(e) =>
                updateAnalysis({
                  estimatedDimensions: {
                    width: Number(e.target.value),
                    depth: value.analysis.estimatedDimensions?.depth ?? 0,
                    ceilingHeightFt: value.analysis.estimatedDimensions?.ceilingHeightFt ?? 9,
                  },
                })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Depth (ft)</Label>
            <Input
              type="number"
              value={value.analysis.estimatedDimensions?.depth ?? ""}
              onChange={(e) =>
                updateAnalysis({
                  estimatedDimensions: {
                    width: value.analysis.estimatedDimensions?.width ?? 0,
                    depth: Number(e.target.value),
                    ceilingHeightFt: value.analysis.estimatedDimensions?.ceilingHeightFt ?? 9,
                  },
                })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ceiling (ft)</Label>
            <Input
              type="number"
              value={value.analysis.estimatedDimensions?.ceilingHeightFt ?? ""}
              onChange={(e) =>
                updateAnalysis({
                  estimatedDimensions: {
                    width: value.analysis.estimatedDimensions?.width ?? 0,
                    depth: value.analysis.estimatedDimensions?.depth ?? 0,
                    ceilingHeightFt: Number(e.target.value),
                  },
                })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Summary</Label>
          <Textarea
            value={value.analysis.summary ?? ""}
            onChange={(e) => updateAnalysis({ summary: e.target.value })}
            placeholder="One-sentence description of the existing space."
            className="min-h-[60px] text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Existing floors</Label>
          <Input
            value={value.analysis.existingMaterials.floors ?? ""}
            onChange={(e) =>
              updateAnalysis({
                existingMaterials: { ...value.analysis.existingMaterials, floors: e.target.value },
              })
            }
            placeholder="e.g. original oak hardwood"
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Existing walls</Label>
          <Input
            value={value.analysis.existingMaterials.walls ?? ""}
            onChange={(e) =>
              updateAnalysis({
                existingMaterials: { ...value.analysis.existingMaterials, walls: e.target.value },
              })
            }
            placeholder="e.g. off-white painted drywall"
            className="h-8 text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Mount BriefExistingSpace in BriefReview**

In `src/components/brief/BriefReview.tsx`, locate the existing brief-card mount block (where BriefHangingCard is mounted). Add nearby:

```tsx
{industryInputMode === "existing-space-photo" && (
  <BriefExistingSpace
    value={brief.existingSpace ?? null}
    onChange={(next) => {
      // Reuse the same debounce + commitHangingSection pattern from Task 4
      // of the hanging-elements feature so other-section drafts aren't
      // clobbered. (Extract or duplicate as needed — same handler shape.)
      const updated = { ...brief, existingSpace: next ?? undefined } as typeof brief;
      // commitExistingSpaceSection mirrors commitHangingSection but
      // for the existingSpace field.
      handleExistingSpaceChange(updated);
    }}
    projectId={projectId!}
  />
)}
```

Read the current industry's `inputMode` via a hook or selector. If `useCurrentIndustry()` doesn't exist, add a small helper that resolves the project's `industry_slug` → BUILTIN_INDUSTRIES entry. Don't fabricate the industry concept — verify against the existing project model.

- [ ] **Step 6: Run tests, verify pass**

```
./node_modules/.bin/vitest run src/components/brief/BriefExistingSpace.test.tsx
./node_modules/.bin/vitest run
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```
Expected: 4 new tests pass; full suite green; TS strict clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/brief/BriefExistingSpace.tsx src/components/brief/PhotoAnnotationCanvas.tsx src/components/brief/BriefExistingSpace.test.tsx src/components/brief/BriefReview.tsx
git commit -m "$(cat <<'EOF'
feat(existing-space): Brief Review card for interior design

Task 4 of the Industries v2 + Interior Design feature. New
BriefExistingSpace component mounted in Brief Review for projects
whose industry.inputMode is "existing-space-photo" (Interior
Design; eventually architecture-renovation flows too).

UI:
- Empty state: drag-drop upload zone.
- Upload triggers (a) Supabase storage upload to project-images
  bucket at existing-space/<projectId>/<ts>.<ext>, (b) optimistic
  commit so the user sees the photo immediately, (c) async call
  to analyze-existing-space which merges structured analysis into
  the brief.
- Populated state: photo with PhotoAnnotationCanvas overlay
  (green "keep" / red "change" polygons + erase tool + double-click
  to close), plus editable dimension + summary + materials fields.
- Polygons in normalized 0..1 coords so masks survive resize.

PhotoAnnotationCanvas is a self-contained SVG overlay that emits
keep/change Polygon[] arrays via onChange. Click adds vertex,
double-click closes, Esc cancels, click-while-erase deletes.

Commit pattern matches BriefHangingCard from the hanging-elements
feature: parent debounces and commits via a sibling handler that
doesn't touch other-section drafts.

Test coverage: 4 tests covering empty state, populated state,
summary edit, and replace-photo flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Composer ID path (`composeExistingSpacePrompt` + dispatch)

**Files:**
- Modify: `src/lib/normalizedBrief.ts` (new helper + composePrompt dispatch on inputMode)
- Modify: `src/lib/normalizedBrief.test.ts` (composer ID-path snapshot tests)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
describe("composePrompt — interior design path", () => {
  // Helper: build a normalized brief with the interior_design industry slug
  // and an existingSpace block. The composer must dispatch to the ID path
  // and emit existing-space-aware sections.
  function buildIdBrief() {
    const parsed = {
      ...eqvilentParsedBrief,
      existingSpace: {
        photoUrl: "https://example.com/room.jpg",
        annotations: {
          keep: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }, { x: 0.1, y: 0.1 }], label: "fireplace" }],
          change: [{ points: [{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.5, y: 0.5 }], label: "flooring" }],
        },
        analysis: {
          features: ["stone fireplace on east wall", "double-hung windows on north wall"],
          existingMaterials: { floors: "oak hardwood, original", walls: "off-white drywall" },
          lighting: { naturalLightDirection: "north" as const },
          summary: "Bright north-facing living room.",
        },
      },
    } as unknown as typeof eqvilentParsedBrief;
    return normalizeBrief({
      project: { ...eqvilentProjectMeta, industrySlug: "interior_design" },
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
  }

  it("emits # EXISTING SPACE section with photo reference + summary", () => {
    const n = buildIdBrief();
    const out = composePrompt(n);
    expect(out.renderer).toMatch(/# EXISTING SPACE/);
    expect(out.renderer).toMatch(/Bright north-facing living room/);
    expect(out.renderer).toMatch(/oak hardwood/);
  });

  it("lists labeled keep regions and labeled change regions", () => {
    const n = buildIdBrief();
    const out = composePrompt(n);
    expect(out.renderer).toMatch(/# PRESERVED REGIONS|# REGIONS TO PRESERVE/i);
    expect(out.renderer).toMatch(/# REDESIGN REGIONS|# REGIONS TO REDESIGN/i);
    expect(out.renderer).toMatch(/fireplace/);
    expect(out.renderer).toMatch(/flooring/);
  });

  it("does NOT emit # SPACE or # ZONE PROGRAM on the ID path", () => {
    const n = buildIdBrief();
    const out = composePrompt(n);
    // Existing-space photo path: zones are not authored explicitly,
    // the photo IS the space. So composePrompt must not emit the
    // spatial-canvas-flavored sections.
    expect(out.renderer).not.toMatch(/# SPACE\n/);
    expect(out.renderer).not.toMatch(/# ZONE PROGRAM/);
  });

  it("emits # REDESIGN INTENT pulling from creative/palette/finishes", () => {
    const n = buildIdBrief();
    const out = composePrompt(n);
    expect(out.renderer).toMatch(/# REDESIGN INTENT/);
  });
});
```

The composer test relies on `project.industrySlug` being part of NormalizedBriefProject. Verify the field exists or add it as `industrySlug?: string` in Task 1's industries work if missed.

- [ ] **Step 2: Run, confirm fail**

```
./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts
```
Expected: 4 new tests fail.

- [ ] **Step 3: Add `composeExistingSpacePrompt` helper**

In `src/lib/normalizedBrief.ts`, add above `composePrompt`:

```ts
/**
 * Build the renderer prompt for interior-design / existing-space
 * projects. Returns the full markdown-structured prompt with
 * sections tailored to the photo-and-mask input pattern:
 *
 *   # SCENE
 *   # EXISTING SPACE     ← summary + materials + lighting + features
 *   # REGIONS TO PRESERVE ← keep polygons (textual)
 *   # REGIONS TO REDESIGN ← change polygons (textual)
 *   # REDESIGN INTENT     ← creative + palette + finish-schedule
 *   # HARD CONSTRAINTS    ← preserve_existing_features, respect_room_proportions
 *
 * Renderer call uses gpt-image-2's /v1/images/edits with the photo
 * as source — this prompt rides alongside that source image.
 */
function composeExistingSpacePrompt(n: NormalizedBrief): string {
  const es = n.existingSpace;
  if (!es) throw new Error("composeExistingSpacePrompt called without existingSpace");

  const sections: string[] = [];

  // # SCENE — same project-type framing as the spatial-canvas path.
  sections.push(`# SCENE\n${PROJECT_TYPE_SCENE[n.project.type] ?? PROJECT_TYPE_SCENE.trade_show_booth}`);

  // # EXISTING SPACE
  const esLines: string[] = ["# EXISTING SPACE"];
  if (es.analysis.summary) esLines.push(es.analysis.summary);
  if (es.analysis.estimatedDimensions) {
    const d = es.analysis.estimatedDimensions;
    esLines.push(`- Approximate dimensions: ${d.width}ft × ${d.depth}ft, ceiling ${d.ceilingHeightFt}ft`);
  }
  if (es.analysis.features.length > 0) {
    esLines.push(`- Existing features: ${es.analysis.features.join("; ")}`);
  }
  const mats = es.analysis.existingMaterials;
  const matLines: string[] = [];
  if (mats.floors) matLines.push(`floors: ${mats.floors}`);
  if (mats.walls) matLines.push(`walls: ${mats.walls}`);
  if (mats.ceiling) matLines.push(`ceiling: ${mats.ceiling}`);
  if (mats.trim) matLines.push(`trim: ${mats.trim}`);
  if (matLines.length > 0) {
    esLines.push(`- Existing materials: ${matLines.join("; ")}`);
  }
  if (es.analysis.lighting.naturalLightDirection) {
    esLines.push(`- Natural light: from the ${es.analysis.lighting.naturalLightDirection}`);
  }
  sections.push(esLines.join("\n"));

  // # REGIONS TO PRESERVE — text-only enumeration of keep polygons
  if (es.annotations.keep.length > 0) {
    const lines = ["# REGIONS TO PRESERVE"];
    lines.push("These regions of the existing space must remain visually identifiable in the redesign. Match position, scale, and material.");
    for (const p of es.annotations.keep) {
      lines.push(`- ${p.label ?? "preserved region"}`);
    }
    sections.push(lines.join("\n"));
  }

  // # REGIONS TO REDESIGN
  if (es.annotations.change.length > 0) {
    const lines = ["# REGIONS TO REDESIGN"];
    lines.push("These regions are open to transformation per the redesign intent below. Replace materials, furniture, surfaces, and lighting fixtures as the brief calls for.");
    for (const p of es.annotations.change) {
      lines.push(`- ${p.label ?? "region to redesign"}`);
    }
    sections.push(lines.join("\n"));
  }

  // # REDESIGN INTENT — pulls from creative + palette + finish-schedule
  const intent: string[] = ["# REDESIGN INTENT"];
  intent.push("Apply the redesign vocabulary to the regions marked for change while preserving the regions marked to keep.");
  if (n.creative.visualLanguage.length > 0) {
    intent.push(`Visual language: ${n.creative.visualLanguage.join(", ")}.`);
  }
  if (n.creative.embrace.length > 0) {
    intent.push(`Embrace: ${n.creative.embrace.join(", ")}.`);
  }
  if (n.creative.avoid.length > 0) {
    intent.push(`Avoid: ${n.creative.avoid.join(", ")}.`);
  }
  // brand colors as palette anchor
  if (n.brand.colors.length > 0) {
    intent.push(`Palette anchor: ${n.brand.colors.map((c) => `${c.name}${c.hex ? ` (${c.hex})` : ""}`).join(", ")}.`);
  }
  sections.push(intent.join("\n"));

  // # HARD CONSTRAINTS for existing-space path
  const hc: string[] = ["# HARD CONSTRAINTS"];
  if (es.annotations.keep.length > 0) {
    hc.push("- Preserved regions appear unchanged in pose, scale, and material.");
  }
  hc.push("- Room proportions, ceiling height, and window/door openings stay identical to the existing space.");
  hc.push("- The redesigned space is recognizably the SAME ROOM as the source photo, transformed per the brief.");
  sections.push(hc.join("\n"));

  return sections.join("\n\n");
}
```

If `PROJECT_TYPE_SCENE` isn't directly accessible, import or replicate the SCENE-first-paragraph pattern from the spatial-canvas composer.

- [ ] **Step 4: Dispatch in `composePrompt`**

At the top of `composePrompt`, add the dispatch:

```ts
const industry = BUILTIN_INDUSTRIES.find((i) => i.slug === n.project.industrySlug);
const inputMode = industry?.inputMode ?? "spatial-canvas";
if (inputMode === "existing-space-photo" && n.existingSpace) {
  const renderer = composeExistingSpacePrompt(n);
  // Reuse the existing negative-prompt block + briefJson assembly
  // logic so the return shape stays identical to the spatial-canvas
  // path. composePrompt currently constructs { renderer, negative,
  // artifacts, briefJson, compliance } — produce the same shape here.
  return {
    renderer,
    negative: /* existing negative-prompt builder output */ "",
    artifacts: { briefJson: n, geometrySummary: "", renderer, negative: "", compliance: [] },
    briefJson: { ...n, compliance: { hardConstraints: n.compliance.hardConstraints } },
    compliance: n.compliance.hardConstraints,
  };
}
```

Match the actual return shape `composePrompt` uses today — read the function first to see exact field names.

The "hybrid" inputMode dispatches based on whether `existingSpace` is present: if it is, use the ID path; if not, use the spatial-canvas path. Document this in a comment.

- [ ] **Step 5: Run tests, verify pass**

```
./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```
Expected: all 4 new tests pass; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "$(cat <<'EOF'
feat(existing-space): composer dispatches on industry inputMode

Task 5 of the Industries v2 + Interior Design feature. composePrompt
now reads the project's industry inputMode and dispatches:

- spatial-canvas → existing renderer (zones, hero installation,
  hanging elements, signage, etc.)
- existing-space-photo → composeExistingSpacePrompt (new) which
  emits # EXISTING SPACE / # REGIONS TO PRESERVE / # REGIONS TO
  REDESIGN / # REDESIGN INTENT / # HARD CONSTRAINTS scaffolded for
  interior design.
- hybrid → if existingSpace block is present use ID path, else
  spatial-canvas. Architecture-renovation projects work; new-build
  projects work; both within the same industry.

The ID prompt path:
- # EXISTING SPACE pulls dimensions, features, materials, lighting,
  summary from analysis.
- # REGIONS TO PRESERVE / TO REDESIGN list labeled polygons textually
  (the actual photo + mask are passed to gpt-image-2 as separate
  visual inputs at render time — Task 6).
- # REDESIGN INTENT pulls creative.visualLanguage / embrace / avoid
  + brand palette.
- # HARD CONSTRAINTS enforces room-proportion preservation +
  recognizable-same-room invariant.

Test coverage: 4 tests for ID-path emission + spatial-canvas-path
exclusion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Renderer ID path (gpt-image-2 `/v1/images/edits` with photo + optional mask)

**Files:**
- Modify: `supabase/functions/_shared/ai-gateway.ts` (extend callOpenAIImage to accept a mask)
- Modify: `supabase/functions/generate-hero/index.ts` (branch on existingSpace presence)
- Modify: `supabase/functions/generate-view/index.ts` (same branch logic)
- Modify: `src/store/renderStore.ts` (pass existingSpacePhotoUrl + mask through to edge functions)

- [ ] **Step 1: Extend `callOpenAIImage` to accept a mask**

In `supabase/functions/_shared/ai-gateway.ts`, find `OpenAIImageOptions`. Add:

```ts
/**
 * Optional alpha-mask PNG (data URL or public URL) for /v1/images/edits.
 * When supplied, gpt-image-2 only modifies the masked regions.
 * Used by the interior-design pipeline to constrain edits to
 * user-marked "change" polygons.
 */
maskUrl?: string;
```

In `_callOpenAIImageInner`, in the with-references branch (where the multipart form is built), add:

```ts
if (options.maskUrl) {
  try {
    const fetched = await fetch(options.maskUrl, {
      signal: AbortSignal.timeout(REF_FETCH_TIMEOUT_MS),
    });
    if (fetched.ok) {
      const blob = await fetched.blob();
      form.append("mask", blob, "mask.png");
    } else {
      console.warn(`[ai-gateway] Could not fetch mask (${fetched.status}); proceeding without it.`);
    }
  } catch (e) {
    console.warn("[ai-gateway] Mask fetch threw; proceeding without it:", e);
  }
}
```

The mask is best-effort: if fetch fails, render proceeds without it (gpt-image-2 then edits the whole photo per the prompt).

- [ ] **Step 2: Add a mask-rasterization helper to the client**

Create `src/lib/rasterizePolygonMask.ts`:

```ts
// Rasterize a set of normalized-coord polygons to an alpha-mask PNG
// data URL for gpt-image-2's /v1/images/edits endpoint.
//
// OpenAI's mask convention: TRANSPARENT pixels are the regions to
// edit (the model fills these); OPAQUE pixels are preserved.
//
// We want "change" polygons to be the editable regions → transparent
// in the mask. Everywhere else stays opaque (preserved). When NO
// change polygons exist (user wants the whole photo redesigned),
// return null so the renderer skips the mask and edits everywhere.

import type { Polygon } from "@/types/brief";

export async function rasterizePolygonMask(
  photoUrl: string,
  changePolygons: Polygon[],
): Promise<string | null> {
  if (changePolygons.length === 0) return null;

  // Load the source photo so we know the right pixel dimensions.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = (e) => reject(e);
    el.src = photoUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  // Start with a fully opaque mask (everything preserved).
  ctx.fillStyle = "rgba(0, 0, 0, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Punch transparent holes for each change polygon.
  ctx.globalCompositeOperation = "destination-out";
  for (const poly of changePolygons) {
    if (poly.points.length < 3) continue;
    ctx.beginPath();
    poly.points.forEach((pt, i) => {
      const px = pt.x * canvas.width;
      const py = pt.y * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}
```

- [ ] **Step 3: Pass mask through renderStore**

In `src/store/renderStore.ts`, find `generateHeroImage`. Add a new optional param:

```ts
existingSpacePhotoUrl?: string;
maskDataUrl?: string;
```

Add them to the edge function body:

```ts
body.existingSpacePhotoUrl = existingSpacePhotoUrl;
body.maskDataUrl = maskDataUrl;
```

Same for `regenerateView` and `generateAllViews`. The PromptGenerator component computes these:

```ts
const existingSpacePhotoUrl = brief?.existingSpace?.photoUrl;
const maskDataUrl = brief?.existingSpace
  ? await rasterizePolygonMask(brief.existingSpace.photoUrl, brief.existingSpace.annotations.change)
  : null;
```

The mask is recomputed on each render call so updates to the annotations propagate.

- [ ] **Step 4: Branch in generate-hero and generate-view**

In `supabase/functions/generate-hero/index.ts`, inside the request body destructure, add `existingSpacePhotoUrl` and `maskDataUrl`.

Just before the call to `generateImageWithFallback`, add:

```ts
// Interior-design / existing-space-photo path: use the existing
// space photo as the source image for gpt-image-2's /v1/images/edits
// instead of going through the spatial-canvas reference chain.
let refUrlsForOpenAI: string[];
let maskUrlForOpenAI: string | undefined;
if (existingSpacePhotoUrl) {
  refUrlsForOpenAI = [existingSpacePhotoUrl];
  maskUrlForOpenAI = maskDataUrl;
} else {
  refUrlsForOpenAI = [
    ...(previousImageUrl ? [previousImageUrl] : []),
    ...(brandLogoUrl ? [brandLogoUrl] : []),
    ...(extraReferenceUrls ?? []),
  ].slice(0, 4);
  maskUrlForOpenAI = undefined;
}
```

Pass to `generateImageWithFallback`:

```ts
const out = await generateImageWithFallback({
  // ...existing options...
  referenceImageUrls: refUrlsForOpenAI,
  maskUrl: maskUrlForOpenAI,
});
```

Replicate the same branch in `supabase/functions/generate-view/index.ts`.

- [ ] **Step 5: Verify deno typecheck**

```
deno check supabase/functions/generate-hero/index.ts
deno check supabase/functions/generate-view/index.ts
deno check supabase/functions/_shared/ai-gateway.ts
```
Expected: clean.

- [ ] **Step 6: Run client TS strict + tests**

```
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/vitest run
```
Expected: clean / green.

- [ ] **Step 7: Manual verification (interior design fixture)**

This step is a manual checkpoint, not automated:

1. Start dev server: `npm run dev`
2. Create a new project with industry = Interior Design
3. Navigate to the Spatial step → see the BriefExistingSpace card (NOT the spatial canvas)
4. Upload a photo of a real room
5. Confirm analyze-existing-space populates the analysis fields within a few seconds
6. Draw a "keep" polygon over a window or fixture; draw a "change" polygon over the floor
7. Write a brief: "Redesign as a moody mid-century lounge"
8. Generate a hero render; confirm the model:
   - Preserves the kept regions (window, fixture)
   - Transforms the change regions per the brief
   - Keeps the room recognizably the same space

If the renders aren't preserving keep regions correctly, the mask isn't rasterizing or isn't reaching gpt-image-2. Check the storage upload of the mask + the multipart form field name (`mask`, not `image[]`).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/ai-gateway.ts supabase/functions/generate-hero/index.ts supabase/functions/generate-view/index.ts src/lib/rasterizePolygonMask.ts src/store/renderStore.ts
git commit -m "$(cat <<'EOF'
feat(existing-space): renderer uses photo + mask for ID projects

Task 6 (final) of the Industries v2 + Interior Design feature.
generate-hero and generate-view branch on existingSpacePhotoUrl
presence:

- spatial-canvas path: existing behavior — hero + logo + extras
  as reference images; no mask.
- existing-space path: photo of existing space is the ONLY
  reference image; optional alpha mask derived from change
  polygons constrains gpt-image-2's edits to those regions.

The mask is rasterized on the client via
src/lib/rasterizePolygonMask.ts — loads the photo to determine
pixel dimensions, draws change polygons as transparent holes in
an otherwise-opaque overlay, exports as PNG data URL. OpenAI's
mask convention: transparent = editable, opaque = preserved.

When the user has NO change polygons (full-room redesign), the
client passes null and the renderer skips the mask field; gpt-
image-2 edits everywhere per the prompt.

callOpenAIImage gains an optional maskUrl in OpenAIImageOptions.
The multipart form attaches it as the "mask" field for
/v1/images/edits. Mask fetch is best-effort: failures log a
warning and the render proceeds without it.

Manual verification on a real interior-design fixture is the
acceptance gate — visually confirm preserved regions stay
identical and change regions transform per the brief.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification checkpoints

After each task:
- `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- `./node_modules/.bin/vitest run`
- `deno check supabase/functions/<changed-fn>/index.ts` for any edge-function task

After Task 3 (vision edge function): smoke test by calling `analyze-existing-space` with a real photo URL and verifying the response shape.

After Task 6 (final): end-to-end manual pass on a real interior-design project — upload photo, annotate, brief, render. Confirm the rendered output preserves keep regions and transforms change regions recognizably.

## Deferred / future work

- Resend-backed email notification for new `beta_waitlist` entries → bryan@gofightwin.co (separate feature).
- Multi-photo input mode for existing-space projects (one photo per wall) — per spec §1 Non-goals.
- Per-room repeater for full-residential interior design projects — per spec §1 Non-goals.
- Plant-palette schema for landscape industry (defer until landscape becomes the focus).
- Architecture renovation mode (hybrid inputMode dispatch is in place but the project-creation flow still needs a "renovation vs new build" radio).
- Carry-forward follow-ups from the hanging-elements feature: composeViewPrompt _dismissedGaps strip, BriefHangingCard debounce race, canvas↔brief hanging-element store join.
