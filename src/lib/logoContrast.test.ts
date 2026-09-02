import { describe, it, expect } from "vitest";
import {
  PLATE_MIN_CONTRAST,
  PLATE_SWAP_BELOW,
  LIGHT_MARK_LUMINANCE,
  analyzePixels,
  contrastRatio,
  fitLogoBox,
  lockupBox,
  logoContrastOn,
  logoGroundHex,
  logoTreatmentFor,
  logoTreatmentsMatch,
  plateBox,
  relativeLuminance,
  treatmentsFromAnalyses,
  type LogoAnalysis,
} from "./logoContrast";
import { resolveDeckStyle } from "./deckStyle";

const mark = (hex: string, extra: Partial<LogoAnalysis> = {}): LogoAnalysis => {
  const lum = relativeLuminance(hex);
  return {
    dominantHex: hex,
    meanLuminance: lum,
    isLightMark: lum >= LIGHT_MARK_LUMINANCE,
    hasTransparency: true,
    aspect: 3,
    palette: [{ hex, share: 1 }],
    ...extra,
  };
};

describe("WCAG colour math", () => {
  it("matches the reference luminance + contrast values", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    // 3-hex + bare forms normalise; garbage reads as black.
    expect(contrastRatio("fff", "#000")).toBe(21);
    expect(relativeLuminance("not-a-colour")).toBe(0);
  });
});

describe("logoTreatmentFor thresholds", () => {
  it("leaves a mark bare at or above the 3.0:1 floor", () => {
    expect(PLATE_MIN_CONTRAST).toBe(3);
    expect(logoTreatmentFor(mark("#0B1B2B"), "#FFFFFF")).toBe("none"); // navy on paper
    expect(logoTreatmentFor(mark("#FFFFFF"), "#0B1B2B")).toBe("none"); // white on navy
    expect(logoTreatmentFor(mark("#F97316"), "#101418")).toBe("none"); // orange on ink
  });

  it("plates the orange-on-orange case that started this — on paper", () => {
    const orange = mark("#F97316");
    expect(orange.isLightMark).toBe(false);
    expect(logoContrastOn(orange, "#F97316")).toBe(1);
    expect(logoTreatmentFor(orange, "#F97316")).toBe("plate-paper");
    // Same hue family, still too close.
    expect(logoTreatmentFor(orange, "#FB923C")).toBe("plate-paper");
  });

  it("plates light marks on ink, dark/coloured marks on paper", () => {
    expect(logoTreatmentFor(mark("#FFFFFF"), "#FFFFFF")).toBe("plate-ink");
    expect(logoTreatmentFor(mark("#FFD700"), "#FDE68A")).toBe("plate-ink"); // yellow on pale yellow
    expect(logoTreatmentFor(mark("#1428A0"), "#1428A0")).toBe("plate-paper");
    expect(logoTreatmentFor(mark("#101418"), "#0B1B2B")).toBe("plate-paper");
  });

  it("swaps plates only when the preferred plate is itself unreadable", () => {
    expect(PLATE_SWAP_BELOW).toBe(2);
    // A pale-grey "light" mark: ink plate reads fine → stays ink.
    expect(logoTreatmentFor(mark("#E5E7EB"), "#F3F4F6")).toBe("plate-ink");
    // A light-classified mark whose palette is dominated by a near-ink colour:
    // ink plate < 2.0 while paper is better → swap to paper.
    const nearInk = mark("#1F2937", { isLightMark: true, meanLuminance: 0.55 });
    expect(logoTreatmentFor(nearInk, "#1F2937")).toBe("plate-paper");
  });

  it("uses the WEAKEST colour of a multi-colour mark", () => {
    const navyAndOrange = mark("#0B1B2B", {
      palette: [
        { hex: "#0B1B2B", share: 0.6 },
        { hex: "#F97316", share: 0.4 },
      ],
    });
    // Navy alone would pass on orange; the orange half vanishes → plate.
    expect(logoTreatmentFor(navyAndOrange, "#F97316")).toBe("plate-paper");
    expect(logoTreatmentFor(navyAndOrange, "#FFFFFF")).toBe("none");
  });

  it("never plates a mark on its own plate colour (orange on a white cover stays bare)", () => {
    // 2.84:1 is under the floor, but a paper plate on paper changes nothing.
    expect(contrastRatio("#F97316", "#FFFFFF")).toBeLessThan(PLATE_MIN_CONTRAST);
    expect(logoTreatmentFor(mark("#F97316"), "#FFFFFF")).toBe("none");
    expect(logoTreatmentFor(mark("#F97316"), "#FAFAFA")).toBe("none");
  });

  it("an unanalysable logo is never touched", () => {
    expect(logoTreatmentFor(null, "#F97316")).toBe("none");
    expect(logoTreatmentFor(undefined, "#FFFFFF")).toBe("none");
  });

  it("honours custom plate colours from the kit", () => {
    expect(logoTreatmentFor(mark("#FFFFFF"), "#FFFFFF", { paper: "#FFFFFF", ink: "#000000" })).toBe("plate-ink");
  });
});

describe("analyzePixels", () => {
  const rgba = (pixels: Array<[number, number, number, number]>) => {
    const out = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach(([r, g, b, a], i) => out.set([r, g, b, a], i * 4));
    return out;
  };

  it("reads an orange transparent-background mark as orange, not light", () => {
    const px: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 16; i++) px.push(i % 2 === 0 ? [249, 115, 22, 255] : [0, 0, 0, 0]);
    const a = analyzePixels(rgba(px), 4, 4, 3.2)!;
    expect(a.hasTransparency).toBe(true);
    expect(a.dominantHex).toBe("#F97316");
    expect(a.isLightMark).toBe(false);
    expect(a.aspect).toBe(3.2);
    expect(a.palette[0].share).toBe(1);
  });

  it("drops a baked-in white background from an opaque JPEG logo", () => {
    // 4×4 white tile with a 2×2 navy mark in the middle.
    const px: Array<[number, number, number, number]> = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        px.push(x >= 1 && x <= 2 && y >= 1 && y <= 2 ? [11, 27, 43, 255] : [255, 255, 255, 255]);
    const a = analyzePixels(rgba(px), 4, 4)!;
    expect(a.hasTransparency).toBe(false);
    expect(a.dominantHex).toBe("#0B1B2B");
    expect(a.isLightMark).toBe(false);
    expect(a.aspect).toBe(1);
  });

  it("measures a flat single-colour image as that colour", () => {
    const px: Array<[number, number, number, number]> = Array.from({ length: 9 }, () => [255, 255, 255, 255]);
    const a = analyzePixels(rgba(px), 3, 3)!;
    expect(a.dominantHex).toBe("#FFFFFF");
    expect(a.isLightMark).toBe(true);
  });

  it("returns null for fully transparent or empty input", () => {
    expect(analyzePixels(rgba([[0, 0, 0, 0]]), 1, 1)).toBeNull();
    expect(analyzePixels(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe("treatments per ground + style", () => {
  const kit = {
    primary: "#F97316",
    paper: "#FFFFFF",
    ink: "#101418",
    leadLogoUrl: "https://cdn.example.com/orange-mark.png",
    coLogoUrl: null,
  };

  it("grounds follow the style: field cover sits on primary, paper covers on paper", () => {
    expect(logoGroundHex(kit, resolveDeckStyle("pitch"), "cover")).toBe("#F97316");
    expect(logoGroundHex(kit, resolveDeckStyle("executive"), "cover")).toBe("#FFFFFF");
    expect(logoGroundHex(kit, resolveDeckStyle("pitch"), "closing")).toBe("#F97316");
    expect(logoGroundHex(kit, resolveDeckStyle("editorial"), "footer")).toBe("#FFFFFF");
  });

  it("an orange lead mark is plated on the pitch cover/closing but bare on the executive cover", () => {
    const orange = mark("#F97316");
    const pitch = treatmentsFromAnalyses(kit, "pitch", orange, null);
    expect(pitch.lead).toEqual({ cover: "plate-paper", footer: "none", closing: "plate-paper" });
    expect(pitch.co).toEqual({ cover: "none", footer: "none", closing: "none" });
    expect(pitch.leadAspect).toBe(3);
    expect(pitch.leadKey).toBe(kit.leadLogoUrl);
    expect(pitch.coKey).toBeNull();
    expect(pitch.styleId).toBe("pitch");
    const exec = treatmentsFromAnalyses(kit, "executive", orange, null);
    expect(exec.lead).toEqual({ cover: "none", footer: "none", closing: "none" });
  });

  it("keys treatments by storage ref, so rotating signed URLs still match", () => {
    const signedA = "https://x.supabase.co/storage/v1/object/sign/company-assets/agency/1/logo.png?token=aaa";
    const signedB = "https://x.supabase.co/storage/v1/object/sign/company-assets/agency/1/logo.png?token=bbb";
    const t = treatmentsFromAnalyses({ ...kit, leadLogoUrl: signedA }, "pitch", mark("#F97316"), null);
    expect(t.leadKey).toBe("company-assets/agency/1/logo.png");
    expect(logoTreatmentsMatch(t, { leadLogoUrl: signedB, coLogoUrl: null }, "pitch")).toBe(true);
    expect(logoTreatmentsMatch(t, { leadLogoUrl: signedB, coLogoUrl: null }, "executive")).toBe(false);
    expect(logoTreatmentsMatch(t, { leadLogoUrl: "https://elsewhere/logo.png", coLogoUrl: null }, "pitch")).toBe(false);
    expect(logoTreatmentsMatch(null, kit, "pitch")).toBe(false);
  });
});

describe("plate geometry", () => {
  it("fits a wide mark to the box width and aligns it to the requested side", () => {
    const box = { x: 0.6, y: 0.55, w: 2.2, h: 0.62 };
    const left = fitLogoBox(box, 5, "left");
    expect(left).toEqual({ x: 0.6, y: 0.64, w: 2.2, h: 0.44 });
    const right = fitLogoBox(box, 1, "right");
    expect(right).toEqual({ x: 2.18, y: 0.55, w: 0.62, h: 0.62 });
    expect(fitLogoBox(box, undefined, "left")).toBe(box);
  });

  it("plates pad 0.12in on every side; the lockup hangs from the top edge", () => {
    const fitted = { x: 0.6, y: 0.64, w: 2.2, h: 0.44 };
    expect(plateBox(fitted)).toEqual({ x: 0.48, y: 0.52, w: 2.44, h: 0.68 });
    const tab = lockupBox(fitted);
    expect(tab.y).toBeLessThan(0);
    expect(tab.x).toBe(0.36);
    expect(tab.w).toBe(2.68);
    expect(tab.y + tab.h).toBeCloseTo(1.32, 3);
  });
});
