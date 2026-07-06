import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectImage {
  id: string;
  project_id: string;
  user_id: string;
  angle_id: string;
  angle_name: string;
  storage_path: string;
  public_url: string;
  is_current: boolean;
  created_at: string;
  /**
   * JSON blob of render metadata. Currently holds modelUsed
   * ("openai/gpt-image-2" or "google/gemini-3-pro-image-preview")
   * and primaryError (gpt-image-2's failure reason when the Gemini
   * fallback fired). Populated by save-render-image so the
   * "Canopy 2.0" / "Canopy Lite" badge survives page reloads.
   * May also carry hero composer artifacts written by generate-hero.
   */
  prompt_artifacts?: {
    modelUsed?: string;
    primaryError?: string;
    /** Sanitized footprint config key ("20x40") this render was generated for. */
    configKey?: string;
    /** Human label for the config (raw footprintSize, e.g. "20x40"). */
    configLabel?: string;
    [key: string]: unknown;
  } | null;
}

export function useProjectImages(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-images", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_images" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProjectImage[];
    },
    enabled: !!projectId,
  });
}

export function useSaveRenderImage(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      angleId,
      angleName,
      imageDataUrl,
      modelUsed,
      primaryError,
      configKey,
      configLabel,
    }: {
      angleId: string;
      angleName: string;
      imageDataUrl: string;
      // Persisted into project_images.prompt_artifacts so the
      // Canopy 2.0 / Canopy Lite badge survives page reload.
      modelUsed?: string;
      primaryError?: string;
      // Footprint config (booth size) tags — persisted into
      // prompt_artifacts AND used by the edge function to prefix the
      // storage filename, so renders stay organized per size.
      configKey?: string;
      configLabel?: string;
    }) => {
      if (!projectId) throw new Error("No project ID");

      // Retry once on transient failures. The save-render-image edge function
      // can fail when the image URL fetch times out or storage hiccups; a
      // single retry catches most of those without doubling user-visible
      // latency on the happy path.
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("save-render-image", {
            body: { projectId, angleId, angleName, imageDataUrl, modelUsed, primaryError, configKey, configLabel },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          return data;
        } catch (err) {
          lastError = err;
          // Brief backoff before retry; skip on last attempt.
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to save render after 2 attempts");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-images", projectId] });
    },
  });
}
