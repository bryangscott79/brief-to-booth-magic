# Prompt Engine Refactor — Design

**Status:** approved by user (Bryan), pending spec review before plan
**Author:** Claude (with Bryan)
**Date:** 2026-05-14

## Problem

The current prompt-generation pipeline produces image-model prompts that are long, contradictory, and weakly enforce the brief. Concrete symptoms observed in production:

- **Wrong project type cascades.** A trade-show booth brief (Eqvilent at ICML) was classified as `architectural_brief`, producing a prompt that explicitly said "permanent architectural brief — NOT a trade show or event build." The image model rendered a permanent showroom, not a 5-day exhibition booth.
- **Zone names bleed onto fascia.** Poetic AI-generated zone names ("The Sanctuary", "The Hearth") appeared in the prompt as room descriptions; the image model rendered them as overhead wayfinding signs on the booth.
- **`designContext` was never populated.** A typed structured-payload field existed on the render store but `setDesignContext` was never called anywhere, so the structured markdown prompt's sections (HERO, ZONE LAYOUT, MATERIALS, etc.) emitted empty for every render. All the brief-specific data was buried in `# NARRATIVE CONTEXT` at the *bottom* of the prompt, where image-model attention is lowest.
- **Default rectangular pavilions.** Without an explicit "structural approach" section reading the brief's visual language (waves, lines, curves), the model defaulted to flat-fascia trade-show-typical geometry — even when the brief called for sculptural forms.
- **Geometry and style are duplicated.** The same dimensions, camera framing, and negative-prompt terms appear in 4-5 places in the assembled prompt. Image models heavily weight repetition; redundant text crowds out the actual design signal.
- **View renders drift from hero.** Auxiliary views (front, back, sides, details, interiors) are composed independently from the brief, not from the hero. Materials, palette, and structural form can quietly shift between hero and views even though they should be identical.

A patch-by-patch series of edits has gotten us part of the way, but the underlying pipeline is brittle. This refactor establishes a single source of truth, separates concerns, makes validation conversational rather than failing, and produces a clean structured prompt the image model can follow reliably.

## Goals

1. **Single source of truth.** All brief, geometry, and design data flows through one normalized object. No duplicate fields scattered across `parsedBrief` + `spatialData` + `elements` + ad-hoc context shapes.
2. **Conversational completion.** Gaps in the brief surface as clarifying questions during brief upload (primary surface) and prompt generation (safety net). The system guides the user to a complete brief; it does not fail on incomplete input.
3. **Clean, structured renderer prompts.** Compact markdown sections, deduplicated, with geometry and hard constraints at the top where image-model attention is highest.
4. **Hero as the authoritative render.** Auxiliary views derive from the hero's persisted composer output, not from re-running the brief. Hero edits propagate to views automatically; brief edits do not silently desync the views.
5. **Auditable, debuggable pipeline.** Every render persists its full composer output (brief snapshot + geometry summary + renderer prompt + negative + compliance checklist). A debug panel exposes all five stages to the user.

## Approach

One coherent refactor, six phases with hard sequencing:

1. Normalized brief schema + `normalizeBrief()` + `validateBrief()` — pure data layer
2. `composePrompt()` — produces 5 output stages from a normalized brief
3. Edge-function refactor — both `generate-hero` and `generate-view` adopt the new pipeline; `heroSnapshot` is introduced as the contract between hero and view renders
4. Interactive clarification UI — shared component at brief upload (primary) and prompts step (safety net)
5. Prompt debug panel — exposes the 5 output stages to the user
6. Project-type migration — DB migration mapping old type values forward, parse-brief output update, UI label update

Phases 1-3 are the critical path for "renders get better." Phases 4-6 are quality-of-life improvements that ship after.

## Architecture — data flow

```
parsedBrief (loose)          spatialData             elements
       │                          │                      │
       └──────────┬───────────────┴──────────────────────┘
                  ▼
         ┌────────────────────┐
         │  normalizeBrief()  │   ← Phase 1: deterministic projection
         └────────┬───────────┘
                  ▼
            NormalizedBrief
                  ▼
         ┌────────────────────┐
         │   validateBrief()  │   ← Phase 1: returns gaps + failures
         └────────┬───────────┘
                  │
        Has gaps? │ No gaps
       ┌──────────┴─────────────┐
       ▼                        ▼
 BriefClarification         composePrompt()      ← Phase 2
 (Phase 4)                       │
       │                ┌────────┼────────────┬─────────┬───────────┐
       │ writes back    ▼        ▼            ▼         ▼           ▼
       │              A. Brief  B. Geometry  C. Renderer  D. Negative  E. Compliance
       │               JSON      Summary       Prompt       Prompt       Checklist
       │                                          │           │
       └──→ parsedBrief                           └─────┬─────┘
                                                        ▼
                                                send to gpt-image-2     ← Phase 3
                                                (renderer + negative
                                                 concatenated)
                                                        │
                                                        ▼
                                            persist heroSnapshot
                                            { composerOutput,
                                              normalizedBrief,
                                              image }
                                                        │
                                                        ▼
                                          composeViewPrompt(snapshot, angle)
                                                        │
                                                        ▼
                                              view render (front/back/etc.)
```

## NormalizedBrief schema

```ts
type ProjectType =
  | 'exhibition_booth'
  | 'brand_activation'
  | 'permanent_interior'
  | 'retail_environment'
  | 'architectural_installation';

interface NormalizedBrief {
  project: {
    id: string;
    name: string;
    type: ProjectType;
  };

  brand: {
    name: string;
    descriptor?: string;          // e.g. "Quantitative trading"
    colors: Array<{
      name: string;
      hex?: string;
      role: 'primary' | 'secondary' | 'accent';
    }>;
    voice?: string;
    industry?: string;
  };

  // Single canonical geometry block — emitted in EXACTLY ONE place in the prompt
  geometry: {
    width: number;                        // in units below
    depth: number;
    area: number;                         // computed
    height: number;                       // max structure height
    units: 'metric' | 'imperial';
    openSides: 1 | 2 | 3 | 4;             // exposes booth type cleanly
    humanScale: number;                   // default 1.7m / 5'8"
    maxObjectSizePctOfFootprint: number;  // default 0.30
    minCirculationWidth: number;          // default 0.9m / 3ft
  };

  // Coordinate-based spatial layout (NOT percentages)
  // Origin = front-left corner. x = width axis (left→right). y = depth axis (front→back).
  zones: Array<{
    id: string;
    purpose: string;                      // FUNCTIONAL descriptor, never a proper name
    x: number;
    y: number;
    width: number;
    depth: number;
    height?: number;
    visibilityPriority: 1 | 2 | 3;        // 1 = primary aisle, 3 = back-of-house
    structuralForm?: 'open' | 'enclosed' | 'canopy' | 'alcove' | 'platform' | 'tower';
    materialIds?: string[];
  }>;

  materials: Array<{
    id: string;
    name: string;
    feel: string;
    finish?: string;
  }>;

  hero: {
    name: string;
    physicalForm: string;                 // "suspended mobius ribbon", etc. — drives architecture
    dimensions?: { width: number; height: number; depth: number };
    materials: string[];
    placementZoneId: string;
  };

  signage: {
    required: Array<{
      content: string;
      type: 'wordmark' | 'descriptor' | 'tagline';
      visibilityRequirement: 'all_sides' | 'front_and_back' | 'front_only';
    }>;
  };

  creative: {
    visualLanguage: string[];             // ["waves", "lines", "round element"]
    referenceLabels: string[];
    embrace: string[];
    avoid: string[];
    forbiddenItems: string[];             // hard-no things (e.g. "bar stools")
    designIntent: string;                 // SHORT poetic narrative — ≤ 300 chars
  };

  // NEW — captured at brief upload via clarification
  context: {
    audience: string[];                   // ["AI researchers", "engineers"]
    venue: {
      name: string;                       // "COEX Convention Center"
      type: 'convention_center' | 'arena' | 'outdoor_plaza' | 'retail_space' | 'flagship_storefront' | 'gallery';
      ambientLight: 'bright_daylit' | 'controlled_indoor' | 'dim_theatrical' | 'outdoor_daylight' | 'mixed';
      ceilingType?: string;
    };
    show?: {
      name: string;                       // "ICML 2025"
      duration: 'single_day' | 'multi_day' | 'permanent';
      neighborhood?: string;
    };
    goals: string[];                      // ["recruit ML engineers"]
    budgetTier: 'standard' | 'premium' | 'ultra';
    timeOfDay: 'morning' | 'midday' | 'evening' | 'controlled';
    staffing: {
      count: number;
      roles: string[];
      attire: 'business' | 'business_casual' | 'casual' | 'branded';
    };
    interactiveTech: string[];
    sustainability?: string[];
  };

  camera: {
    angle: 'hero_34' | 'front' | 'side_left' | 'side_right' | 'back' | 'top' | 'interior' | 'detail';
    eyeLevel: number;                     // in geometry.units
    framing: 'wide' | 'medium' | 'detail';
  };

  // Computed during validate
  compliance: {
    hardConstraints: HardConstraint[];
  };
}

type HardConstraint =
  | { id: 'footprint_match';        status: 'pass' | 'fail' | 'unknown'; message?: string }
  | { id: 'open_sides_clear';       status: 'pass' | 'fail' | 'unknown' }
  | { id: 'signage_present';        status: 'pass' | 'fail' | 'unknown' }
  | { id: 'descriptor_present';     status: 'pass' | 'fail' | 'unknown' }
  | { id: 'hero_scale_ok';          status: 'pass' | 'fail' | 'unknown'; actualPct?: number }
  | { id: 'forbidden_items_absent'; status: 'pass' | 'fail' | 'unknown' };
```

## Validator + interactive clarification

`validateBrief(normalized)` returns:

```ts
interface ValidationResult {
  failures: HardConstraint[];   // constraints whose data is present but wrong
  gaps: Gap[];                  // fields with missing data the validator needs filled
}

interface Gap {
  field: string;                // e.g. 'brand.colors', 'context.venue.type'
  severity: 'blocking' | 'helpful';
  question: string;             // human-readable
  options?: string[];           // optional quick-pick chips
  fallback: unknown;            // value applied if user opts to skip
  source: 'schema' | 'ai';      // schema-derived (v1) vs AI-generated (future)
}
```

**Failures vs gaps — how they surface together.** Both flow through the same UI: `BriefClarification` renders gaps as questions, and renders failures as "this looks wrong" cards with a suggested resolution that itself becomes a gap (e.g. failure: hero dimensions exceed 30% of footprint → gap: "The hero is currently 38% of the footprint. Resize to fit, or override the 30% ceiling for this project?"). A failure can be resolved by either correcting the underlying data (most common) or by explicitly accepting an override (rare; recorded so audits show the choice). Gaps without underlying failures are simply unfilled fields. Both reach zero before the Generate button unblocks.

### `BriefClarification` component behavior

- Renders each gap as a small card: question + quick-pick chips (if `options`) + text fallback + "Skip with default" link
- On answer, writes value back to `parsedBrief` via the existing brief edit flow
- After each answer, re-runs `normalizeBrief()` and `validateBrief()`; the gap list shrinks
- When the gap list is empty, the surrounding flow (brief review / prompt generation) unblocks
- Multiple gaps render in priority order: `blocking` before `helpful`
- Capped at 5 visible questions at a time; "Show all" expander reveals the rest

### Primary surface vs safety net

- **Primary: Brief Review step (existing route).** After `parse-brief` runs, `BriefClarification` fills the gap between what parse-brief extracted and what the normalized brief needs. Goal: the user leaves this step with a fully-populated normalized brief.
- **Safety net: Prompts step.** Only fires if downstream activity introduced new gaps (e.g. hero installation generated by `generate-element` but missing `physicalForm`, or a new zone created on the canvas without a `structuralForm`).

## Composer — 5 output stages

`composePrompt(normalized: NormalizedBrief): ComposerOutput` is a pure function. No side effects. No DB. No AI calls.

```ts
interface ComposerOutput {
  briefJson: NormalizedBrief;   // A. verbatim, for audit
  geometrySummary: string;      // B. text block, see below
  renderer: string;             // C. the actual prompt sent to gpt-image-2
  negative: string;             // D. concatenated into renderer; kept separate for clarity
  compliance: HardConstraint[]; // E. checklist for UI surface
}
```

### Renderer prompt structure

Compact markdown, ~600-1200 tokens total. Sections in priority order:

```markdown
# SCENE
[ ONE sentence: project type + camera angle + framing + render quality ]

# GEOMETRY (ground truth — all elements must obey)
- Footprint: {width} × {depth} {units} ({area} {area_units})
- Maximum structure height: {height} {units}
- Open sides: {openSides}, must remain unobstructed and visible
- Human scale: {humanScale} {units}
- Max hero object: {maxObjectSizePctOfFootprint*area} {area_units} of footprint
- Min circulation: {minCirculationWidth} {units}
All layout, objects, and camera framing MUST obey this geometry.

# STRUCTURAL APPROACH
[ visualLanguage as architecture, hero.physicalForm, zone structural vocabulary ]

# COORDINATE LAYOUT
Origin: front-left corner. x = width axis (left→right). y = depth axis (front→back).
- {zone.purpose}: x={x}, y={y}, w={w}, d={d}, visibility={priority}
- ...

# BRAND
{brand.name}{ + " — " + brand.descriptor if present }
Colors:
- {color.role}: {color.name} ({color.hex if present})
Required signage:
- "{signage.content}" ({signage.type}) — {signage.visibilityRequirement}

# CONTEXT
Venue: {context.venue.name}, {context.venue.type}, {context.venue.ambientLight}
Audience: {context.audience}
Time of day: {context.timeOfDay}
Staffing: {context.staffing.count} {context.staffing.attire}, roles: {context.staffing.roles}

# DESIGN INTENT
{ creative.designIntent — ≤ 300 chars }

# HARD CONSTRAINTS (output MUST satisfy)
- Footprint: exactly {width} × {depth} {units}
- Open sides: {openSides}, unobstructed and visible
- Required signage: {brand.name}{ + " + " + descriptor if present }, visible per requirement
- Hero scale: ≤ {maxObjectSizePctOfFootprint*100}% of footprint
- Forbidden items: {creative.forbiddenItems.join(", ")}
```

### Single-source-of-truth principles

- Geometry appears in **exactly one section** (`# GEOMETRY`). Re-stating dimensions in `# SCENE`, `# CAMERA`, etc. is forbidden.
- Camera framing appears in **exactly one section** (`# SCENE`). The `camera` field on the normalized brief carries the data; the SCENE sentence consumes it.
- Style references (architectural-photography lineage, premium aesthetic) live in `# SCENE` only — never repeated in `# STRUCTURAL APPROACH` or elsewhere.
- Negative-prompt terms live in `# HARD CONSTRAINTS` (forbidden items) and the trailing concatenated `negative` block. Nowhere else.
- Zone names: prompts emit **functional descriptors** only (`zone.purpose`). The AI-authored poetic name (e.g. "The Sanctuary") never reaches the model. This kills the wayfinding-sign hallucination.

## Hero as authoritative render — view derivation

### `heroSnapshot` contract

When `generate-hero` produces an image, the edge function persists a `heroSnapshot` JSONB blob to `project_images.prompt_artifacts` (alongside `project_id`, `angle_id='hero_34'`, `image_url`):

```ts
interface HeroSnapshot {
  composerOutput: ComposerOutput;   // all 5 stages from the hero composition
  normalizedBrief: NormalizedBrief; // snapshot of the brief at hero time
  imageUrl: string;
  generatedAt: string;              // ISO timestamp
}
```

### View composition

View prompts are composed by `composeViewPrompt(heroSnapshot, angle)` which produces a thin overlay:

```markdown
# SCENE
[ camera angle for THIS view — front elevation / left side / etc. ]

# REFERENCE (from hero render, MUST honor)
The hero render is the authoritative version of THIS booth. Materials, palette,
structural form, hero installation, signage placement, lighting — all must
match. The ONLY thing that changes between the hero and this view is the
camera angle.

# CAMERA (specific to this view)
[ camera position, eye level, framing for this angle ]

# ZONE FOCUS (interiors only)
[ which zone, structural details pulled from heroSnapshot.normalizedBrief.zones ]

# CONSTRAINTS
- Booth geometry: identical to hero ({width} × {depth} {units})
- No new materials, no palette shifts, no architectural reinvention
- Brand signage matches hero placement
```

The hero **image** is attached as the multimodal reference. The hero's renderer prompt is NOT re-attached (it's already encoded in the hero pixels and the snapshot is structural reference).

### Implications

- Regenerating the hero updates `heroSnapshot` → next view regeneration sees the new design automatically.
- Editing the brief AFTER the hero is rendered leaves the hero locked. Views continue to match the hero, not the new brief edits. The Prompts step shows a UI affordance ("Brief edited — regenerate hero to apply?") when `heroSnapshot.normalizedBrief` is stale relative to current `normalizedBrief`.
- View-to-view consistency comes free: all views read from the same snapshot.

## Integration points

### New files

- `src/lib/normalizedBrief.ts` — `NormalizedBrief`, `normalizeBrief()`, `validateBrief()`, `composePrompt()`, `composeViewPrompt()`
- `src/components/prompts/BriefClarification.tsx` — gap-question UI
- `src/components/prompts/PromptDebugPanel.tsx` — collapsed panel showing 5 output stages
- `supabase/migrations/<timestamp>_normalize_project_types.sql` — project_type vocabulary migration

### Modified files

- `src/components/brief/BriefUpload.tsx` (or wherever the brief review lives) — mount `BriefClarification` after parse-brief completes
- `src/components/prompts/PromptGenerator.tsx` — call `normalizeBrief` → `validateBrief` → `composePrompt`, render `BriefClarification` for any remaining gaps, hand `ComposerOutput` to renderStore; mount `PromptDebugPanel`
- `src/store/renderStore.ts` — `generateHeroImage`, `generateAllViews`, `regenerateView` accept `composerOutput` (or `heroSnapshot` + `angle` for views); forwards to edge functions
- `supabase/functions/generate-hero/index.ts` — receives `renderer` text + reference URLs; strips the inline structured-prompt logic (now lives in the client composer); persists `heroSnapshot` to `project_images`
- `supabase/functions/generate-view/index.ts` — receives the view's `renderer` text (already composed from `heroSnapshot` on the client) + reference URLs; strips inline prompt logic
- `supabase/functions/parse-brief/index.ts` — emits the new `project_type` vocabulary directly
- `src/lib/designContextBuilder.ts` — **deprecated and removed**; its responsibilities collapse into `normalizeBrief` + `composePrompt`
- `src/lib/promptBuilder.ts` — significantly trimmed; the per-angle prompt builders become thin wrappers that call `composePrompt` or `composeViewPrompt`

### DB changes

```sql
-- migration: normalize project types
UPDATE projects SET project_type = CASE project_type
  WHEN 'trade_show_booth'         THEN 'exhibition_booth'
  WHEN 'live_brand_activation'    THEN 'brand_activation'
  WHEN 'permanent_installation'   THEN 'permanent_interior'
  WHEN 'architectural_brief'      THEN 'architectural_installation'
  WHEN 'film_premiere'            THEN 'brand_activation'
  WHEN 'game_release_activation'  THEN 'brand_activation'
  ELSE project_type
END;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN (
    'exhibition_booth',
    'brand_activation',
    'permanent_interior',
    'retail_environment',
    'architectural_installation'
  ));

-- prompt_artifacts JSONB column on project_images (if not already present)
ALTER TABLE project_images
  ADD COLUMN IF NOT EXISTS prompt_artifacts JSONB;
```

## Phasing

### Phase 1 — Schema, normalizer, validator (no production impact)

- Define `NormalizedBrief` + supporting types in `src/lib/normalizedBrief.ts`
- Implement `normalizeBrief(parsedBrief, spatialData, elements, geometry)` — deterministic projection from existing data into the canonical shape
- Implement `validateBrief(normalized)` — produces `failures` + `gaps`
- Fixture tests against Eqvilent (ICML) and US Cabinet Depot data; verify zone mapping, geometry, gap detection
- **Ships as a pure library. Nothing in production calls it yet.**

### Phase 2 — Composer (no production impact)

- Implement `composePrompt(normalized): ComposerOutput`
- Implement `composeViewPrompt(heroSnapshot, angle): ComposerOutput`
- Snapshot tests on both — produce stable output for fixture briefs
- **Still no production impact; the composer is dark.**

### Phase 3 — Edge function refactor (production goes live)

- `generate-hero`: accepts `renderer` text + `negative` text from the client; concatenates and sends to gpt-image-2; persists `heroSnapshot` to `project_images.prompt_artifacts`
- `generate-view`: accepts `renderer` text from the client (already composed via `composeViewPrompt(heroSnapshot, angle)`)
- `PromptGenerator` is updated to call the new pipeline:
  1. `normalize` → `validate` → if no blocking gaps → `compose` → send
  2. After hero renders, hero's composer output + the snapshot URL is available for view composition
- Old `designContextBuilder.ts` is removed; old structured-prompt logic in both edge functions is removed
- **This is where renders start using the new pipeline.**

### Phase 4 — Interactive clarification UI

- `BriefClarification` component
- Mounted in two places: Brief Review step (primary) and Prompts step (safety net)
- Writes answers back to `parsedBrief` via existing brief edit hooks
- Tested against fixture briefs with various gap shapes

### Phase 5 — Prompt debug panel

- `PromptDebugPanel` component, collapsed by default on the Prompts step
- Renders the 5 output stages with copy-to-clipboard for each
- Helps the team understand what's being sent and why

### Phase 6 — Project type migration

- DB migration (above)
- `parse-brief` emits new types
- UI label updates throughout (project creation, settings, brief review)
- Removal of old type values from the `TYPE_SUFFIX` map in both edge functions

## Backward compatibility

- Existing rendered hero images stay valid. The first time a project hits the new pipeline, the hero is regenerated (or the user explicitly migrates), and `heroSnapshot` populates from that point forward.
- Existing `parsedBrief` data is read by `normalizeBrief` with graceful defaults for missing fields. The validator will flag those as gaps; the user resolves via clarification.
- Old `project_type` values are migrated forward by the DB migration. No data is lost.
- Old composer-less renders persist with empty `prompt_artifacts`. The debug panel handles missing data gracefully (shows "no artifacts available — re-render to populate").

## Future extensions (out of scope here)

These are noted so the architecture leaves room; they are NOT part of this refactor:

- **Prompt template library.** Users save composer outputs (or partial overlays) as named, keyword-tagged templates. Templates can be applied to other projects — the composer accepts an optional `styleOverlay: Partial<ComposerOutput>` argument that overrides specific sections (e.g. lighting + structural approach), while the project's normalized brief drives identity-specific sections (brand, geometry, signage). Keywords are stored alongside the template and surfaced as filters. Mix-and-match works because templates are partial overlays, not replacements.
- **AI-generated clarification questions.** Phase 1's gaps are schema-derived. A future iteration can use a small LLM call to read the parsedBrief + extracted text and produce richer, contextual clarification questions (e.g. "the brief mentions 'premium feel' — which of these material families do you want as primary: wood, metal, fabric, glass?").
- **Brief drift indicator.** When `normalizedBrief` diverges from `heroSnapshot.normalizedBrief` (i.e. brief was edited after hero), a "regenerate hero to apply" affordance surfaces near the hero card.
- **Composer A/B mode.** A flag to run two composer versions side-by-side on the same brief, render both, and compare. Useful for iterating on prompt structure without breaking shipping behavior.

## Open questions (resolved during brainstorming)

- ~~Validation policy (hard stop / soft warn / trust model)?~~ → Interactive clarification.
- ~~Where do the 5 output stages surface?~~ → Debug panel + persisted to project_images.
- ~~Project type mapping?~~ → Replace with 5 canonical types, migrate existing data.
- ~~How do views derive from hero?~~ → `heroSnapshot` is the contract; views read snapshot and apply a camera-angle overlay.
- ~~Are there missing brief fields?~~ → Yes; `context` block added (audience, venue, show, goals, budgetTier, timeOfDay, staffing, interactiveTech, sustainability).
- ~~Where does clarification happen?~~ → Brief Review step (primary), Prompts step (safety net) — same component, same gap shape.

## Success criteria

- An Eqvilent-ICML render goes through the new pipeline without manual project_type correction.
- A US Cabinet Depot render does not produce overhead "The Sanctuary / The Hearth / The Retreat" wayfinding signs.
- A brief that lists "waves, lines, round element" as visual language produces a render with curved/sculptural architecture, not a flat rectangular pavilion.
- Auxiliary views (front, back, sides, details, interiors) hold the hero's palette, materials, and structural form across all five angles.
- The Prompt Debug panel shows all 5 output stages for any rendered image.
- The Brief Review step asks the user 0-N targeted questions to complete a partial brief; the user can answer or skip with defaults.
