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

      const { data, error } = await supabase.functions.invoke("save-render-image", {
        body: { projectId, angleId, angleName, imageDataUrl },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-images", projectId] });
    },
  });
}
