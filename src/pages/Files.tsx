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
  FileText,
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
import { RenderPromptDialog } from "@/components/common/RenderPromptDialog";
import { RhinoUploadPanel } from "@/components/rhino/RhinoUploadPanel";
import { RhinoGallery } from "@/components/rhino/RhinoGallery";
import { FilesVideoPanel } from "@/components/files/FilesVideoPanel";
import { parseVersionedAngleId, sanitizeConfigKey } from "@/lib/promptVersions";
import type { ProjectImage } from "@/hooks/useProjectImages";

export default function FilesPage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(projectId);
  const { data: rhinoRenders = [], isLoading: rhinoLoading } = useRhinoRenders(projectId);
  const { currentProject } = useProjectStore();
  const clientId = currentProject?.clientId ?? null;

  const [activeAngle, setActiveAngle] = useState<string>("all");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  // "View prompt" dialog — shows the stored prompt_artifacts for the
  // render currently open in the lightbox.
  const [promptDialogImage, setPromptDialogImage] = useState<ProjectImage | null>(null);
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

  // ── Booth-size (footprint config) grouping ──────────────────────────
  // Renders are tagged with their config via the angle_id __cfg__ suffix
  // (primary channel) and prompt_artifacts.configKey/configLabel
  // (fallback). Untagged/legacy renders land in an "Earlier renders"
  // group at the end. Single-group projects render the flat grid exactly
  // as before.
  const spatialConfigs: Array<{ footprintSize?: string }> = Array.isArray(
    currentProject?.elements?.spatialStrategy?.data?.configs,
  )
    ? currentProject!.elements.spatialStrategy.data.configs
    : [];
  const configKeyLabelMap = new Map<string, string>();
  for (const cfg of spatialConfigs) {
    if (cfg?.footprintSize) {
      configKeyLabelMap.set(
        sanitizeConfigKey(String(cfg.footprintSize)),
        String(cfg.footprintSize),
      );
    }
  }
  const sizeTagOf = (img: ProjectImage): { key: string | null; label: string | null } => {
    const { configKey: parsedKey } = parseVersionedAngleId(img.angle_id);
    const artifactKey =
      typeof img.prompt_artifacts?.configKey === "string" ? img.prompt_artifacts.configKey : null;
    const key = parsedKey ?? artifactKey;
    const artifactLabel =
      typeof img.prompt_artifacts?.configLabel === "string"
        ? img.prompt_artifacts.configLabel
        : null;
    return { key, label: artifactLabel ?? (key ? configKeyLabelMap.get(key) ?? key : null) };
  };

  const sizeGroups: Array<{ key: string | null; label: string; images: ProjectImage[] }> = (() => {
    const byKey = new Map<string, ProjectImage[]>();
    const untagged: ProjectImage[] = [];
    for (const img of filtered) {
      const { key } = sizeTagOf(img);
      if (!key) {
        untagged.push(img);
        continue;
      }
      const list = byKey.get(key);
      if (list) list.push(img);
      else byKey.set(key, [img]);
    }
    const groups: Array<{ key: string | null; label: string; images: ProjectImage[] }> = [];
    // Project-config order first (largest → smallest as authored)…
    for (const [key, label] of configKeyLabelMap) {
      const images = byKey.get(key);
      if (images) {
        groups.push({ key, label, images });
        byKey.delete(key);
      }
    }
    // …then keys whose config no longer exists on the project…
    for (const [key, images] of byKey) {
      groups.push({ key, label: sizeTagOf(images[0]).label ?? key, images });
    }
    // …and untagged/legacy renders last.
    if (untagged.length > 0) {
      groups.push({ key: null, label: "Earlier renders", images: untagged });
    }
    return groups;
  })();

  // Flattened display order (group order) — the lightbox walks this list
  // so prev/next follows what's on screen.
  const displayImages = sizeGroups.flatMap((g) => g.images);
  const displayIndexById = new Map(displayImages.map((img, i) => [img.id, i]));

  // Lightbox navigation
  const lightboxImg = lightbox !== null ? displayImages[lightbox] : null;
  const goLightbox = (dir: 1 | -1) => {
    if (lightbox === null) return;
    const next = lightbox + dir;
    if (next >= 0 && next < displayImages.length) setLightbox(next);
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
    <AppLayout surface="light">
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

                    {/* Image grid — grouped under booth-size headers when the
                        project's renders span more than one size. */}
                    {filtered.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground text-sm">
                        No images match the current filter.
                      </div>
                    ) : (
                      (() => {
                        const renderCard = (img: ProjectImage) => {
                          const isSelected = selectedImages.has(img.id);
                          const sizeLabel = sizeTagOf(img).label;
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
                                  setLightbox(displayIndexById.get(img.id) ?? 0);
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
                              {selectMode ? (
                                <div className="absolute top-1.5 left-1.5">
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4 text-primary drop-shadow" />
                                  ) : (
                                    <Square className="h-4 w-4 text-white/80 drop-shadow" />
                                  )}
                                </div>
                              ) : (
                                sizeLabel && (
                                  <div className="absolute top-1.5 left-1.5">
                                    <span className="bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                                      {sizeLabel}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        };

                        return sizeGroups.length > 1 ? (
                          <div className="space-y-6">
                            {sizeGroups.map((group) => (
                              <div key={group.key ?? "__untagged__"}>
                                <div className="flex items-center gap-2 mb-2">
                                  <h3 className="text-sm font-semibold">{group.label}</h3>
                                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4">
                                    {group.images.length}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                  {group.images.map(renderCard)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {displayImages.map(renderCard)}
                          </div>
                        );
                      })()
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
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() => setPromptDialogImage(lightboxImg)}
                title="View the exact prompt that produced this render"
              >
                <FileText className="h-3 w-3 mr-1" />
                View prompt
              </Button>
            </div>
            <p className="text-white/30 text-xs">{lightbox + 1} of {displayImages.length}</p>
          </div>
          {lightbox < displayImages.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); goLightbox(1); }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Prompt-transparency dialog — portaled above the lightbox. */}
      <RenderPromptDialog
        image={promptDialogImage}
        onClose={() => setPromptDialogImage(null)}
      />
    </AppLayout>
  );
}
