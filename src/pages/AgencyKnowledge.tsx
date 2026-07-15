// Agency-level Knowledge Base page.
// Route: /agency/knowledge
//
// Primary account holders drop documents here that inform the whole
// agency context — brand bible, playbook, pricing standards, style,
// house rules, etc. Fed into parse-brief and all generation flows.

import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";
import { useAgency } from "@/hooks/useAgency";
import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

export default function AgencyKnowledge() {
  const { agency, isLoading } = useAgency();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!agency) {
    return (
      <AppLayout>
        <Card className="p-6">
          <p className="text-muted-foreground">
            You aren't a member of an agency yet. Ask your admin to invite you.
          </p>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <PageHeader
          eyebrow={<>{agency.name} · Shared context</>}
          title="Agency Knowledge"
          subtitle="Playbooks, rate standards, and style references — context for every project."
        />

        <Card className="p-6">
          <KnowledgeBasePanel
            scope="agency"
            scopeId={agency.id}
            title="Agency documents"
            description="Anything that should influence generation across all clients and projects."
          />
        </Card>
      </div>
    </AppLayout>
  );
}
