import { AppLayout } from "@/components/layout/AppLayout";
import { BriefUpload } from "@/components/brief/BriefUpload";
import { useProjectSync } from "@/hooks/useProjectSync";
import { Loader2 } from "lucide-react";

export default function UploadPage() {
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">New Project</h1>
          <p className="text-muted-foreground">
            Upload your brief and let AI extract the details — then confirm and continue
          </p>
        </div>
        <BriefUpload projectId={projectId} />
      </div>
    </AppLayout>
  );
}
