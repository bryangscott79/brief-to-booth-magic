/**
 * FilesVideoPanel — Image-to-video generator within the Files & Media hub.
 * Allows selecting images (project images or polished 3D renders) individually
 * or collectively and generating AI videos from them.
 */

import { useState } from "react";
import {
  Play,
  Video,
  Loader2,
  Download,
  RefreshCw,
  AlertCircle,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Box,
} from "lucide-react";
import { LucideIcon } from "@/components/ui/lucide-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  useVideoStore,
  CAMERA_MOTION_PRESETS,
  type CameraMotion,
  type GeneratedVideo,
} from "@/store/videoStore";
import type { ProjectImage } from "@/hooks/useProjectImages";
import type { RhinoRender } from "@/hooks/useRhinoRenders";

interface FilesVideoPanelProps {
  projectId: string;
  savedImages: ProjectImage[];
  rhinoRenders: RhinoRender[];
  preSelectedImages?: ProjectImage[];
}

type SourceTab = "project" | "renders";

export function FilesVideoPanel({
  projectId,
  savedImages,
  rhinoRenders,
  preSelectedImages,
}: FilesVideoPanelProps) {
  const [sourceTab, setSourceTab] = useState<SourceTab>("project");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(preSelectedImages?.map((i) => i.id) ?? [])
  );
  const [selectedMotion, setSelectedMotion] = useState<CameraMotion>("walkthrough");
  const [duration, setDuration] = useState(6);
  const { toast } = useToast();

  const { videos, isGenerating, generateVideo, setProjectId } = useVideoStore();
  setProjectId(projectId);

  // Build source lists
  const projectSources = savedImages.map((img) => ({
    id: img.id,
    name: img.angle_name,
    url: img.public_url,
    badge: img.is_current ? "Current" : undefined,
  }));

  const rhinoSources = rhinoRenders
    .filter((r) => r.polish_status === "complete" && r.polished_public_url)
    .map((r) => ({
      id: r.id,
      name: r.view_name || "Untitled View",
      url: r.polished_public_url!,
      badge: "Polished",
    }));

  const rawRhinoSources = rhinoRenders
    .filter((r) => r.polish_status === "uploaded")
    .map((r) => ({
      id: r.id,
      name: r.view_name || "Untitled View",
      url: r.original_public_url,
      badge: "Original",
    }));

  const allRhinoSources = [...rhinoSources, ...rawRhinoSources];
  const activeSources = sourceTab === "project" ? projectSources : allRhinoSources;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === activeSources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeSources.map((s) => s.id)));
    }
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "Select images", description: "Choose at least one image to generate a video from.", variant: "destructive" });
      return;
    }

    const sources = activeSources.filter((s) => selectedIds.has(s.id));

    for (const source of sources) {
      try {
        await generateVideo({
          sourceAngleId: source.id,
          sourceAngleName: source.name,
          sourceImageUrl: source.url,
          cameraMotion: selectedMotion,
          duration,
          projectId,
        });
      } catch {
        // error toast handled in store
      }
    }

    toast({
      title: `${sources.length} video${sources.length > 1 ? "s" : ""} queued`,
      description: `Creating ${CAMERA_MOTION_PRESETS.find((p) => p.id === selectedMotion)?.name} videos…`,
    });
  };

  const allVideos = Object.values(videos);
  const completedVideos = allVideos.filter((v) => v.status === "complete");
  const processingVideos = allVideos.filter((v) => v.status === "generating" || v.status === "processing");

  return (
    <div className="space-y-6">
      {/* Source selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4" />
            Image to Video
          </CardTitle>
          <CardDescription>
            Select one or more images and generate AI video walkthroughs. Each image becomes its own video clip.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Source type tabs */}
          <div>
            <Tabs value={sourceTab} onValueChange={(v) => { setSourceTab(v as SourceTab); setSelectedIds(new Set()); }}>
              <TabsList className="h-8">
                <TabsTrigger value="project" className="text-xs gap-1.5 h-7">
                  <ImageIcon className="h-3 w-3" />
                  Project Images
                  {savedImages.length > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px] h-3.5 ml-0.5">{savedImages.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="renders" className="text-xs gap-1.5 h-7">
                  <Box className="h-3 w-3" />
                  3D Renders
                  {allRhinoSources.length > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[9px] h-3.5 ml-0.5">{allRhinoSources.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Image selection grid */}
          {activeSources.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">
                {sourceTab === "project"
                  ? "No project images yet. Generate renders on the Prompts page."
                  : "No 3D renders available. Upload renders in the 3D Renders tab."}
              </p>
            </div>
          ) : (
            <>
              {/* Select all bar */}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {selectedIds.size === activeSources.length ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectedIds.size === activeSources.length ? "Deselect all" : "Select all"}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {activeSources.map((source) => {
                  const isSelected = selectedIds.has(source.id);
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggle(source.id)}
                      className={cn(
                        "relative rounded-lg overflow-hidden border-2 transition-all aspect-video text-left",
                        isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <img
                        src={source.url}
                        alt={source.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
                        <span className="text-[11px] text-white font-medium truncate block">{source.name}</span>
                        {source.badge && (
                          <span className="text-[9px] text-white/60">{source.badge}</span>
                        )}
                      </div>
                      {/* Selection indicator */}
                      <div className="absolute top-1.5 left-1.5">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
                            <CheckSquare className="h-3 w-3 text-primary-foreground" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-black/40 border border-white/30" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Camera motion presets */}
          <div>
            <label className="text-sm font-medium mb-3 block">Camera Motion</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {CAMERA_MOTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => { setSelectedMotion(preset.id); setDuration(preset.defaultDuration); }}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    selectedMotion === preset.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <LucideIcon name={preset.icon} className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{preset.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Duration</label>
              <span className="text-sm text-muted-foreground">{duration}s</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={([val]) => setDuration(val)}
              min={4}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>4s</span>
              <span>10s</span>
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={selectedIds.size === 0 || isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Videos…
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Generate {selectedIds.size > 1 ? `${selectedIds.size} Videos` : "Video"}{" "}
                {selectedIds.size > 0 && `· ${CAMERA_MOTION_PRESETS.find((p) => p.id === selectedMotion)?.name}`}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Processing */}
      {processingVideos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processingVideos.map((video) => (
                <div key={video.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{video.sourceAngleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {CAMERA_MOTION_PRESETS.find((p) => p.id === video.cameraMotion)?.name} · {video.duration}s
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {video.status === "generating" ? "Generating" : "Processing"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed videos */}
      {completedVideos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Video className="h-4 w-4" />
              Generated Videos ({completedVideos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed videos */}
      {allVideos.filter((v) => v.status === "error").length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-destructive">Failed Videos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allVideos
                .filter((v) => v.status === "error")
                .map((video) => (
                  <div key={video.id} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{video.sourceAngleName} — {CAMERA_MOTION_PRESETS.find((p) => p.id === video.cameraMotion)?.name}</p>
                      <p className="text-xs text-destructive">{video.error}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        useVideoStore.getState().generateVideo({
                          sourceAngleId: video.sourceAngleId,
                          sourceAngleName: video.sourceAngleName,
                          sourceImageUrl: video.sourceImageUrl,
                          cameraMotion: video.cameraMotion,
                          duration: video.duration,
                          projectId,
                        });
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VideoCard({ video }: { video: GeneratedVideo }) {
  const motionPreset = CAMERA_MOTION_PRESETS.find((p) => p.id === video.cameraMotion);

  const handleDownload = () => {
    if (!video.videoUrl) return;
    const a = document.createElement("a");
    a.href = video.videoUrl;
    a.download = `${video.sourceAngleName}_${video.cameraMotion}_${video.duration}s.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="aspect-video bg-black relative">
        {video.videoUrl ? (
          <video
            src={video.videoUrl}
            controls
            className="w-full h-full object-contain"
            poster={video.sourceImageUrl}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Video className="h-8 w-8 opacity-50" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-medium truncate">{video.sourceAngleName}</h4>
          <Badge variant="outline" className="text-xs ml-2 shrink-0">
            <LucideIcon name={motionPreset?.icon} className="h-3 w-3 mr-1" /> {motionPreset?.name}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{video.duration}s · {video.provider}</span>
          <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 px-2">
            <Download className="h-3 w-3 mr-1" />
            <span className="text-xs">Download</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
