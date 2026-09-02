import { describe, it, expect } from "vitest";
import {
  applyDeckOps,
  carryOverridesAcrossCompile,
  describeSkippedOp,
  effectiveBrandKit,
  pushChatMessage,
  recordVersion,
  remapOverrides,
  renameVersion,
  restoreVersion,
  versionNumber,
  versionTitle,
  MAX_CHAT_MESSAGES,
  type DeckChatMessage,
  type DeckDesignSettings,
  type DeckHistory,
} from "./deckOps";
import { relayoutRenderSlides } from "./compileDeckSpec";
import { resolveBrandKit } from "./brandKit";
import type { DeckSpec, SlideSpec } from "./deckSpec";

const agencySource = { name: "Exhibitus", logoUrl: null, primary: "#0B1B2B", secondary: "#4F6BE8", headingFontId: "space-grotesk", bodyFontId: "inter" };
const clientSource = { name: "Samsung", logoUrl: null, primary: "#1428A0", secondary: "#5B8DEF", typographyNote: null };

const meta = { projectName: "Samsung — CES 2027", clientName: "Samsung", agencyName: "Exhibitus", boothSize: "20x40", dateLabel: "Jan 2027" };
const img = (n: string) => ({ url: `https://x/${n}.png`, label: n });
const spec: DeckSpec = {
  meta,
  slides: [
    { layout: "cover", eyebrow: "Proposal", title: "Samsung — CES 2027", subtitle: "20x40" },
    { layout: "section", number: 3, title: "The Space" },
    { layout: "spatial", title: "Zone program", boothSize: "20x40", zones: [{ name: "Hero", sqft: 240 }] },
    { layout: "renderFull", image: img("hero"), caption: "hero" },
    { layout: "video", title: "Walkthrough", videoUrl: "https://x/w.mp4", caption: "Walk" },
    { layout: "renderFull", image: img("left"), caption: "left" },
    { layout: "renderFull", image: img("right"), caption: "right" },
    { layout: "renderFull", image: img("bar"), caption: "bar" },
    { layout: "section", number: 4, title: "The Investment" },
    { layout: "closing", headline: "Let's build it.", contacts: [] },
  ],
};

describe("effectiveBrandKit", () => {
  const kit = resolveBrandKit("agency", agencySource, clientSource);

  it("lays palette + font overrides over the saved brand without touching it", () => {
    const frozen = JSON.parse(JSON.stringify(kit));
    const eff = effectiveBrandKit(kit, {
      paletteOverride: { primary: "#112233" },
      fontOverride: { headingFontId: "fraunces" },
    });
    expect(eff).not.toBe(kit);
    expect(eff.primary).toBe("#112233");
    expect(eff.secondary).toBe(kit.secondary);
    expect(eff.heading.id).toBe("fraunces");
    expect(eff.body.id).toBe(kit.body.id);
    expect(eff.leadLogoUrl).toBe(kit.leadLogoUrl);
    expect(kit).toEqual(frozen);
  });

  it("ignores malformed hex and unknown font ids; no overrides → same values", () => {
    const eff = effectiveBrandKit(kit, { paletteOverride: { primary: "navy", secondary: "#ABCDEF" }, fontOverride: { bodyFontId: "nope" } });
    expect(eff.primary).toBe(kit.primary);
    expect(eff.secondary).toBe("#ABCDEF");
    expect(eff.body.id).toBe("inter"); // library fallback
    const same = effectiveBrandKit(kit, {});
    expect(same).toEqual(kit);
    expect(same).not.toBe(kit);
  });
});

describe("versions — compile → feedback → restore is linear", () => {
  const settingsA: DeckDesignSettings = { brandMode: "agency", style: "pitch", renderPresentation: "full" };
  const settingsB: DeckDesignSettings = { ...settingsA, slideOverrides: { "0": { ground: "primary" } } };
  const specB: DeckSpec = { ...spec, slides: spec.slides.map((s, i) => (i === 0 ? { ...s, title: "Navy cover" } : s)) as SlideSpec[] };

  it("records, restores as a new version, and never rewrites history", () => {
    let history: DeckHistory = { versions: [], currentVersionId: null };
    const compiled = recordVersion(history, { message: "Compiled", spec, settings: settingsA });
    history = compiled.history;
    expect(history.currentVersionId).toBe(compiled.version.id);
    expect(compiled.version.seq).toBe(1);

    const revised = recordVersion(history, { message: "Make the cover navy", summary: "Cover set to navy.", spec: specB, settings: settingsB });
    history = revised.history;
    expect(history.versions.map((v) => v.message)).toEqual(["Compiled", "Make the cover navy"]);
    expect(revised.version.summary).toBe("Cover set to navy.");
    expect(revised.version.seq).toBe(2);

    const restored = restoreVersion(history, compiled.version.id);
    expect(restored).not.toBeNull();
    history = restored!.history;
    expect(history.versions.map((v) => v.message)).toEqual(["Compiled", "Make the cover navy", "Restored v1"]);
    expect(history.currentVersionId).toBe(restored!.version.id);
    expect(restored!.version.spec).toEqual(spec);
    expect(restored!.version.settings).toEqual(settingsA);
    expect(restored!.version.spec).not.toBe(compiled.version.spec); // snapshot, not a shared ref
    expect(versionNumber(history.versions, restored!.version)).toBe(3);
    expect(restoreVersion(history, "nope")).toBeNull();
  });

  it("snapshots deeply — later patches never leak into history", () => {
    const { history, version } = recordVersion({ versions: [], currentVersionId: null }, { message: "Compiled", spec, settings: settingsA });
    const next = applyDeckOps({ spec: version.spec, settings: version.settings }, [{ op: "update_slide", index: 0, patch: { title: "Changed" } }]);
    expect((next.state.spec.slides[0] as { title: string }).title).toBe("Changed");
    expect((history.versions[0].spec.slides[0] as { title: string }).title).toBe("Samsung — CES 2027");
  });

  it("labels rename in place and drive the chip title; seq survives the cap", () => {
    let history: DeckHistory = { versions: [], currentVersionId: null };
    for (let i = 0; i < 45; i++) history = recordVersion(history, { message: `m${i}`, spec, settings: settingsA }).history;
    expect(history.versions).toHaveLength(40);
    expect(history.versions[0].seq).toBe(6);
    expect(versionNumber(history.versions, history.versions[0])).toBe(6);
    const last = history.versions[history.versions.length - 1];
    expect(versionTitle(history.versions, last)).toBe("v45 · m44");
    history = renameVersion(history, last.id, "  Client review  ");
    expect(versionTitle(history.versions, history.versions[39])).toBe("v45 · Client review");
    history = renameVersion(history, last.id, "");
    expect(history.versions[39].label).toBeUndefined();
    expect(versionTitle(history.versions, { ...last, message: "A very long feedback message that keeps going" })).toBe("v45 · A very long feedback messag…");
  });
});

describe("chat thread helpers", () => {
  it("caps the thread and describes skipped ops for humans", () => {
    let chat: DeckChatMessage[] = [];
    for (let i = 0; i < MAX_CHAT_MESSAGES + 3; i++) {
      chat = pushChatMessage(chat, { id: `m${i}`, role: i % 2 ? "assistant" : "user", content: `c${i}`, createdAt: "" });
    }
    expect(chat).toHaveLength(MAX_CHAT_MESSAGES);
    expect(chat[0].id).toBe("m3");
    expect(describeSkippedOp({ op: "remove_slide", index: 12 })).toBe("remove_slide · slide 13");
    expect(describeSkippedOp({ op: "set_palette", primary: "orange" })).toBe("set_palette · orange");
    expect(describeSkippedOp("junk")).toBe("an unreadable change");
  });
});

describe("overrides across structural changes", () => {
  it("carries per-slide overrides across a recompile only where the layout at that index held", () => {
    const overrides = { "0": { ground: "paper" as const }, "3": { hideLogo: true }, "9": { accent: "quiet" as const } };
    const recompiled: DeckSpec = { ...spec, slides: [...spec.slides.slice(0, 3), ...spec.slides.slice(4)] };
    expect(carryOverridesAcrossCompile(overrides, spec, recompiled)).toEqual({ "0": { ground: "paper" } });
    expect(carryOverridesAcrossCompile(overrides, spec, spec)).toEqual(overrides);
    expect(carryOverridesAcrossCompile(undefined, spec, spec)).toBeUndefined();
    expect(carryOverridesAcrossCompile(overrides, null, spec)).toBeUndefined();
  });

  it("re-lays the render block for a new presentation without recompiling, hero + video fixed", () => {
    const grid = relayoutRenderSlides(spec, "grid");
    expect(grid.spec.slides.map((s) => s.layout)).toEqual([
      "cover", "section", "spatial", "renderFull", "video", "renderGrid", "section", "closing",
    ]);
    const gridSlide = grid.spec.slides[5];
    expect(gridSlide.layout === "renderGrid" && gridSlide.images.map((i) => i.label)).toEqual(["left", "right", "bar"]);
    // Index map: before the block unchanged, hero/video pinned, pooled renders gone, tail shifted.
    expect([0, 2, 3, 4, 5, 7, 8, 9].map(grid.indexMap)).toEqual([0, 2, 3, 4, null, null, 6, 7]);
    expect(remapOverrides({ "0": { ground: "paper" }, "6": { hideLogo: true }, "9": { accent: "loud" } }, grid.indexMap)).toEqual({
      "0": { ground: "paper" },
      "7": { accent: "loud" },
    });

    // Featured renders stay full-bleed; mixed pairs the rest.
    const mixed = relayoutRenderSlides(grid.spec, "mixed", new Set(["https://x/bar.png"]));
    expect(mixed.spec.slides.map((s) => s.layout)).toEqual([
      "cover", "section", "spatial", "renderFull", "video", "renderFull", "renderGrid", "section", "closing",
    ]);
    const bar = mixed.spec.slides[5];
    expect(bar.layout === "renderFull" && bar.image.label).toBe("bar");

    // Back to full restores one slide per render; a deck without renders is untouched.
    expect(relayoutRenderSlides(mixed.spec, "full").spec.slides.map((s) => s.layout)).toEqual(spec.slides.map((s) => s.layout));
    const noRenders: DeckSpec = { ...spec, slides: spec.slides.filter((s) => s.layout === "cover" || s.layout === "closing") };
    expect(relayoutRenderSlides(noRenders, "grid").spec).toBe(noRenders);
  });
});
