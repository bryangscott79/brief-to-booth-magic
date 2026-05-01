// DesignedDeck — top-level UI for the AI-designed presentation flow.
//
// Replaces the old "pptxgenjs lays out boxes" flow with "Claude designs
// every slide as HTML+CSS." The component owns:
//   - Generation: fires generate-designed-deck with full project context
//   - Preview: renders each slide in a live iframe at 1920×1080 (scaled)
//   - Editing: per-slide regenerate, reorder, hide, raw HTML edit
//   - Export: PDF or PPTX, each slide rendered offscreen via html2canvas
//
// Empty-state CTA is the primary entry. After generation, the deck stays
// in localStorage so refreshes don't re-spend tokens.

import { useState } from "react";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronUp,
  ChevronDown,
  Trash2,
  FileText,
  Code2,
  Wand2,
  Presentation as PresentationIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useDesignedDeck, type DesignedSlide } from "@/hooks/useDesignedDeck";
import {
  exportDesignedDeckToPDF,
  exportDesignedDeckToPPTX,
  type ExportProgress,
} from "@/lib/exportDesignedDeck";

interface DesignedDeckProps {
  projectId: string | null | undefined;
  /** Current parsed brief — passed straight to the edge function. */
  parsedBrief: any;
  elements: any;
  projectName?: string;
  /** Render images (current) for Claude to feature. */
  images: Array<{ angle_id: string; angle_name: string; public_url: string; is_current: boolean }>;
  /** Brand color resolved from agency profile, with leading # or not. */
  brandColor?: string;
  secondaryColor?: string;
  agencyName?: string;
}

const STYLE_PRESETS = [
  { id: "Pitch", label: "Pitch deck", desc: "Bold, ambitious, brand-color-forward — for new business." },
  { id: "Executive", label: "Executive", desc: "Restrained, confident, high-whitespace — for C-suite reviews." },
  { id: "Editorial", label: "Editorial", desc: "Magazine-style typography, prose over bullets — for storytelling." },
  { id: "Tactical", label: "Tactical", desc: "Numbers + diagrams forward — for production reviews." },
];

export function DesignedDeck({
  projectId,
  parsedBrief,
  elements,
  projectName,
  images,
  brandColor,
  secondaryColor,
  agencyName,
}: DesignedDeckProps) {
  const { toast } = useToast();
  const {
    deck,
    isGenerating,
    generatingSlideIds,
    error,
    generate,
    regenerateSlides,
    moveSlide,
    removeSlide,
    updateSlideHtml,
    reset,
    ping,
  } = useDesignedDeck(projectId);

  const [stylePreset, setStylePreset] = useState<string>("Pitch");
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);
  const [editingHtmlSlideId, setEditingHtmlSlideId] = useState<string | null>(null);
  const [draftHtml, setDraftHtml] = useState<string>("");
  const [pingState, setPingState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | {
        status: "ok";
        anthropicKey?: "configured" | "missing";
        deployToken?: string;
        alternativeKeysFound?: string[];
      }
    | { status: "fail"; message: string }
  >({ status: "idle" });

  const handlePing = async () => {
    setPingState({ status: "running" });
    const res = await ping();
    if (res.ok) {
      setPingState({
        status: "ok",
        anthropicKey: res.anthropicKey,
        deployToken: res.deployToken,
        alternativeKeysFound: res.alternativeKeysFound,
      });
    } else {
      setPingState({ status: "fail", message: res.error ?? "Unknown error" });
    }
  };

  const imageUrls = images
    .filter((i) => i.is_current)
    .map((i) => ({ angle: i.angle_id, url: i.public_url }));

  const handleGenerate = async () => {
    try {
      await generate({
        parsedBrief,
        elements,
        projectName,
        imageUrls,
        brandColor,
        secondaryColor,
        agencyName,
        stylePreset,
      });
      toast({
        title: "Deck designed",
        description: "Canopy finished the first pass. Review each slide and regenerate any you want to refine.",
      });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRegenerateSlide = async (slideId: string) => {
    try {
      await regenerateSlides([slideId], {
        parsedBrief,
        elements,
        projectName,
        imageUrls,
        brandColor,
        secondaryColor,
        agencyName,
        stylePreset,
      });
      toast({ title: "Slide regenerated" });
    } catch (e) {
      toast({
        title: "Regeneration failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleExport = async (format: "pdf" | "pptx") => {
    if (!deck) return;
    setExporting(format);
    setExportProgress(null);
    const safeName = (projectName || parsedBrief?.brand?.name || "Proposal").replace(
      /[^a-z0-9_-]/gi,
      "_",
    );
    try {
      if (format === "pdf") {
        await exportDesignedDeckToPDF(deck.slides, `${safeName}_Designed.pdf`, setExportProgress);
      } else {
        await exportDesignedDeckToPPTX(
          deck.slides,
          `${safeName}_Designed.pptx`,
          { author: agencyName, title: projectName },
          setExportProgress,
        );
      }
      toast({
        title: `Exported ${format.toUpperCase()}`,
        description: `${deck.slides.length} slides`,
      });
    } catch (e) {
      console.error("[DesignedDeck] export error:", e);
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  };

  const openHtmlEditor = (slide: DesignedSlide) => {
    setEditingHtmlSlideId(slide.id);
    setDraftHtml(slide.html);
  };

  const saveHtmlEdit = () => {
    if (editingHtmlSlideId) {
      updateSlideHtml(editingHtmlSlideId, draftHtml);
      toast({ title: "Slide updated" });
    }
    setEditingHtmlSlideId(null);
    setDraftHtml("");
  };

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!deck) {
    return (
      <Card className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-designed deck
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Beta</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Canopy designs every slide as HTML — typography, layout, brand color, image placement.
            Picks up your full project context, brand voice, and render images. No bullet-point template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setStylePreset(preset.id)}
                className={cn(
                  "rounded-lg border text-left transition-colors px-3 py-2.5",
                  stylePreset === preset.id
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30",
                )}
              >
                <div className="text-sm font-medium mb-0.5">{preset.label}</div>
                <div className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                  {preset.desc}
                </div>
              </button>
            ))}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full btn-glow"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Designing 12–14 slides…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Design my deck
              </>
            )}
          </Button>

          {isGenerating && (
            <p className="text-[11px] text-muted-foreground text-center">
              Canopy takes ~30–60 seconds to design a full deck. We'll cache it so you don't pay twice.
            </p>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs space-y-2">
              <div className="font-medium text-destructive">{error}</div>

              {/* Anthropic auth failure — most actionable case. The key
                * exists in Supabase but Anthropic itself is rejecting it. */}
              {/invalid x-api-key|authentication_error|API error \(401\)/i.test(error) && (
                <div className="text-muted-foreground space-y-1.5">
                  <p className="text-amber-600 font-medium">
                    Your Anthropic API key is invalid.
                  </p>
                  <p>
                    The function reached Anthropic but the key value was rejected (401 invalid x-api-key).
                    This usually means:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>The key was copied with trailing/leading whitespace.</li>
                    <li>The key was revoked or never activated.</li>
                    <li>The key belongs to a different Anthropic account.</li>
                  </ul>
                  <p className="mt-2">
                    Fix:{" "}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline hover:no-underline"
                    >
                      generate a fresh key
                    </a>
                    {" "}(starts with{" "}
                    <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">sk-ant-</code>),
                    then update{" "}
                    <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>{" "}
                    in Lovable → Project Settings → Supabase → Edge Function Secrets.
                  </p>
                </div>
              )}

              {/* Function unreachable — deployment issue. */}
              {/Failed to send a request|FunctionsFetchError|Function not found|404/i.test(error) && (
                <div className="text-muted-foreground space-y-1.5">
                  <p>The edge function isn't responding. Two things to check:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      <strong>Lovable hasn't deployed yet.</strong> New edge functions usually deploy
                      within a minute of being pushed. Try again shortly.
                    </li>
                    <li>
                      <strong>The Anthropic API key isn't configured.</strong> In Lovable, go to{" "}
                      Project Settings → Supabase → Edge Function Secrets and confirm{" "}
                      <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>{" "}
                      is set.
                    </li>
                  </ul>
                </div>
              )}

              {/ANTHROPIC_API_KEY is not configured/i.test(error) && (
                <div className="text-muted-foreground">
                  Set a secret named exactly{" "}
                  <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code>{" "}
                  in Project Settings → Supabase → Edge Function Secrets, then retry.
                </div>
              )}
            </div>
          )}

          {/* Diagnostic — costs zero tokens, tells the user exactly what's wrong */}
          <div className="space-y-2 text-[11px]">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={handlePing}
                disabled={pingState.status === "running"}
              >
                {pingState.status === "running" ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3 mr-1" />
                )}
                Test connection
              </Button>
              {pingState.status === "ok" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    pingState.anthropicKey === "configured"
                      ? "text-green-600"
                      : "text-amber-600",
                  )}
                >
                  {pingState.anthropicKey === "configured"
                    ? "✓ Function reachable, ANTHROPIC_API_KEY configured."
                    : "⚠ Function reachable but ANTHROPIC_API_KEY is missing."}
                </span>
              )}
              {pingState.status === "fail" && (
                <span className="text-destructive">✗ {pingState.message}</span>
              )}
            </div>

            {pingState.status === "ok" && pingState.deployToken && (
              <p className="text-muted-foreground/70">
                Deploy token: <span className="font-mono">{pingState.deployToken}</span>
              </p>
            )}

            {pingState.status === "ok" &&
              pingState.anthropicKey === "missing" &&
              (pingState.alternativeKeysFound?.length ?? 0) > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-amber-700">
                  <p className="font-medium">Looks like a naming mismatch.</p>
                  <p className="mt-1">
                    The function expects{" "}
                    <code className="font-mono text-[10px] bg-amber-500/10 px-1 py-0.5 rounded">
                      ANTHROPIC_API_KEY
                    </code>{" "}
                    but found these instead:{" "}
                    <span className="font-mono">
                      {pingState.alternativeKeysFound!.join(", ")}
                    </span>
                    . Rename your secret to <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
                    in Supabase → Edge Function Secrets.
                  </p>
                </div>
              )}

            {pingState.status === "ok" && pingState.anthropicKey === "missing" &&
              (pingState.alternativeKeysFound?.length ?? 0) === 0 && (
                <p className="text-amber-600">
                  Set a secret named exactly{" "}
                  <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                    ANTHROPIC_API_KEY
                  </code>{" "}
                  in Lovable → Project Settings → Supabase → Edge Function Secrets.
                </p>
              )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Deck preview ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {deck.slides.length} designed slides
              <span className="text-muted-foreground ml-2 text-xs">
                · {new Date(deck.generatedAt).toLocaleString()}
              </span>
            </div>
          </div>

          <Select value={stylePreset} onValueChange={setStylePreset}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            title="Discard the current deck and design fresh"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Redesign all
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("pdf")}
            disabled={!!exporting}
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1.5" />
            )}
            Export PDF
          </Button>

          <Button
            size="sm"
            onClick={() => handleExport("pptx")}
            disabled={!!exporting}
            className="btn-glow"
          >
            {exporting === "pptx" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <PresentationIcon className="h-3.5 w-3.5 mr-1.5" />
            )}
            Export PPTX
          </Button>
        </CardContent>
        {exportProgress && (
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-[11px] text-muted-foreground">
              Rendering slide {exportProgress.slideIndex + 1} of {exportProgress.total} ·{" "}
              {exportProgress.slideTitle}
            </div>
            <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${((exportProgress.slideIndex + 1) / exportProgress.total) * 100}%`,
                }}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Slide grid */}
      <div className="space-y-4">
        {deck.slides.map((slide, idx) => (
          <SlideCard
            key={slide.id}
            slide={slide}
            index={idx}
            total={deck.slides.length}
            isRegenerating={generatingSlideIds.has(slide.id)}
            onRegenerate={() => handleRegenerateSlide(slide.id)}
            onMove={(direction) => moveSlide(slide.id, direction)}
            onRemove={() => {
              if (confirm(`Remove "${slide.title}" from the deck?`)) removeSlide(slide.id);
            }}
            onEditHtml={() => openHtmlEditor(slide)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm("Discard the current AI-designed deck? You can always generate a new one.")) {
            reset();
          }
        }}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Discard deck
        </Button>
        <div className="text-xs text-muted-foreground">
          {deck.slides.length} slides · cached locally
        </div>
      </div>

      {/* HTML editor dialog */}
      <Dialog open={!!editingHtmlSlideId} onOpenChange={(open) => !open && setEditingHtmlSlideId(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              Edit slide HTML
            </DialogTitle>
            <DialogDescription>
              Power-user mode — edit the raw HTML for this slide. Body must stay 1920×1080 px.
              Inline CSS only (Google Fonts via @import allowed).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draftHtml}
            onChange={(e) => setDraftHtml(e.target.value)}
            rows={24}
            className="font-mono text-[11px]"
            spellCheck={false}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingHtmlSlideId(null)}>
              Cancel
            </Button>
            <Button onClick={saveHtmlEdit}>Save HTML</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Slide card ────────────────────────────────────────────────────────────

interface SlideCardProps {
  slide: DesignedSlide;
  index: number;
  total: number;
  isRegenerating: boolean;
  onRegenerate: () => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onEditHtml: () => void;
}

function SlideCard({
  slide,
  index,
  total,
  isRegenerating,
  onRegenerate,
  onMove,
  onRemove,
  onEditHtml,
}: SlideCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-xs text-muted-foreground w-6 text-center shrink-0">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{slide.title}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {slide.slideType}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMove("up")}
            disabled={index === 0}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onMove("down")}
            disabled={index === total - 1}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onEditHtml}
            title="Edit HTML"
          >
            <Code2 className="h-3.5 w-3.5 mr-1" />
            HTML
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Regenerate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Live preview — iframe scaled down via transform so the deck reads
         * as a vertical stack of fixed-aspect slides without breaking the
         * underlying 1920×1080 layout. */}
        <SlidePreview html={slide.html} />
      </CardContent>
    </Card>
  );
}

function SlidePreview({ html }: { html: string }) {
  // The slide is authored at 1920×1080. The card width here is roughly
  // 800px; we scale the iframe down to fit by transform.
  const targetWidth = 800;
  const scale = targetWidth / 1920;
  const scaledHeight = 1080 * scale;

  return (
    <div
      className="relative overflow-hidden bg-neutral-900"
      style={{ height: `${scaledHeight}px`, width: "100%" }}
    >
      <iframe
        srcDoc={html}
        sandbox=""
        title="Slide preview"
        className="border-0 origin-top-left absolute"
        style={{
          width: "1920px",
          height: "1080px",
          transform: `scale(${scale})`,
        }}
      />
    </div>
  );
}

export default DesignedDeck;
