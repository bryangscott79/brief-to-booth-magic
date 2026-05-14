// src/lib/normalizedBrief.test.ts
//
// Fixture + snapshot tests for the prompt engine pipeline:
//   - normalizeBrief()  — Task 4
//   - validateBrief()   — Task 5
//   - composePrompt()   — Task 6
//   - composeViewPrompt() — Task 7

import { describe, it, expect } from "vitest";
import { normalizeBrief, validateBrief, composePrompt, composeViewPrompt } from "./normalizedBrief";
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

  it("renderer prompt leads with # SCENE and # GEOMETRY", () => {
    const out = composePrompt(normalized);
    const lines = out.renderer.split("\n").filter((l) => l.startsWith("#") && !l.startsWith("##"));
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

  it("renderer prompt geometry footprint stated once in # GEOMETRY (not in SCENE/STRUCTURAL/etc.)", () => {
    const out = composePrompt(normalized);
    // The HARD CONSTRAINTS section restates the rule intentionally
    // ("Footprint: exactly N × M …"). What we want to prevent is the
    // GEOMETRY footprint line ("- Footprint: 6 × 6 metric (36 sqm)")
    // appearing in multiple sections like the old prompt did.
    // Strip the HARD CONSTRAINTS section before counting.
    const trimmed = out.renderer.replace(
      /# HARD CONSTRAINTS[\s\S]*?(?=\n# |$)/,
      "",
    );
    const footprintGeom = trimmed.match(/^- Footprint:/gm) ?? [];
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
