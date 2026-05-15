import { describe, it, expect } from "vitest";
import { BUILTIN_INDUSTRIES } from "./builtinIndustries";
import type { BriefSectionId } from "./industryFields";

const REQUIRED_SECTIONS: Record<string, BriefSectionId[]> = {
  experiential: ["spatial-zones", "hero-installation", "hanging-elements", "signage"],
  architecture: ["existing-space", "spatial-zones"],
  landscape: ["spatial-zones"],
  interior_design: ["existing-space"],
  entertainment: ["spatial-zones", "hero-installation"],
  audio_visual: ["spatial-zones"],
};

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
    "industry %s declares the required briefSections / inputMode / defaultRenderAngles",
    (slug) => {
      const i = BUILTIN_INDUSTRIES.find((x) => x.slug === slug)!;
      expect(["spatial-canvas", "existing-space-photo", "hybrid"]).toContain(i.inputMode);
      expect(i.defaultRenderAngles.length).toBeGreaterThan(0);
      for (const required of REQUIRED_SECTIONS[slug] ?? []) {
        expect(i.briefSections).toContain(required);
      }
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
