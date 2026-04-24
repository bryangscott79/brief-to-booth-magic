import { AppLayout } from "@/components/layout/AppLayout";
import { BriefUpload } from "@/components/brief/BriefUpload";
import { ProjectKnowledgeBase } from "@/components/files/ProjectKnowledgeBase";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function UploadPage() {
  const { projectId, isLoading } = useProjectSync();
  const [searchParams] = useSearchParams();
  const isSuiteMode = searchParams.get("suite") === "true";

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
      <div className="container py-12 space-y-12">
        <div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">
              {isSuiteMode ? "Upload Suite Brief" : "New Project"}
            </h1>
            <p className="text-muted-foreground">
              {isSuiteMode
                ? "Upload the master brief for this suite — activations will inherit this context"
                : "Upload your brief and let AI extract the details — then confirm and continue"}
            </p>
          </div>
          <BriefUpload projectId={projectId} />
        </div>

        {projectId && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Project Knowledge Base</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add supporting docs — RFPs, inspiration, pricing, brand assets — so the AI can
                reference them when generating strategy, prompts, and exports.
              </p>
            </div>
            <ProjectKnowledgeBase projectId={projectId} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
