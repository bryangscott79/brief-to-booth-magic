import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useRhinoRenders } from "@/hooks/useRhinoRenders";
import { useProjectStore } from "@/store/projectStore";
import { Loader2, FolderOpen, Box } from "lucide-react";
import { RhinoUploadPanel } from "@/components/rhino/RhinoUploadPanel";
import { RhinoGallery } from "@/components/rhino/RhinoGallery";

export default function RhinoPage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { data: renders = [], isLoading: rendersLoading } = useRhinoRenders(projectId);
  const { currentProject } = useProjectStore();
  const clientId = currentProject?.clientId ?? null;

  const isLoading = syncLoading || rendersLoading;

  return (
    <AppLayout>
      <div className="container py-12 max-w-5xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !projectId ? (
          <div className="text-center py-24">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Select a project to upload 3D renders</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Box className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-semibold">3D Render Upload</h1>
              </div>
              <p className="text-muted-foreground">
                Upload Rhino, SketchUp, or 3D model screenshots. AI will polish them into
                photorealistic renderings with brand-consistent materials and lighting.
              </p>
            </div>

            {/* Upload panel */}
            <RhinoUploadPanel projectId={projectId} />

            {/* Gallery */}
            <RhinoGallery
              renders={renders}
              projectId={projectId}
              clientId={clientId}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
