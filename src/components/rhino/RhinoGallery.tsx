import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  ImageIcon,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RhinoRender } from "@/hooks/useRhinoRenders";
import { useDeleteRhino, useUpdateRhino, usePolishRhino } from "@/hooks/useRhinoRenders";
import { useBrandIntelligence } from "@/hooks/useClients";
import { useProjectStore } from "@/store/projectStore";
import { RhinoPolishControls } from "./RhinoPolishControls";
import { BeforeAfterCompare } from "./BeforeAfterCompare";

type FilterMode = "all" | "original" | "polished";

interface RhinoGalleryProps {
  renders: RhinoRender[];
  projectId: string;
  clientId: string | null;
}

export function RhinoGallery({ renders, projectId, clientId }: RhinoGalleryProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const deleteRhino = useDeleteRhino();
  const updateRhino = useUpdateRhino();
  const polishRhino = usePolishRhino();

  const { currentProject } = useProjectStore();
  const { data: brandIntelEntries } = useBrandIntelligence(clientId);
  const approvedVisual = brandIntelEntries
    ?.filter((e) => e.is_approved && (e.category === "visual_identity" || e.category === "vendor_material"))
    .map((e) => ({ category: e.category, title: e.title, content: e.content })) ?? [];

  const filtered = renders.filter((r) => {
    if (filter === "original") return r.polish_status === "uploaded";
    if (filter === "polished") return r.polish_status === "complete";
    return true;
  });

  const handleStartEdit = (render: RhinoRender) => {
    setEditingId(render.id);
    setEditName(render.view_name || "");
  };

  const handleSaveEdit = (render: RhinoRender) => {
    updateRhino.mutate({
      renderId: render.id,
      projectId,
      viewName: editName,
    });
    setEditingId(null);
  };

  const handlePolish = (
    render: RhinoRender,
    instructions: string,
    stylePreset: string
  ) => {
    // Build design context from project elements
    const elements = currentProject?.elements;
    let designContext = "";
    if (elements?.bigIdea?.data?.title) {
      designContext += `Big Idea: ${elements.bigIdea.data.title}\n`;
    }
    if (elements?.spatialStrategy?.data?.zones) {
      designContext += `Spatial Zones: ${JSON.stringify(elements.spatialStrategy.data.zones)}\n`;
    }

    polishRhino.mutate({
      renderId: render.id,
      projectId,
      rhinoImageUrl: render.original_public_url,
      projectType: currentProject?.projectType || "trade_show_booth",
      brandIntelligence: approvedVisual,
      designContext,
      polishInstructions: instructions || undefined,
      stylePreset: stylePreset as any,
    });
  };

  if (renders.length === 0) {
    return (
      <Card className="element-card">
        <CardContent className="py-12 text-center">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <h3 className="text-sm font-medium mb-1">No Rhino renders yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Upload screenshots from Rhino, SketchUp, or any 3D modeling software above.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        {(["all", "original", "polished"] as FilterMode[]).map((mode) => (
          <Badge
            key={mode}
            variant={filter === mode ? "default" : "outline"}
            className="cursor-pointer capitalize"
            onClick={() => setFilter(mode)}
          >
            {mode === "all" ? `All (${renders.length})` :
             mode === "original" ? `Originals (${renders.filter(r => r.polish_status === "uploaded").length})` :
             `Polished (${renders.filter(r => r.polish_status === "complete").length})`}
          </Badge>
        ))}
      </div>

      {/* Gallery grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((render) => {
          const isExpanded = expandedId === render.id;
          const isEditing = editingId === render.id;

          return (
            <Card key={render.id} className="overflow-hidden">
              {/* Image */}
              <div className="relative aspect-video bg-muted">
                {render.polish_status === "complete" && render.polished_public_url ? (
                  isExpanded ? (
                    <BeforeAfterCompare
                      beforeUrl={render.original_public_url}
                      afterUrl={render.polished_public_url}
                      className="w-full h-full"
                    />
                  ) : (
                    <img
                      src={render.polished_public_url}
                      alt={render.view_name || "Polished render"}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : render.polish_status === "processing" ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                      <span className="text-xs text-muted-foreground">Polishing...</span>
                    </div>
                  </div>
                ) : (
                  <img
                    src={render.original_public_url}
                    alt={render.view_name || "Rhino render"}
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Status badge */}
                <div className="absolute top-2 left-2">
                  <Badge
                    className={cn(
                      "text-[10px]",
                      render.polish_status === "complete"
                        ? "bg-green-600/90 text-white"
                        : render.polish_status === "processing"
                        ? "bg-yellow-600/90 text-white"
                        : render.polish_status === "error"
                        ? "bg-red-600/90 text-white"
                        : "bg-gray-600/90 text-white"
                    )}
                  >
                    {render.polish_status === "complete"
                      ? "Polished"
                      : render.polish_status === "processing"
                      ? "Processing"
                      : render.polish_status === "error"
                      ? "Error"
                      : "Original"}
                  </Badge>
                </div>

                {/* Compare toggle for polished renders */}
                {render.polish_status === "complete" && render.polished_public_url && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2 h-7 text-xs"
                    onClick={() => setExpandedId(isExpanded ? null : render.id)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {isExpanded ? "Hide Compare" : "Compare"}
                  </Button>
                )}
              </div>

              <CardContent className="p-3 space-y-3">
                {/* View name (editable) */}
                <div className="flex items-center justify-between">
                  {isEditing ? (
                    <div className="flex items-center gap-1 flex-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-6 text-xs"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleSaveEdit(render)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {render.view_name || "Untitled View"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => handleStartEdit(render)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(render.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive/60 hover:text-destructive"
                      onClick={() =>
                        deleteRhino.mutate({
                          renderId: render.id,
                          projectId,
                          storagePath: render.original_storage_path,
                          polishedStoragePath: render.polished_storage_path,
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Polish controls (show for uploaded or polished renders) */}
                {render.polish_status !== "processing" && (
                  <RhinoPolishControls
                    render={render}
                    onPolish={(instructions, preset) =>
                      handlePolish(render, instructions, preset)
                    }
                    isPolishing={
                      polishRhino.isPending &&
                      polishRhino.variables?.renderId === render.id
                    }
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
