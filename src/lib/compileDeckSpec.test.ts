import { describe, it, expect } from "vitest";
import { compileDeckSpec, type CompileDeckInputs } from "./compileDeckSpec";
import { resolveBrandKit } from "./brandKit";
import type { SlideLayout } from "./deckSpec";

const kit = resolveBrandKit(
  "blend",
  {
    name: "Exhibitus",
    logoUrl: null,
    primary: "#0B1B2B",
    secondary: "#4F6BE8",
    headingFontId: "space-grotesk",
    bodyFontId: "inter",
  },
  {
    name: "Samsung",
    logoUrl: null,
    primary: "#1428A0",
    secondary: "#5B8DEF",
    typographyNote: null,
  },
);

const richInputs = (): CompileDeckInputs => ({
  project: { name: "Samsung — CES 2027" },
  parsedBrief: {
    brand: { name: "Samsung" },
    objectives: { primary: "Own the AI-home conversation", secondary: ["500 qualified leads"] },
    events: {
      primaryShow: "CES 2027",
      shows: [{ name: "CES 2027", location: "Las Vegas", dates: "January 5–8, 2027" }],
    },
    spatial: { footprints: [{ size: "20x40", sqft: 800, priority: "primary" }], modular: true },
    audiences: [{ name: "Retail buyers", description: "Decision makers", priority: 1 }],
    budget: { perShow: 185000 },
  },
  elements: {
    bigIdea: {
      status: "complete",
      data: {
        headline: "The Frame of What's Next",
        narrative: "A booth that behaves like a living gallery.",
        strategicPosition: "Museum-grade calm in a loud hall.",
      },
    },
    interactiveMechanics: {
      status: "complete",
      data: { hero: { name: "The Lightwall", concept: "A reactive LED facade." } },
    },
    experienceFramework: {
      status: "complete",
      data: { conceptDescription: "Three-act journey.", visitorJourney: [{}, {}, {}] },
    },
    spatialStrategy: {
      status: "complete",
      data: {
        configs: [
          {
            footprintSize: "20x40",
            totalSqft: 800,
            zones: [
              { name: "Hero Zone", sqft: 240 },
              { name: "Demo Bar", sqft: 180 },
            ],
          },
        ],
      },
    },
    budgetLogic: {
      status: "complete",
      data: {
        totalPerShow: 185000,
        allocation: [{ category: "Structure", percentage: 40, amount: 74000 }],
      },
    },
  },
  renders: [
    { angle_id: "floor_plan_2d", angle_name: "Floor Plan", public_url: "https://x/fp.png", is_current: true },
    { angle_id: "hero_front", angle_name: "Hero Front", public_url: "https://x/hero.png", is_current: true },
    { angle_id: "aisle", angle_name: "Aisle View", public_url: "https://x/a.png", is_current: true },
    { angle_id: "interior", angle_name: "Interior", public_url: "https://x/b.png", is_current: true },
    { angle_id: "old", angle_name: "Old View", public_url: "https://x/old.png", is_current: false },
  ],
  kit,
});

describe("compileDeckSpec", () => {
  it("emits slide families in canonical order for a rich project", () => {
    const spec = compileDeckSpec(richInputs());
    const layouts = spec.slides.map((s) => s.layout);

    // cover first, closing last, nextSteps just before closing.
    expect(layouts[0]).toBe("cover");
    expect(layouts[layouts.length - 1]).toBe("closing");
    expect(layouts[layouts.length - 2]).toBe("nextSteps");

    // Family ordering: ask < concept < spatial < renders < budget.
    const idx = (l: SlideLayout) => layouts.indexOf(l);
    expect(idx("briefSummary")).toBeGreaterThan(idx("cover"));
    expect(idx("concept")).toBeGreaterThan(idx("briefSummary"));
    expect(idx("elementGrid")).toBeGreaterThan(idx("concept"));
    expect(idx("spatial")).toBeGreaterThan(idx("elementGrid"));
    expect(idx("renderFull")).toBeGreaterThan(idx("spatial"));
    expect(idx("budget")).toBeGreaterThan(idx("renderFull"));

    // Section numbers count up from 1.
    const sections = spec.slides.filter((s) => s.layout === "section");
    expect(sections.map((s: any) => s.number)).toEqual([1, 2, 3, 4]);

    // Non-current renders are excluded; hero picked by angle naming.
    const hero = spec.slides.find((s) => s.layout === "renderFull") as any;
    expect(hero.image.url).toBe("https://x/hero.png");

    // The two remaining views form one grid (floor plan went to spatial).
    const grids = spec.slides.filter((s) => s.layout === "renderGrid") as any[];
    expect(grids).toHaveLength(1);
    expect(grids[0].images.map((i: any) => i.url)).toEqual(["https://x/a.png", "https://x/b.png"]);
  });

  it("skips slides whose data is absent — no placeholder content", () => {
    const spec = compileDeckSpec({
      project: { name: "Bare Project" },
      parsedBrief: null,
      elements: null,
      renders: [],
      kit,
    });
    const layouts = spec.slides.map((s) => s.layout);
    for (const absent of [
      "briefSummary",
      "concept",
      "elementGrid",
      "spatial",
      "renderFull",
      "renderGrid",
      "budget",
      "materials",
      "section",
    ] as SlideLayout[]) {
      expect(layouts).not.toContain(absent);
    }
    // The deck still opens and closes properly.
    expect(layouts).toEqual(["cover", "nextSteps", "closing"]);
  });

  it("ignores incomplete elements and matches the footprint's spatial config", () => {
    const inputs = richInputs();
    inputs.elements!.bigIdea!.status = "generating";
    inputs.elements!.spatialStrategy!.data.configs.unshift({
      footprintSize: "10x20",
      totalSqft: 200,
      zones: [{ name: "Tiny", sqft: 200 }],
    });
    const spec = compileDeckSpec(inputs);
    expect(spec.slides.map((s) => s.layout)).not.toContain("concept");
    const spatial = spec.slides.find((s) => s.layout === "spatial") as any;
    expect(spatial.totalSqft).toBe(800);
    expect(spatial.zones[0].name).toBe("Hero Zone");
  });

  it("carries brand + show identity into meta", () => {
    const spec = compileDeckSpec(richInputs());
    expect(spec.meta).toMatchObject({
      projectName: "Samsung — CES 2027",
      clientName: "Samsung",
      agencyName: "Exhibitus",
      boothSize: "20x40",
      showName: "CES 2027",
      dateLabel: "January 5–8, 2027",
    });
  });
});
