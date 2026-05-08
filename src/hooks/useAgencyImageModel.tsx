// useAgencyImageModel — resolves the agency's image-generation preference
// down to the legacy `"gemini" | "openai"` provider flag the edge
// functions accept.
//
// Why this exists: the `agencies.image_model` column stores abstract model
// identifiers like `"openai/gpt-image-2"` or `"google/gemini-3-pro-image-
// preview"`, but the rendering edge functions only branch on a coarse
// "gemini" vs "openai" flag. This hook bridges the two without forcing
// every render call site to know about model ids.
//
// Default policy: if the agency has no preference (or a value we don't
// recognize), we route to GPT-image-2. This matches the platform decision
// to lead with image-2 quality on every render, while still letting
// super admins flip the agency to a Gemini tier from settings.

import { useAgency } from "@/hooks/useAgency";
import { type ImageModelId, getImageModel } from "@/lib/imageModels";

/** Coarse provider routing for the legacy edge-function `imageModel` body field. */
export type ImageProvider = "gemini" | "openai";

/**
 * Map an abstract `ImageModelId` (or any string we might see in the column)
 * down to "gemini" or "openai". Unknown values default to OpenAI so we
 * lead with the higher-fidelity model.
 */
export function imageModelToProvider(id: string | null | undefined): ImageProvider {
  if (!id) return "openai";
  if (id.startsWith("openai/")) return "openai";
  if (id.startsWith("google/")) return "gemini";
  return "openai";
}

/**
 * Returns the image-model state for the current user's primary agency.
 *
 *   modelId  — the abstract id stored in `agencies.image_model`
 *   model    — the matching `ImageModel` registry entry (label, badge, etc.)
 *   provider — coarse "gemini" | "openai" flag for edge functions
 */
export function useAgencyImageModel(): {
  modelId: ImageModelId;
  model: ReturnType<typeof getImageModel>;
  provider: ImageProvider;
  isLoading: boolean;
} {
  const { agency, isLoading } = useAgency();
  const stored = (agency as any)?.image_model as string | null | undefined;
  const model = getImageModel(stored);
  return {
    modelId: model.id,
    model,
    provider: imageModelToProvider(stored ?? model.id),
    isLoading,
  };
}
