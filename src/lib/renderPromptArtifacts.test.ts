import { describe, it, expect } from "vitest";
import {
  buildRenderPromptArtifacts,
  MAX_PROMPT_CHARS,
} from "./renderPromptArtifacts";

describe("buildRenderPromptArtifacts", () => {
  it("returns null when there is no prompt text", () => {
    expect(buildRenderPromptArtifacts({ prompt: "" })).toBeNull();
    expect(buildRenderPromptArtifacts({ prompt: "   " })).toBeNull();
    expect(buildRenderPromptArtifacts({ prompt: null })).toBeNull();
    expect(buildRenderPromptArtifacts({ prompt: undefined })).toBeNull();
  });

  it("stores the full prompt plus optional sections", () => {
    const out = buildRenderPromptArtifacts({
      prompt: "# SCENE\nA booth",
      negative: "no cartoons",
      geometrySummary: "Geometry: 20ft × 40ft",
      compliance: [{ id: "footprint_match", status: "pass" }],
      model: "openai/gpt-image-2",
      generatedAt: "2026-07-06T00:00:00.000Z",
    });
    expect(out).toEqual({
      prompt: "# SCENE\nA booth",
      negative: "no cartoons",
      geometrySummary: "Geometry: 20ft × 40ft",
      compliance: [{ id: "footprint_match", status: "pass" }],
      model: "openai/gpt-image-2",
      generatedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("omits empty optional fields instead of storing blanks", () => {
    const out = buildRenderPromptArtifacts({
      prompt: "prompt text",
      negative: "  ",
      geometrySummary: "",
      compliance: [],
      references: [],
      model: "",
    })!;
    expect(out.prompt).toBe("prompt text");
    expect(out).not.toHaveProperty("negative");
    expect(out).not.toHaveProperty("geometrySummary");
    expect(out).not.toHaveProperty("compliance");
    expect(out).not.toHaveProperty("references");
    expect(out).not.toHaveProperty("model");
    // generatedAt defaults to now (ISO string).
    expect(typeof out.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(out.generatedAt))).toBe(false);
  });

  it("caps oversized prompts and flags the truncation", () => {
    const big = "x".repeat(MAX_PROMPT_CHARS + 500);
    const out = buildRenderPromptArtifacts({ prompt: big })!;
    expect(out.prompt.length).toBe(MAX_PROMPT_CHARS);
    expect(out.promptTruncated).toBe(true);
  });

  it("never stores base64 data URLs as references (row-size guard)", () => {
    const out = buildRenderPromptArtifacts({
      prompt: "p",
      references: [
        { label: "Hero reference", url: "https://cdn.example.com/hero.png" },
        { label: "Mask", url: "data:image/png;base64,AAAA" },
        { label: "Floor plan", url: `https://x.com/${"a".repeat(3000)}` },
      ],
    })!;
    expect(out.references).toEqual([
      { label: "Hero reference", url: "https://cdn.example.com/hero.png" },
    ]);
  });

  it("dedupes reference URLs and defaults missing labels", () => {
    const out = buildRenderPromptArtifacts({
      prompt: "p",
      references: [
        { label: "Brand logo", url: "https://cdn.example.com/logo.png" },
        { label: "Duplicate", url: "https://cdn.example.com/logo.png" },
        { url: "https://cdn.example.com/extra.png" },
        null,
        { label: "Empty", url: "" },
      ],
    })!;
    expect(out.references).toEqual([
      { label: "Brand logo", url: "https://cdn.example.com/logo.png" },
      { label: "Reference", url: "https://cdn.example.com/extra.png" },
    ]);
  });
});
