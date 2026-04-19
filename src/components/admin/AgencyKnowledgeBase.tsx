// AgencyKnowledgeBase — legacy component, now a thin wrapper around the new
// RAG-backed KnowledgeBasePanel scoped to the agency.
//
// Preserves the same mount point used in AdminSettings while swapping the
// implementation to the new knowledge_documents pipeline.

import { Loader2 } from "lucide-react";
import { useAgency } from "@/hooks/useAgency";
import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

export function AgencyKnowledgeBase() {
  const { agency, isLoading } = useAgency();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="text-sm text-muted-foreground py-6">
        Join or create an agency to use the agency knowledge base.
      </div>
    );
  }

  return (
    <KnowledgeBasePanel
      scope="agency"
      scopeId={agency.id}
      title="Agency knowledge"
      description="Documents that inform how your agency operates — playbooks, rate standards, style references, and process notes. Used as context across every project."
    />
  );
}
