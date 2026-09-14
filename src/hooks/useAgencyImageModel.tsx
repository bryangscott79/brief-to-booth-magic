// useAgencyImageModel — resolves the agency's image-generation preference.
//
// `agencies.image_model` stores an abstract model identifier like
// "openai/gpt-image-2.5" or "google/gemini-3-pro-image-preview". Render
// calls now send that FULL id to the edge functions as `image_model`,
// which attempt it first and then walk the standing fallback ladder
// (see supabase/functions/_shared/image-model-chain.ts).
//
// `provider` is the legacy coarse "gemini" | "openai" flag. It is still
// emitted alongside the full id purely so an edge-function deployment
// that predates the full-id contract keeps routing to the right
// provider. New call sites should use `modelId`.
//
// Default policy: an agency with no (or an unrecognised) preference gets
// DEFAULT_IMAGE_MODEL — the flagship Master tier.

import { useAgency } from "@/hooks/useAgency";
import {
  type ImageModelId,
  type ImageProvider,
  getImageModel,
  imageModelToProvider,
} from "@/lib/imageModels";

// Re-exported for backward compatibility — these used to live here.
// The canonical definitions are now in @/lib/imageModels so non-React
// modules (e.g. the render store) can import them without pulling in
// React Query.
export type { ImageProvider };
export { imageModelToProvider };

/**
 * Returns the image-model state for the current user's primary agency.
 *
 *   modelId  — the abstract id stored in `agencies.image_model`
 *   model    — the matching `ImageModel` registry entry (label, badge, etc.)
 *   provider — legacy coarse "gemini" | "openai" flag for old edge functions
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
