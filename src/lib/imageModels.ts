/**
 * Render quality tier registry.
 *
 * IMPORTANT — user-facing language: never expose underlying model names or
 * providers (no "Gemini", "Nano Banana", "OpenAI", "GPT", etc). Users see
 * only abstract quality tiers ("Signature", "Studio", "Draft") so the
 * rendering pipeline feels like part of the platform they're paying for.
 *
 * The `id` is the underlying model identifier sent to the AI gateway and is
 * for internal/backend use only. Persisted on `agencies.image_model` and
 * passed to image edge functions via the `image_model` body param.
 */

export type ImageModelId =
  | "google/gemini-3-pro-image-preview"
  | "google/gemini-3.1-flash-image-preview"
  | "google/gemini-2.5-flash-image"
  | "openai/gpt-image-1";

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
    id: "google/gemini-3-pro-image-preview",
    label: "Signature",
    shortLabel: "Signature",
    description: "Highest fidelity. Best for hero renders and final presentation imagery.",
    badge: "Best quality",
    available: true,
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Studio",
    shortLabel: "Studio",
    description: "Premium quality at faster speeds. Great for iteration and editing.",
    badge: "Recommended",
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
    id: "openai/gpt-image-1",
    label: "Typographic",
    shortLabel: "Typographic",
    description: "Tuned for legible on-render text and graphic-led compositions.",
    badge: "Coming soon",
    available: false,
  },
];

export const DEFAULT_IMAGE_MODEL: ImageModelId = "google/gemini-3-pro-image-preview";

export function getImageModel(id: string | null | undefined): ImageModel {
  return (
    IMAGE_MODELS.find((m) => m.id === id) ??
    IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
  );
}
