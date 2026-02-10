import { AppLayout } from "@/components/layout/AppLayout";
import { ElementDashboard } from "@/components/elements/ElementDashboard";
import { useProjectSync } from "@/hooks/useProjectSync";
import { Loader2 } from "lucide-react";

export default function GeneratePage() {
  const { projectId, isLoading } = useProjectSync();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-12">
        <ElementDashboard projectId={projectId} />
      </div>
    </AppLayout>
  );
}
