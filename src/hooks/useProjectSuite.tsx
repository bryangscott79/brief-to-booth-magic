import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectSummary, SuiteContext } from "@/types/brief";

export function useProjectSuite(projectId: string | null | undefined, parentId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-suite", projectId, parentId],
    enabled: !!projectId,
    queryFn: async (): Promise<SuiteContext> => {
      const suiteParentId = parentId ?? projectId;

      // Fetch children of the suite parent
      const { data: childRows, error: childErr } = await supabase
        .from("projects")
        .select("id, name, project_type, activation_type, status, scale_classification, footprint_sqft")
        .eq("parent_id" as any, suiteParentId!)
        .order("sort_order" as any, { ascending: true });

      if (childErr) throw childErr;

      const children: ProjectSummary[] = (childRows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        projectType: r.project_type,
        activationType: r.activation_type,
        status: r.status,
        scaleClassification: r.scale_classification,
        footprintSqft: r.footprint_sqft,
      }));

      let parent: ProjectSummary | null = null;
      if (parentId) {
        const { data: parentRow } = await supabase
          .from("projects")
          .select("id, name, project_type, activation_type, status, scale_classification, footprint_sqft")
          .eq("id", parentId)
          .single();
        if (parentRow) {
          const p = parentRow as any;
          parent = {
            id: p.id,
            name: p.name,
            projectType: p.project_type,
            activationType: p.activation_type,
            status: p.status,
            scaleClassification: p.scale_classification,
            footprintSqft: p.footprint_sqft,
          };
        }
      }

      // Siblings = children minus current project
      const siblings = children.filter(c => c.id !== projectId);

      return { parent, children, siblings };
    },
  });
}
