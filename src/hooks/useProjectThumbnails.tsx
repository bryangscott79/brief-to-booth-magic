// useProjectThumbnails — bulk-fetch ALL current render URLs per project
// so the projects list can:
//   1. Show a visual reference (first hero) for each card
//   2. Scrub through additional renders on hover (banner peek-through)
//
// Single query for the whole list — N+1-safe on a 50-project page.
// Returned shape is `Map<projectId, string[]>` ordered hero-first,
// then any other render. The first element is the "primary" thumb;
// the rest power the hover scrub.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectThumbnails(projectIds: string[]) {
  return useQuery({
    queryKey: ["project-thumbnails", [...projectIds].sort().join(",")],
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Map<string, string[]>> => {
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

      // Bucket all images per project, then sort each list:
      // hero_34 → other hero variants → everything else, deduped.
      const byProject = new Map<string, string[]>();
      const seenKeys = new Set<string>(); // key = project_id|public_url

      const heroPriority = (angleId: string): number => {
        if (angleId === "hero_34" || angleId.startsWith("hero_34__v__")) return 0;
        if (angleId.toLowerCase().startsWith("hero")) return 1;
        return 2;
      };

      // Pre-sort by hero priority then created-at desc (already sorted).
      const sorted = [...rows].sort(
        (a, b) => heroPriority(a.angle_id) - heroPriority(b.angle_id),
      );

      for (const r of sorted) {
        if (!r.public_url) continue;
        const k = `${r.project_id}|${r.public_url}`;
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        const existing = byProject.get(r.project_id);
        if (existing) existing.push(r.public_url);
        else byProject.set(r.project_id, [r.public_url]);
      }

      return byProject;
    },
    // Thumbnails change rarely; keep them cached for 5 min so list
    // re-renders don't refetch. Invalidated explicitly when a render
    // completes (saveRenderImage triggers a project_images refresh).
    staleTime: 5 * 60 * 1000,
  });
}
