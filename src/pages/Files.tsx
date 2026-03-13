import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectImages } from "@/hooks/useProjectImages";
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
} from "lucide-react";

export default function FilesPage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(projectId);

  const [activeAngle, setActiveAngle] = useState<string>("all");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const isLoading = syncLoading || imagesLoading;

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
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Project Files</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {savedImages.length} image{savedImages.length !== 1 ? "s" : ""} across{" "}
                  {angleNames.length} angle{angleNames.length !== 1 ? "s" : ""}
                </p>
              </div>
              {savedImages.length > 0 && (
                <Toggle
                  pressed={currentOnly}
                  onPressedChange={setCurrentOnly}
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Sparkles className="h-3 w-3" />
                  Current only
                </Toggle>
              )}
            </div>

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
                {/* Angle filter tabs */}
                <div className="flex gap-2 flex-wrap">
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
                    const hasCurrent = savedImages.some((i) => i.angle_name === name && i.is_current);
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
                        {hasCurrent && (
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Image grid */}
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">
                    No images match the current filter.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filtered.map((img, idx) => (
                      <div
                        key={img.id}
                        className="group relative rounded-lg overflow-hidden cursor-pointer bg-muted aspect-video border border-border/40 hover:border-primary/40 transition-all hover:shadow-lg hover:-translate-y-0.5"
                        onClick={() => setLightbox(idx)}
                      >
                        <img
                          src={img.public_url}
                          alt={img.angle_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        {/* Bottom info */}
                        <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                          <p className="text-white text-[10px] font-medium leading-tight truncate">
                            {img.angle_name}
                          </p>
                          <p className="text-white/60 text-[10px]">
                            {new Date(img.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>

                        {/* Current badge */}
                        {img.is_current && (
                          <div className="absolute top-1.5 right-1.5">
                            <span className="bg-primary/90 text-primary-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                              Current
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Prev */}
          {lightbox > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
              onClick={(e) => { e.stopPropagation(); goLightbox(-1); }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Image */}
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
                {new Date(lightboxImg.created_at).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="ml-2 h-7 text-xs"
                onClick={() => handleDownload(lightboxImg)}
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
            <p className="text-white/30 text-xs">{lightbox + 1} of {filtered.length}</p>
          </div>

          {/* Next */}
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
