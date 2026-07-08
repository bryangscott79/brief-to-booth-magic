import { AppLayout } from "@/components/layout/AppLayout";
import { ElementDashboard } from "@/components/elements/ElementDashboard";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectStore } from "@/store/projectStore";
import { useBrandIntelligence } from "@/hooks/useClients";
import { useShowCosts } from "@/hooks/useCompanyProfile";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";
import { Loader2 } from "lucide-react";
import {
  WorkSheet,
  InkRail,
  RailSection,
  RailTitle,
  RailRow,
  SpecMono,
  StatusChip,
} from "@/components/shell";

// ─── Weighted Context Rail ───────────────────────────────────────────────────
// Read-only reference truth for the Generate step: the context sources that
// are already assembled and passed to element generation (brand intelligence,
// past learnings, show costs, project knowledge). Same hooks the dashboard
// uses — React Query dedupes the fetches.

function WeightedContextRail({
  projectId,
  clientId,
}: {
  projectId: string | null;
  clientId: string | null;
}) {
  const { data: intelligence } = useBrandIntelligence(clientId);
  const { costs: showCosts } = useShowCosts();
  const { files: kbFiles } = useKnowledgeBase(projectId);

  const approved = (intelligence ?? []).filter((e) => e.is_approved);
  const pastLearnings = approved.filter((e) => e.category === "past_learning");
  const kbWithText = kbFiles.filter((f) => f.extracted_text);

  return (
    <InkRail
      footer={
        <p className="text-[12px] leading-[17px]" style={{ color: "rgba(255,255,255,0.56)" }}>
          Adjust weighting on the sheet — only the entries you select feed generation.
        </p>
      }
    >
      <RailTitle
        label="Weighted context"
        hint="Everything below is passed to concept generation."
      />

      <RailSection label="Brand intelligence" accent="sky">
        <RailRow
          label="Approved entries"
          mono
          tone={approved.length > 0 ? "pass" : "default"}
          value={intelligence ? String(approved.length) : undefined}
        />
        <RailRow
          label="Past learnings"
          mono
          value={intelligence ? String(pastLearnings.length) : undefined}
        />
      </RailSection>

      <RailSection label="Cost data" accent="violet">
        <RailRow
          label="Show costs"
          mono
          tone={showCosts.length > 0 ? "pass" : "default"}
          value={showCosts.length > 0 ? `${showCosts.length} shows` : undefined}
        />
      </RailSection>

      <RailSection label="Project knowledge" accent="pink">
        <RailRow
          label="Docs with extracted text"
          mono
          value={kbFiles.length > 0 ? String(kbWithText.length) : undefined}
        />
      </RailSection>
    </InkRail>
  );
}

export default function GeneratePage() {
  const { projectId, isLoading } = useProjectSync();
  const currentProject = useProjectStore((s) => s.currentProject);
  const clientId = currentProject?.clientId ?? null;

  const elements = currentProject?.elements;
  const completedCount = elements
    ? Object.values(elements).filter((e) => e.status === "complete").length
    : 0;
  const totalCount = elements ? Object.keys(elements).length : 8;

  if (isLoading) {
    return (
      <AppLayout surface="light">
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout surface="light">
      <div className="px-5 py-5 md:px-10">
        <div className="flex flex-col gap-5 lg:flex-row">
          <WorkSheet
            className="min-w-0 flex-1"
            title="Generate"
            subtitle="Eight concept elements, generated from the brief and weighted context"
            headerRight={
              completedCount === totalCount && totalCount > 0 ? (
                <StatusChip variant="pass">All elements complete</StatusChip>
              ) : (
                <SpecMono className="text-slate">
                  {completedCount}/{totalCount} complete
                </SpecMono>
              )
            }
          >
            <ElementDashboard projectId={projectId} />
          </WorkSheet>

          <WeightedContextRail projectId={projectId} clientId={clientId} />
        </div>
      </div>
    </AppLayout>
  );
}
