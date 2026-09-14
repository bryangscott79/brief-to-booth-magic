/**
 * Image-model resolution + fallback ordering.
 *
 * This module is deliberately PURE — no Deno APIs, no fetch, no imports.
 * That keeps it (a) importable by every edge function and (b) unit
 * testable from the front-end vitest suite (see
 * src/lib/imageModelChain.test.ts) without spinning up Deno.
 *
 * Why it exists: the per-agency image-model preference is stored as a
 * full model id on `agencies.image_model` (e.g. "openai/gpt-image-2.5")
 * and sent to the render edge functions as the `image_model` body param.
 * Before this module the edge functions collapsed that choice to a
 * coarse "gemini" | "openai" flag and then ignored it outright
 * (`void imageModel;`), so every render hardcoded gpt-image-2.
 *
 * Two hard requirements drive the design:
 *
 *   1. The agency's chosen model must be attempted FIRST.
 *   2. An unknown / retired / mistyped id must NEVER fail the render.
 *      A retired model id returns 404/400 from the provider; we degrade
 *      down the chain and report the reason instead of erroring out.
 *      (We had a retired-model outage; this is the guard against a
 *      repeat.)
 *
 * NOTE: user-facing copy must never expose these ids or their
 * providers. They are internal routing identifiers only — the product
 * shows abstract quality tiers (see src/lib/imageModels.ts).
 */

/** Every image model the render pipeline knows how to call. */
export const KNOWN_IMAGE_MODEL_IDS = [
  "openai/gpt-image-2.5",
  "openai/gpt-image-2",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-2.5-flash-image",
] as const;

export type KnownImageModelId = (typeof KNOWN_IMAGE_MODEL_IDS)[number];

/**
 * Platform default. Must stay in sync with DEFAULT_IMAGE_MODEL in
 * src/lib/imageModels.ts (the "Master" tier).
 */
export const DEFAULT_IMAGE_MODEL_ID: KnownImageModelId = "openai/gpt-image-2.5";

/**
 * Backward compatibility: older clients (and any deployment still
 * running the previous bundle) send the coarse provider flag rather
 * than a model id. Map each to that provider's current flagship.
 */
export const LEGACY_PROVIDER_DEFAULTS: Record<string, KnownImageModelId> = {
  openai: "openai/gpt-image-2.5",
  gemini: "google/gemini-3-pro-image-preview",
  google: "google/gemini-3-pro-image-preview",
};

/**
 * The standing fallback ladder, most → least capable. When the caller's
 * chosen model is one of these it is hoisted to the front and the rest
 * of the ladder follows in this order (see buildImageModelChain).
 *
 * This is the pre-existing chain (gpt-image-2 → gemini-3-pro-image)
 * with the new flagship added on top; the Gemini rung itself retries
 * the flash variant internally, so 3.1-flash is not repeated here.
 */
export const IMAGE_MODEL_FALLBACK_ORDER: KnownImageModelId[] = [
  "openai/gpt-image-2.5",
  "openai/gpt-image-2",
  "google/gemini-3-pro-image-preview",
];

export interface ResolvedImageModel {
  /** The model id to attempt first. Always a known id. */
  id: string;
  /** Exactly what the caller asked for, before normalisation. */
  requested?: string;
  /**
   * Set when the requested value was not a usable model id (missing,
   * legacy provider flag, or unknown/retired). Surfaced to the UI via
   * `primaryError` so an operator can see that the agency's preference
   * did not route as configured.
   */
  note?: string;
}

/** "openai/gpt-image-2.5" → "openai"; "google/…" → "google". */
export function imageModelProviderOf(id: string): "openai" | "google" {
  return id.startsWith("google/") ? "google" : "openai";
}

/** "openai/gpt-image-2.5" → "gpt-image-2.5" (the provider's own name). */
export function bareModelName(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

export function isKnownImageModelId(id: string | null | undefined): boolean {
  return !!id && (KNOWN_IMAGE_MODEL_IDS as readonly string[]).includes(id);
}

/**
 * Normalise whatever the client sent into a model id we can actually
 * call. Never throws — an unrecognised value resolves to the platform
 * default with an explanatory `note`.
 *
 * Accepts:
 *   - a full known id      → used as-is
 *   - "gemini" / "openai"  → that provider's flagship (legacy clients)
 *   - null / "" / garbage  → platform default, with a note
 */
export function resolveImageModelId(
  requested: string | null | undefined,
): ResolvedImageModel {
  if (requested === null || requested === undefined || String(requested).trim() === "") {
    return { id: DEFAULT_IMAGE_MODEL_ID };
  }

  const raw = String(requested).trim();

  if (isKnownImageModelId(raw)) {
    return { id: raw, requested: raw };
  }

  const legacy = LEGACY_PROVIDER_DEFAULTS[raw.toLowerCase()];
  if (legacy) {
    return { id: legacy, requested: raw };
  }

  // Unknown or retired id. Do NOT attempt it — the provider would
  // answer 404/400 and burn a round trip. Degrade to the default and
  // keep the reason so it reaches the model badge tooltip.
  return {
    id: DEFAULT_IMAGE_MODEL_ID,
    requested: raw,
    note:
      `Requested render engine "${raw}" is not available; ` +
      `used the default engine instead.`,
  };
}

/**
 * Build the ordered list of models to try: the chosen model first, then
 * the standing fallback ladder with duplicates removed. Any id (known
 * or not) can lead the chain — resolveImageModelId is what guarantees
 * the lead is callable, and the ladder guarantees there is always
 * somewhere to degrade to.
 */
export function buildImageModelChain(primary: string): string[] {
  const chain: string[] = [primary];
  for (const id of IMAGE_MODEL_FALLBACK_ORDER) {
    if (!chain.includes(id)) chain.push(id);
  }
  return chain;
}

/**
 * Convenience: resolution + chain in one call. This is what the edge
 * functions use.
 */
export function resolveImageModelChain(
  requested: string | null | undefined,
): { chain: string[]; resolved: ResolvedImageModel } {
  const resolved = resolveImageModelId(requested);
  return { chain: buildImageModelChain(resolved.id), resolved };
}
