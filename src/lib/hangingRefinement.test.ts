import { describe, it, expect } from "vitest";
import {
  hangingApprovalKey,
  buildHangingEditInstruction,
  formatHangingSpecLines,
} from "./hangingRefinement";
import type { NormalizedHangingElement } from "./normalizedBrief";

function makeElement(
  overrides: Partial<NormalizedHangingElement> = {},
): NormalizedHangingElement {
  return {
    id: "hang-1",
    name: "Primary identity ring",
    physicalForm: "Backlit circular ring above the booth center.",
    shape: "ring",
    dimensions: { width: 10, depth: 10, thicknessFt: 1.5 },
    suspensionDropFt: 3,
    position: { x: 10, y: 10 },
    materials: ["brushed aluminum"],
    surfaces: ["outer face: wordmark"],
    lighting: ["edge-lit perimeter glow"],
    printed: ["outer: brand logotype"],
    ...overrides,
  };
}

describe("hangingApprovalKey", () => {
  it("is scoped per config + hero image", () => {
    const a = hangingApprovalKey("20x40", "https://x.com/hero-v1.png");
    const b = hangingApprovalKey("20x40", "https://x.com/hero-v2.png");
    const c = hangingApprovalKey("100x60", "https://x.com/hero-v1.png");
    expect(a).toBe("20x40::https://x.com/hero-v1.png");
    // A new hero version resets approval (different key)…
    expect(a).not.toBe(b);
    // …and approval never bleeds across booth sizes.
    expect(a).not.toBe(c);
  });

  it("is stable for single-config projects (null config) and missing heroes", () => {
    expect(hangingApprovalKey(null, "https://x.com/h.png")).toBe(
      "__default__::https://x.com/h.png",
    );
    expect(hangingApprovalKey(undefined, null)).toBe("__default__::__no-hero__");
    // Deterministic — the same inputs always produce the same key.
    expect(hangingApprovalKey(null, "https://x.com/h.png")).toBe(
      hangingApprovalKey(null, "https://x.com/h.png"),
    );
  });
});

describe("formatHangingSpecLines", () => {
  it("includes geometry, materials, and creative direction when present", () => {
    const lines = formatHangingSpecLines(
      makeElement({ creativeDirection: "Logo on outer face only." }),
    );
    expect(lines.join("\n")).toContain("10 × 10 ft × 1.5 ft thick, ring outline");
    expect(lines.join("\n")).toContain("suspended 3 ft below the venue ceiling");
    expect(lines.join("\n")).toContain("Materials: brushed aluminum");
    expect(lines.join("\n")).toContain("Creative direction (EXACT): Logo on outer face only.");
  });

  it("omits empty sections and respects metric units for width/depth", () => {
    const lines = formatHangingSpecLines(
      makeElement({ materials: [], surfaces: [], lighting: [], printed: [], physicalForm: "" }),
      "metric",
    );
    const text = lines.join("\n");
    expect(text).toContain("10 × 10 m");
    expect(text).not.toContain("Materials:");
    expect(text).not.toContain("Creative direction");
  });
});

describe("buildHangingEditInstruction", () => {
  it("locks the scene and scopes the change to the hanging element", () => {
    const instruction = buildHangingEditInstruction(
      [makeElement()],
      "make the ring thinner, brushed aluminum, logo on outer face only",
    );
    expect(instruction).toContain("Modify ONLY the suspended hanging element(s)");
    expect(instruction).toContain("camera angle IDENTICAL");
    expect(instruction).toContain("CANONICAL HANGING ELEMENT SPEC");
    expect(instruction).toContain("- Primary identity ring");
    expect(instruction).toContain("REFINEMENT REQUEST");
    expect(instruction).toContain(
      "make the ring thinner, brushed aluminum, logo on outer face only",
    );
    expect(instruction).toContain("SUSPENDED from the venue rigging");
  });

  it("carries every element's spec for multi-element briefs", () => {
    const instruction = buildHangingEditInstruction(
      [makeElement(), makeElement({ id: "hang-2", name: "Aisle banner", shape: "rect" })],
      "raise both higher",
    );
    expect(instruction).toContain("- Primary identity ring");
    expect(instruction).toContain("- Aisle banner");
  });
});
