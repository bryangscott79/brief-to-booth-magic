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
    }: {
      angleId: string;
      angleName: string;
      imageDataUrl: string;
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
            body: { projectId, angleId, angleName, imageDataUrl },
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
