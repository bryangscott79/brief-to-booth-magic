// Tests for the render-engine resolution + fallback ordering that the
// image edge functions use.
//
// The module under test lives in supabase/functions/_shared because the
// edge functions own it, but it is deliberately pure TypeScript (no Deno
// APIs) so it can be exercised here instead of only in production.
//
// What these lock down:
//   1. The agency's chosen model is always attempted FIRST.
//   2. An unknown / retired / mistyped id NEVER hard-fails — it resolves
//      to the platform default and reports why. (We had a retired-model
//      outage; this is the regression guard.)
//   3. Legacy "gemini" / "openai" bodies still route somewhere sensible.
//   4. The registry the UI renders and the chain the server walks agree
//      on both the id set and the default.

import { describe, expect, it } from "vitest";
import {
  bareModelName,
  buildImageModelChain,
  DEFAULT_IMAGE_MODEL_ID,
  IMAGE_MODEL_FALLBACK_ORDER,
  imageModelProviderOf,
  isKnownImageModelId,
  KNOWN_IMAGE_MODEL_IDS,
  resolveImageModelChain,
  resolveImageModelId,
} from "../../supabase/functions/_shared/image-model-chain.ts";
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  imageModelToProvider,
} from "@/lib/imageModels";

describe("resolveImageModelId", () => {
  it("passes a known id through untouched", () => {
    const r = resolveImageModelId("google/gemini-3.1-flash-image-preview");
    expect(r.id).toBe("google/gemini-3.1-flash-image-preview");
    expect(r.note).toBeUndefined();
  });

  it("resolves the new flagship id", () => {
    expect(resolveImageModelId("openai/gpt-image-2.5").id).toBe("openai/gpt-image-2.5");
  });

  it("falls back to the platform default when nothing is requested", () => {
    for (const empty of [undefined, null, "", "   "]) {
      const r = resolveImageModelId(empty);
      expect(r.id).toBe(DEFAULT_IMAGE_MODEL_ID);
      expect(r.note).toBeUndefined();
    }
  });

  it("maps the legacy coarse provider flags to a sensible default id", () => {
    expect(resolveImageModelId("openai").id).toBe("openai/gpt-image-2.5");
    expect(resolveImageModelId("gemini").id).toBe("google/gemini-3-pro-image-preview");
    expect(resolveImageModelId("OpenAI").id).toBe("openai/gpt-image-2.5");
    // Legacy flags are a rewrite, not a straight pass-through, but they
    // are expected — no scary note.
    expect(resolveImageModelId("gemini").note).toBeUndefined();
  });

  it("degrades an unknown or retired id instead of attempting it", () => {
    const r = resolveImageModelId("openai/gpt-image-1");
    expect(r.id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(r.requested).toBe("openai/gpt-image-1");
    expect(r.note).toContain("openai/gpt-image-1");
    expect(r.note).toContain("not available");
  });

  it("never throws on junk input", () => {
    for (const junk of ["🙂", "null", "openai/", "/", "google/does-not-exist"]) {
      const r = resolveImageModelId(junk);
      expect(isKnownImageModelId(r.id)).toBe(true);
      expect(r.note).toBeTruthy();
    }
  });
});

describe("buildImageModelChain", () => {
  it("puts the chosen model first", () => {
    expect(buildImageModelChain("google/gemini-3-pro-image-preview")[0]).toBe(
      "google/gemini-3-pro-image-preview",
    );
    expect(buildImageModelChain("openai/gpt-image-2")[0]).toBe("openai/gpt-image-2");
  });

  it("appends the standing ladder after the chosen model", () => {
    expect(buildImageModelChain("openai/gpt-image-2.5")).toEqual([
      "openai/gpt-image-2.5",
      "openai/gpt-image-2",
      "google/gemini-3-pro-image-preview",
    ]);
  });

  it("never repeats a model", () => {
    for (const id of KNOWN_IMAGE_MODEL_IDS) {
      const chain = buildImageModelChain(id);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it("always leaves somewhere to degrade to", () => {
    for (const id of KNOWN_IMAGE_MODEL_IDS) {
      expect(buildImageModelChain(id).length).toBeGreaterThan(1);
    }
  });

  it("hoists a model that is already in the ladder rather than duplicating it", () => {
    const chain = buildImageModelChain("google/gemini-3-pro-image-preview");
    expect(chain).toEqual([
      "google/gemini-3-pro-image-preview",
      "openai/gpt-image-2.5",
      "openai/gpt-image-2",
    ]);
  });

  it("keeps a chosen model that is outside the ladder at the head", () => {
    const chain = buildImageModelChain("google/gemini-2.5-flash-image");
    expect(chain[0]).toBe("google/gemini-2.5-flash-image");
    expect(chain.slice(1)).toEqual(IMAGE_MODEL_FALLBACK_ORDER);
  });
});

describe("resolveImageModelChain", () => {
  it("routes a retired id to the default chain and explains why", () => {
    const { chain, resolved } = resolveImageModelChain("openai/gpt-image-0");
    expect(chain[0]).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(resolved.note).toBeTruthy();
  });

  it("routes the agency preference to the head of the chain", () => {
    const { chain, resolved } = resolveImageModelChain("google/gemini-3.1-flash-image-preview");
    expect(chain[0]).toBe("google/gemini-3.1-flash-image-preview");
    expect(resolved.note).toBeUndefined();
  });
});

describe("provider + name helpers", () => {
  it("splits provider from id", () => {
    expect(imageModelProviderOf("openai/gpt-image-2.5")).toBe("openai");
    expect(imageModelProviderOf("google/gemini-3-pro-image-preview")).toBe("google");
  });

  it("strips the provider prefix for the wire model name", () => {
    expect(bareModelName("openai/gpt-image-2.5")).toBe("gpt-image-2.5");
    expect(bareModelName("gpt-image-2.5")).toBe("gpt-image-2.5");
  });
});

describe("client registry agrees with the server chain", () => {
  it("shares the same set of model ids", () => {
    expect([...IMAGE_MODELS.map((m) => m.id)].sort()).toEqual(
      [...KNOWN_IMAGE_MODEL_IDS].sort(),
    );
  });

  it("shares the same platform default", () => {
    expect(DEFAULT_IMAGE_MODEL).toBe(DEFAULT_IMAGE_MODEL_ID);
  });

  it("marks exactly one tier as the recommended default", () => {
    const recommended = IMAGE_MODELS.filter((m) => m.badge === "Recommended");
    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe(DEFAULT_IMAGE_MODEL);
  });

  it("never names a provider or model in user-facing copy", () => {
    const banned = /gemini|openai|gpt|google|nano.?banana|anthropic|claude/i;
    for (const m of IMAGE_MODELS) {
      expect(m.label).not.toMatch(banned);
      expect(m.shortLabel).not.toMatch(banned);
      expect(m.description).not.toMatch(banned);
      if (m.badge) expect(m.badge).not.toMatch(banned);
    }
  });

  it("agrees with the server on the legacy coarse provider flag", () => {
    // The FRD flagged that imageModelToProvider's unknown-value default
    // disagreed with DEFAULT_IMAGE_MODEL. Pin them together.
    expect(imageModelToProvider(undefined)).toBe(
      imageModelProviderOf(DEFAULT_IMAGE_MODEL_ID) === "google" ? "gemini" : "openai",
    );
    expect(imageModelToProvider("google/gemini-3-pro-image-preview")).toBe("gemini");
    expect(imageModelToProvider("openai/gpt-image-2.5")).toBe("openai");
    expect(imageModelToProvider("nonsense")).toBe(imageModelToProvider(undefined));
  });
});
