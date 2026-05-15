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
