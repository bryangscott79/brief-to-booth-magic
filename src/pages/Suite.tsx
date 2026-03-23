import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  Plus,
  DollarSign,
} from "lucide-react";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectSuite } from "@/hooks/useProjectSuite";
import { useProject } from "@/hooks/useProjects";
import { SuiteOverview } from "@/components/suite/SuiteOverview";
import { AddActivationPanel } from "@/components/suite/AddActivationPanel";

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  parsing: { label: "Parsing", variant: "secondary" },
  reviewed: { label: "Reviewed", variant: "secondary" },
  generating: { label: "Generating", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
};

export default function SuitePage() {
  const navigate = useNavigate();
  const { projectId } = useProjectSync();
  const { data: parentProject, isLoading: parentLoading } = useProject(projectId ?? undefined);
  const { data: suiteData, isLoading: suiteLoading } = useProjectSuite(projectId, null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const isLoading = parentLoading || suiteLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!parentProject) {
    return (
      <AppLayout>
        <div className="container py-12">
          <p className="text-muted-foreground">Project not found.</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </div>
      </AppLayout>
    );
  }

  const parentAny = parentProject as any;
  const children = suiteData?.children ?? [];

  // Budget rollup: sum budget_logic.totalPerShow from children that have it
  const budgetItems: Array<{ name: string; total: number }> = [];
  let budgetTotal = 0;
  // We'd need full child data for budget_logic -- for now use parent if available
  if (parentProject.budget_logic) {
    const bl = parentProject.budget_logic as any;
    if (bl?.totalPerShow) {
      budgetItems.push({ name: parentProject.name, total: bl.totalPerShow });
      budgetTotal += bl.totalPerShow;
    }
  }

  const handleActivationCreated = (newId: string) => {
    setAddPanelOpen(false);
    navigate(`/review?project=${newId}`);
  };

  return (
    <AppLayout>
      <div className="container py-8 max-w-6xl">
        {/* Back nav */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-muted-foreground"
          onClick={() => navigate("/projects")}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          All Projects
        </Button>

        {/* Parent project summary */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">{parentProject.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground">
                  {parentAny.project_type && (
                    <span className="capitalize">{String(parentAny.project_type).replace(/_/g, " ")}</span>
                  )}
                  {parentProject.parsed_brief && (
                    <>
                      <span>-</span>
                      <span>{(parentProject.parsed_brief as any)?.brand?.name}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={STATUS_BADGES[parentProject.status]?.variant ?? "outline"}>
                  {STATUS_BADGES[parentProject.status]?.label ?? parentProject.status}
                </Badge>
                <Badge variant="secondary">
                  {children.length} activation{children.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Suite overview grid */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Activations</h2>
            <Button onClick={() => setAddPanelOpen(true)} size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Activation
            </Button>
          </div>

          <SuiteOverview
            parentId={projectId!}
            children={children}
            onAddActivation={() => setAddPanelOpen(true)}
          />
        </div>

        {/* Budget rollup */}
        {budgetTotal > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Budget Rollup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {budgetItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="font-medium">${item.total.toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>${budgetTotal.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Activation Panel */}
        <AddActivationPanel
          parentId={projectId!}
          parentProjectType={parentAny.project_type ?? "trade_show_booth"}
          onCreated={handleActivationCreated}
          open={addPanelOpen}
          onOpenChange={setAddPanelOpen}
        />
      </div>
    </AppLayout>
  );
}
