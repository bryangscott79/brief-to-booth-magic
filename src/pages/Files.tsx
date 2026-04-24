import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useRhinoRenders } from "@/hooks/useRhinoRenders";
import { useProjectStore } from "@/store/projectStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Download,
  ImageIcon,
  Loader2,
  FolderOpen,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Box,
  Video,
  CheckSquare,
  Square,
  Play,
} from "lucide-react";
import { RhinoUploadPanel } from "@/components/rhino/RhinoUploadPanel";
import { RhinoGallery } from "@/components/rhino/RhinoGallery";
import { FilesVideoPanel } from "@/components/files/FilesVideoPanel";

export default function FilesPage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(projectId);
  const { data: rhinoRenders = [], isLoading: rhinoLoading } = useRhinoRenders(projectId);
  const { currentProject } = useProjectStore();
  const clientId = currentProject?.clientId ?? null;

  const [activeAngle, setActiveAngle] = useState<string>("all");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const isLoading = syncLoading || imagesLoading || rhinoLoading;

  // Build angle tabs
  const angleNames = Array.from(new Set(savedImages.map((i) => i.angle_name)));

  // Filter images
  const filtered = savedImages.filter((img) => {
    if (currentOnly && !img.is_current) return false;
    if (activeAngle !== "all" && img.angle_name !== activeAngle) return false;
    return true;
  });

  // Lightbox navigation
  const lightboxImg = lightbox !== null ? filtered[lightbox] : null;
  const goLightbox = (dir: 1 | -1) => {
    if (lightbox === null) return;
    const next = lightbox + dir;
    if (next >= 0 && next < filtered.length) setLightbox(next);
  };

  const handleDownload = (img: (typeof savedImages)[0]) => {
    const link = document.createElement("a");
    link.href = img.public_url;
    link.download = `${img.angle_name.replace(/\s+/g, "_")}_${new Date(img.created_at).getTime()}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectImage = (id: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedImages.size === filtered.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(filtered.map((img) => img.id)));
    }
  };

  const selectedImageObjects = filtered.filter((img) => selectedImages.has(img.id));

  return (
    <AppLayout>
      <div className="container py-10 max-w-7xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !projectId ? (
          <div className="text-center py-24">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Select a project to view files</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Files & Media</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Project images, 3D renders with AI polish, and video generation
              </p>
            </div>

            <Tabs defaultValue="images">
              <TabsList className="mb-2">
                <TabsTrigger value="images" className="gap-2">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Images
                  {savedImages.length > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4">
                      {savedImages.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="renders" className="gap-2">
                  <Box className="h-3.5 w-3.5" />
                  3D Renders
                  {rhinoRenders.length > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] h-4">
                      {rhinoRenders.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="video" className="gap-2">
                  <Video className="h-3.5 w-3.5" />
                  Video
                </TabsTrigger>
                <TabsTrigger value="documents" className="gap-2">
                  <BookOpen className="h-3.5 w-3.5" />
                  Documents
                </TabsTrigger>
              </TabsList>

              {/* ── IMAGES TAB ── */}
              <TabsContent value="images" className="space-y-5 mt-4">
                {savedImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-28 text-center border border-dashed rounded-xl border-border/60">
                    <ImageIcon className="h-10 w-10 mb-4 text-muted-foreground opacity-30" />
                    <h3 className="text-base font-medium mb-1">No images yet</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Generate renders on the Prompts page — they'll appear here automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Toolbar */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={() => setActiveAngle("all")}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                            activeAngle === "all"
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          All angles
                          <span className="ml-1.5 opacity-70">{savedImages.length}</span>
                        </button>
                        {angleNames.map((name) => {
                          const count = savedImages.filter((i) => i.angle_name === name).length;
                          return (
                            <button
                              key={name}
                              onClick={() => setActiveAngle(name)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                                activeAngle === name
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                              }`}
                            >
                              {name}
                              <span className="opacity-70">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Toggle
                          pressed={currentOnly}
                          onPressedChange={setCurrentOnly}
                          size="sm"
                          className="gap-1.5 text-xs"
                        >
                          <Sparkles className="h-3 w-3" />
                          Current only
                        </Toggle>
                        <Toggle
                          pressed={selectMode}
                          onPressedChange={(v) => {
                            setSelectMode(v);
                            if (!v) setSelectedImages(new Set());
                          }}
                          size="sm"
                          className="gap-1.5 text-xs"
                        >
                          <CheckSquare className="h-3 w-3" />
                          Select
                        </Toggle>
                      </div>
                    </div>

                    {/* Select-mode bar */}
                    {selectMode && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
                        <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                          {selectedImages.size === filtered.length ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          {selectedImages.size === filtered.length ? "Deselect all" : "Select all"}
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {selectedImages.size} selected
                        </span>
                        {selectedImages.size > 0 && (
                          <Button
                            size="sm"
                            className="ml-auto gap-1.5 h-7 text-xs"
                            onClick={() => {
                              // Switch to video tab with selected images
                              const tabTrigger = document.querySelector('[data-value="video"]') as HTMLElement;
                              tabTrigger?.click();
                            }}
                          >
                            <Play className="h-3 w-3" />
                            Make Video ({selectedImages.size})
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Image grid */}
                    {filtered.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground text-sm">
                        No images match the current filter.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {filtered.map((img, idx) => {
                          const isSelected = selectedImages.has(img.id);
                          return (
                            <div
                              key={img.id}
                              className={`group relative rounded-lg overflow-hidden cursor-pointer bg-muted aspect-video border transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                                isSelected
                                  ? "border-primary ring-2 ring-primary/40"
                                  : "border-border/40 hover:border-primary/40"
                              }`}
                              onClick={() => {
                                if (selectMode) {
                                  toggleSelectImage(img.id);
                                } else {
                                  setLightbox(idx);
                                }
                              }}
                            >
                              <img
                                src={img.public_url}
                                alt={img.angle_name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                                <p className="text-white text-[10px] font-medium leading-tight truncate">{img.angle_name}</p>
                                <p className="text-white/60 text-[10px]">
                                  {new Date(img.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </p>
                              </div>
                              {img.is_current && (
                                <div className="absolute top-1.5 right-1.5">
                                  <span className="bg-primary/90 text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                                    Current
                                  </span>
                                </div>
                              )}
                              {selectMode && (
                                <div className="absolute top-1.5 left-1.5">
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4 text-primary drop-shadow" />
                                  ) : (
                                    <Square className="h-4 w-4 text-white/80 drop-shadow" />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ── 3D RENDERS TAB ── */}
              <TabsContent value="renders" className="space-y-5 mt-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload Rhino, SketchUp, or 3D model screenshots. AI will polish them into
                    photorealistic renderings with brand-consistent materials and lighting.
                    Polished renders can be included in your export and presentation.
                  </p>
                  <RhinoUploadPanel projectId={projectId} />
                </div>
                <RhinoGallery
                  renders={rhinoRenders}
                  projectId={projectId}
                  clientId={clientId}
                />
              </TabsContent>

              {/* ── VIDEO TAB ── */}
              <TabsContent value="video" className="mt-4">
                <FilesVideoPanel
                  projectId={projectId}
                  savedImages={savedImages}
                  rhinoRenders={rhinoRenders}
                  preSelectedImages={selectMode && selectedImages.size > 0 ? selectedImageObjects : undefined}
                />
              </TabsContent>

              {/* ── DOCUMENTS TAB ── */}
              <TabsContent value="documents" className="mt-4">
                <ProjectKnowledgeBase projectId={projectId} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="h-6 w-6" />
          </button>
          {lightbox > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); goLightbox(-1); }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div
            className="max-w-5xl max-h-[85vh] w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImg.public_url}
              alt={lightboxImg.angle_name}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
            <div className="flex items-center gap-3">
              <span className="text-white/80 text-sm">{lightboxImg.angle_name}</span>
              {lightboxImg.is_current && (
                <Badge className="bg-primary/80 text-primary-foreground text-xs">Current</Badge>
              )}
              <span className="text-white/40 text-xs">
                {new Date(lightboxImg.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <Button size="sm" variant="secondary" className="ml-2 h-7 text-xs" onClick={() => handleDownload(lightboxImg)}>
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <p className="text-white/30 text-xs">{lightbox + 1} of {filtered.length}</p>
          </div>
          {lightbox < filtered.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); goLightbox(1); }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </AppLayout>
  );
}
