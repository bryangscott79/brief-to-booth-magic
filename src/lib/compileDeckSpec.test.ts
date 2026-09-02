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
    const spec = compileDeckSpec({ ...richInputs(), renderPresentation: "grid" });
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

  describe("render presentation", () => {
    // Floor plan + hero + 5 other views.
    const withViews = (): CompileDeckInputs => {
      const inputs = richInputs();
      inputs.renders = [
        { angle_id: "floor_plan_2d", angle_name: "Floor Plan", public_url: "https://x/fp.png", is_current: true },
        { angle_id: "hero_front", angle_name: "Hero Front", public_url: "https://x/hero.png", is_current: true },
        ...["a", "b", "c", "d", "e"].map((k) => ({
          angle_id: `view_${k}`,
          angle_name: `View ${k.toUpperCase()}`,
          public_url: `https://x/${k}.png`,
          is_current: true,
        })),
      ];
      return inputs;
    };
    const renderSlides = (spec: ReturnType<typeof compileDeckSpec>) =>
      spec.slides.filter((s) => s.layout === "renderFull" || s.layout === "renderGrid");

    it("defaults to full: hero + every render on its own slide, captioned by angle", () => {
      const spec = compileDeckSpec(withViews());
      const slides = renderSlides(spec);
      expect(slides).toHaveLength(6);
      expect(slides.every((s) => s.layout === "renderFull")).toBe(true);
      expect((slides[0] as any).image.url).toBe("https://x/hero.png");
      expect(slides.slice(1).map((s: any) => s.caption)).toEqual(["View A", "View B", "View C", "View D", "View E"]);
      expect(compileDeckSpec({ ...withViews(), renderPresentation: "full" }).slides).toEqual(spec.slides);
    });

    it("mixed: hero full, the rest paired 2-up, a lone leftover full", () => {
      const spec = compileDeckSpec({ ...withViews(), renderPresentation: "mixed" });
      const layouts = renderSlides(spec).map((s) => s.layout);
      // hero, [A B], [C D], E
      expect(layouts).toEqual(["renderFull", "renderGrid", "renderGrid", "renderFull"]);
      const grids = spec.slides.filter((s) => s.layout === "renderGrid") as any[];
      expect(grids.map((g) => g.images.length)).toEqual([2, 2]);
    });

    it("grid: hero full, the rest 4-up (legacy behaviour)", () => {
      const spec = compileDeckSpec({ ...withViews(), renderPresentation: "grid" });
      const layouts = renderSlides(spec).map((s) => s.layout);
      // hero, [A B C D], E
      expect(layouts).toEqual(["renderFull", "renderGrid", "renderFull"]);
      const grid = spec.slides.find((s) => s.layout === "renderGrid") as any;
      expect(grid.images).toHaveLength(4);
    });

    it("featured renders go full-bleed ahead of the grids in mixed / grid modes", () => {
      const spec = compileDeckSpec({ ...withViews(), renderPresentation: "grid", featuredRenderIds: ["view_c"] });
      const slides = renderSlides(spec) as any[];
      // hero, C (featured), [A B D E]
      expect(slides.map((s) => s.layout)).toEqual(["renderFull", "renderFull", "renderGrid"]);
      expect(slides[1].caption).toBe("View C");
      expect(slides[2].images.map((i: any) => i.label)).toEqual(["View A", "View B", "View D", "View E"]);
    });

    it("selectedRenderIds restricts which renders are used — including the floor plan", () => {
      const spec = compileDeckSpec({
        ...withViews(),
        renderPresentation: "full",
        selectedRenderIds: ["hero_front", "view_b"],
      });
      const slides = renderSlides(spec) as any[];
      expect(slides.map((s) => s.caption)).toEqual(["Hero Front", "View B"]);
      const spatial = spec.slides.find((s) => s.layout === "spatial") as any;
      expect(spatial.image).toBeUndefined();
      // Selecting nothing at all drops the render slides entirely.
      const none = compileDeckSpec({ ...withViews(), selectedRenderIds: [] });
      expect(renderSlides(none)).toHaveLength(0);
    });

    it("unknown presentation values fall back to full", () => {
      const spec = compileDeckSpec({ ...withViews(), renderPresentation: "bogus" as any });
      expect(renderSlides(spec).every((s) => s.layout === "renderFull")).toBe(true);
    });
  });

  describe("walkthrough video", () => {
    it("emits a video slide right after the hero render only when a clip is present", () => {
      const without = compileDeckSpec(richInputs());
      expect(without.slides.map((s) => s.layout)).not.toContain("video");

      const spec = compileDeckSpec({
        ...richInputs(),
        video: { url: "https://x/walk.mp4", posterUrl: "https://x/hero.png", label: "Hero Front — Walkthrough", durationSec: 8 },
      });
      const layouts = spec.slides.map((s) => s.layout);
      const videoIdx = layouts.indexOf("video");
      expect(videoIdx).toBeGreaterThan(0);
      expect(layouts[videoIdx - 1]).toBe("renderFull");
      expect(layouts.filter((l) => l === "video")).toHaveLength(1);
      const video = spec.slides[videoIdx] as any;
      expect(video).toMatchObject({
        layout: "video",
        title: "Walkthrough",
        videoUrl: "https://x/walk.mp4",
        posterUrl: "https://x/hero.png",
        caption: "Hero Front — Walkthrough",
        durationSec: 8,
      });
    });

    it("still gets a Space section + video slide when the project has no renders", () => {
      const spec = compileDeckSpec({
        project: { name: "Bare" },
        parsedBrief: null,
        elements: null,
        renders: [],
        kit,
        video: { url: "https://x/walk.mp4" },
      });
      expect(spec.slides.map((s) => s.layout)).toEqual(["cover", "section", "video", "nextSteps", "closing"]);
      const video = spec.slides[2] as any;
      expect(video.caption).toBe("Booth walkthrough");
      expect(video.posterUrl).toBeUndefined();
    });

    it("ignores a video record without a URL", () => {
      const spec = compileDeckSpec({ ...richInputs(), video: { url: "" } });
      expect(spec.slides.map((s) => s.layout)).not.toContain("video");
    });
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
