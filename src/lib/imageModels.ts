/**
 * Render quality tier registry.
 *
 * IMPORTANT — user-facing language: never expose underlying model names or
 * providers (no "Gemini", "Nano Banana", "OpenAI", "GPT", etc). Users see
 * only abstract quality tiers ("Master", "Signature", "Studio", "Draft")
 * so the rendering pipeline feels like part of the platform they're paying
 * for.
 *
 * The `id` is the underlying model identifier sent to the AI gateway and is
 * for internal/backend use only. Persisted on `agencies.image_model` and
 * passed to image edge functions via the `image_model` body param.
 *
 * Keep the ids here in sync with KNOWN_IMAGE_MODEL_IDS in
 * supabase/functions/_shared/image-model-chain.ts — that module owns the
 * server-side resolution + fallback ordering.
 */

export type ImageModelId =
  | "openai/gpt-image-2.5"
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "google/gemini-2.5-flash-image"
  | "openai/gpt-image-2";

export interface ImageModel {
  id: ImageModelId;
  label: string;
  shortLabel: string;
  description: string;
  badge?: string;
  /** True if currently routable through the existing edge-function image pipeline. */
  available: boolean;
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "openai/gpt-image-2.5",
    label: "Master",
    shortLabel: "Master",
    description:
      "The flagship engine. Highest fidelity overall, with the sharpest on-render typography, brand marks, and signage of any tier. Slowest and costliest per render.",
    // Exactly one tier carries this badge — it is also DEFAULT_IMAGE_MODEL.
    badge: "Recommended",
    available: true,
  },
  {
    id: "google/gemini-3-pro-image-preview",
    label: "Signature",
    shortLabel: "Signature",
    description: "High fidelity photoreal renders at a lower cost. A strong default for hero and presentation imagery.",
    available: true,
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Studio",
    shortLabel: "Studio",
    description: "Premium quality at faster speeds. Great for iteration and editing.",
    available: true,
  },
  {
    id: "google/gemini-2.5-flash-image",
    label: "Draft",
    shortLabel: "Draft",
    description: "Fastest turnaround. Good for early concepts and bulk variations.",
    available: true,
  },
  {
    id: "openai/gpt-image-2",
    label: "Typographic",
    shortLabel: "Typographic",
    description:
      "Previous-generation text-and-logo engine. Superseded by Master; kept available for agencies mid-project that want renders to match earlier output.",
    available: true,
  },
];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "openai/gpt-image-2.5";

export function getImageModel(id: string | null | undefined): ImageModel {
  return (
    IMAGE_MODELS.find((m) => m.id === id) ??
    IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
  );
}

/** Coarse provider routing for the legacy edge-function `imageModel` body field. */
export type ImageProvider = "gemini" | "openai";

/**
 * Map an abstract `ImageModelId` (or any string we might see in the column)
 * down to "gemini" or "openai".
 *
 * This is LEGACY: the render pipeline now sends the full model id via
 * `image_model`. The coarse flag rides along only so an edge-function
 * deployment that still predates the full-id contract keeps routing to
 * the right provider. Unknown values follow DEFAULT_IMAGE_MODEL rather
 * than a separately-hardcoded guess — the two used to disagree.
 */
export function imageModelToProvider(id: string | null | undefined): ImageProvider {
  const target = id && id.trim() ? id : DEFAULT_IMAGE_MODEL;
  if (target.startsWith("google/")) return "gemini";
  if (target.startsWith("openai/")) return "openai";
  return DEFAULT_IMAGE_MODEL.startsWith("google/") ? "gemini" : "openai";
}
