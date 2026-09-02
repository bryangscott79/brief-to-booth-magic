import { describe, it, expect } from "vitest";
import { applyDeckOps, isValidDeckOp, pushVersion, MAX_VERSIONS, summarizeDeckForModel, type DeckState } from "./deckOps";
import type { DeckSpec, SlideSpec } from "./deckSpec";

const slides = [
  { layout: "cover", title: "Samsung — CES 2027" },
  { layout: "section", number: "01", title: "The Ask" },
  { layout: "concept", title: "Architecture of life", body: "Long narrative" },
  { layout: "closing", title: "Let's build it." },
] as unknown as SlideSpec[];

const base: DeckState = {
  spec: { meta: { projectName: "Samsung — CES 2027" }, slides } as unknown as DeckSpec,
  settings: { style: "pitch", brandMode: "agency", slideOverrides: { "2": { ground: "paper" } } },
};

describe("applyDeckOps", () => {
  it("applies design ops without touching slides", () => {
    const { state, applied } = applyDeckOps(base, [
      { op: "set_style", style: "executive" },
      { op: "set_palette", primary: "#0B1B2B" },
      { op: "set_fonts", headingFontId: "fraunces" },
    ]);
    expect(applied).toHaveLength(3);
    expect(state.settings.style).toBe("executive");
    expect(state.settings.paletteOverride?.primary).toBe("#0B1B2B");
    expect(state.settings.fontOverride?.headingFontId).toBe("fraunces");
    expect(state.spec.slides).toEqual(base.spec.slides);
  });

  it("patches a slide but never its layout", () => {
    const { state } = applyDeckOps(base, [
      { op: "update_slide", index: 2, patch: { body: "Short.", layout: "cover" } },
    ]);
    expect((state.spec.slides[2] as unknown as { body: string }).body).toBe("Short.");
    expect(state.spec.slides[2].layout).toBe("concept");
  });

  it("keeps per-slide overrides attached through removes and reorders", () => {
    const removed = applyDeckOps(base, [{ op: "remove_slide", index: 1 }]).state;
    expect(removed.spec.slides).toHaveLength(3);
    expect(removed.settings.slideOverrides).toEqual({ "1": { ground: "paper" } });

    const reordered = applyDeckOps(base, [{ op: "reorder_slides", order: [3, 2, 1, 0] }]).state;
    expect(reordered.spec.slides[0].layout).toBe("closing");
    expect(reordered.settings.slideOverrides).toEqual({ "1": { ground: "paper" } });
  });

  it("skips malformed ops instead of corrupting the deck", () => {
    const { state, applied, skipped } = applyDeckOps(base, [
      { op: "remove_slide", index: 99 },
      { op: "set_palette", primary: "orange" },
      { op: "reorder_slides", order: [0, 0, 1, 2] },
      { op: "nonsense" },
      { op: "duplicate_slide", index: 0 },
    ]);
    expect(skipped).toHaveLength(4);
    expect(applied).toHaveLength(1);
    expect(state.spec.slides).toHaveLength(5);
    expect(state.spec.slides[1].layout).toBe("cover");
  });

  it("validates insert_slide layouts", () => {
    expect(isValidDeckOp({ op: "insert_slide", index: 1, slide: { layout: "section", title: "X" } }, 4)).toBe(true);
    expect(isValidDeckOp({ op: "insert_slide", index: 1, slide: { layout: "hologram" } }, 4)).toBe(false);
    expect(isValidDeckOp({ op: "insert_slide", index: 9, slide: { layout: "section" } }, 4)).toBe(false);
  });
});

describe("versions", () => {
  it("caps history at MAX_VERSIONS, dropping the oldest", () => {
    let versions = [] as ReturnType<typeof pushVersion>;
    for (let i = 0; i < MAX_VERSIONS + 5; i++) {
      versions = pushVersion(versions, {
        id: `v${i}`, createdAt: "", message: `m${i}`, spec: base.spec, settings: base.settings,
      });
    }
    expect(versions).toHaveLength(MAX_VERSIONS);
    expect(versions[0].id).toBe("v5");
  });

  it("summarizes slides with 0-based indices and layouts", () => {
    const s = summarizeDeckForModel(base.spec, base.settings);
    expect(s).toContain("0: [cover] Samsung — CES 2027");
    expect(s).toContain("2: [concept] Architecture of life (overrides=");
    expect(s).toContain("style=pitch");
  });
});
