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
    label: "Nano Banana Pro",
    shortLabel: "Pro",
    description: "Highest fidelity. Best for hero renders and presentation imagery.",
    badge: "Best quality",
    available: true,
  },
  {
    id: "google/gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    shortLabel: "2",
    description: "Pro-quality at faster speeds. Great for iteration and editing.",
    badge: "New",
    available: true,
  },
  {
    id: "google/gemini-2.5-flash-image",
    label: "Nano Banana",
    shortLabel: "Standard",
    description: "Fastest and most economical. Good for drafts and bulk renders.",
    available: true,
  },
  {
    id: "openai/gpt-image-1",
    label: "OpenAI GPT Image",
    shortLabel: "GPT",
    description: "Strong on legible text and stylized renders. Coming soon.",
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
