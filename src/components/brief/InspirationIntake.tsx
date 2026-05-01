// InspirationIntake — collects visual inspiration upfront and routes it
// straight into the project knowledge base.
//
// Why this lives at the start of a project (Upload page):
//   The model gets dramatically better grounding when it can see what
//   "good" looks like for this specific project. Asking for inspiration
//   AFTER spatial planning means the user has already locked in
//   decisions the inspiration could have informed. So we ask first.
//
// What we collect:
//   1. Reference images (drag & drop, multiple). Stored as individual
//      knowledge_documents rows tagged ["inspiration", "image"].
//   2. Reference URLs (Pinterest boards, project case studies, brand
//      sites). Pasted one per line with optional captions. Packaged into
//      a single text knowledge_document tagged ["inspiration", "links"].
//
// Both surface in the existing ProjectKnowledgeBase panel below this
// component (scope=project) and are picked up by the project-scope RAG
// retriever during generation.

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Sparkles, ImagePlus, Link2, Loader2, Upload, X, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB / image
const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
};

interface InspirationIntakeProps {
  projectId: string;
  /** When true, render in compact mode (no header, smaller padding). */
  compact?: boolean;
}

interface PendingImage {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

function extractValidUrls(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Allow lines to be either bare URLs or "URL — caption" / "URL: caption"
  return lines
    .map((line) => {
      const match = line.match(/(https?:\/\/[^\s]+)/);
      return match ? line : "";
    })
    .filter(Boolean);
}

function pendingImageId() {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function InspirationIntake({ projectId, compact = false }: InspirationIntakeProps) {
  const { toast } = useToast();
  const { uploadDocument } = useKnowledgeDocuments({ scope: "project", scopeId: projectId });

  const [images, setImages] = useState<PendingImage[]>([]);
  const [urlsText, setUrlsText] = useState("");
  const [savingLinks, setSavingLinks] = useState(false);
  const [linksSaved, setLinksSaved] = useState(false);

  const validUrlLines = useMemo(() => extractValidUrls(urlsText), [urlsText]);

  // ── Image drop handler ────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const next: PendingImage[] = accepted
      .filter((f) => {
        if (f.size > MAX_IMAGE_BYTES) {
          toast({
            title: `${f.name} is too large`,
            description: "Max image size is 25 MB.",
            variant: "destructive",
          });
          return false;
        }
        return true;
      })
      .map((file) => ({ id: pendingImageId(), file, status: "pending" as const }));
    if (next.length === 0) return;
    setImages((prev) => [...prev, ...next]);
    void uploadPending(next);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
  });

  // ── Upload pipeline (per-image) ───────────────────────────────────────
  async function uploadPending(items: PendingImage[]) {
    for (const item of items) {
      setImages((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: "uploading" } : p)),
      );
      try {
        await uploadDocument.mutateAsync({
          file: item.file,
          userTags: ["inspiration", "image"],
        });
        setImages((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "done" } : p)),
        );
      } catch (e) {
        setImages((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  status: "error",
                  errorMsg: e instanceof Error ? e.message : String(e),
                }
              : p,
          ),
        );
        toast({
          title: `Couldn't save ${item.file.name}`,
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Link list save ────────────────────────────────────────────────────
  async function handleSaveLinks() {
    if (validUrlLines.length === 0) {
      toast({
        title: "No links found",
        description: "Paste one URL per line — captions after the URL are optional.",
        variant: "destructive",
      });
      return;
    }
    setSavingLinks(true);
    try {
      const body = [
        "# Inspiration links",
        "",
        "Reference URLs the team shared at the start of this project.",
        "Each line is a URL optionally followed by a short caption.",
        "",
        ...validUrlLines,
      ].join("\n");

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File([body], `inspiration-links-${stamp}.md`, {
        type: "text/markdown",
      });
      await uploadDocument.mutateAsync({
        file,
        title: `Inspiration links (${validUrlLines.length})`,
        userTags: ["inspiration", "links"],
      });
      toast({
        title: "Inspiration saved",
        description: `${validUrlLines.length} link${validUrlLines.length === 1 ? "" : "s"} added to the project knowledge base.`,
      });
      setUrlsText("");
      setLinksSaved(true);
      setTimeout(() => setLinksSaved(false), 3000);
    } catch (e) {
      toast({
        title: "Couldn't save links",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSavingLinks(false);
    }
  }

  const stats = useMemo(() => {
    const total = images.length;
    const done = images.filter((i) => i.status === "done").length;
    const errored = images.filter((i) => i.status === "error").length;
    return { total, done, errored };
  }, [images]);

  return (
    <Card className={cn(compact && "shadow-none")}>
      {!compact && (
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold">
                What does this project look like in your head?
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                Drop in reference images and links before we kick off the brief. The AI uses
                them throughout — strategy, prompts, spatial planning, exports — so giving it
                a visual target up front makes everything downstream sharper.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-5">
        {/* Image dropzone */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reference images
            </p>
            {stats.total > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {stats.done} of {stats.total} saved
                {stats.errored > 0 ? ` · ${stats.errored} failed` : ""}
              </span>
            )}
          </div>
          <div
            {...getRootProps()}
            className={cn(
              "relative cursor-pointer rounded-lg border-2 border-dashed transition-colors px-4 py-6 text-center",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <input {...getInputProps()} />
            <ImagePlus className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragActive ? "Drop your images" : "Drop reference images here"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              PNG, JPG, WEBP, HEIC — up to 25 MB each. Multiple files supported.
            </p>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="relative group rounded-md border border-border bg-muted/40 px-2 py-2 text-xs flex items-center gap-2 min-w-0"
                >
                  <div className="shrink-0">
                    {img.status === "uploading" || img.status === "pending" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : img.status === "done" ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-destructive" />
                    )}
                  </div>
                  <span className="truncate" title={img.file.name}>
                    {img.file.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(img.id);
                    }}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    aria-label="Remove from list"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* URL list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Reference links
            </p>
            {validUrlLines.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {validUrlLines.length} URL{validUrlLines.length === 1 ? "" : "s"} detected
              </Badge>
            )}
          </div>
          <Textarea
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
            placeholder={`Paste one per line. Captions after the URL are optional.\n\nhttps://www.pinterest.com/board/futuristic-booth — overall vibe\nhttps://www.archdaily.com/some-project — material palette\nhttps://www.notion.so/your-mood-board`}
            rows={5}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              <Link2 className="inline h-3 w-3 mr-1" />
              Links are saved as a single document the AI can quote in strategy and prompts.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveLinks}
              disabled={savingLinks || validUrlLines.length === 0}
            >
              {savingLinks ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : linksSaved ? (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              {linksSaved ? "Saved" : "Save links"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
