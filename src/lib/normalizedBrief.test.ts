// src/lib/normalizedBrief.test.ts
//
// Fixture + snapshot tests for the prompt engine pipeline:
//   - normalizeBrief()  — Task 4
//   - validateBrief()   — Task 5
//   - composePrompt()   — Task 6
//   - composeViewPrompt() — Task 7

import { describe, it, expect } from "vitest";
import {
  normalizeBrief,
  validateBrief,
  composePrompt,
  composeViewPrompt,
  validateParsedBriefForReview,
} from "./normalizedBrief";
import type { HeroSnapshot } from "./normalizedBrief";
import {
  eqvilentParsedBrief,
  eqvilentGeometry,
  eqvilentInteractiveMechanicsHero,
  eqvilentProjectMeta,
} from "./__fixtures__/eqvilent-icml";
import {
  usCabinetDepotParsedBrief,
  usCabinetDepotGeometry,
  usCabinetDepotInteractiveMechanicsHero,
  usCabinetDepotProjectMeta,
} from "./__fixtures__/us-cabinet-depot";

// ─── normalizeBrief — Eqvilent ICML ─────────────────────────────────

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

// ─── normalizeBrief — US Cabinet Depot ───────────────────────────────

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

// ─── validateBrief — gaps ────────────────────────────────────────────

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

  it("flags missing venue name as a blocking gap when location is absent", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: { ...eqvilentParsedBrief, events: { shows: [], primaryShow: undefined } },
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    expect(gaps.some((g) => g.field === "context.venue.name")).toBe(true);
  });

  it("does not fail descriptor_present when brand has no descriptor", () => {
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

// ─── validateBrief — failures ────────────────────────────────────────

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
    if (heroFailure?.status === "fail" && "actualPct" in heroFailure && heroFailure.actualPct !== undefined) {
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

// ─── composePrompt — 5 output stages ─────────────────────────────────

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

  it("renderer prompt leads with # SCENE and # SPACE", () => {
    const out = composePrompt(normalized);
    const lines = out.renderer.split("\n").filter((l) => l.startsWith("#") && !l.startsWith("##"));
    expect(lines[0]).toBe("# SCENE");
    expect(lines[1]).toBe("# SPACE");
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

  it("emits # ZONE PROGRAM as a list of zone purposes (no coordinates)", () => {
    const out = composePrompt(normalized);
    // The old `# COORDINATE LAYOUT` block (with x/y/w/d per zone) was
    // forcing the model into a rectangular-pavilion layout-solver
    // mindset. We replaced it with `# ZONE PROGRAM` — what the booth
    // contains, not where it goes — so the model can compose the
    // layout organically.
    expect(out.renderer).toContain("# ZONE PROGRAM");
    expect(out.renderer).not.toContain("# COORDINATE LAYOUT");
    expect(out.renderer).not.toMatch(/x=\d/);
    expect(out.renderer).not.toMatch(/Origin: front-left/);
    expect(out.renderer).toContain("hero focal area");
  });

  it("includes HARD CONSTRAINTS with footprint and signage rules", () => {
    const out = composePrompt(normalized);
    expect(out.renderer).toContain("# HARD CONSTRAINTS");
    expect(out.renderer).toMatch(/Footprint: exactly 6 × 6 metric/);
    expect(out.renderer).toContain("Eqvilent");
    expect(out.renderer).toContain("Quantitative trading");
  });

  it("renderer prompt geometry footprint stated once in # SPACE (not in SCENE/STRUCTURAL/etc.)", () => {
    const out = composePrompt(normalized);
    // The HARD CONSTRAINTS section restates the rule intentionally
    // ("Footprint: exactly N × M …"). What we want to prevent is the
    // SPACE floor-footprint line ("- Floor footprint: 6 × 6 metric
    // (36 sqm) — a RECTANGULAR …") appearing in multiple sections
    // like the old prompt did. Strip HARD CONSTRAINTS first, then
    // count remaining footprint declarations. The label was renamed
    // from "Footprint" → "Floor footprint" when we tightened the
    // rectangular-floor rule (client feedback: keep the carpet
    // rectangular, the structures above can be organic).
    const trimmed = out.renderer.replace(
      /# HARD CONSTRAINTS[\s\S]*?(?=\n# |$)/,
      "",
    );
    const footprintGeom = trimmed.match(/^- Floor footprint:/gm) ?? [];
    expect(footprintGeom.length).toBe(1);
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

// ─── composePrompt — hanging elements section ────────────────────────

describe("composePrompt — hanging elements section", () => {
  it("omits the # HANGING ELEMENTS section when no elements exist", () => {
    // Use existing eqvilent fixtures — no hangingElements on the parsed brief
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const out = composePrompt(n);
    expect(out.renderer).not.toMatch(/# HANGING ELEMENTS/);
  });

  it("includes the # HANGING ELEMENTS section with intro + per-element details", () => {
    const parsed = {
      ...eqvilentParsedBrief,
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
    } as unknown as typeof eqvilentParsedBrief;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const out = composePrompt(n);

    expect(out.renderer).toMatch(/# HANGING ELEMENTS/);
    // Weight-bearing language
    expect(out.renderer).toMatch(/SUSPENDED from the venue rigging/i);
    expect(out.renderer).toMatch(/NOT attached to the booth structure/i);
    // Per-element details
    expect(out.renderer).toMatch(/Primary identity ring/);
    expect(out.renderer).toMatch(/edge-lit perimeter glow/);
    expect(out.renderer).toMatch(/front: brand logotype/);
  });

  it("appends one note to # STRUCTURAL APPROACH when hanging elements exist", () => {
    const parsed = {
      ...eqvilentParsedBrief,
      hangingElements: [{ name: "Ring", physicalForm: "white ring" }],
    } as unknown as typeof eqvilentParsedBrief;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const out = composePrompt(n);
    expect(out.renderer).toMatch(
      /Floor-supported structures \(walls, fascia, hero installation\) are visually distinct from the hanging elements above/i,
    );
  });

  it("includes the hanging_elements_aloft constraint and prompt line when elements exist", () => {
    const parsed = {
      ...eqvilentParsedBrief,
      hangingElements: [{ name: "Ring", physicalForm: "white ring" }],
    } as unknown as typeof eqvilentParsedBrief;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: parsed,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(
      n.compliance.hardConstraints.find((c) => c.id === "hanging_elements_aloft"),
    ).toBeDefined();
    const out = composePrompt(n);
    expect(out.renderer).toMatch(
      /Hanging elements appear clearly above and detached from the booth structure/i,
    );
  });

  it("does NOT include the hanging_elements_aloft constraint when no elements", () => {
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(
      n.compliance.hardConstraints.find((c) => c.id === "hanging_elements_aloft"),
    ).toBeUndefined();
  });
});

// ─── Defensive normalization — survives partial / legacy briefs ─────
//
// Real-world parsedBrief data from the DB may be missing fields that
// were added to the schema later (e.g. brand.visualIdentity, audiences,
// creative.visualLanguage). The normalizer must NEVER crash on these
// inputs — instead, it should fill defaults and let validateBrief
// surface the missing data as gaps for the clarification UI to ask
// about. Otherwise the React tree throws and the app-level error
// boundary catches it, which the user perceives as the app being
// "really unstable".

describe("normalizeBrief — defensive against partial briefs", () => {
  const meta = {
    id: "test-partial",
    name: "Partial Brief Test",
    projectType: "exhibition_booth" as const,
  };
  const geometry = eqvilentGeometry;

  it("does not crash when brief.brand.visualIdentity is undefined", () => {
    const partial = {
      brand: { name: "X", category: "", pov: "", personality: [], competitors: [] },
    } as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"];
    expect(() =>
      normalizeBrief({ project: meta, parsedBrief: partial, geometry, elements: null }),
    ).not.toThrow();
  });

  it("does not crash when brief.audiences is missing entirely", () => {
    const partial = {
      brand: {
        name: "X",
        category: "",
        pov: "",
        personality: [],
        competitors: [],
        visualIdentity: { colors: [], avoidColors: [], avoidImagery: [] },
      },
    } as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"];
    expect(() =>
      normalizeBrief({ project: meta, parsedBrief: partial, geometry, elements: null }),
    ).not.toThrow();
  });

  it("does not crash when brief is essentially empty {} (e.g. corrupted row)", () => {
    const partial = {} as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"];
    expect(() =>
      normalizeBrief({ project: meta, parsedBrief: partial, geometry, elements: null }),
    ).not.toThrow();
  });

  it("validator on partial brief does not crash and returns gaps", () => {
    const partial = {} as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"];
    const normalized = normalizeBrief({
      project: meta,
      parsedBrief: partial,
      geometry,
      elements: null,
    });
    const result = validateBrief(normalized);
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(Array.isArray(result.failures)).toBe(true);
  });

  it("validateParsedBriefForReview survives an empty brief", () => {
    const partial = {} as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"];
    expect(() => {
      const result = validateParsedBriefForReview(partial);
      expect(Array.isArray(result.gaps)).toBe(true);
    }).not.toThrow();
  });
});

// ─── Gap-resolution round trip ───────────────────────────────────────
//
// When the user answers a gap, the answer must actually CLEAR the
// gap in the next validation pass. Without this round-trip the UI
// shows a "Save" that does nothing — the user can keep saving and
// the card never disappears, which is what was happening for the
// hero.physicalForm and brand.colors.hex gaps before the data fix.

describe("applyGapAnswer + validate round trip", () => {
  it("hero.physicalForm answer clears the hero physicalForm gap", async () => {
    const { applyGapAnswer } = await import("./normalizedBrief");
    // Start: brief with no hero physicalForm anywhere. Gap should fire.
    const initial = structuredClone(eqvilentParsedBrief);
    initial.experience.hero.description = ""; // ensure the brief side is empty
    const beforeNorm = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: initial,
      geometry: eqvilentGeometry,
      elements: null, // no element-data fallback either
    });
    const beforeGaps = validateBrief(beforeNorm).gaps;
    expect(beforeGaps.some((g) => g.field === "hero.physicalForm")).toBe(true);

    // Apply the user's answer.
    let after = initial;
    applyGapAnswer(
      initial,
      "hero.physicalForm",
      "An inline 20ft x 20ft booth with curved lines and a hanging round element",
      (next) => {
        after = next;
      },
    );

    // After: gap should be gone.
    const afterNorm = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: after,
      geometry: eqvilentGeometry,
      elements: null,
    });
    const afterGaps = validateBrief(afterNorm).gaps;
    expect(afterGaps.some((g) => g.field === "hero.physicalForm")).toBe(false);
    // And the answer should be readable on the normalized hero:
    expect(afterNorm.hero.physicalForm.toLowerCase()).toContain("curved lines");
  });

  it("brand.colors.hex answer clears the hex gap and surfaces hex on the normalized color", async () => {
    const { applyGapAnswer } = await import("./normalizedBrief");
    const initial = structuredClone(eqvilentParsedBrief);
    // Brief has color names but no hex codes.
    initial.brand.visualIdentity.colors = ["orange", "black"];
    const beforeNorm = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: initial,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const beforeGaps = validateBrief(beforeNorm).gaps;
    expect(beforeGaps.some((g) => g.field === "brand.colors.hex")).toBe(true);
    expect(beforeNorm.brand.colors[0]?.hex).toBeUndefined();

    let after = initial;
    applyGapAnswer(initial, "brand.colors.hex", "#E67E22", (next) => {
      after = next;
    });

    const afterNorm = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: after,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(afterNorm.brand.colors[0]?.hex).toBe("#E67E22");
    // The name should NOT include the parenthesized hex anymore — the
    // suffix is parsed out into the dedicated hex field.
    expect(afterNorm.brand.colors[0]?.name).toBe("orange");
    // And the gap is gone.
    const afterGaps = validateBrief(afterNorm).gaps;
    expect(afterGaps.some((g) => g.field === "brand.colors.hex")).toBe(false);
  });

  it("re-applying the hex answer doesn't double-suffix the color name", async () => {
    // Edge case: user saves, then edits, then saves again. The "(hex)"
    // suffix should be replaced, not appended a second time.
    const { applyGapAnswer } = await import("./normalizedBrief");
    const initial = structuredClone(eqvilentParsedBrief);
    initial.brand.visualIdentity.colors = ["orange", "black"];
    let mid = initial;
    applyGapAnswer(initial, "brand.colors.hex", "#E67E22", (next) => {
      mid = next;
    });
    let after = mid;
    applyGapAnswer(mid, "brand.colors.hex", "#FF6B1A", (next) => {
      after = next;
    });
    expect(after.brand.visualIdentity.colors[0]).toBe("orange (#FF6B1A)");
  });
});

// ─── normalizeBrief — hanging elements ───────────────────────────────
//
// Task 1 of the hanging-elements feature. The normalizer must:
//   1. Carry parsedBrief.hangingElements through into
//      NormalizedBrief.hanging.elements with stable ids and sensible
//      numeric defaults (parser gives free-text dimensions / positional
//      hints; the normalizer coerces).
//   2. Default to an empty array when the field is absent (legacy
//      briefs in the DB don't have it).
//   3. Survive a brief object that lacks the `hangingElements` key
//      entirely — the safeBrief defense-in-depth path.
//
// We don't yet have a `minimalParsedBrief` helper; build the input
// inline by cloning eqvilentParsedBrief (which already gives us a
// fully-shaped ParsedBrief) and adding hangingElements to a typed-loose
// copy so we can attach the new field before it lives on the ParsedBrief
// type (Task 1 only adds the normalizer side; the type addition is
// outside the scope of this slice — the parser writes free-form JSON
// that normalizeBrief reads through `(b as ...).hangingElements`).

describe("normalizeBrief — hanging elements", () => {
  it("normalizes a parsed brief with one hanging element", () => {
    const briefWithHanging = {
      ...eqvilentParsedBrief,
      hangingElements: [
        {
          name: "Primary identity ring",
          physicalForm:
            "Suspended ring framing the hero zone, carrying the brand wordmark on its front face.",
          shape: "ring",
          estimatedDimensions: "3m diameter x 0.3m thick",
          suspensionHint: "centered over hero zone",
          materials: ["brushed aluminum", "tensioned white fabric"],
          surfaces: [
            "front face: white LED wordmark",
            "underside: matte black",
            "back: brushed aluminum",
          ],
          lighting: ["edge-lit perimeter glow", "downcast 4000K wash on booth"],
          printed: ["front: brand logotype", "back: hashtag"],
        },
      ],
    };
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: briefWithHanging as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"],
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(n.hanging.elements).toHaveLength(1);
    const el = n.hanging.elements[0];
    expect(el.id).toBe("hang_0");
    expect(el.name).toBe("Primary identity ring");
    expect(el.shape).toBe("ring");
    // eqvilentGeometry.width === 6 (metric), so defaultDim = 6/3 = 2.
    // Lock in the documented defaults so a regression in
    // normalizeHangingElement (e.g. changing the divisor or dropping
    // the default position) is caught by the test instead of slipping
    // through with a tautological "> 0" assertion.
    expect(el.dimensions.width).toBeCloseTo(2);
    expect(el.dimensions.depth).toBeCloseTo(2);
    expect(el.dimensions.thicknessFt).toBe(1);
    expect(el.suspensionDropFt).toBe(3);
    expect(el.position).toEqual({ x: 3, y: 3 });
    expect(el.materials).toContain("brushed aluminum");
    expect(el.printed).toContain("front: brand logotype");
  });

  it("produces stable IDs across repeated normalize calls", () => {
    // Deterministic ids matter for downstream tasks 2-6: the canvas
    // drag-edit + prompt anchoring use the id as a stable handle into
    // local state. A clock-stamped id (the old Date.now() form)
    // regenerated on every normalize call and silently broke any
    // state that keyed off element id.
    const briefWithHanging = {
      ...eqvilentParsedBrief,
      hangingElements: [{ name: "Ring" }, { name: "Banner" }],
    };
    const input = {
      project: eqvilentProjectMeta,
      parsedBrief: briefWithHanging as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"],
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    };
    const a = normalizeBrief(input);
    const b = normalizeBrief(input);
    expect(a.hanging.elements.map((e) => e.id)).toEqual(b.hanging.elements.map((e) => e.id));
    expect(a.hanging.elements.map((e) => e.id)).toEqual(["hang_0", "hang_1"]);
  });

  it("defaults hanging.elements to [] when parsedBrief.hangingElements is omitted", () => {
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief, // no hangingElements key at all
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    expect(n.hanging.elements).toEqual([]);
  });

  it("survives a legacy parsedBrief copy whose hangingElements key was deleted", () => {
    // Simulate the older-DB-row case where hangingElements never
    // existed. Going through safeBrief, the field should normalize
    // to [].
    const legacy = structuredClone(eqvilentParsedBrief) as unknown as Record<string, unknown>;
    delete legacy.hangingElements;
    const n = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: legacy as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"],
      geometry: eqvilentGeometry,
      elements: null,
    });
    expect(n.hanging.elements).toEqual([]);
  });
});

// ─── validateBrief — hanging-elements gap (Task 2) ───────────────────
//
// When the booth has no hanging element authored, the validator emits
// a non-blocking "helpful" gap so the clarification UI can offer a
// one-click "add a default ring" path. Three suppression rules:
//
//   1. Don't emit when the brief already has hanging elements.
//   2. Don't emit when the user previously said "No — floor-only
//      booth" (the answer is persisted on the brief via a sentinel
//      so the gap doesn't re-fire on the same project).
//
// The codebase has no separate skipMap — gap suppression is always
// data-driven (the same shape as brand.colors.hex: write a value to
// the brief, validator sees the value, gap doesn't fire). For
// hanging.elements the "filled" state and the "initial" state are
// both `length === 0`, so we need an explicit sentinel: a
// `_dismissedGaps` array attached to the brief.

describe("validateBrief — hanging-elements gap", () => {
  it("emits helpful gap when hanging.elements is empty and not dismissed", () => {
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: eqvilentParsedBrief, // no hangingElements key
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    const gap = gaps.find((g) => g.field === "hanging.elements");
    expect(gap).toBeDefined();
    expect(gap?.severity).toBe("helpful");
    expect(gap?.question).toMatch(/hanging/i);
    expect(gap?.options).toEqual(["Yes — add one", "No — floor-only booth"]);
    // Lock in the gap's data shape — composer + UX both depend on
    // fallback (empty hanging list = "we never asked") and source
    // (schema-emitted, not AI-suggested).
    expect(gap?.fallback).toEqual([]);
    expect(gap?.source).toBe("schema");
  });

  it("does NOT emit when hanging.elements is non-empty", () => {
    const briefWithHanging = {
      ...eqvilentParsedBrief,
      hangingElements: [
        { name: "Primary ring", physicalForm: "white ring" },
      ],
    };
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: briefWithHanging as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"],
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    expect(gaps.some((g) => g.field === "hanging.elements")).toBe(false);
  });

  it("does NOT emit when user previously dismissed the gap", () => {
    // applyGapAnswer with "No — floor-only booth" writes a sentinel
    // into the brief; on the next normalize+validate pass, the gap
    // should not re-fire.
    const dismissedBrief = {
      ...eqvilentParsedBrief,
      _dismissedGaps: ["hanging.elements"],
    };
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: dismissedBrief as unknown as Parameters<typeof normalizeBrief>[0]["parsedBrief"],
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    expect(gaps.some((g) => g.field === "hanging.elements")).toBe(false);
  });
});

// ─── applyGapAnswer — hanging.elements branch (Task 2) ───────────────

describe("applyGapAnswer — hanging.elements", () => {
  it('"Yes — add one" seeds a default hanging element', async () => {
    const { applyGapAnswer } = await import("./normalizedBrief");
    const initial = structuredClone(eqvilentParsedBrief);
    let after = initial;
    applyGapAnswer(initial, "hanging.elements", "Yes — add one", (next) => {
      after = next;
    });
    const updated = after as unknown as {
      hangingElements?: Array<{
        name?: string;
        shape?: string;
        materials?: string[];
        lighting?: string[];
        printed?: string[];
      }>;
    };
    expect(updated.hangingElements).toBeDefined();
    expect(updated.hangingElements).toHaveLength(1);
    expect(updated.hangingElements?.[0].name).toMatch(/identity|hanging/i);
    // Lock in the seed shape spec'd for Tasks 3-6 (composer, canvas,
    // prompt anchoring). If the seed silently regresses (e.g. swaps
    // shape from "ring" to "banner") downstream rendering breaks.
    const seed = updated.hangingElements?.[0];
    expect(seed?.shape).toBe("ring");
    expect(seed?.materials).toContain("brushed aluminum frame");
    expect(seed?.lighting).toContain("edge-lit perimeter glow");
    expect(seed?.printed).toContain("front: brand logotype");
  });

  it('"No — floor-only booth" dismisses the gap so it does not re-emit', async () => {
    const { applyGapAnswer } = await import("./normalizedBrief");
    const initial = structuredClone(eqvilentParsedBrief);
    let after = initial;
    applyGapAnswer(initial, "hanging.elements", "No — floor-only booth", (next) => {
      after = next;
    });
    // Verify round-trip: validate sees the dismissal and skips the gap.
    const normalized = normalizeBrief({
      project: eqvilentProjectMeta,
      parsedBrief: after,
      geometry: eqvilentGeometry,
      elements: { interactiveMechanics: { data: { hero: eqvilentInteractiveMechanicsHero } } },
    });
    const { gaps } = validateBrief(normalized);
    expect(gaps.some((g) => g.field === "hanging.elements")).toBe(false);
  });

  it("Yes then No clears the seeded element AND records the dismissal", async () => {
    // Regression test for i1: prior to this fix, toggling Yes → No
    // left the Yes-seeded element on the brief. validateBrief masked
    // the issue (length > 0 suppresses the gap), but downstream
    // consumers (composer, canvas, Tasks 3-6) would still see a
    // stale "ring" the user explicitly rejected.
    const { applyGapAnswer } = await import("./normalizedBrief");

    // Step 1: Yes seeds an element.
    const initial = structuredClone(eqvilentParsedBrief);
    let afterYes = initial;
    applyGapAnswer(initial, "hanging.elements", "Yes — add one", (next) => {
      afterYes = next;
    });
    const yesLoose = afterYes as unknown as { hangingElements?: unknown[] };
    expect((yesLoose.hangingElements ?? []).length).toBe(1);

    // Step 2: No clears it and records the dismissal.
    let afterNo = afterYes;
    applyGapAnswer(afterYes, "hanging.elements", "No — floor-only booth", (next) => {
      afterNo = next;
    });
    const noLoose = afterNo as unknown as {
      hangingElements?: unknown[];
      _dismissedGaps?: string[];
    };
    expect(noLoose.hangingElements ?? []).toEqual([]);
    expect(noLoose._dismissedGaps).toContain("hanging.elements");
  });
});

// ─── composeViewPrompt — hero-derived views ──────────────────────────

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
    // New edit-mode format: short instruction + consistency guard +
    // restrictions. No structured # SCENE / # REFERENCE markdown
    // sections — that wording made the model treat the prompt as a
    // fresh generation instead of an edit.
    expect(out.renderer.toLowerCase()).toContain("reference image");
    expect(out.renderer.toLowerCase()).toContain("this exact booth");
  });

  it("front view instruction explicitly mentions front-elevation framing", () => {
    const out = composeViewPrompt(heroSnapshot, "front");
    expect(out.renderer.toLowerCase()).toMatch(/front[- ]elevation|front face|head-on/);
  });

  it("interior view instruction mentions standing inside a zone", () => {
    const out = composeViewPrompt(heroSnapshot, "interior", { zoneId: "hero" });
    expect(out.renderer.toLowerCase()).toContain("standing inside");
    expect(out.renderer.toLowerCase()).toContain("hero focal area");
  });

  it("does not re-state the full # GEOMETRY ground-truth block (the hero carries geometry)", () => {
    const out = composeViewPrompt(heroSnapshot, "front");
    const geomHeaders = out.renderer.match(/# GEOMETRY \(ground truth/g) ?? [];
    expect(geomHeaders.length).toBe(0);
  });

  it("instructs the model to treat the reference as canonical and only change camera", () => {
    const out = composeViewPrompt(heroSnapshot, "side_left");
    // The minimal edit-mode prompt should say (a) match the reference
    // exactly and (b) only the camera angle changes. The exact phrasing
    // is asserted loosely so the prompt can be tuned without breaking
    // the test on every word change.
    expect(out.renderer.toLowerCase()).toMatch(/canonical|exactly|only the camera/i);
    expect(out.renderer.toLowerCase()).toContain("only the camera angle changes");
  });

  it("renderer prompt is short (edit-style, not generation-style)", () => {
    // The original structured composer was 400-600 tokens per view,
    // which gpt-image-2 read as a fresh generation prompt. The new
    // edit-style prompt should be 300-1200 chars — short enough to
    // feel like an edit instruction, long enough to carry the
    // consistency guard + restrictions.
    const out = composeViewPrompt(heroSnapshot, "front");
    expect(out.renderer.length).toBeGreaterThan(150);
    expect(out.renderer.length).toBeLessThan(1200);
  });
});
