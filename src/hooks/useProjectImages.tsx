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
   * JSON blob of render metadata, populated by save-render-image.
   *   - modelUsed / primaryError → Canopy 2.0 / Canopy Lite badge
   *   - configKey / configLabel → booth-size (footprint config) tags
   *   - prompt / negative / geometrySummary / compliance / references /
   *     model / generatedAt → prompt-transparency payload (see
   *     buildRenderPromptArtifacts) shown by the "View prompt" dialog
   *   - hangingApproved → hanging-element check gate approval for the
   *     hero this row stores
   * Legacy rows (pre prompt-tracking) may be null or carry only a
   * subset — the UI shows "Prompt not recorded" for those.
   */
  prompt_artifacts?: {
    modelUsed?: string;
    primaryError?: string;
    /** Sanitized footprint config key ("20x40") this render was generated for. */
    configKey?: string;
    /** Human label for the config (raw footprintSize, e.g. "20x40"). */
    configLabel?: string;
    /** Full prompt text actually sent to the image model. */
    prompt?: string;
    promptTruncated?: boolean;
    negative?: string;
    geometrySummary?: string;
    compliance?: unknown[];
    references?: Array<{ label?: string; url?: string }>;
    model?: string;
    generatedAt?: string;
    /** Hanging-element check approved for this hero render. */
    hangingApproved?: boolean;
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
      promptArtifacts,
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
      // Prompt-transparency payload (buildRenderPromptArtifacts) —
      // merged into prompt_artifacts by the edge function so every
      // render keeps the exact prompt that produced it.
      promptArtifacts?: Record<string, unknown>;
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
            body: { projectId, angleId, angleName, imageDataUrl, modelUsed, primaryError, configKey, configLabel, promptArtifacts },
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
