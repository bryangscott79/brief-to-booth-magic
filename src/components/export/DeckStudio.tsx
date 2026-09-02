// DeckStudio — the flagship deck path on the Export step.
//
// Flow: pick a brand mode (agency / client / blend — BrandModeDialog, with
// inline gap-fixing via BrandKitPanel) → compile the designed slide system
// deterministically from the project's real data (compileDeckSpec) → preview
// the slides → download an EDITABLE .pptx (buildDeckPptx) or a print-perfect
// PDF (renderDeckHtml + the browser's print dialog).
//
// No AI call, no edge function: the eight strategy elements and the brief
// already carry the content; the design lives in the deterministic renderers,
// so every deck is consistent, instant, and free.

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/projectStore";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { useProjectDeck, useSaveProjectDeck } from "@/hooks/useProjectDeck";
import { useBrandSources } from "@/hooks/useBrandKit";
import { BrandModeDialog } from "@/components/export/brand/BrandModeDialog";
import { BrandKitPanel } from "@/components/export/brand/BrandKitPanel";
import { SectionLabel, SpecMono, StatusChip } from "@/components/shell";
import { resolveBrandKit, type BrandKit, type BrandMode } from "@/lib/brandKit";
import { compileDeckSpec, type DeckRenderImage } from "@/lib/compileDeckSpec";
import { buildDeckPptx } from "@/lib/deckBuilder";
import { renderSlideHtml, renderDeckHtml } from "@/lib/deckSlideHtml";
import { DECK_STYLES, DEFAULT_DECK_STYLE, isDeckStyleId, type DeckStyleId } from "@/lib/deckStyle";
import type { DeckSpec } from "@/lib/deckSpec";
import { parseVersionedAngleId } from "@/lib/promptVersions";
import { markProjectExported } from "@/lib/markProjectExported";
import { FileDown, Loader2, Palette, Presentation, RefreshCw, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeckStudioProps {
  projectId: string | null;
  clientId: string | null;
}

export function DeckStudio({ projectId, clientId }: DeckStudioProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentProject = useProjectStore((s) => s.currentProject);
  const { data: images } = useProjectImages(projectId ?? undefined);
  const { activeConfigLabel, activeConfigKey, defaultConfigKey } = useActiveSpatialConfig(projectId);
  const { data: deck } = useProjectDeck(projectId);
  const saveDeck = useSaveProjectDeck(projectId);
  const { agency, client } = useBrandSources(clientId);

  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [showBrandPanel, setShowBrandPanel] = useState(false);
  const [spec, setSpec] = useState<DeckSpec | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [style, setStyle] = useState<DeckStyleId | null>(null);
  const [buildingPptx, setBuildingPptx] = useState(false);
  const brandPanelRef = useRef<HTMLDivElement>(null);

  // Renders for the ACTIVE booth size (same rule as Files/ZIP: explicit
  // config suffix wins; untagged legacy renders belong to configs[0]).
  const activeRenders = useMemo<DeckRenderImage[]>(() => {
    const current = (images ?? []).filter((img) => img.is_current);
    if (!activeConfigKey) return current;
    return current.filter((img) => {
      const parsed = parseVersionedAngleId(img.angle_id);
      const cfg =
        parsed.configKey ??
        ((img as { prompt_artifacts?: { configKey?: string } }).prompt_artifacts?.configKey ?? null);
      return cfg ? cfg === activeConfigKey : activeConfigKey === defaultConfigKey;
    });
  }, [images, activeConfigKey, defaultConfigKey]);

  // Rehydrate a previously compiled deck (settings.brandMode + settings.style
  // + saved spec). Decks saved before styles existed carry no style → pitch.
  const savedMode = (deck?.settings as { brandMode?: BrandMode } | undefined)?.brandMode;
  const savedStyle = (deck?.settings as { style?: unknown } | undefined)?.style;
  const savedSpec = (deck?.content as { spec?: DeckSpec } | undefined)?.spec;
  const effectiveSpec = spec ?? savedSpec ?? null;
  const effectiveKit = useMemo(() => {
    if (kit) return kit;
    if (savedMode) return resolveBrandKit(savedMode, agency, client);
    return null;
  }, [kit, savedMode, agency, client]);
  const effectiveStyle: DeckStyleId = style ?? (isDeckStyleId(savedStyle) ? savedStyle : DEFAULT_DECK_STYLE);
  const styleLabel = DECK_STYLES.find((s) => s.id === effectiveStyle)?.label ?? effectiveStyle;

  const compile = (chosenKit: BrandKit, chosenStyle: DeckStyleId) => {
    const compiled = compileDeckSpec({
      project: { name: currentProject?.name ?? null },
      parsedBrief: (currentProject?.parsedBrief ?? null) as Record<string, unknown> | null,
      elements: (currentProject?.elements ?? null) as never,
      renders: activeRenders,
      kit: chosenKit,
      boothSizeLabel: activeConfigLabel ?? undefined,
    });
    setKit(chosenKit);
    setStyle(chosenStyle);
    setSpec(compiled);
    saveDeck.mutate({ content: { spec: compiled } });
    const label = DECK_STYLES.find((s) => s.id === chosenStyle)?.label ?? chosenStyle;
    toast({
      title: "Deck compiled",
      description: `${compiled.slides.length} slides in ${chosenKit.mode === "blend" ? "blended" : chosenKit.mode} brand · ${label} style.`,
    });
  };

  const handleDownloadPptx = async () => {
    if (!effectiveSpec || !effectiveKit) return;
    setBuildingPptx(true);
    let skipped = 0;
    try {
      const blob = await buildDeckPptx(effectiveSpec, effectiveKit, {
        style: effectiveStyle,
        onImageSkipped: () => {
          skipped += 1;
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(effectiveSpec.meta.clientName || effectiveSpec.meta.projectName || "Canopy").replace(/[^a-zA-Z0-9]+/g, "_")}_Deck.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Deck downloaded",
        description: skipped > 0 ? `${skipped} image${skipped === 1 ? "" : "s"} couldn't be fetched and were skipped.` : "Fully editable in PowerPoint.",
      });
      if (projectId) void markProjectExported(projectId, queryClient);
    } catch (err) {
      toast({
        title: "Couldn't build the deck",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBuildingPptx(false);
    }
  };

  const handlePrintPdf = () => {
    if (!effectiveSpec || !effectiveKit) return;
    const html = renderDeckHtml(effectiveSpec, effectiveKit, effectiveStyle);
    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Popup blocked", description: "Allow popups to export the PDF.", variant: "destructive" });
      return;
    }
    win.document.write(
      html.replace(
        "</head>",
        `<style>@page{size:13.333in 7.5in;margin:0}@media print{body{margin:0}.deck-slide{page-break-after:always}}</style></head>`,
      ),
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
    if (projectId) void markProjectExported(projectId, queryClient);
  };

  const openFixGaps = () => {
    setShowBrandPanel(true);
    setTimeout(() => brandPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <div className="rounded-[14px] border border-border bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy">
          <Presentation className="h-4 w-4 text-white" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-navy">Client deck</p>
          <p className="text-[12px] text-slate">
            Designed slide system, compiled from this project — editable PowerPoint first.
          </p>
        </div>
        {effectiveKit && (
          <StatusChip variant="neutral">
            {effectiveKit.mode === "blend" ? "Blended brand" : `${effectiveKit.mode} brand`}
          </StatusChip>
        )}
        {effectiveSpec && effectiveKit && <StatusChip variant="neutral">{styleLabel}</StatusChip>}
        {activeConfigLabel && <SpecMono className="text-[11px] text-slate">{activeConfigLabel}</SpecMono>}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openFixGaps} className="gap-1.5">
            <Palette className="h-3.5 w-3.5" strokeWidth={1.5} />
            Brand kit
          </Button>
          <Button size="sm" onClick={() => setModeDialogOpen(true)} className="gap-1.5">
            {effectiveSpec ? <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> : null}
            {effectiveSpec ? "Recompile" : "Design deck"}
          </Button>
        </div>
      </div>

      {showBrandPanel && (
        <div ref={brandPanelRef} className="border-b border-border bg-cloud/50 px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel accent="violet">Brand kit</SectionLabel>
            <button type="button" onClick={() => setShowBrandPanel(false)} className="text-[12px] text-slate hover:text-navy">
              Hide
            </button>
          </div>
          <BrandKitPanel clientId={clientId} />
        </div>
      )}

      {effectiveSpec && effectiveKit ? (
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <SpecMono className="text-[12px] text-charcoal">{effectiveSpec.slides.length} slides</SpecMono>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrintPdf} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" strokeWidth={1.5} />
                PDF
              </Button>
              <Button size="sm" onClick={handleDownloadPptx} disabled={buildingPptx} className="gap-1.5">
                {buildingPptx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" strokeWidth={1.5} />}
                Download .pptx
              </Button>
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, 243px)" }}>
            {effectiveSpec.slides.map((slide, i) => (
              <div
                key={`${slide.layout}-${i}`}
                className={cn("relative overflow-hidden rounded-lg border border-border bg-cloud")}
                style={{ width: 243, height: 137 }}
              >
                <iframe
                  title={`Slide ${i + 1}`}
                  srcDoc={renderSlideHtml(slide, effectiveKit, i, effectiveSpec.slides.length, effectiveSpec.meta, effectiveStyle)}
                  className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                  style={{ width: 1280, height: 720, transform: "scale(0.19)" }}
                  scrolling="no"
                  loading="lazy"
                />
                <span className="absolute bottom-1 right-1.5 rounded bg-white/80 px-1 font-mono text-[9px] text-slate">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-slate">
            Pick a brand treatment and Canopy compiles the full proposal deck — cover, brief, concept, spatial
            plan, renders, budget, next steps — from this project's work.
          </p>
        </div>
      )}

      <BrandModeDialog
        open={modeDialogOpen}
        onOpenChange={setModeDialogOpen}
        projectId={projectId}
        clientId={clientId}
        onConfirm={compile}
        onFixGaps={() => {
          setModeDialogOpen(false);
          openFixGaps();
        }}
      />
    </div>
  );
}
