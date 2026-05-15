# Hanging Elements — Design Spec

**Status:** Approved (brainstorm 2026-05-15)
**Owner:** Bryan Scott
**Related:** prompt-engine-refactor (2026-05-14), client feedback on Eqvilent oval-floor render

---

## Goal

Let the brief capture, the user edit, and the renderer model render **overhead hanging structures** — ring signs, halos, fly-rigged banners, suspended LED installations — as distinct architectural elements that hang from the venue rigging, not from the booth structure below.

Today the brief schema has no concept of "hanging." The renderer interprets everything as floor-supported, which is wrong for the most common identifier on island booths: the overhead identity ring/sign visible from across the hall. Client feedback prompted this: *"there's no way to isolate and control floor-supported structures, hanging signs, and the shape of the floor plan. Generally you'd have a rectangular carpet and then everything above can be organic."* The rectangular-floor half landed in commit `d57ff92`; this spec covers the hanging half.

A "hanging element" in this spec is a small piece of architecture — a structure with materials, surfaces, lighting, LED panels, and printed faces — not just a sign. Schema models it the same way `NormalizedBriefHero` already models the centerpiece installation.

## Non-goals

- **Lighting fixtures.** Venue-handled and rarely render-critical. Hanging elements that *contain* light are in-scope (e.g. an internally-lit ring); freestanding theatrical lights are out.
- **Multi-storey suspended walkways or rigging-supported floors.** Edge case; treat as a custom Hero installation instead.
- **Animation / kinetic hanging elements.** Static-render only for v1.
- **Venue rigging constraints.** Some venues don't allow hanging signs. We won't validate this — the user is responsible for knowing their venue rules.

## Architecture

Five surfaces touched, in dependency order:

1. **Schema** — new `NormalizedBriefHanging` block on `NormalizedBrief`.
2. **Parser** — `parse-brief` edge function extracts hanging elements from the brief PDF.
3. **Validator** — `validateBrief` emits a `helpful` gap when no hanging elements are declared.
4. **UI** — new "Hanging Elements" card on Brief Review + new layer on the Spatial canvas (top-down + iso).
5. **Composer** — new `# HANGING ELEMENTS` section in the renderer prompt with explicit weight-bearing language.

Each surface is small in isolation; the schema is the single source of truth that wires the rest together.

## Detailed design

### 1 · Schema

Add to `src/lib/normalizedBrief.ts`:

```ts
export interface NormalizedHangingElement {
  /** Stable identifier; used for canvas drag-edit and prompt anchoring. */
  id: string;
  /** Short label shown in UI and prompt, e.g. "Primary identity ring". */
  name: string;
  /**
   * 1-2 sentence sculptural description of the structure. Same role as
   * `NormalizedBriefHero.physicalForm` — drives the model's mental image
   * of the form.
   */
  physicalForm: string;
  /** Top-down outline shape. `ring` is its own enum because it's the
   * dominant hanging form and benefits from explicit geometry. */
  shape: "rect" | "circle" | "oval" | "ring" | "custom";
  /**
   * Top-down dimensions. Width and depth in the same units as
   * NormalizedBriefGeometry. `thicknessFt` is the structure's own
   * vertical thickness (a flat banner has small thickness; a ring or
   * truss has more). Suspended height is separate — see below.
   */
  dimensions: { width: number; depth: number; thicknessFt: number };
  /**
   * Distance from venue ceiling DOWN to the bottom of the element.
   * The element sits at `ceilingHeightFt - suspensionDropFt` from the
   * floor. Convention venues typically rig 4-6m above the booth floor.
   */
  suspensionDropFt: number;
  /**
   * Top-down center position in the same coordinate space as
   * NormalizedBriefZone (booth-local feet/meters from front-left).
   */
  position: { x: number; y: number };
  /** Materials list — e.g. ["brushed aluminum", "tensioned white fabric"]. */
  materials: string[];
  /**
   * Surface descriptions per face. e.g. ["front face: white LED
   * wordmark", "underside: matte black", "back: brushed aluminum"].
   * Free-form strings — flexibility matters more than enum here.
   */
  surfaces: string[];
  /**
   * Lighting attributes. e.g. ["edge-lit perimeter glow", "internally
   * backlit", "downcast 4000K wash on booth floor"].
   */
  lighting: string[];
  /**
   * Printed graphics. e.g. ["front: brand logotype", "back: hashtag"].
   * Separate from `surfaces` because the renderer treats printed
   * content as visible text content that must be rendered accurately.
   */
  printed: string[];
}

export interface NormalizedBriefHanging {
  elements: NormalizedHangingElement[];  // 0..N; most projects have 0–2
}

// Add to NormalizedBrief:
export interface NormalizedBrief {
  // ...existing fields...
  hanging: NormalizedBriefHanging;
}
```

Default value when a brief has no hanging info: `{ elements: [] }`. The `safeBrief()` helper gains a corresponding default. Adding to the type does NOT make hanging elements mandatory — empty array is the dominant state until the user authors one.

**Why a new top-level field, not nested under `signage`:** Hanging elements are architectural objects, not signage requirements. `signage.required` enumerates brand wordmarks that must appear somewhere on the booth (no statement about where they live); `hanging.elements` enumerates physical structures with their own form, position, and materials. The two cross-reference but aren't the same data shape.

### 2 · Parser (parse-brief edge function)

Extend the parsed-brief JSON schema with a `hangingElements` slot:

```jsonc
"hangingElements": {
  "type": "array",
  "description": "Overhead structures suspended from venue rigging. Each is a small architectural object with materials, surfaces, lighting, and a position above the booth. Examples: 'overhead identity ring', 'hanging sign with white LED wordmark', 'suspended halo above lounge'.",
  "items": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "physicalForm": { "type": "string" },
      "shape": { "type": "string", "enum": ["rect", "circle", "oval", "ring", "custom"] },
      "estimatedDimensions": { "type": "string", "description": "free-text, e.g. '3m diameter × 0.3m thick'" },
      "suspensionHint": { "type": "string", "description": "free-text positional hint, e.g. 'centered over hero zone'" },
      "materials": { "type": "array", "items": { "type": "string" } },
      "surfaces": { "type": "array", "items": { "type": "string" } },
      "lighting": { "type": "array", "items": { "type": "string" } },
      "printed": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

LLM prompt guidance for the parser: look for phrases like *hanging sign, overhead sign, suspended from, ring above, halo, fly-rigged, rigging-supported, hanging banner, overhead structure*. Empty array when none mentioned.

The parser returns rough authored data; the normalizer converts free-text dimensions/position to numeric fields with sensible defaults, generating stable `id` values.

### 3 · Validator + clarification gap

Add to `validateBrief`:

```ts
if (normalized.hanging.elements.length === 0 && !skipMap["hanging.elements"]) {
  gaps.push({
    field: "hanging.elements",
    severity: "helpful",
    question: "Will this booth have a hanging overhead structure visible from across the hall? It's a common identifier on island booths.",
    options: ["Yes — add one", "No — floor-only booth"],
    fallback: [],
    source: "schema",
  });
}
```

When the user picks "Yes — add one," the `applyGapAnswer` helper writes a default hanging element into `parsedBrief.hanging.elements[0]` (centered above booth, ring shape, 1m drop, brand color edge-lit, brand wordmark on front face). User then refines in Brief Review. When the user picks "No — floor-only," `skipMap["hanging.elements"]` is set on the project so the gap doesn't re-fire.

### 4 · Brief Review card

New `BriefHangingCard` component in `src/components/brief/`. Mounts in `BriefReview` alongside the existing cards. Renders:

- Section header: "Hanging Elements" + count badge + "+ Add hanging element" button
- One sub-card per element with editable fields:
  - **Name** (text input)
  - **Physical form** (textarea, 1-2 sentence guidance)
  - **Shape** (select)
  - **Dimensions** (three numeric inputs: width / depth / thickness)
  - **Suspension drop** (numeric, ft)
  - **Materials** (chip add/remove, same UX as creative.embrace)
  - **Surfaces** (chip add/remove)
  - **Lighting** (chip add/remove)
  - **Printed** (chip add/remove)
  - **Position** — read-only summary ("centered above booth") with a "Position on canvas" link that opens the Spatial step
- Empty state: "No hanging elements. The booth will render as floor-only. + Add one"

Component file budget: ~280 lines. Test coverage: same pattern as `BriefClarification.test.tsx`.

### 5 · Spatial canvas

Two visual surfaces.

**Top-down planner (`SpatialCanvas`):**
- New `hangingLayer` rendered above the floor zones in z-order. Dashed outline, hatched-fill at 20% opacity, distinct from solid floor-zone fills. Each element labeled with its name.
- Drag to reposition. Resize handles on cardinal edges. Rotation locked to 0/90/180/270 for v1.
- Click to open the same edit dialog as Brief Review (no per-attribute editing inline on the canvas — too cramped).
- New toolbar button: "+ Hanging element" (icon + label, sits next to existing "+ Feature").
- New toggle: "Show hanging" (default on). When off, hanging elements are hidden so the user can edit the floor layer without visual noise. Hidden state is local-canvas-only; doesn't affect the data.

**3D iso preview (`SpatialCanvasIso`):**
- Each hanging element renders as a wireframe block at `ceilingHeightFt - suspensionDropFt` height with its true top-down footprint and thickness.
- A thin dashed line drops from the element down to its centroid on the floor — visual anchor for context.
- Same hide/show toggle wired through.

Canvas math reuses existing utilities (`absoluteZoneToCanvasCoords`, etc.); the new layer doesn't need its own coordinate system.

### 6 · Composer

Add a new section `# HANGING ELEMENTS` to `composePrompt`, positioned between `# SPACE` and `# STRUCTURAL APPROACH`. Section is omitted entirely when `hanging.elements.length === 0` (no empty-section bloat).

Section template (per element):

```
# HANGING ELEMENTS
These structures are SUSPENDED from the venue rigging/ceiling above
the booth. They are NOT attached to the booth structure below — the
booth does not bear their weight. Render them as truly suspended
overhead with visible separation from the booth structure beneath.

- {name}
  Form: {physicalForm}
  Geometry: {width} × {depth} × {thicknessFt} {units}, {shape} outline,
            positioned {positionPhrase} the booth, {suspensionDropFt}ft
            below the venue ceiling.
  Materials: {materials.join(", ")}
  Surfaces: {surfaces.join("; ")}
  Lighting: {lighting.join(", ")}
  Printed: {printed.join("; ")}
```

`positionPhrase` is derived from the element's `position` relative to booth center: `"centered above"`, `"above the front-left quadrant of"`, `"offset to the back-right of"`, etc.

Existing `# STRUCTURAL APPROACH` section adds one new sentence at the end when hanging elements exist:
> *"Floor-supported structures (walls, fascia, hero installation) are visually distinct from the hanging elements above — there is open air between them."*

### 7 · Hard constraint

Add `hanging_elements_aloft` to `HardConstraint`:

```ts
| { id: "hanging_elements_aloft"; status: "pass" | "fail" | "unknown"; message?: string }
```

Status set to `"unknown"` at composition time (we can't statically verify a visual rule). Reserved for future use if we add post-render automated checks. Listed in the compliance manifest so the renderer prompt's `# HARD CONSTRAINTS` block reminds the model: *"Hanging elements appear clearly above and detached from the booth structure."*

### 8 · Test coverage

- **Schema/normalizer tests** in `normalizedBrief.test.ts`:
  - Fixture-driven parse → normalize → assert `hanging.elements[0]` matches expected output
  - `applyGapAnswer` with `hanging.elements` writes the default element correctly
  - Skipping the gap records the skip so it doesn't re-fire
- **Composer snapshot tests**:
  - Empty elements: no `# HANGING ELEMENTS` section
  - Single element: section present, positional phrase correct
  - Multiple elements: each gets its own bullet, intro instruction appears once
- **Brief Review card** in `BriefHangingCard.test.tsx`:
  - Empty state shows "Add" CTA
  - Adding creates editable card with default values
  - Editing fires the right setters
  - Removing deletes the entry
- **Canvas math** (small Vitest unit):
  - Hanging element drag updates `position` correctly
  - Resize updates `dimensions.width/depth` correctly
- **Fixture pairs:** add hanging elements to Eqvilent + US Cabinet Depot fixtures so the end-to-end snapshot tests cover the new section

## Implementation order

Six tasks, each ships a working slice:

1. **Schema + normalizer + safeBrief defaults** — types compile, tests for the new shape pass
2. **Validator gap + applyGapAnswer** — gap surfaces correctly; skip persists
3. **Composer section** — `# HANGING ELEMENTS` text renders correctly; snapshot tests pass
4. **Brief Review card** — UI for authoring; tests pass; integrates with existing brief edit flow
5. **Spatial canvas layer (top-down)** — drag/resize/edit on the existing canvas
6. **Spatial canvas iso (3D)** — wireframe block in the iso preview

`parse-brief` JSON schema update lands alongside task 1 so the extracted data has a place to land; if the LLM extracts nothing initially that's fine (validator gap surfaces it).

## Open questions

- **Shape `ring`** — is the inner radius a separate field, or implicit (e.g. "ring outer 3m, inner 2.4m")? Default to implicit string in `physicalForm` for v1; revisit if the renderer struggles.
- **Conflicting hanging + floor structure positions** — what if a hanging element is positioned above a floor zone (almost always the case)? No conflict by design; they live in different layers. Worth a UX hint when the user drags a hanging element over a clearly-incompatible spot (e.g. over a wall zone that touches the ceiling).
- **Suspension drop authoring UX** — should the user enter "drop from ceiling" or "absolute height from floor"? Going with drop-from-ceiling because that's how rigging crews think and the LLM extraction usually matches it. Could add the alternate label as a hint.

## Future work

- Animation / kinetic elements (rotating ring, parallax banners)
- Per-element camera framing (a "Hanging Detail" view angle)
- Cross-check against a venue's `maxHangingPoints` constraint when we add venue-rules data
- Pre-render visual verification of the `hanging_elements_aloft` constraint
