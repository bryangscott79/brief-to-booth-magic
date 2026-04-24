/**
 * VideoGenerator — UI for creating AI video walkthroughs from renders
 *
 * Allows users to select any generated render and create video
 * walkthroughs, flyovers, rotations, pans, and zooms.
 */

import { useState } from "react";
import { Play, Video, Loader2, Download, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  useVideoStore,
  CAMERA_MOTION_PRESETS,
  type CameraMotion,
  type GeneratedVideo,
} from "@/store/videoStore";
import type { GeneratedImage } from "@/store/renderStore";

// ============================================
// PROPS
// ============================================

interface VideoGeneratorProps {
  projectId: string;
  generatedImages: Record<string, GeneratedImage>;
  boothSize?: string;
  angleNames: Record<string, string>;
}

// ============================================
// COMPONENT
// ============================================

export function VideoGenerator({ projectId, generatedImages, boothSize, angleNames }: VideoGeneratorProps) {
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const [selectedMotion, setSelectedMotion] = useState<CameraMotion>("walkthrough");
  const [duration, setDuration] = useState(6);
  const { toast } = useToast();

  const {
    videos,
    isGenerating,
    generateVideo,
    setProjectId,
  } = useVideoStore();

  // Ensure video store is synced with project
  setProjectId(projectId);

  // Get completed renders that can be used as video sources
  const completedRenders = Object.entries(generatedImages)
    .filter(([_, img]) => img.status === "complete" && img.url)
    .map(([id, img]) => ({
      id,
      name: angleNames[id] || id,
      url: img.url,
    }));

  const handleGenerateVideo = async () => {
    if (!selectedAngle) {
      toast({ title: "Select a render", description: "Choose a rendered image to create a video from.", variant: "destructive" });
      return;
    }

    const source = completedRenders.find((r) => r.id === selectedAngle);
    if (!source) return;

    try {
      await generateVideo({
        sourceAngleId: source.id,
        sourceAngleName: source.name,
        sourceImageUrl: source.url,
        cameraMotion: selectedMotion,
        duration,
        projectId,
        boothSize,
      });

      toast({
        title: "Video generation started",
        description: `Creating ${selectedMotion} video from ${source.name}...`,
      });
    } catch (error) {
      toast({
        title: "Video generation failed",
        description: error instanceof Error ? error.message : "Failed to generate video.",
        variant: "destructive",
      });
    }
  };

  // Get all videos grouped by source angle
  const allVideos = Object.values(videos);
  const completedVideos = allVideos.filter((v) => v.status === "complete");
  const processingVideos = allVideos.filter((v) => v.status === "generating" || v.status === "processing");

  return (
    <div className="space-y-8">
      {/* Source Image Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Create Video
          </CardTitle>
          <CardDescription>
            Select a rendered image and camera motion to generate an AI video walkthrough.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Render selection grid */}
          <div>
            <label className="text-sm font-medium mb-3 block">Source Image</label>
            {completedRenders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No rendered images available. Generate renders first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {completedRenders.map((render) => (
                  <button
                    key={render.id}
                    onClick={() => setSelectedAngle(render.id)}
                    className={cn(
                      "relative rounded-lg overflow-hidden border-2 transition-all aspect-video",
                      selectedAngle === render.id
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <img
                      src={render.url}
                      alt={render.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                      <span className="text-xs text-white truncate block">{render.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Camera motion presets */}
          <div>
            <label className="text-sm font-medium mb-3 block">Camera Motion</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {CAMERA_MOTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setSelectedMotion(preset.id);
                    setDuration(preset.defaultDuration);
                  }}
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

          {/* Duration slider */}
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
            onClick={handleGenerateVideo}
            disabled={!selectedAngle || isGenerating}
            className="w-full btn-glow"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Video...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Generate {CAMERA_MOTION_PRESETS.find((p) => p.id === selectedMotion)?.name || "Video"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Processing Videos */}
      {processingVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processingVideos.map((video) => (
                <div key={video.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{video.sourceAngleName}</p>
                    <p className="text-xs text-muted-foreground">
                      {CAMERA_MOTION_PRESETS.find((p) => p.id === video.cameraMotion)?.name} • {video.duration}s
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

      {/* Completed Videos Gallery */}
      {completedVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Generated Videos ({completedVideos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedVideos.map((video) => (
                <VideoCard key={video.id} video={video} projectId={projectId} boothSize={boothSize} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Videos */}
      {allVideos.filter((v) => v.status === "error").length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Failed Videos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allVideos
                .filter((v) => v.status === "error")
                .map((video) => (
                  <div key={video.id} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-destructive" />
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
                          boothSize,
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

// ============================================
// VIDEO CARD
// ============================================

function VideoCard({ video, projectId: _projectId, boothSize: _boothSize }: { video: GeneratedVideo; projectId: string; boothSize?: string }) {
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
      {/* Video player */}
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

      {/* Video info */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-medium truncate">{video.sourceAngleName}</h4>
          <Badge variant="outline" className="text-xs ml-2 shrink-0">
            <LucideIcon name={motionPreset?.icon} className="h-3 w-3 mr-1" /> {motionPreset?.name}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{video.duration}s • {video.provider}</span>
          <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 px-2">
            <Download className="h-3 w-3 mr-1" />
            <span className="text-xs">Download</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
