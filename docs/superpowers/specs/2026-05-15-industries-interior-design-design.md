# Industries v2 + Interior Design — Design Spec

**Status:** Draft (brainstorm 2026-05-15)
**Owner:** Bryan Scott
**Related:** Existing industries infrastructure (BUILTIN_INDUSTRIES, activation-types, AdminIndustries)

---

## Goal

Take Canopy from a single working vertical (experiential / trade-show) to a multi-vertical platform where each industry has its own brief shape, its own render input model, and its own deliverable feel — **without forking the whole pipeline**.

The forcing function is interior design, which is fundamentally different from experiential in one way: the user doesn't lay out empty space, they redesign an existing space they have a photo of. That forces the platform to grow a new input pattern (existing-space photo + annotation mask) that other industries (architecture renovation, hospitality refresh) will also benefit from.

## Non-goals

- **Full vertical specialization.** Each industry doesn't get its own composer / spatial / canvas engine. The shared NormalizedBrief + composePrompt + render pipeline stays — industries plug in vertical-specific brief sections and prompt scaffolding.
- **Replacing the experiential flow.** Trade-show / activation projects keep their current canvas-driven workflow. Interior design adds a parallel input mode; the user picks at project creation.
- **Renovation-grade construction docs.** No finish schedules, plumbing routes, code-compliance markup. This is concept rendering with structural understanding, not contract documents.
- **Animation / VR walk-throughs.** Static renders only for v1.

## Architecture

Three surfaces extend or grow, one is new:

1. **Industries v2 (extend):** Add `interior_design` as the 6th built-in industry. Each industry declares its `briefSections` — which sections of the brief schema apply, in what order, with what defaults.
2. **ExistingSpace input (new):** A new block on ParsedBrief carrying the uploaded photo, user-drawn keep/change annotations, and a vision-model-derived analysis. Surfaced via a new BriefExistingSpace component on Brief Review.
3. **Photo-annotation canvas (new):** Lightweight HTML5 canvas overlay where the user marks regions of the photo as "keep" or "change". Saved as SVG polygons on the project.
4. **Render pipeline (extend):** For interior design, generate-hero / generate-view use gpt-image-2's `/v1/images/edits` endpoint with the photo as the source image and the annotation mask informing the prompt ("preserve these regions; redesign these regions according to the brief").

## Detailed design

### 1 · Industry schema extension

Add to `BuiltinIndustry` interface:

```ts
export interface BuiltinIndustry {
  // ...existing fields (slug, label, description, icon, vocabulary, sort_order)...
  /**
   * Which sections of the brief schema apply to projects in this
   * industry, in canonical display order. A section appearing here
   * means it shows up in Brief Review for projects tagged with
   * this industry. Sections NOT listed are hidden — they may still
   * exist in the schema (e.g. for cross-industry compatibility) but
   * the UI won't surface them for this vertical.
   *
   * The shared engine (normalizer, validator, composer) reads from
   * ParsedBrief regardless; this list controls UI rendering only.
   */
  briefSections: BriefSectionId[];
  /**
   * Input mode used at project creation: "spatial-canvas" (the
   * existing zone-layout flow), "existing-space-photo" (interior
   * design — upload a photo and annotate), or "hybrid" (allow both).
   * Drives which Spatial step UI mounts.
   */
  inputMode: "spatial-canvas" | "existing-space-photo" | "hybrid";
  /**
   * Default render angles for this industry. Experiential's defaults
   * are hero/front/back/sides + per-zone interiors. Interior design's
   * defaults are wide-shot, detail of focal wall, alternate-light shot,
   * and a before/after composite. Each angle is an internal id the
   * renderer composer knows how to interpret.
   */
  defaultRenderAngles: RenderAngleId[];
}

export type BriefSectionId =
  | "brand"             // shared
  | "audience"          // shared
  | "objectives"        // shared
  | "spatial-zones"     // experiential-style zone layout
  | "existing-space"    // photo + annotation + vision analysis
  | "creative"          // shared
  | "hero-installation" // experiential
  | "signage"           // shared but conditional
  | "hanging-elements"  // experiential (booths, hospitality)
  | "finish-schedule"   // interior design, architecture
  | "furniture-inventory" // interior design, hospitality
  | "lighting-plan"     // interior design, hospitality, retail
  | "palette"           // shared
  | "budget";           // shared

export type RenderAngleId =
  | "hero_34"           // 3/4 hero perspective (current default)
  | "front" | "back" | "left" | "right" | "top" | "iso"
  | "wide_shot"         // interior design hero: wide room view
  | "focal_detail"      // close-up of the redesign's centerpiece
  | "alternate_light"   // same view, different time of day / lighting
  | "before_after";     // composite split
```

Update `BUILTIN_INDUSTRIES` to include `briefSections`, `inputMode`, and `defaultRenderAngles` per industry. Interior design entry:

```ts
{
  slug: "interior_design",
  label: "Interior Design",
  description: "Residential, hospitality, restaurant, retail — redesigns of existing spaces.",
  icon: "Sofa",
  vocabulary: {
    project_type: "Project type",
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
    "existing-space", "creative", "palette",
    "finish-schedule", "furniture-inventory", "lighting-plan",
    "budget",
  ],
  inputMode: "existing-space-photo",
  defaultRenderAngles: ["wide_shot", "focal_detail", "alternate_light", "before_after"],
  sort_order: 35,
}
```

The existing 5 industries gain matching `briefSections` / `inputMode` / `defaultRenderAngles` declarations so the new fields are non-optional on the type:

- **experiential**: zones + hero-installation + hanging + signage; canvas; existing angle set
- **architecture**: existing-space (for renos) OR spatial-zones (for new builds); hybrid
- **landscape**: spatial-zones (site plan); palette swapped for "plant palette"
- **entertainment**: hybrid; signage + hanging
- **audio_visual**: hybrid; bigger emphasis on lighting-plan

### 2 · ExistingSpace block on ParsedBrief

New schema slot, parallel to `signage` / `hanging`:

```ts
export interface ParsedBriefExistingSpace {
  /**
   * Single canonical photo of the space. Storage URL. The user can
   * re-upload to replace; the previous photo URL is dropped.
   */
  photoUrl: string;
  /**
   * User-drawn annotations. Each polygon is a closed path in
   * NORMALIZED PHOTO COORDS (0..1 on each axis) so masks survive
   * photo resizing. SVG-friendly: render directly as <polygon> over
   * the photo at any display size.
   */
  annotations: {
    /** Regions to preserve: walls to keep, windows, fixtures, etc. */
    keep: Polygon[];
    /** Regions to redesign: replace flooring, repaint, swap furniture. */
    change: Polygon[];
  };
  /**
   * Vision-model output (auto-populated by an `analyze-existing-space`
   * edge function on photo upload). User can override any field via
   * the BriefExistingSpace card.
   */
  analysis: {
    estimatedDimensions?: { width: number; depth: number; ceilingHeightFt: number };
    /** Identified architectural features: "double-hung windows on north wall", "stone fireplace on east wall", etc. */
    features: string[];
    /** Existing materials catalog: floors, walls, ceiling, trim. */
    existingMaterials: {
      floors?: string;
      walls?: string;
      ceiling?: string;
      trim?: string;
      [zone: string]: string | undefined;
    };
    /** Lighting conditions inferred from the photo. */
    lighting: {
      naturalLightDirection?: "north" | "south" | "east" | "west" | "skylight" | "none";
      existingFixtures?: string[];
      timeOfDayInferred?: "morning" | "midday" | "evening" | "night" | "controlled";
    };
    /** Free-text summary the LLM produced — useful when the user wants a one-line description in the brief. */
    summary?: string;
  };
}

export interface Polygon {
  /** Normalized 0..1 points around the polygon, closed (last ≠ first). */
  points: Array<{ x: number; y: number }>;
  /** Optional label the user typed: "fireplace to keep", "old flooring". */
  label?: string;
}
```

Added to `ParsedBrief`:

```ts
existingSpace?: ParsedBriefExistingSpace;
```

Mirror on `NormalizedBrief`:

```ts
existingSpace?: NormalizedBriefExistingSpace;
```

The normalizer is mostly pass-through for this block (already structured), but it:
- Validates the photo URL is present + reachable
- Coerces annotation point arrays to closed polygons (auto-close if last ≠ first)
- Trims/dedupes vision-analysis arrays

### 3 · `analyze-existing-space` edge function (new)

Triggered after photo upload. Calls a vision model (gpt-4o or gemini-3-pro-vision via the existing ai-gateway) with a structured-output schema matching `ParsedBriefExistingSpace.analysis`.

System prompt: *"You are analyzing a photo of an interior space for redesign. Extract structured information about the existing space. Be conservative — only report what you can confidently see. Return null for fields you can't determine."*

Response merged into `parsedBrief.existingSpace.analysis`. User can override any field via the brief card. Re-run on a new photo upload.

### 4 · BriefExistingSpace component (new)

Replaces the spatial-canvas surface for interior-design projects. Mounted in the Spatial step when `industry.inputMode === "existing-space-photo"` (or as the secondary option in "hybrid").

UI:
- **Photo upload zone** (drag-drop or click): once uploaded, displays the photo full-width.
- **Annotation toolbar** above the photo:
  - "Keep" tool — draw a polygon (click to add vertices, double-click to close). Green outline + 30% green fill.
  - "Change" tool — same UX but red outline + 30% red fill.
  - Eraser — click a polygon to delete it.
  - Undo / redo.
- **Vision-analysis panel** below the photo: shows the auto-extracted dimensions, features, materials, lighting. Each field is inline-editable; user overrides persist on `parsedBrief.existingSpace.analysis`.
- **Notes field**: free-text, "anything else about this space we should know."

Annotation storage:
- Polygons stored in **normalized 0..1 coords** so resizing the photo display doesn't break the masks.
- Saved live to `parsedBrief.existingSpace.annotations` via the same debounced-commit pattern BriefHangingCard uses (400ms debounce, sibling commit handler that doesn't touch other-section drafts).

### 5 · Render pipeline for interior design

Two paths the renderer handles differently based on industry:

**Experiential / current path (unchanged):**
- Spatial canvas → zone layout → composedPrompt with `# SPACE` / `# ZONE PROGRAM` / `# HANGING ELEMENTS` sections → gpt-image-2 `/v1/images/generations` (no source image) → render.

**Interior design path (new):**
- ExistingSpace photo → composedPrompt with `# EXISTING SPACE` section + `# REDESIGN INTENT` section + `# PRESERVED REGIONS` + `# REDESIGN REGIONS` → gpt-image-2 `/v1/images/edits` with photo as source → render.

Composer changes:
- `composePrompt` reads `industry.inputMode` and dispatches:
  - If `spatial-canvas`: existing behavior (current `# SPACE`, `# ZONE PROGRAM`, etc.)
  - If `existing-space-photo`: new sections that describe the existing space (from `analysis`), the preserved regions (from `annotations.keep`), and the redesign intent (from `creative` + `palette` + `finish-schedule`)
- Helper `composeExistingSpacePrompt(normalized)` returns the renderer string for ID projects.

Renderer call:
- For ID, the existing-space photo is the source image. gpt-image-2 `/v1/images/edits` accepts the source + the prompt + an optional mask. The "change" polygons can be rasterized to an alpha-mask PNG and sent — gpt-image-2 then constrains its edits to the masked regions. The "keep" polygons inform the prompt textually ("preserve the fireplace at coords X, the windows at coords Y").

### 6 · Project creation flow

When a user creates a new project:
1. They pick an industry (already supported via OnboardingCreateAgency, ActivationTypes pages).
2. The industry's `inputMode` determines which Spatial-step UI mounts.
3. The brief uses the industry's `briefSections` list to determine which cards to surface on Brief Review.
4. The renderer uses `defaultRenderAngles` to populate the Prompts step's view list.

A single `industry_slug` column on the projects table drives this. (Already exists — verify and use.)

### 7 · Hard constraints

For interior design:
- **preserve_existing_features**: When `annotations.keep` is non-empty, the renderer must keep those regions visually identifiable. Status set to "unknown" at composition (visual rule); mirrored in `# HARD CONSTRAINTS`.
- **respect_room_proportions**: The renderer must not change the room's overall proportions (it's a redesign of the existing space, not a new room).

### 8 · Tests

- Schema/normalizer tests for `ParsedBriefExistingSpace` shape, polygon coercion, vision-analysis pass-through
- `analyze-existing-space` edge function: smoke test with a real photo + assert response shape
- BriefExistingSpace component tests: polygon drawing, undo/redo, normalized-coord persistence
- Composer snapshot test for the ID prompt scaffold
- Fixture: a real interior design brief + photo + expected normalized output (parallel to Eqvilent/US Cabinet Depot)

## Implementation order

Six tasks, each ships a working slice:

1. **Industries v2 schema** — add `briefSections` / `inputMode` / `defaultRenderAngles` to BuiltinIndustry, populate for all 6 industries (including interior_design as a new entry with NULL backing data initially)
2. **ExistingSpace schema** — type definitions, normalizer pass-through, safeBrief defaults
3. **`analyze-existing-space` edge function** — vision-model call, returns structured analysis
4. **BriefExistingSpace component** — upload zone + annotation canvas + analysis panel + debounced commit (mirrors BriefHangingCard's pattern)
5. **Composer ID path** — `composeExistingSpacePrompt` helper + `composePrompt` dispatch on `inputMode`
6. **Renderer ID path** — generate-hero / generate-view use `/v1/images/edits` with the source photo + optional mask when industry is interior design

Migration order: 1 and 2 land together as data-layer prep. 3 lands as a standalone edge function. 4 is the biggest UI task. 5 + 6 are the prompt + render integration.

## Open questions

- **Mask rasterization quality**: gpt-image-2's `/v1/images/edits` mask is an alpha-PNG. Rasterizing user-drawn polygons at the photo's native resolution should be fine, but worth a smoke test with a real photo to verify the mask reads correctly.
- **Photo storage**: Existing `project-images` bucket OR a new `existing-space-photos` bucket? Probably reuse `project-images` with a path prefix.
- **Multiple existing-space photos**: spec says single photo; user can re-upload to replace. If users want a multi-photo input later (per spec §1's Non-goals), revisit.
- **Architecture industry's "renovation vs. new build" toggle**: The `inputMode: "hybrid"` declaration says architecture supports both. Where does the user pick? A project-creation step radio? Or detect from the brief's content? For v1, simplest: project creation flow asks "Is this an existing space or a new build?" and routes accordingly.

## Future work

- Per-room repeater for full-residential-build interior design projects (defer per Non-goals)
- Plant-palette schema for landscape (defer until landscape industry is the focus)
- Multi-photo input mode (defer)
- Before/after compositing logic for renders (sketched as `defaultRenderAngles` entry; logic deferred)
- Cross-industry brief-section reuse (e.g. an experiential project that happens to have an existing-space photo for context) — not needed for v1
