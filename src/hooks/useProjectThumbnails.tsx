// useProjectThumbnails — bulk-fetch one hero render URL per project so
// the projects list can show a visual reference for each card / row
// without firing one query per project (would be N+1 on a 50-project
// page).
//
// The picker prefers `hero_34` (the canonical 3/4 hero view) but falls
// back to any other hero variant if the user only generated other
// angles. Returns a Map<projectId, public_url> keyed for O(1) lookup
// in the projects list render.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectThumbnails(projectIds: string[]) {
  return useQuery({
    queryKey: ["project-thumbnails", [...projectIds].sort().join(",")],
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("project_images" as any)
        .select("project_id, public_url, angle_id, is_current, created_at")
        .in("project_id", projectIds)
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as Array<{
        project_id: string;
        public_url: string;
        angle_id: string;
      }>;

      // First pass: prefer hero_34. Second pass: any hero variant.
      // Third pass: any current image. Stop at the first found per project.
      const byProject = new Map<string, string>();
      const recordIfMissing = (id: string, url: string) => {
        if (!byProject.has(id) && url) byProject.set(id, url);
      };

      for (const r of rows) {
        if (r.angle_id === "hero_34" || r.angle_id.startsWith("hero_34__v__")) {
          recordIfMissing(r.project_id, r.public_url);
        }
      }
      for (const r of rows) {
        if (r.angle_id.toLowerCase().startsWith("hero")) {
          recordIfMissing(r.project_id, r.public_url);
        }
      }
      for (const r of rows) {
        recordIfMissing(r.project_id, r.public_url);
      }

      return byProject;
    },
    // Thumbnails change rarely; keep them cached for 5 min so list
    // re-renders don't refetch. Invalidated explicitly when a render
    // completes (saveRenderImage triggers a project_images refresh).
    staleTime: 5 * 60 * 1000,
  });
}
