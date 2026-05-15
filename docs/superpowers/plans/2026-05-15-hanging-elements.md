# Hanging Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "hanging elements" architectural layer to the brief — overhead structures (rings, halos, fly-rigged banners, suspended LED installations) suspended from venue rigging, distinct from floor-supported booth structure. Each element is richly attributed (form, materials, surfaces, lighting, printed graphics) and positioned via the spatial canvas.

**Architecture:** New `NormalizedBriefHanging` block on `NormalizedBrief`, parallel to `signage`. Five surfaces touched in dependency order: schema → parser → validator → composer → UI (brief review card + spatial canvas top-down + iso). Renderer prompt gets a new `# HANGING ELEMENTS` section with explicit "suspended from venue rigging, not booth structure" language so gpt-image-2 renders genuine separation. Spec at `docs/superpowers/specs/2026-05-15-hanging-elements-design.md`.

**Tech Stack:** TypeScript (strict) + React 18 + Vite + Supabase + Deno edge functions. Vitest + jsdom for client tests. Existing fixture pattern (Eqvilent + US Cabinet Depot) for end-to-end normalizer/composer coverage. Spatial canvas built on a custom 2D renderer (`src/components/spatial/SpatialCanvas.tsx`) plus a Three.js iso preview (`src/components/spatial/SpatialCanvasIso.tsx`).

---

## Task 1: Schema + normalizer + safeBrief defaults

**Files:**
- Modify: `src/lib/normalizedBrief.ts` (add types, normalizer, safeBrief defaults)
- Modify: `src/lib/normalizedBrief.test.ts` (add fixture tests for the new shape)
- Modify: `supabase/functions/parse-brief/index.ts` (JSON schema slot for hangingElements)

- [ ] **Step 1: Write the failing test for the hanging schema**

Add to `src/lib/normalizedBrief.test.ts` at the end of the existing describe block for `normalizeBrief`:

```ts
describe("hanging elements", () => {
  it("normalizes a parsed brief with one hanging element", () => {
    const parsed = {
      ...minimalParsedBrief,
      hangingElements: [
        {
          name: "Primary identity ring",
          physicalForm: "white LED-lit ring, 3m diameter × 0.3m thick, internally backlit acrylic with brushed aluminum frame.",
          shape: "ring",
          estimatedDimensions: "3m diameter × 0.3m thick",
          suspensionHint: "centered above the booth, 4ft below venue ceiling",
          materials: ["brushed aluminum", "internally backlit white acrylic"],
          surfaces: ["front-facing edge: brand wordmark in cut-vinyl"],
          lighting: ["edge-lit perimeter glow", "downcast 4000K wash on booth"],
          printed: ["front: brand logotype"],
        },
      ],
    };
    const n = normalizeBrief(parsed, mockGeometry(), {});
    expect(n.hanging.elements).toHaveLength(1);
    const el = n.hanging.elements[0];
    expect(el.id).toMatch(/^hang_/);
    expect(el.name).toBe("Primary identity ring");
    expect(el.shape).toBe("ring");
    expect(el.dimensions.width).toBeGreaterThan(0);
    expect(el.dimensions.depth).toBeGreaterThan(0);
    expect(el.suspensionDropFt).toBeGreaterThan(0);
    expect(el.materials).toContain("brushed aluminum");
    expect(el.printed).toContain("front: brand logotype");
  });

  it("defaults hanging.elements to empty array when parsed brief omits it", () => {
    const n = normalizeBrief(minimalParsedBrief, mockGeometry(), {});
    expect(n.hanging.elements).toEqual([]);
  });

  it("survives a legacy parsedBrief with no hangingElements key", () => {
    // Type assertion to simulate a pre-feature parsedBrief
    const legacy = { ...minimalParsedBrief } as Record<string, unknown>;
    delete legacy.hangingElements;
    const n = normalizeBrief(legacy as typeof minimalParsedBrief, mockGeometry(), {});
    expect(n.hanging.elements).toEqual([]);
  });
});
```

Use the existing `minimalParsedBrief` and `mockGeometry()` test helpers in the file.

- [ ] **Step 2: Run the test, confirm it fails**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`

Expected: 3 new tests fail with `TS2339: Property 'hanging' does not exist on type 'NormalizedBrief'` (or runtime "undefined") because the types and normalizer haven't been added yet.

- [ ] **Step 3: Add the type definitions to `normalizedBrief.ts`**

Insert immediately above `export interface NormalizedBrief {`:

```ts
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
  shape: "rect" | "circle" | "oval" | "ring" | "custom";
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
```

Then add `hanging: NormalizedBriefHanging;` to the `NormalizedBrief` interface alongside `signage`:

```ts
export interface NormalizedBrief {
  project: NormalizedBriefProject;
  brand: NormalizedBriefBrand;
  geometry: NormalizedBriefGeometry;
  zones: NormalizedBriefZone[];
  materials: NormalizedBriefMaterial[];
  hero: NormalizedBriefHero;
  signage: NormalizedBriefSignage;
  hanging: NormalizedBriefHanging;  // ← new
  creative: NormalizedBriefCreative;
  context: NormalizedBriefContext;
  camera: NormalizedBriefCamera;
  compliance: NormalizedBriefCompliance;
}
```

- [ ] **Step 4: Add the normalizer helper function**

Insert above `normalizeBrief` (the existing function):

```ts
/**
 * Convert a parsed-brief hanging entry into a NormalizedHangingElement.
 * Parser gives us free-text dimensions and positional hints; this is
 * where we coerce to numeric coordinates with sensible defaults.
 *
 * Defaults when fields are missing:
 *   - shape: "ring" (most common authored form)
 *   - position: booth center
 *   - dimensions: width = 1/3 of booth width, depth = same, thickness 1ft
 *   - suspensionDropFt: 3 (typical clearance for visibility from across hall)
 */
function normalizeHangingElement(
  raw: ParsedHangingElement,
  geometry: NormalizedBriefGeometry,
  idx: number,
): NormalizedHangingElement {
  const id = `hang_${Date.now().toString(36)}_${idx}`;
  const defaultDim = geometry.width / 3;
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim().length > 0
      ? raw.name.trim()
      : `Hanging element ${idx + 1}`,
    physicalForm: typeof raw.physicalForm === "string" ? raw.physicalForm.trim() : "",
    shape: ["rect", "circle", "oval", "ring", "custom"].includes(raw.shape as string)
      ? (raw.shape as NormalizedHangingElement["shape"])
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
```

Add the matching parsed-shape type at the top of the file with the other parsed-shape types:

```ts
/**
 * Shape of a single hanging element as it arrives from the parse-brief
 * edge function. Free-text dimensions and positional hints; numeric
 * coercion happens in normalizeHangingElement.
 */
interface ParsedHangingElement {
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
```

- [ ] **Step 5: Wire the normalizer into `normalizeBrief`**

Inside the `normalizeBrief` function, find where `signage` is assembled and add after it (search for `signage: { required: signageRequired }`):

```ts
const hangingElements: NormalizedHangingElement[] = Array.isArray(
  (b as { hangingElements?: unknown }).hangingElements,
)
  ? (b as { hangingElements: ParsedHangingElement[] }).hangingElements.map(
      (raw, idx) => normalizeHangingElement(raw, geometry, idx),
    )
  : [];
```

Then add `hanging: { elements: hangingElements },` to the returned object alongside `signage: { required: signageRequired }`.

- [ ] **Step 6: Update `safeBrief` defaults**

Find `safeBrief` near the bottom of the file. Add `hangingElements: [],` to its returned object so legacy briefs without the field still normalize cleanly.

- [ ] **Step 7: Run the test, verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`

Expected: 3 hanging-element tests pass. All other existing tests still pass.

- [ ] **Step 8: Add the JSON schema slot to parse-brief**

Edit `supabase/functions/parse-brief/index.ts`. Find the parsedBrief JSON schema (look for `"signage"` to anchor). Add immediately after the `signage` property:

```jsonc
"hangingElements": {
  "type": "array",
  "description": "Overhead structures suspended from venue rigging above the booth. Each is a small architectural object — not just a sign. Examples: 'overhead identity ring', 'hanging sign with white LED wordmark', 'suspended halo above lounge'. Look for phrases like 'hanging sign', 'overhead sign', 'suspended from', 'ring above', 'halo', 'fly-rigged', 'rigging-supported'. Empty array if the brief doesn't mention any.",
  "items": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Short label, e.g. 'Primary identity ring'." },
      "physicalForm": { "type": "string", "description": "1-2 sentence sculptural description of the structure." },
      "shape": { "type": "string", "enum": ["rect", "circle", "oval", "ring", "custom"] },
      "estimatedDimensions": { "type": "string", "description": "Free-text, e.g. '3m diameter x 0.3m thick'." },
      "suspensionHint": { "type": "string", "description": "Free-text positional hint, e.g. 'centered over hero zone'." },
      "materials": { "type": "array", "items": { "type": "string" } },
      "surfaces": { "type": "array", "items": { "type": "string" }, "description": "Per-face descriptions, e.g. ['front face: white LED wordmark']." },
      "lighting": { "type": "array", "items": { "type": "string" } },
      "printed": { "type": "array", "items": { "type": "string" }, "description": "Printed graphics, e.g. ['front: brand logotype']." }
    }
  }
}
```

Also append `hangingElements` to the parser's system-prompt guidance (look for the "Extract the following fields" or similar block in the same file) so the LLM knows to populate it.

- [ ] **Step 9: Run Deno typecheck on the edge function**

Run: `deno check supabase/functions/parse-brief/index.ts`
Expected: Clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts supabase/functions/parse-brief/index.ts
git commit -m "$(cat <<'EOF'
feat(hanging): schema + normalizer + parse-brief slot

Task 1 of the hanging-elements feature. Adds the NormalizedBriefHanging
schema with per-element rich attributes (form, materials, surfaces,
lighting, printed graphics, position, suspension drop), the normalizer
helper that converts parse-brief output into the typed shape with
sensible defaults, and the JSON schema slot in parse-brief so the LLM
extracts hanging-element data from brief PDFs.

Default hanging.elements is an empty array — feature is opt-in and
legacy briefs without the field normalize cleanly via safeBrief.

Test coverage: 3 new fixture tests in normalizedBrief.test.ts
(populated entry, missing key, legacy brief).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Validator gap + applyGapAnswer

**Files:**
- Modify: `src/lib/normalizedBrief.ts` (extend validateBrief + applyGapAnswer)
- Modify: `src/lib/normalizedBrief.test.ts` (gap-detection and skip tests)

- [ ] **Step 1: Write the failing test for the validator gap**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
describe("hanging elements clarification gap", () => {
  it("emits a helpful gap when hanging.elements is empty and not skipped", () => {
    const n = normalizeBrief(minimalParsedBrief, mockGeometry(), {});
    const { gaps } = validateBrief(n, {});
    const gap = gaps.find((g) => g.field === "hanging.elements");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("helpful");
    expect(gap?.question).toMatch(/hanging/i);
    expect(gap?.options).toEqual(["Yes — add one", "No — floor-only booth"]);
  });

  it("does NOT emit the gap when hanging.elements is non-empty", () => {
    const parsed = {
      ...minimalParsedBrief,
      hangingElements: [{ name: "Primary ring", physicalForm: "white ring" }],
    };
    const n = normalizeBrief(parsed, mockGeometry(), {});
    const { gaps } = validateBrief(n, {});
    expect(gaps.find((g) => g.field === "hanging.elements")).toBeUndefined();
  });

  it("does NOT emit the gap when the user previously skipped", () => {
    const n = normalizeBrief(minimalParsedBrief, mockGeometry(), {});
    const { gaps } = validateBrief(n, { "hanging.elements": true });
    expect(gaps.find((g) => g.field === "hanging.elements")).toBeUndefined();
  });

  it("applyGapAnswer with 'Yes — add one' writes a default hanging element", () => {
    const updated = applyGapAnswer(
      minimalParsedBrief,
      "hanging.elements",
      "Yes — add one",
    );
    expect(updated.hangingElements).toBeDefined();
    expect((updated.hangingElements ?? []).length).toBe(1);
    expect((updated.hangingElements ?? [])[0]?.name).toMatch(/identity|hanging/i);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: 4 new tests fail because the gap and applyGapAnswer branch don't exist yet.

- [ ] **Step 3: Add the validator gap**

In `validateBrief` (find the function in `normalizedBrief.ts`), inside the gap-collection block, add:

```ts
// hanging.elements — helpful gap surfaced when the brief has no
// overhead structure declared. Users can answer "yes — add one" to
// seed a default and refine in Brief Review, or "no" to skip the
// nag for this project. Common on island booths but not universal.
if (
  normalized.hanging.elements.length === 0 &&
  !skipMap["hanging.elements"]
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
```

- [ ] **Step 4: Add the applyGapAnswer branch**

In `applyGapAnswer` (same file), add a new case before the default fallback:

```ts
if (field === "hanging.elements") {
  if (typeof value === "string" && value.startsWith("Yes")) {
    // Seed a default hanging element. User refines attributes in
    // Brief Review; position is centered above booth by default.
    return {
      ...parsedBrief,
      hangingElements: [
        {
          name: "Primary identity sign",
          physicalForm:
            "Overhead branded structure visible from across the hall — typically a ring or halo silhouette with internal lighting.",
          shape: "ring",
          materials: ["brushed aluminum frame", "internally backlit white acrylic"],
          surfaces: ["front-facing edge: brand wordmark"],
          lighting: ["edge-lit perimeter glow"],
          printed: ["front: brand logotype"],
        },
      ],
    };
  }
  // "No — floor-only booth" → leave hangingElements absent. The
  // skip is recorded separately by the caller via skipMap, so this
  // branch is a no-op here.
  return parsedBrief;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all 4 new tests pass; full suite still green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "$(cat <<'EOF'
feat(hanging): validator gap + applyGapAnswer for hanging elements

Task 2 of the hanging-elements feature. validateBrief now emits a
helpful (non-blocking) gap when hanging.elements is empty so the
user gets a one-click "add a default hanging element" path during
brief clarification. The skip option records skipMap so it doesn't
re-fire on the same project.

applyGapAnswer handles "Yes — add one" by seeding a default ring-
shaped element with brand-wordmark surfaces and edge-lit perimeter.
The user refines materials, dimensions, and position in Brief
Review (task 4) and on the spatial canvas (task 5).

Test coverage: 4 new tests covering gap emission, gap suppression
when populated/skipped, and the applyGapAnswer default-seed path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Composer section

**Files:**
- Modify: `src/lib/normalizedBrief.ts` (extend composePrompt)
- Modify: `src/lib/normalizedBrief.test.ts` (composer snapshot tests)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/normalizedBrief.test.ts`:

```ts
describe("composePrompt — hanging elements section", () => {
  it("omits the # HANGING ELEMENTS section when no elements exist", () => {
    const n = normalizeBrief(minimalParsedBrief, mockGeometry(), {});
    const out = composePrompt(n);
    expect(out.renderer).not.toMatch(/# HANGING ELEMENTS/);
  });

  it("includes the # HANGING ELEMENTS section with intro + per-element details", () => {
    const parsed = {
      ...minimalParsedBrief,
      hangingElements: [
        {
          name: "Primary identity ring",
          physicalForm: "White LED-lit ring, internally backlit acrylic.",
          shape: "ring",
          materials: ["brushed aluminum", "backlit acrylic"],
          surfaces: ["front-facing edge: brand wordmark"],
          lighting: ["edge-lit perimeter glow"],
          printed: ["front: brand logotype"],
        },
      ],
    };
    const n = normalizeBrief(parsed, mockGeometry(), {});
    const out = composePrompt(n);

    expect(out.renderer).toMatch(/# HANGING ELEMENTS/);
    // Weight-bearing language must be present so the model
    // renders separation from booth structure
    expect(out.renderer).toMatch(/SUSPENDED from the venue rigging/i);
    expect(out.renderer).toMatch(/NOT attached to the booth structure/i);
    // Per-element details
    expect(out.renderer).toMatch(/Primary identity ring/);
    expect(out.renderer).toMatch(/edge-lit perimeter glow/);
    expect(out.renderer).toMatch(/front: brand logotype/);
  });

  it("appends one note to # STRUCTURAL APPROACH when hanging elements exist", () => {
    const parsed = {
      ...minimalParsedBrief,
      hangingElements: [{ name: "Ring", physicalForm: "white ring" }],
    };
    const n = normalizeBrief(parsed, mockGeometry(), {});
    const out = composePrompt(n);
    expect(out.renderer).toMatch(
      /Floor-supported structures \(walls, fascia, hero installation\) are visually distinct from the hanging elements above/i,
    );
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: 3 new composer tests fail because the section doesn't exist yet.

- [ ] **Step 3: Add a helper to derive `positionPhrase`**

Insert above `composePrompt`:

```ts
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
```

- [ ] **Step 4: Add the composer section**

In `composePrompt`, find where the `# SPACE` section is pushed onto `sections`. Add immediately after it:

```ts
// # HANGING ELEMENTS — only present when elements exist. Section
// teaches the model that these structures hang from venue rigging
// and are NOT supported by the booth, so render visible separation.
if (n.hanging.elements.length > 0) {
  const u = n.geometry.units === "metric" ? "m" : "ft";
  const lines: string[] = [
    "# HANGING ELEMENTS",
    "These structures are SUSPENDED from the venue rigging/ceiling above the booth. They are NOT attached to the booth structure below — the booth does not bear their weight. Render them as truly suspended overhead with visible separation from the booth structure beneath.",
    "",
  ];
  for (const el of n.hanging.elements) {
    const phrase = positionPhraseFor(el, n.geometry);
    lines.push(`- ${el.name}`);
    if (el.physicalForm) lines.push(`  Form: ${el.physicalForm}`);
    lines.push(
      `  Geometry: ${formatNumber(el.dimensions.width)} × ${formatNumber(el.dimensions.depth)} × ${formatNumber(el.dimensions.thicknessFt)} ${u}, ${el.shape} outline, positioned ${phrase} the booth, ${formatNumber(el.suspensionDropFt)}ft below the venue ceiling.`,
    );
    if (el.materials.length > 0) {
      lines.push(`  Materials: ${el.materials.join(", ")}`);
    }
    if (el.surfaces.length > 0) {
      lines.push(`  Surfaces: ${el.surfaces.join("; ")}`);
    }
    if (el.lighting.length > 0) {
      lines.push(`  Lighting: ${el.lighting.join(", ")}`);
    }
    if (el.printed.length > 0) {
      lines.push(`  Printed: ${el.printed.join("; ")}`);
    }
    lines.push("");
  }
  sections.push(lines.join("\n").trimEnd());
}
```

- [ ] **Step 5: Add the STRUCTURAL APPROACH note when hanging elements exist**

In the same function, find the `# STRUCTURAL APPROACH` block (the `if (n.creative.visualLanguage.length > 0 || …) { … }` block). Inside that block, after the existing `sa.push("What this section is NOT asking for: …")` line, add:

```ts
if (n.hanging.elements.length > 0) {
  sa.push(
    "Floor-supported structures (walls, fascia, hero installation) are visually distinct from the hanging elements above — there is open air between them.",
  );
}
```

- [ ] **Step 6: Add the `hanging_elements_aloft` hard constraint**

Per spec §7. In `normalizedBrief.ts`, extend the `HardConstraint` union to include the new id:

```ts
export type HardConstraint =
  | { id: "footprint_match"; status: "pass" | "fail" | "unknown"; message?: string }
  | { id: "open_sides_clear"; status: "pass" | "fail" | "unknown" }
  | { id: "signage_present"; status: "pass" | "fail" | "unknown" }
  | { id: "descriptor_present"; status: "pass" | "fail" | "unknown" }
  | { id: "hero_scale_ok"; status: "pass" | "fail" | "unknown"; actualPct?: number }
  | { id: "forbidden_items_absent"; status: "pass" | "fail" | "unknown" }
  | { id: "hanging_elements_aloft"; status: "pass" | "fail" | "unknown"; message?: string };  // ← new
```

In the compliance-assembly block of `normalizeBrief` (search for the existing `hardConstraints.push(...)` calls), add:

```ts
// hanging_elements_aloft — visual constraint: when hanging elements
// exist, they must render clearly above and detached from booth
// structure. Status set to "unknown" at composition time (we can't
// statically verify a visual rule). Reserved for future post-render
// CV checks. Listed in compliance so the # HARD CONSTRAINTS prompt
// block reminds the model.
if (hangingElements.length > 0) {
  hardConstraints.push({
    id: "hanging_elements_aloft",
    status: "unknown",
    message: "Hanging elements must appear clearly above and visually detached from the booth structure.",
  });
}
```

In the `# HARD CONSTRAINTS` section of `composePrompt` (search for `## HARD CONSTRAINTS` or `hc.push`), add a conditional line:

```ts
if (n.hanging.elements.length > 0) {
  hc.push(
    "- Hanging elements appear clearly above and detached from the booth structure (open air between them).",
  );
}
```

Add a test for this in `normalizedBrief.test.ts`:

```ts
it("includes the hanging_elements_aloft constraint and prompt line when elements exist", () => {
  const parsed = {
    ...minimalParsedBrief,
    hangingElements: [{ name: "Ring", physicalForm: "white ring" }],
  };
  const n = normalizeBrief(parsed, mockGeometry(), {});
  expect(
    n.compliance.hardConstraints.find((c) => c.id === "hanging_elements_aloft"),
  ).toBeDefined();
  const out = composePrompt(n);
  expect(out.renderer).toMatch(
    /Hanging elements appear clearly above and detached from the booth structure/i,
  );
});

it("does NOT include the hanging_elements_aloft constraint when no elements", () => {
  const n = normalizeBrief(minimalParsedBrief, mockGeometry(), {});
  expect(
    n.compliance.hardConstraints.find((c) => c.id === "hanging_elements_aloft"),
  ).toBeUndefined();
});
```

- [ ] **Step 7: Run the tests, verify they pass**

Run: `./node_modules/.bin/vitest run src/lib/normalizedBrief.test.ts`
Expected: all 5 new composer tests pass (3 from step 1 + 2 from step 6). Full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/normalizedBrief.ts src/lib/normalizedBrief.test.ts
git commit -m "$(cat <<'EOF'
feat(hanging): composer section + STRUCTURAL APPROACH separation note

Task 3 of the hanging-elements feature. Adds a new # HANGING
ELEMENTS section to the renderer prompt, positioned between # SPACE
and # STRUCTURAL APPROACH. Section opens with explicit "suspended
from venue rigging, NOT attached to booth structure" language so
gpt-image-2 renders genuine separation between the overhead
elements and the booth below.

Per-element details include physical form, geometry, position
relative to booth (derived via positionPhraseFor helper that
buckets x/y into "front/center/back" × "left/center/right"
quadrants), materials, surfaces, lighting, and printed graphics.

Also appends a one-line note to # STRUCTURAL APPROACH reminding
the model that floor-supported structures and hanging elements are
visually distinct with open air between them.

Section is OMITTED entirely when hanging.elements is empty — no
empty-section bloat in the dominant zero-element case.

Also adds the hanging_elements_aloft hard constraint (status
"unknown" at composition time — reserved for future post-render CV
verification) and a corresponding line in the # HARD CONSTRAINTS
prompt block.

Test coverage: 5 new composer tests (omitted, present, structural-
note appended, hard-constraint included when present, hard-
constraint absent when empty).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Brief Review card

**Files:**
- Create: `src/components/brief/BriefHangingCard.tsx`
- Create: `src/components/brief/BriefHangingCard.test.tsx`
- Modify: `src/pages/BriefReview.tsx` (mount the card)

- [ ] **Step 1: Locate the existing BriefReview component**

Run: `grep -n "Hero Information\|Brand Information\|Target Audiences" src/pages/BriefReview.tsx | head -10`

This anchors where to mount the new card. Expected to find a series of card-style sections — the new card will sit after the Hero section.

- [ ] **Step 2: Write the failing test**

Create `src/components/brief/BriefHangingCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefHangingCard } from "./BriefHangingCard";
import type { NormalizedHangingElement } from "@/lib/normalizedBrief";

const sampleElement: NormalizedHangingElement = {
  id: "hang_x_0",
  name: "Primary identity ring",
  physicalForm: "White LED-lit ring, internally backlit.",
  shape: "ring",
  dimensions: { width: 3, depth: 3, thicknessFt: 1 },
  suspensionDropFt: 3,
  position: { x: 3, y: 3 },
  materials: ["brushed aluminum"],
  surfaces: ["front: brand wordmark"],
  lighting: ["edge-lit"],
  printed: ["front: logotype"],
};

describe("BriefHangingCard", () => {
  it("shows the empty state when no elements", () => {
    render(<BriefHangingCard elements={[]} onChange={() => {}} />);
    expect(screen.getByText(/no hanging elements/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders one sub-card per element", () => {
    render(
      <BriefHangingCard
        elements={[sampleElement]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Primary identity ring")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/White LED-lit ring/)).toBeInTheDocument();
  });

  it("calls onChange with a new element when Add clicked", () => {
    const onChange = vi.fn();
    render(<BriefHangingCard elements={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as NormalizedHangingElement[];
    expect(next).toHaveLength(1);
    expect(next[0].shape).toBe("ring");
  });

  it("calls onChange with the element removed when X clicked", () => {
    const onChange = vi.fn();
    render(
      <BriefHangingCard
        elements={[sampleElement]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/remove/i));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("updates the name field via onChange", () => {
    const onChange = vi.fn();
    render(
      <BriefHangingCard
        elements={[sampleElement]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("Primary identity ring"), {
      target: { value: "Renamed ring" },
    });
    expect(onChange).toHaveBeenCalled();
    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0] as NormalizedHangingElement[];
    expect(latest[0].name).toBe("Renamed ring");
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `./node_modules/.bin/vitest run src/components/brief/BriefHangingCard.test.tsx`
Expected: 5 tests fail with "Cannot find module".

- [ ] **Step 4: Create the BriefHangingCard component**

Create `src/components/brief/BriefHangingCard.tsx`:

```tsx
// BriefHangingCard — authoring UI for overhead hanging elements on
// the Brief Review page. Renders one sub-card per element with
// editable fields (name, physical form, shape, dimensions,
// suspension drop, chip-add arrays for materials/surfaces/lighting/
// printed). Position is read-only here — user opens the spatial
// canvas (task 5) to drag-position. Empty state shows an "Add"
// CTA so the user can author without going through the brief
// clarification gap path.

import { useCallback } from "react";
import type { NormalizedHangingElement } from "@/lib/normalizedBrief";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Wind } from "lucide-react";

interface ChipListProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}

function ChipList({ label, values, onChange, placeholder }: ChipListProps) {
  const remove = (idx: number) => {
    const next = values.slice();
    next.splice(idx, 1);
    onChange(next);
  };
  const add = (val: string) => {
    if (!val.trim()) return;
    onChange([...values, val.trim()]);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${v}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        className="h-8 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
      />
    </div>
  );
}

export interface BriefHangingCardProps {
  elements: NormalizedHangingElement[];
  onChange: (next: NormalizedHangingElement[]) => void;
}

export function BriefHangingCard({ elements, onChange }: BriefHangingCardProps) {
  const update = useCallback(
    (idx: number, patch: Partial<NormalizedHangingElement>) => {
      const next = elements.slice();
      next[idx] = { ...next[idx], ...patch };
      onChange(next);
    },
    [elements, onChange],
  );

  const addNew = () => {
    const id = `hang_${Date.now().toString(36)}_${elements.length}`;
    onChange([
      ...elements,
      {
        id,
        name: `Hanging element ${elements.length + 1}`,
        physicalForm: "",
        shape: "ring",
        dimensions: { width: 3, depth: 3, thicknessFt: 1 },
        suspensionDropFt: 3,
        position: { x: 0, y: 0 },
        materials: [],
        surfaces: [],
        lighting: [],
        printed: [],
      },
    ]);
  };

  const remove = (idx: number) => {
    const next = elements.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wind className="h-4 w-4 text-primary" />
          Hanging Elements
          {elements.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">
              ({elements.length})
            </span>
          )}
        </CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={addNew}>
          <Plus className="h-3 w-3 mr-1" />
          Add hanging element
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {elements.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No hanging elements. The booth will render as floor-only.
            Click "Add hanging element" to author one.
          </p>
        ) : (
          elements.map((el, idx) => (
            <div
              key={el.id}
              className="rounded-lg border border-border bg-muted/10 p-3 space-y-3"
            >
              <div className="flex items-start gap-2">
                <Input
                  value={el.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  placeholder="Name (e.g. Primary identity ring)"
                  className="flex-1 font-medium"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(idx)}
                  aria-label={`Remove ${el.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Physical form
                </Label>
                <Textarea
                  value={el.physicalForm}
                  onChange={(e) => update(idx, { physicalForm: e.target.value })}
                  placeholder="1-2 sentence sculptural description"
                  className="min-h-[60px] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Shape</Label>
                  <Select
                    value={el.shape}
                    onValueChange={(v) =>
                      update(idx, { shape: v as NormalizedHangingElement["shape"] })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ring">Ring</SelectItem>
                      <SelectItem value="rect">Rectangle</SelectItem>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="oval">Oval</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Suspension drop (ft)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={el.suspensionDropFt}
                    onChange={(e) =>
                      update(idx, {
                        suspensionDropFt: Number(e.target.value),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Width</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={el.dimensions.width}
                    onChange={(e) =>
                      update(idx, {
                        dimensions: {
                          ...el.dimensions,
                          width: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Depth</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={el.dimensions.depth}
                    onChange={(e) =>
                      update(idx, {
                        dimensions: {
                          ...el.dimensions,
                          depth: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Thickness (ft)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={el.dimensions.thicknessFt}
                    onChange={(e) =>
                      update(idx, {
                        dimensions: {
                          ...el.dimensions,
                          thicknessFt: Number(e.target.value),
                        },
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <ChipList
                label="Materials"
                values={el.materials}
                onChange={(next) => update(idx, { materials: next })}
                placeholder="e.g. brushed aluminum, then Enter"
              />
              <ChipList
                label="Surfaces"
                values={el.surfaces}
                onChange={(next) => update(idx, { surfaces: next })}
                placeholder="e.g. front: brand wordmark, then Enter"
              />
              <ChipList
                label="Lighting"
                values={el.lighting}
                onChange={(next) => update(idx, { lighting: next })}
                placeholder="e.g. edge-lit, then Enter"
              />
              <ChipList
                label="Printed graphics"
                values={el.printed}
                onChange={(next) => update(idx, { printed: next })}
                placeholder="e.g. front: logotype, then Enter"
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `./node_modules/.bin/vitest run src/components/brief/BriefHangingCard.test.tsx`
Expected: 5/5 pass.

- [ ] **Step 6: Mount the card in BriefReview**

In `src/pages/BriefReview.tsx`, add the import near the other `@/components/brief/` imports:

```ts
import { BriefHangingCard } from "@/components/brief/BriefHangingCard";
```

Find where the Hero section card is rendered, and add immediately after it:

```tsx
<BriefHangingCard
  elements={normalized.hanging.elements}
  onChange={(next) => {
    // Map back to ParsedHangingElement shape for parsedBrief
    // (the normalizer round-trips through these shapes).
    handleParsedBriefChange({
      ...parsedBrief,
      hangingElements: next.map((el) => ({
        name: el.name,
        physicalForm: el.physicalForm,
        shape: el.shape,
        materials: el.materials,
        surfaces: el.surfaces,
        lighting: el.lighting,
        printed: el.printed,
      })),
    });
  }}
/>
```

Replace `handleParsedBriefChange` with whatever the existing handler is named in your codebase — search the file for how the Hero section commits edits.

- [ ] **Step 7: Run TypeScript + full test suite**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && ./node_modules/.bin/vitest run`
Expected: TS clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/brief/BriefHangingCard.tsx src/components/brief/BriefHangingCard.test.tsx src/pages/BriefReview.tsx
git commit -m "$(cat <<'EOF'
feat(hanging): Brief Review card for authoring hanging elements

Task 4 of the hanging-elements feature. New BriefHangingCard
component mounted on the Brief Review page alongside the existing
brand/audience/hero cards. Empty state shows a one-click "Add
hanging element" CTA; populated state renders one sub-card per
element with editable fields:

- Name + physical form (1-2 sentence description)
- Shape select (ring / rect / circle / oval / custom)
- Suspension drop (ft below venue ceiling)
- Width × depth × thickness (numeric)
- Chip-add arrays for materials, surfaces, lighting, printed graphics

Position fields are intentionally NOT edited here — task 5 adds the
spatial canvas layer where the user drags to position. The card
just summarises position read-only in a future iteration.

Test coverage: 5 component tests (empty state, populated state,
add new, remove, edit name).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Spatial canvas top-down layer

**Files:**
- Modify: `src/components/spatial/SpatialCanvas.tsx` (render dashed hanging outlines + drag/resize)
- Modify: `src/components/spatial/SpatialCanvas.test.tsx` (or create if missing) — drag math
- Modify: `src/components/spatial/SpatialPlanner.tsx` (toolbar button + show/hide toggle)
- Modify: `src/lib/geometryModel.ts` (add hanging elements to BoothGeometry)

- [ ] **Step 1: Extend BoothGeometry**

In `src/lib/geometryModel.ts`, add to the `BoothGeometry` interface (near `zones` and `features`):

```ts
hangingElements?: AbsoluteHangingElement[];
```

And add the `AbsoluteHangingElement` interface:

```ts
export interface AbsoluteHangingElement {
  id: string;
  name: string;
  x: number;        // booth-local (front-left origin)
  y: number;
  width: number;
  depth: number;
  thicknessFt: number;
  shape: "rect" | "circle" | "oval" | "ring" | "custom";
  suspensionDropFt: number;
}
```

Update `boothGeometryFromLegacy` to default `hangingElements` to `[]` when the source has no field.

- [ ] **Step 2: Write the canvas drag-math test**

If `SpatialCanvas.test.tsx` doesn't exist, create it with:

```tsx
import { describe, it, expect } from "vitest";
import {
  // The drag-math helpers should be exported for unit testing.
  hangingElementAtPoint,
  moveHangingElement,
} from "./SpatialCanvas";

describe("SpatialCanvas hanging-element math", () => {
  const el = {
    id: "h1",
    name: "Ring",
    x: 3,
    y: 3,
    width: 2,
    depth: 2,
    thicknessFt: 1,
    shape: "ring" as const,
    suspensionDropFt: 3,
  };

  it("hangingElementAtPoint returns the element when the click is inside its top-down footprint", () => {
    expect(hangingElementAtPoint([el], { x: 3.5, y: 3.5 })).toBe(el);
  });

  it("hangingElementAtPoint returns null when the click is outside", () => {
    expect(hangingElementAtPoint([el], { x: 0, y: 0 })).toBeNull();
  });

  it("moveHangingElement updates position by the drag delta", () => {
    const moved = moveHangingElement(el, { dx: 1, dy: -0.5 });
    expect(moved.x).toBe(4);
    expect(moved.y).toBe(2.5);
  });
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `./node_modules/.bin/vitest run src/components/spatial/SpatialCanvas.test.tsx`
Expected: imports fail because the helpers don't exist yet.

- [ ] **Step 4: Add the helpers + canvas rendering**

In `src/components/spatial/SpatialCanvas.tsx`:

a) Export the helpers near the top of the file:

```ts
export function hangingElementAtPoint(
  elements: AbsoluteHangingElement[],
  point: { x: number; y: number },
): AbsoluteHangingElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (
      point.x >= el.x - el.width / 2 &&
      point.x <= el.x + el.width / 2 &&
      point.y >= el.y - el.depth / 2 &&
      point.y <= el.y + el.depth / 2
    ) {
      return el;
    }
  }
  return null;
}

export function moveHangingElement(
  el: AbsoluteHangingElement,
  delta: { dx: number; dy: number },
): AbsoluteHangingElement {
  return { ...el, x: el.x + delta.dx, y: el.y + delta.dy };
}
```

b) Inside the canvas render function, after the floor-zones rendering loop, add a new render pass for hanging elements (only when `showHanging` prop is true):

```tsx
{showHanging &&
  (geometry.hangingElements ?? []).map((el) => {
    const px = toPx(el.x);
    const py = toPx(el.y);
    const pw = toPx(el.width);
    const pd = toPx(el.depth);
    return (
      <g
        key={el.id}
        onMouseDown={(e) => handleHangingMouseDown(e, el)}
        style={{ cursor: "move" }}
      >
        <rect
          x={px - pw / 2}
          y={py - pd / 2}
          width={pw}
          height={pd}
          fill="rgba(99, 102, 241, 0.12)"
          stroke="rgb(99, 102, 241)"
          strokeWidth={1.5}
          strokeDasharray="6 3"
          rx={el.shape === "ring" || el.shape === "circle" ? pw / 2 : 4}
        />
        <text
          x={px}
          y={py}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fill="rgb(99, 102, 241)"
          pointerEvents="none"
        >
          {el.name}
        </text>
      </g>
    );
  })}
```

c) Add the drag handler (mirrors zone drag handler logic):

```ts
const handleHangingMouseDown = (
  e: React.MouseEvent,
  el: AbsoluteHangingElement,
) => {
  e.stopPropagation();
  const start = pxToBooth({ x: e.clientX, y: e.clientY });
  const onMove = (mv: MouseEvent) => {
    const cur = pxToBooth({ x: mv.clientX, y: mv.clientY });
    const moved = moveHangingElement(el, {
      dx: cur.x - start.x,
      dy: cur.y - start.y,
    });
    onGeometryChange({
      ...geometry,
      hangingElements: (geometry.hangingElements ?? []).map((h) =>
        h.id === el.id ? moved : h,
      ),
    });
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
};
```

d) Add the `showHanging` prop with default true:

```ts
interface SpatialCanvasProps {
  // ...existing props...
  showHanging?: boolean;
}

export function SpatialCanvas({
  // ...existing destructured props...
  showHanging = true,
}: SpatialCanvasProps) {
```

- [ ] **Step 5: Run the canvas test, verify it passes**

Run: `./node_modules/.bin/vitest run src/components/spatial/SpatialCanvas.test.tsx`
Expected: 3/3 pass.

- [ ] **Step 6: Add the SpatialPlanner toolbar button + toggle**

In `src/components/spatial/SpatialPlanner.tsx`, add a toolbar button next to the existing "+ Feature":

```tsx
<Button
  type="button"
  size="sm"
  variant="outline"
  onClick={addHangingElement}
>
  <Wind className="h-3 w-3 mr-1" />
  Hanging element
</Button>
<Button
  type="button"
  size="sm"
  variant="ghost"
  onClick={() => setShowHanging((v) => !v)}
>
  {showHanging ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
  {showHanging ? "Hide hanging" : "Show hanging"}
</Button>
```

Implement `addHangingElement` and `showHanging` state:

```ts
const [showHanging, setShowHanging] = useState(true);

const addHangingElement = useCallback(() => {
  const id = `hang_${Date.now().toString(36)}`;
  const newEl: AbsoluteHangingElement = {
    id,
    name: `Hanging element ${(canvasGeometry.hangingElements?.length ?? 0) + 1}`,
    x: canvasGeometry.width / 2,
    y: canvasGeometry.depth / 2,
    width: canvasGeometry.width / 3,
    depth: canvasGeometry.depth / 3,
    thicknessFt: 1,
    shape: "ring",
    suspensionDropFt: 3,
  };
  handleCanvasGeometryChange({
    ...canvasGeometry,
    hangingElements: [...(canvasGeometry.hangingElements ?? []), newEl],
  });
}, [canvasGeometry, handleCanvasGeometryChange]);
```

Pass `showHanging` down to `<SpatialCanvas ... showHanging={showHanging} />`.

- [ ] **Step 7: Run TS strict + tests**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && ./node_modules/.bin/vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/spatial/SpatialCanvas.tsx src/components/spatial/SpatialCanvas.test.tsx src/components/spatial/SpatialPlanner.tsx src/lib/geometryModel.ts
git commit -m "$(cat <<'EOF'
feat(hanging): spatial canvas top-down layer for hanging elements

Task 5 of the hanging-elements feature. SpatialCanvas now renders a
dashed-outline layer above the floor zones for each hanging element,
visually distinct from solid floor rectangles. Users can drag to
position. SpatialPlanner gains two toolbar controls:

- "+ Hanging element" button — adds a default ring-shaped element
  centered on the booth at suspension drop 3ft. User refines in
  Brief Review (task 4) or via spatial canvas edit dialog.
- "Show/hide hanging" toggle — local visibility flag so users can
  edit the floor layout without visual noise from the overhead
  layer. Toggle doesn't affect the data.

BoothGeometry gains hangingElements?: AbsoluteHangingElement[]. The
new shape carries everything the canvas needs to render + drag
(name, x/y/width/depth, shape, thickness, suspensionDropFt).

Drag math (hangingElementAtPoint, moveHangingElement) is exported
and unit-tested.

Test coverage: 3 new unit tests on the drag math.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Spatial canvas iso (3D) wireframe

**Files:**
- Modify: `src/components/spatial/SpatialCanvasIso.tsx`

- [ ] **Step 1: Locate the existing iso renderer**

Run: `grep -n "hangingElements\|<Box \|<Line \|zones.map" src/components/spatial/SpatialCanvasIso.tsx | head -10`

Identify where zones are extruded into 3D boxes — the same pattern applies for hanging elements but at suspension height.

- [ ] **Step 2: Add the iso rendering pass**

In the iso renderer's JSX, immediately after the zones-rendering block, add:

```tsx
{(geometry.hangingElements ?? []).map((el) => {
  // Bottom of element sits at (ceilingHeightFt - suspensionDropFt)
  const ceilingHeightFt = geometry.ceilingHeightFt ?? 12;
  const bottomY = Math.max(ceilingHeightFt - el.suspensionDropFt, 0);
  const centerY = bottomY + el.thicknessFt / 2;
  return (
    <group key={el.id}>
      {/* Wireframe element */}
      <mesh position={[el.x, centerY, el.y]}>
        <boxGeometry args={[el.width, el.thicknessFt, el.depth]} />
        <meshBasicMaterial
          color="#6366f1"
          wireframe
        />
      </mesh>
      {/* Dashed drop line from element down to floor centroid */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([el.x, bottomY, el.y, el.x, 0, el.y])}
            count={2}
            itemSize={3}
          />
        </bufferGeometry>
        <lineDashedMaterial
          color="#6366f1"
          dashSize={0.2}
          gapSize={0.1}
          opacity={0.6}
          transparent
        />
      </line>
    </group>
  );
})}
```

- [ ] **Step 3: Run TS strict + tests**

Run: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && ./node_modules/.bin/vitest run`
Expected: clean.

- [ ] **Step 4: Manual verification on the Eqvilent fixture**

This step is a manual checkpoint, not automated:

1. Start the dev server: `npm run dev`
2. Open an Eqvilent project, navigate to the Spatial step
3. Click "+ Hanging element" — confirm a dashed ring appears in the top-down view above the zones
4. Drag it — confirm it moves smoothly
5. Switch to iso view — confirm a wireframe ring appears at the right height with a dashed drop line
6. Click "Hide hanging" — confirm the layer hides; click again — re-shows

- [ ] **Step 5: Commit**

```bash
git add src/components/spatial/SpatialCanvasIso.tsx
git commit -m "$(cat <<'EOF'
feat(hanging): iso 3D wireframe rendering for hanging elements

Task 6 (final) of the hanging-elements feature. SpatialCanvasIso
renders each hanging element as a wireframe box at its true
suspension height (ceilingHeightFt - suspensionDropFt) with the
element's top-down footprint and thickness as the box volume. A
thin dashed line drops from the element's center down to the floor
centroid — visual anchor for context (otherwise the element floats
disconnected from any reference point).

Color matches the top-down dashed-outline layer (#6366f1 indigo)
so users see the same hanging element rendered consistently across
the top-down and iso views.

Manual verification on Eqvilent fixture confirms drag + toggle +
iso wireframe all work as designed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification checkpoints

After each task:
- TS strict (`./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`)
- Vitest (`./node_modules/.bin/vitest run`)
- Deno check on edge-fn changes (`deno check supabase/functions/parse-brief/index.ts`)

After Task 3 (composer): run a manual hero render on Eqvilent with a hanging element in the brief — verify the prompt visibly contains `# HANGING ELEMENTS` and the rendered hero shows the ring suspended above the booth.

After Task 6 (final): end-to-end manual pass on both Eqvilent and US Cabinet Depot. Confirm the brief-review card, spatial canvas drag, iso wireframe, and rendered output all line up.

## Deferred / future work

- Per-element camera angle ("Hanging Detail" view) — separate task.
- Pre-render visual verification of the `hanging_elements_aloft` hard constraint — needs an image-diff/CV check, not in this plan.
- Animation / kinetic elements — out of scope.
- Venue rigging constraints (max suspension points, weight limits) — out of scope until venue-rules data lands.
