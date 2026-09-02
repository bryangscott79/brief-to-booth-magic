import { describe, it, expect } from "vitest";
import {
  DECK_STYLES,
  PITCH_LEGACY_TOKENS,
  deckScale,
  resolveDeckStyle,
  type DeckStyleId,
} from "./deckStyle";
import { renderDeckHtml, renderSlideHtml } from "./deckSlideHtml";
import { buildDeckPptx } from "./deckBuilder";
import { resolveBrandKit } from "./brandKit";
import type { DeckSpec, SlideLayout } from "./deckSpec";

const kit = resolveBrandKit(
  "blend",
  { name: "Exhibitus", logoUrl: null, primary: "#0B1B2B", secondary: "#4F6BE8", headingFontId: "space-grotesk", bodyFontId: "inter" },
  { name: "Samsung", logoUrl: null, primary: "#1428A0", secondary: "#5B8DEF", typographyNote: null },
);

/** One of every layout, with every optional field populated. */
const spec: DeckSpec = {
  meta: { projectName: "Samsung — CES 2027", clientName: "Samsung", agencyName: "Exhibitus", boothSize: "20x40", showName: "CES 2027", dateLabel: "January 5–8, 2027" },
  slides: [
    { layout: "cover", eyebrow: "Booth Design Proposal", title: "Samsung — CES 2027", subtitle: "20x40 booth" },
    { layout: "section", number: 1, title: "The Ask", subtitle: "What the brief calls for" },
    {
      layout: "briefSummary",
      title: "What we heard",
      facts: [{ label: "Show", value: "CES 2027" }, { label: "Budget", value: "$185,000" }],
      objectives: ["Own the AI-home conversation", "Drive 500+ conversations."],
      audiences: [{ name: "Retail buyers", description: "Category leads" }],
    },
    { layout: "concept", headline: "The Frame of What's Next", subheadline: "A living gallery.", narrative: "CES is a shouting match of screens.", points: ["Calm", "Curation", "Serenity closes"] },
    { layout: "elementGrid", title: "Six moves", cards: [{ title: "A", body: "a" }, { title: "B", body: "b" }, { title: "C", body: "c" }, { title: "D", body: "d" }, { title: "E", body: "e" }] },
    { layout: "spatial", title: "Zone program", boothSize: "20x40", totalSqft: 800, image: { url: "https://x/fp.png", label: "Floor Plan" }, zones: [{ name: "Hero", sqft: 240, note: "Arrival" }, { name: "Demo", sqft: 180 }] },
    { layout: "renderFull", image: { url: "https://x/hero.png", label: "Hero" }, caption: "Main aisle approach" },
    { layout: "renderGrid", title: "Around the booth", images: [{ url: "https://x/a.png", label: "Aisle Left" }, { url: "https://x/b.png", label: "Aisle Right" }, { url: "https://x/c.png", label: "Bar" }] },
    { layout: "renderGrid", title: "Inside", images: [{ url: "https://x/a.png", label: "Aisle Left" }, { url: "https://x/b.png", label: "Aisle Right" }] },
    { layout: "budget", title: "Budget", rows: [{ category: "Structure", amount: 70300, percentage: 38, description: "Walls" }, { category: "AV", amount: 44400, percentage: 24 }], total: 185000, totalLabel: "Total per show" },
    { layout: "materials", title: "Materials", rows: [{ category: "Walls", summary: "Panels", subtotal: 41200 }, { category: "Floor", summary: "" }], total: 90100, note: "Estimates." },
    { layout: "nextSteps", title: "Next", steps: [{ title: "Review", detail: "Walkthrough" }, { title: "Approve" }], timelineNote: "Targeting CES 2027" },
    { layout: "closing", headline: "Let's build it.", subline: "Exhibitus × Samsung", contacts: [{ name: "Bryan", email: "b@x.co", phone: "+1" }] },
  ],
};

const ALL_LAYOUTS: SlideLayout[] = ["cover", "section", "briefSummary", "concept", "elementGrid", "spatial", "renderFull", "renderGrid", "budget", "materials", "nextSteps", "closing"];
const STYLE_IDS = DECK_STYLES.map((s) => s.id);

describe("deckStyle tokens", () => {
  it("pitch tokens are exactly the legacy design defaults", () => {
    // Pinned literally: if this changes, every deck compiled before styles
    // existed would render differently.
    expect(resolveDeckStyle("pitch")).toEqual({
      id: "pitch",
      cover: "field",
      section: "number",
      type: { title: 1, body: 1, caption: 1 },
      density: { margin: 0.6, spacing: 1 },
      accent: { intensity: "tint", panelTransparency: 95, zebra: true, topBar: true, geometry: true },
      images: { framing: "bleed", figureNumbers: false },
      tables: { numbersLead: false },
      prose: false,
    });
    expect(resolveDeckStyle("pitch")).toBe(PITCH_LEGACY_TOKENS);
  });

  it("missing or unknown style ids fall back to pitch", () => {
    expect(resolveDeckStyle()).toBe(PITCH_LEGACY_TOKENS);
    expect(resolveDeckStyle(null)).toBe(PITCH_LEGACY_TOKENS);
    expect(resolveDeckStyle("bogus")).toBe(PITCH_LEGACY_TOKENS);
  });

  it("pitch scale helpers are identity at the legacy 0.6in margin", () => {
    const { T, B, C, S, M, CW } = deckScale(PITCH_LEGACY_TOKENS);
    for (const pt of [8, 8.5, 9, 10.5, 11, 12.5, 13, 24, 32, 44, 48]) {
      expect(T(pt)).toBe(pt);
      expect(B(pt)).toBe(pt);
      expect(C(pt)).toBe(pt);
    }
    expect(S(0.92)).toBe(0.92);
    expect(S(1.28)).toBe(1.28);
    expect(M).toBe(0.6);
    expect(CW).toBeCloseTo(12.133, 6);
  });

  it("exposes the four presets in order with labels and blurbs", () => {
    expect(STYLE_IDS).toEqual(["pitch", "executive", "editorial", "tactical"]);
    for (const s of DECK_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(resolveDeckStyle(s.id).id).toBe(s.id);
    }
  });

  it("every style scales to half-point sizes", () => {
    for (const id of STYLE_IDS) {
      const { T, B, C } = deckScale(resolveDeckStyle(id));
      for (const pt of [8.5, 9, 10.5, 11.5, 13, 24, 32, 44, 48, 64]) {
        for (const v of [T(pt), B(pt), C(pt)]) expect(v * 2).toBe(Math.round(v * 2));
      }
    }
  });
});

describe("deckSlideHtml with styles", () => {
  it("omitting the style renders byte-identically to pitch (backward compatible)", () => {
    spec.slides.forEach((slide, i) => {
      const legacy = renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta);
      const pitch = renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, "pitch");
      expect(pitch).toBe(legacy);
    });
    expect(renderDeckHtml(spec, kit, "pitch")).toBe(renderDeckHtml(spec, kit));
    // The legacy 4-arg call (no meta) still works.
    expect(renderSlideHtml(spec.slides[0], kit, 0, spec.slides.length)).toContain('data-layout="cover"');
  });

  it("renders every layout in every style without holes", () => {
    for (const id of STYLE_IDS) {
      const seen = new Set<SlideLayout>();
      spec.slides.forEach((slide, i) => {
        const html = renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, id);
        seen.add(slide.layout);
        expect(html).toContain(`data-layout="${slide.layout}"`);
        expect(html).not.toMatch(/NaN|undefined|null/);
        expect(html).toContain("width:1280px;height:720px");
      });
      expect([...seen].sort()).toEqual([...ALL_LAYOUTS].sort());
    }
  });

  it("styles actually diverge from pitch where their tokens say they should", () => {
    const at = (layout: SlideLayout, id: DeckStyleId) => {
      const i = spec.slides.findIndex((s) => s.layout === layout);
      return renderSlideHtml(spec.slides[i], kit, i, spec.slides.length, spec.meta, id);
    };
    // Executive: paper cover, no top bar, inset hero.
    expect(at("cover", "executive")).toContain("background:#FFFFFF;font-family");
    expect(at("cover", "pitch")).toContain("background:#1428A0;font-family");
    expect(at("budget", "executive")).not.toContain("top:0px;width:1280px;height:8.6px");
    expect(at("budget", "pitch")).toContain("top:0px;width:1280px;height:8.6px");
    expect(at("renderFull", "executive")).toContain("background:#FFFFFF;font-family");
    expect(at("renderFull", "pitch")).toContain("background:#101418;font-family");
    // Editorial: prose objectives, oversized title.
    expect(at("briefSummary", "editorial")).toContain("Own the AI-home conversation. Drive 500+ conversations.");
    expect(at("briefSummary", "pitch")).not.toContain("Own the AI-home conversation. Drive");
    expect(at("cover", "editorial")).toContain(`font-size:${Math.round(75.5 * (96 / 72) * 10) / 10}px`);
    // Tactical: numbers lead + figure numbers + filled table header.
    const tb = at("budget", "tactical");
    expect(tb.indexOf("$70,300")).toBeLessThan(tb.indexOf("Structure"));
    expect(at("renderGrid", "tactical")).toContain("01 — Aisle Left");
    expect(at("renderGrid", "pitch")).not.toContain("01 — ");
    expect(at("section", "tactical")).toContain("SAMSUNG — CES 2027   ·   20X40   ·   CES 2027");
    expect(at("cover", "tactical")).toContain("January 5–8, 2027");
  });
});

describe("deckBuilder with styles", () => {
  it("builds a pptx for every style (images unreachable → skipped, never thrown)", async () => {
    for (const id of STYLE_IDS) {
      let skipped = 0;
      const blob = await buildDeckPptx(spec, kit, { style: id, onImageSkipped: () => { skipped += 1; } });
      expect(blob.size).toBeGreaterThan(10_000);
      expect(skipped).toBeGreaterThan(0);
    }
  }, 60_000);
});
