import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  accentTokensFor,
  defaultSlideGround,
  groundPalette,
  kitGrounds,
  resolveSlide,
  usesGroundPalette,
} from "./deckGround";
import { resolveDeckStyle } from "./deckStyle";
import { renderDeckHtml, renderSlideHtml } from "./deckSlideHtml";
import { buildDeckPptx } from "./deckBuilder";
import { resolveBrandKit } from "./brandKit";
import { logoTreatmentAt, logoTreatmentsMatch, treatmentsFromAnalyses, type LogoAnalysis, type LogoTreatments } from "./logoContrast";
import type { DeckSpec, SlideLayout } from "./deckSpec";
import type { SlideOverrides } from "./deckOps";

const agencySource = { name: "Exhibitus", logoUrl: null, primary: "#0B1B2B", secondary: "#4F6BE8", headingFontId: "space-grotesk", bodyFontId: "inter" };
const clientSource = { name: "Samsung", logoUrl: null, primary: "#1428A0", secondary: "#5B8DEF", typographyNote: null };
const kit = resolveBrandKit("blend", agencySource, clientSource);
const brandedKit = resolveBrandKit(
  "blend",
  { ...agencySource, logoUrl: "https://cdn.example.com/agency.png" },
  { ...clientSource, logoUrl: "https://cdn.example.com/client.png" },
);

const spec: DeckSpec = {
  meta: { projectName: "Samsung — CES 2027", clientName: "Samsung", agencyName: "Exhibitus", boothSize: "20x40", showName: "CES 2027", dateLabel: "January 5–8, 2027" },
  slides: [
    { layout: "cover", eyebrow: "Booth Design Proposal", title: "Samsung — CES 2027", subtitle: "20x40 booth" },
    { layout: "section", number: 1, title: "The Ask", subtitle: "What the brief calls for" },
    {
      layout: "briefSummary",
      title: "What we heard",
      facts: [{ label: "Show", value: "CES 2027" }],
      objectives: ["Own the AI-home conversation"],
      audiences: [{ name: "Retail buyers", description: "Category leads" }],
    },
    { layout: "concept", headline: "The Frame of What's Next", narrative: "CES is a shouting match of screens.", points: ["Calm", "Curation"] },
    { layout: "renderFull", image: { url: "https://x/hero.png", label: "Hero" }, caption: "Main aisle approach" },
    { layout: "budget", title: "Budget", rows: [{ category: "Structure", amount: 70300, percentage: 38 }], total: 185000, totalLabel: "Total per show" },
    { layout: "closing", headline: "Let's build it.", subline: "Exhibitus × Samsung", contacts: [{ name: "Bryan", email: "b@x.co" }] },
  ],
};

const at = (layout: SlideLayout, style: "pitch" | "executive" | "editorial" | "tactical", overrides?: SlideOverrides | null, k = kit, treatments: LogoTreatments | null = null) => {
  const i = spec.slides.findIndex((s) => s.layout === layout);
  return renderSlideHtml(spec.slides[i], k, i, spec.slides.length, spec.meta, style, treatments, overrides);
};
const px = (v: number) => `${Math.round(v * 96 * 10) / 10}px`;

describe("deckGround — resolution", () => {
  it("default grounds follow the style", () => {
    expect(defaultSlideGround("cover", resolveDeckStyle("pitch"))).toBe("primary");
    expect(defaultSlideGround("cover", resolveDeckStyle("executive"))).toBe("paper");
    expect(defaultSlideGround("section", resolveDeckStyle("pitch"))).toBe("ink");
    expect(defaultSlideGround("section", resolveDeckStyle("executive"))).toBe("paper");
    expect(defaultSlideGround("renderFull", resolveDeckStyle("tactical"))).toBe("paper");
    expect(defaultSlideGround("budget", resolveDeckStyle("pitch"))).toBe("paper");
  });

  it("no override → nothing is overridden and the style's variants stand", () => {
    const res = resolveSlide({ layout: "cover" }, resolveDeckStyle("pitch"), kitGrounds(kit));
    expect(res.overridden).toBe(false);
    expect(res.cover).toBe("field");
    expect(res.groundHex).toBe("#1428A0");
    expect(usesGroundPalette(res)).toBe(false);
    expect(resolveSlide({ layout: "cover" }, resolveDeckStyle("pitch"), kitGrounds(kit), { notes: "Say hi" }).overridden).toBe(false);
  });

  it("a paper ground turns dark-native variants into their paper siblings", () => {
    const g = kitGrounds(kit);
    expect(resolveSlide({ layout: "cover" }, resolveDeckStyle("pitch"), g, { ground: "paper" }).cover).toBe("quiet");
    expect(resolveSlide({ layout: "section" }, resolveDeckStyle("pitch"), g, { ground: "paper" }).section).toBe("rule");
    expect(resolveSlide({ layout: "renderFull" }, resolveDeckStyle("pitch"), g, { ground: "paper" }).framing).toBe("inset");
    expect(resolveSlide({ layout: "closing" }, resolveDeckStyle("pitch"), g, { ground: "paper" }).onPaper).toBe(true);
  });

  it("a dark ground keeps paper-native variants and swaps their palette; the rule section becomes a numeral", () => {
    const g = kitGrounds(kit);
    const quiet = resolveSlide({ layout: "cover" }, resolveDeckStyle("executive"), g, { ground: "primary" });
    expect(quiet.cover).toBe("quiet");
    expect(usesGroundPalette(quiet)).toBe(true);
    expect(quiet.groundHex).toBe("#1428A0");
    expect(resolveSlide({ layout: "section" }, resolveDeckStyle("executive"), g, { ground: "ink" }).section).toBe("number");
    const budget = resolveSlide({ layout: "budget" }, resolveDeckStyle("pitch"), g, { ground: "ink" });
    expect(budget.groundHex).toBe("#101418");
    expect(usesGroundPalette(budget)).toBe(true);
    expect(budget.overridden).toBe(true);
  });

  it("ground palette swaps roles on dark grounds and keeps ink on light ones", () => {
    const base = { primary: "#1428A0", secondary: "#5B8DEF", ink: "#101418", paper: "#FFFFFF" };
    expect(groundPalette(base, "#FFFFFF")).toMatchObject({ primary: "#1428A0", ink: "#101418", paper: "#FFFFFF", darkGround: false });
    const dark = groundPalette(base, "#101418");
    expect(dark).toMatchObject({ primary: "#FFFFFF", ink: "#FFFFFF", paper: "#101418", darkGround: true });
    const light = groundPalette(base, "#F5E663");
    expect(light.darkGround).toBe(false);
    expect(light.ink).toBe("#101418");
    expect(light.paper).toBe("#F5E663");
  });

  it("accent steps one notch and toggles the chrome", () => {
    const pitch = resolveDeckStyle("pitch");
    expect(accentTokensFor(pitch, "normal")).toBe(pitch);
    expect(accentTokensFor(pitch, "quiet").accent).toEqual({ intensity: "hairline", panelTransparency: 100, zebra: false, topBar: false, geometry: false });
    expect(accentTokensFor(pitch, "loud").accent).toEqual({ intensity: "field", panelTransparency: 90, zebra: true, topBar: true, geometry: true });
    expect(accentTokensFor(resolveDeckStyle("executive"), "loud").accent.intensity).toBe("tint");
    expect(accentTokensFor(pitch, "quiet")).not.toBe(pitch);
    expect(accentTokensFor(pitch, "quiet").cover).toBe("field");
  });
});

describe("per-slide overrides — HTML renderer", () => {
  it("no override / empty override renders byte-identically to the legacy call", () => {
    spec.slides.forEach((slide, i) => {
      const legacy = renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, "pitch");
      expect(renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, "pitch", null, null)).toBe(legacy);
      expect(renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, "pitch", null, {})).toBe(legacy);
      expect(renderSlideHtml(slide, kit, i, spec.slides.length, spec.meta, "pitch", null, { accent: "normal" })).toBe(legacy);
    });
    expect(renderDeckHtml(spec, kit, "pitch", null, {})).toBe(renderDeckHtml(spec, kit, "pitch"));
  });

  it("an ink ground on a body slide flips the palette and the top bar", () => {
    const html = at("budget", "pitch", { ground: "ink" });
    expect(html).toContain('data-ground="ink"');
    expect(html).toContain("background:#101418;font-family");
    // Title now paper, kicker still secondary, bar is the secondary (section language).
    expect(html).toContain(`font-size:${px(24 / 72)};font-weight:700;color:#FFFFFF`);
    expect(html).toContain("top:0px;width:1280px;height:8.6px;background:#5B8DEF");
    expect(html).not.toContain("color:#1428A0");
    // Baseline still on paper with the primary title.
    const base = at("budget", "pitch");
    expect(base).toContain("background:#FFFFFF;font-family");
    expect(base).toContain("color:#1428A0");
  });

  it("a paper cover on the pitch deck draws the quiet (executive) treatment — pinned", () => {
    const html = at("cover", "pitch", { ground: "paper" });
    expect(html).toContain('data-ground="paper"');
    expect(html).toContain("background:#FFFFFF;font-family");
    // The quiet treatment's primary rule under the mark, at the pitch margin.
    expect(html).toContain(
      `<div style="position:absolute;left:${px(0.6)};top:${px(1.42)};width:${px(12.133)};height:${px(0.02)};background:#1428A0;"></div>`,
    );
    // No field geometry, no lockup tab.
    expect(html).not.toContain("border-radius:50%");
    expect(html).not.toContain(`top:${px(-0.3)}`);
  });

  it("a primary ground on an executive cover keeps the quiet layout with light type", () => {
    const html = at("cover", "executive", { ground: "primary" });
    expect(html).toContain("background:#1428A0;font-family");
    // Title role → paper; the rule under the mark → paper too.
    expect(html).toContain(`font-size:${px(44 * 0.92 / 72)}`);
    expect(html).toContain("background:#FFFFFF;\"></div>");
    expect(html).not.toContain("color:#1428A0");
  });

  it("an ink override on the closing mixes its soft text toward ink, not primary", () => {
    const html = at("closing", "pitch", { ground: "ink" });
    expect(html).toContain("background:#101418;font-family");
    // mix(paper, ink, 0.88) on the subline — vs mix(paper, primary, 0.88) by default.
    expect(html).toContain("color:#E2E3E3");
    expect(at("closing", "pitch")).toContain("color:#E3E5F4");
  });

  it("hideLogo suppresses every mark on the slide (and only that slide)", () => {
    const treatments = treatmentsFromAnalyses(brandedKit, "pitch", null, null);
    const shown = at("cover", "pitch", null, brandedKit, treatments);
    expect(shown).toContain("<img");
    const hidden = at("cover", "pitch", { hideLogo: true }, brandedKit, treatments);
    expect(hidden).not.toContain("<img");
    expect(hidden).toContain("Samsung — CES 2027");
    const body = at("budget", "pitch", { hideLogo: true }, brandedKit, treatments);
    expect(body).not.toContain("agency.png");
    expect(at("budget", "pitch", null, brandedKit, treatments)).toContain("agency.png");
  });

  it("quiet accent drops the bar and zebra on a body slide; loud turns the field on", () => {
    const quiet = at("budget", "pitch", { accent: "quiet" });
    expect(quiet).not.toContain("top:0px;width:1280px;height:8.6px");
    expect(quiet).toContain('data-ground="paper"');
    const loud = at("budget", "executive", { accent: "loud" });
    expect(loud).toContain("top:0px;width:1280px;height:8.6px;background:#1428A0");
  });

  it("renderDeckHtml applies the override map by slide index", () => {
    const html = renderDeckHtml(spec, kit, "pitch", null, { "5": { ground: "ink" }, "0": { ground: "paper" } });
    const grounds = [...html.matchAll(/data-ground="(\w+)"/g)].map((m) => m[1]);
    expect(grounds).toEqual(["paper", "ink", "paper", "paper", "ink", "ink", "primary"]);
  });
});

describe("per-slide overrides — logo plating follows the effective ground", () => {
  // A near-navy mark: 1.5:1 against the Samsung-blue cover (plate), 18:1 on paper (bare).
  const navyMark: LogoAnalysis = {
    dominantHex: "#0B1B2B",
    meanLuminance: 0.011,
    isLightMark: false,
    hasTransparency: true,
    aspect: 4,
    palette: [{ hex: "#0B1B2B", share: 1 }],
  };
  const t = treatmentsFromAnalyses(brandedKit, "pitch", navyMark, null);

  it("computes a treatment for every ground an override can choose", () => {
    expect(Object.keys(t.onGround ?? {}).sort()).toEqual(["#101418", "#1428A0", "#FFFFFF"]);
    // Default grounds resolve to the same answers as the per-context sets.
    expect(logoTreatmentAt(t, "lead", "cover", "#1428A0")).toBe(t.lead.cover);
    expect(logoTreatmentAt(t, "lead", "footer", "#FFFFFF")).toBe(t.lead.footer);
    // Legacy treatments (no map) fall back to the per-context set.
    const legacy: LogoTreatments = { lead: t.lead, co: t.co };
    expect(logoTreatmentAt(legacy, "lead", "cover", "#101418")).toBe(t.lead.cover);
  });

  it("a dark mark is plated on the brand-blue cover but bare once the cover is on paper", () => {
    expect(t.lead.cover).toBe("plate-paper");
    const navy = at("cover", "pitch", null, brandedKit, t);
    expect(navy).toContain(`border-radius:${px(0.14)}`); // lockup tab
    const paper = at("cover", "pitch", { ground: "paper" }, brandedKit, t);
    expect(paper).not.toContain(`border-radius:${px(0.14)}`);
    expect(paper).not.toContain(`border-radius:${px(0.08)}`);
    expect(paper).toContain("client.png");
  });

  it("a palette override invalidates persisted treatments", () => {
    expect(logoTreatmentsMatch(t, brandedKit, "pitch")).toBe(true);
    expect(logoTreatmentsMatch(t, { ...brandedKit, primary: "#0B1B2B" }, "pitch")).toBe(false);
    expect(logoTreatmentsMatch(t, { leadLogoUrl: brandedKit.leadLogoUrl, coLogoUrl: brandedKit.coLogoUrl }, "pitch")).toBe(true);
  });
});

describe("per-slide overrides — PPTX renderer (1:1 with HTML)", () => {
  // jsdom's Blob has no arrayBuffer(); FileReader is the portable route.
  const toBuffer = (blob: Blob) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
  const unzip = async (blob: Blob) => JSZip.loadAsync(await toBuffer(blob));
  const read = async (zip: JSZip, path: string) => {
    const f = zip.file(path);
    expect(f, path).not.toBeNull();
    return (await f!.async("string")) as string;
  };
  // pptxgenjs stores every defineSlideMaster as a slide LAYOUT (one physical
  // master); a slide's rels name the layout it sits on.
  const layoutCount = (zip: JSZip) => zip.file(/^ppt\/slideLayouts\/slideLayout\d+\.xml$/).length;
  const layoutXmlOf = async (zip: JSZip, slideNumber: number) => {
    const rels = await read(zip, `ppt/slides/_rels/slide${slideNumber}.xml.rels`);
    const name = /slideLayouts\/(slideLayout\d+)\.xml/.exec(rels)?.[1];
    expect(name, `slide${slideNumber} layout`).toBeTruthy();
    return read(zip, `ppt/slideLayouts/${name}.xml`);
  };
  const bgOf = (layoutXml: string) =>
    /<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-F]{6})"\/>[\s\S]*?<\/p:bg>/.exec(layoutXml)?.[1] ?? null;

  it("an ink body slide gets an ink layout with light type; speaker notes land; the baseline is untouched", async () => {
    const baseline = await unzip(await buildDeckPptx(spec, kit, { style: "pitch" }));
    const overridden = await unzip(
      await buildDeckPptx(spec, kit, {
        style: "pitch",
        slideOverrides: { "5": { ground: "ink", notes: "Walk them through the structure line first." } },
      }),
    );
    // Exactly one extra layout — defined on first use, for the ink body ground.
    expect(layoutCount(overridden)).toBe(layoutCount(baseline) + 1);
    const baseLayout = await layoutXmlOf(baseline, 6);
    const overLayout = await layoutXmlOf(overridden, 6);
    expect(baseLayout).toContain('name="CANOPY_BODY"');
    expect(bgOf(baseLayout)).toBe("FFFFFF");
    expect(overLayout).toContain('name="CANOPY_OV_body_101418_LOGO_BAR_"');
    expect(bgOf(overLayout)).toBe("101418");
    // Its chrome matches the HTML: secondary top bar on a dark ground, light hairline (mix(paper, ink, .25)).
    expect(overLayout).toContain('val="5B8DEF"');
    expect(overLayout).toContain('val="4C4F52"');
    // Slide 6 (the budget): baseline title in primary, override title in paper.
    const baseXml = await read(baseline, "ppt/slides/slide6.xml");
    const overXml = await read(overridden, "ppt/slides/slide6.xml");
    expect(baseXml).toContain('val="1428A0"');
    expect(overXml).not.toContain('val="1428A0"');
    expect(overXml).toContain('val="FFFFFF"');
    // Notes.
    const notes = overridden.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/);
    const texts = await Promise.all(notes.map((f) => f.async("string")));
    expect(texts.some((x) => x.includes("Walk them through the structure line first."))).toBe(true);
    // Untouched slides keep their legacy layouts.
    expect(await layoutXmlOf(overridden, 1)).toContain('name="CANOPY_COVER"');
    expect(await layoutXmlOf(overridden, 2)).toContain('name="CANOPY_SECTION"');
  }, 30_000);

  it("builds with every override kind across styles (unreachable images skipped, never thrown)", async () => {
    const slideOverrides: Record<string, SlideOverrides> = {
      "0": { ground: "paper", hideLogo: true },
      "1": { ground: "primary", accent: "loud" },
      "3": { ground: "ink", accent: "quiet", notes: "Pause here." },
      "4": { ground: "paper" },
      "6": { ground: "ink" },
    };
    for (const style of ["pitch", "executive", "editorial", "tactical"] as const) {
      const blob = await buildDeckPptx(spec, brandedKit, { style, slideOverrides, logoTreatments: treatmentsFromAnalyses(brandedKit, style, null, null) });
      expect(blob.size).toBeGreaterThan(10_000);
    }
  }, 60_000);
});
