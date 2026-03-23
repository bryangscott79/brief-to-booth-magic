import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useBrandIntelligence } from "@/hooks/useClients";
import { useBrandAssets } from "@/hooks/useBrandAssets";
import { useVenueIntelligenceForShow } from "@/hooks/useVenueIntelligence";
import { useProjectSuite } from "@/hooks/useProjectSuite";
import { buildBrandRAGContext } from "@/lib/brandRAGBuilder";
import type { ElementType } from "@/types/brief";

// ─── KB FILE SHAPE ───────────────────────────────────────────────────────────

interface KBFile {
  file_name: string;
  extracted_text: string | null;
}

const AGENCY_KB_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

// ─── INTERNAL: FETCH KB FILES ────────────────────────────────────────────────

function useKBFiles(projectId: string | null | undefined, label: string) {
  return useQuery({
    queryKey: ["kb-files", label, projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_files" as any)
        .select("file_name, extracted_text")
        .eq("project_id", projectId!);

      if (error) throw error;
      return (data ?? []) as unknown as KBFile[];
    },
  });
}

// ─── MAIN HOOK ───────────────────────────────────────────────────────────────

interface UseBrandRAGOptions {
  clientId: string | null | undefined;
  projectId: string | null | undefined;
  parentId?: string | null | undefined;
  showName?: string | null | undefined;
  elementType?: ElementType;
  tokenBudget?: number;
}

export function useBrandRAG({
  clientId,
  projectId,
  parentId,
  showName,
  elementType,
  tokenBudget,
}: UseBrandRAGOptions) {
  const { data: guidelines, isLoading: guidelinesLoading } = useBrandGuidelines(clientId);
  const { data: intelligence, isLoading: intelligenceLoading } = useBrandIntelligence(clientId);
  const { data: assets, isLoading: assetsLoading } = useBrandAssets(clientId);
  const { data: venueData, isLoading: venueLoading } = useVenueIntelligenceForShow(showName);
  const { data: agencyKB, isLoading: agencyKBLoading } = useKBFiles(AGENCY_KB_PROJECT_ID, "agency");
  const { data: projectKB, isLoading: projectKBLoading } = useKBFiles(projectId, "project");
  const { data: suiteContext, isLoading: suiteLoading } = useProjectSuite(projectId, parentId ?? null);

  const isLoading =
    guidelinesLoading ||
    intelligenceLoading ||
    assetsLoading ||
    venueLoading ||
    agencyKBLoading ||
    projectKBLoading ||
    suiteLoading;

  const brandContext = !isLoading
    ? buildBrandRAGContext({
        guidelines: guidelines ?? null,
        intelligence: (intelligence ?? []).map((e) => ({
          category: e.category,
          title: e.title,
          content: e.content,
          relevance_weight: e.confidence_score ?? undefined,
        })),
        venueData: venueData ?? null,
        assets: assets ?? [],
        agencyKB: agencyKB ?? [],
        projectKB: projectKB ?? [],
        suiteContext: suiteContext ?? null,
        elementType,
        tokenBudget,
      })
    : null;

  return {
    brandContext: brandContext?.brandContext ?? "",
    suiteContext: brandContext?.suiteContextBlock ?? "",
    tokenEstimate: brandContext?.tokenEstimate ?? 0,
    isLoading,
  };
}
