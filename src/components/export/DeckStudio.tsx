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
//
// Three controls sit between the header and the preview:
//   · Renders — which of the active booth size's renders go in, which are
//     featured (own full-bleed slide), and how the rest are presented
//     (one per slide / mixed / compact grids). Persisted in deck settings.
//   · Walkthrough video — embed a clip generated in Files → Video. The mp4
//     is copied into project storage (deckVideo.ts) because provider URLs
//     expire; the deck references the durable copy.
//   · Logo contrast (invisible) — before every compile / download the kit's
//     marks are analysed (logoContrast.ts) and plated where the ground
//     would swallow them. The decision is stored with the deck so the
//     rehydrated preview and the .pptx agree.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/projectStore";
import { useProjectImages } from "@/hooks/useProjectImages";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import {
  useProjectDeck,
  useSaveProjectDeck,
  type DeckContent,
  type DeckSettings,
  type DeckVideoContent,
} from "@/hooks/useProjectDeck";
import { useBrandSources } from "@/hooks/useBrandKit";
import { BrandModeDialog } from "@/components/export/brand/BrandModeDialog";
import { BrandKitPanel } from "@/components/export/brand/BrandKitPanel";
import { SectionLabel, SpecMono, StatusChip } from "@/components/shell";
import { resolveBrandKit, type BrandKit, type BrandMode } from "@/lib/brandKit";
import {
  compileDeckSpec,
  DEFAULT_RENDER_PRESENTATION,
  RENDER_PRESENTATIONS,
  isRenderPresentation,
  type DeckRenderImage,
  type RenderPresentation,
} from "@/lib/compileDeckSpec";
import { buildDeckPptx } from "@/lib/deckBuilder";
import { renderSlideHtml, renderDeckHtml } from "@/lib/deckSlideHtml";
import { DECK_STYLES, DEFAULT_DECK_STYLE, isDeckStyleId, type DeckStyleId } from "@/lib/deckStyle";
import type { DeckSpec } from "@/lib/deckSpec";
import { computeLogoTreatments, logoTreatmentsMatch, type LogoTreatments } from "@/lib/logoContrast";
import { persistWalkthroughVideo, removeWalkthroughVideo, walkthroughLabel } from "@/lib/deckVideo";
import { useVideoStore, type GeneratedVideo } from "@/store/videoStore";
import { parseVersionedAngleId } from "@/lib/promptVersions";
import { markProjectExported } from "@/lib/markProjectExported";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileDown,
  Film,
  Loader2,
  Palette,
  Presentation,
  RefreshCw,
  Printer,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DeckStudioProps {
  projectId: string | null;
  clientId: string | null;
}

/** Render picker state — persisted 1:1 into deck settings. `selected` null
 *  means "every current render" (so newly generated renders join by
 *  default until the user makes an explicit choice). */
interface RenderPrefs {
  presentation: RenderPresentation;
  selected: string[] | null;
  featured: string[];
}

const FLOOR_PLAN_IDS = new Set(["floor_plan_2d", "top"]);

export function DeckStudio({ projectId, clientId }: DeckStudioProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentProject = useProjectStore((s) => s.currentProject);
  const { data: images } = useProjectImages(projectId ?? undefined);
  const { activeConfigLabel, activeConfigKey, defaultConfigKey } = useActiveSpatialConfig(projectId);
  const { data: deck } = useProjectDeck(projectId);
  const saveDeck = useSaveProjectDeck(projectId);
  const { agency, client } = useBrandSources(clientId);
  const storeProjectId = useVideoStore((s) => s.projectId);
  const storeVideos = useVideoStore((s) => s.videos);

  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [showBrandPanel, setShowBrandPanel] = useState(false);
  const [rendersOpen, setRendersOpen] = useState(false);
  const [spec, setSpec] = useState<DeckSpec | null>(null);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [style, setStyle] = useState<DeckStyleId | null>(null);
  const [prefs, setPrefs] = useState<RenderPrefs | null>(null);
  /** undefined = untouched this session (fall through to the saved row). */
  const [video, setVideo] = useState<DeckVideoContent | null | undefined>(undefined);
  const [treatments, setTreatments] = useState<LogoTreatments | null>(null);
  const [buildingPptx, setBuildingPptx] = useState(false);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
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

  // Walkthrough clips generated this session for THIS project (the store
  // is in-memory and resets when the project changes).
  const completedVideos = useMemo<GeneratedVideo[]>(
    () =>
      projectId && storeProjectId === projectId
        ? Object.values(storeVideos).filter((v) => v.status === "complete" && !!v.videoUrl)
        : [],
    [projectId, storeProjectId, storeVideos],
  );

  // ── Rehydration ────────────────────────────────────────────────────────
  // A previously compiled deck (settings.brandMode / style / render prefs /
  // logo treatments + saved spec + video). Decks saved before a field
  // existed fall back to that field's default.
  const savedSettings = (deck?.settings ?? {}) as DeckSettings;
  const savedContent = (deck?.content ?? {}) as DeckContent;
  const savedMode = savedSettings.brandMode as BrandMode | undefined;
  const savedStyle = savedSettings.style;
  const savedSpec = savedContent.spec;
  const effectiveSpec = spec ?? savedSpec ?? null;
  const effectiveKit = useMemo(() => {
    if (kit) return kit;
    if (savedMode) return resolveBrandKit(savedMode, agency, client);
    return null;
  }, [kit, savedMode, agency, client]);
  const effectiveStyle: DeckStyleId = style ?? (isDeckStyleId(savedStyle) ? savedStyle : DEFAULT_DECK_STYLE);
  const styleLabel = DECK_STYLES.find((s) => s.id === effectiveStyle)?.label ?? effectiveStyle;
  const effectivePrefs: RenderPrefs = prefs ?? {
    presentation: isRenderPresentation(savedSettings.renderPresentation)
      ? savedSettings.renderPresentation
      : DEFAULT_RENDER_PRESENTATION,
    selected: Array.isArray(savedSettings.selectedRenderIds) ? savedSettings.selectedRenderIds : null,
    featured: Array.isArray(savedSettings.featuredRenderIds) ? savedSettings.featuredRenderIds : [],
  };
  const effectiveVideo: DeckVideoContent | null = video !== undefined ? video : (savedContent.video ?? null);
  // Saved treatments only count when they were computed for these marks in
  // this style (signed logo URLs rotate — the match is by storage ref).
  const effectiveTreatments: LogoTreatments | null = useMemo(() => {
    if (treatments) return treatments;
    if (effectiveKit && logoTreatmentsMatch(savedSettings.logoTreatments, effectiveKit, effectiveStyle)) {
      return savedSettings.logoTreatments ?? null;
    }
    return null;
  }, [treatments, effectiveKit, effectiveStyle, savedSettings.logoTreatments]);

  // Decks compiled before logo intelligence existed: analyse on load so the
  // preview (and the next download) never show a swallowed mark. The key
  // guard keeps this to one run per kit + style.
  const backfillKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveKit || !effectiveSpec || effectiveTreatments) return;
    const key = `${effectiveKit.leadLogoUrl ?? ""}|${effectiveKit.coLogoUrl ?? ""}|${effectiveStyle}`;
    if (backfillKeyRef.current === key) return;
    backfillKeyRef.current = key;
    void computeLogoTreatments(effectiveKit, effectiveStyle).then((t) => {
      if (backfillKeyRef.current !== key) return;
      setTreatments(t);
      saveDeck.mutate({ settings: { logoTreatments: t } });
    });
    // saveDeck is a stable mutation object; listing it would re-run per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKit, effectiveSpec, effectiveTreatments, effectiveStyle]);

  // ── Compile ────────────────────────────────────────────────────────────
  const prefsSettings = (p: RenderPrefs): Partial<DeckSettings> => ({
    renderPresentation: p.presentation,
    selectedRenderIds: p.selected,
    featuredRenderIds: p.featured,
  });

  const compile = async (
    chosenKit: BrandKit,
    chosenStyle: DeckStyleId,
    overrides: { prefs?: RenderPrefs; video?: DeckVideoContent | null; silent?: boolean } = {},
  ) => {
    const p = overrides.prefs ?? effectivePrefs;
    const v = overrides.video !== undefined ? overrides.video : effectiveVideo;
    const compiled = compileDeckSpec({
      project: { name: currentProject?.name ?? null },
      parsedBrief: (currentProject?.parsedBrief ?? null) as Record<string, unknown> | null,
      elements: (currentProject?.elements ?? null) as never,
      renders: activeRenders,
      kit: chosenKit,
      boothSizeLabel: activeConfigLabel ?? undefined,
      renderPresentation: p.presentation,
      selectedRenderIds: p.selected,
      featuredRenderIds: p.featured,
      video: v,
    });
    // Logo contrast is decided BEFORE the deck is shown, and reused while
    // the marks + style are unchanged (analyses are cached per logo anyway).
    const t = logoTreatmentsMatch(effectiveTreatments, chosenKit, chosenStyle)
      ? (effectiveTreatments as LogoTreatments)
      : await computeLogoTreatments(chosenKit, chosenStyle);
    setKit(chosenKit);
    setStyle(chosenStyle);
    setSpec(compiled);
    setPrefs(p);
    setVideo(v);
    setTreatments(t);
    saveDeck.mutate({
      settings: { ...prefsSettings(p), logoTreatments: t },
      content: { spec: compiled, video: v },
    });
    if (!overrides.silent) {
      const label = DECK_STYLES.find((s) => s.id === chosenStyle)?.label ?? chosenStyle;
      toast({
        title: "Deck compiled",
        description: `${compiled.slides.length} slides in ${chosenKit.mode === "blend" ? "blended" : chosenKit.mode} brand · ${label} style.`,
      });
    }
  };

  /** Render-picker changes recompile instantly (deterministic, no AI) when a
   *  deck exists; otherwise they just persist for the first compile. */
  const updatePrefs = (patch: Partial<RenderPrefs>) => {
    const next: RenderPrefs = { ...effectivePrefs, ...patch };
    setPrefs(next);
    if (effectiveKit && effectiveSpec) {
      void compile(effectiveKit, effectiveStyle, { prefs: next, silent: true });
    } else {
      saveDeck.mutate({ settings: prefsSettings(next) });
    }
  };

  const allRenderIds = activeRenders.map((r) => r.angle_id);
  const isSelected = (id: string) => effectivePrefs.selected === null || effectivePrefs.selected.includes(id);
  const selectedCount = activeRenders.filter((r) => isSelected(r.angle_id)).length;
  const toggleSelected = (id: string) => {
    const current = effectivePrefs.selected ?? allRenderIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const everything = allRenderIds.every((a) => next.includes(a));
    updatePrefs({
      selected: everything ? null : next,
      featured: effectivePrefs.featured.filter((f) => next.includes(f)),
    });
  };
  const toggleFeatured = (id: string) => {
    const has = effectivePrefs.featured.includes(id);
    updatePrefs({ featured: has ? effectivePrefs.featured.filter((f) => f !== id) : [...effectivePrefs.featured, id] });
  };
  const selectAll = (on: boolean) => updatePrefs({ selected: on ? null : [], featured: on ? effectivePrefs.featured : [] });
  const presentationLabel =
    RENDER_PRESENTATIONS.find((p) => p.id === effectivePrefs.presentation)?.label ?? effectivePrefs.presentation;

  // ── Walkthrough video ──────────────────────────────────────────────────
  const heroRenderUrl = useMemo(() => {
    const hero = effectiveSpec?.slides.find((s) => s.layout === "renderFull");
    return hero && hero.layout === "renderFull" ? hero.image.url : null;
  }, [effectiveSpec]);

  const handleEmbedVideo = async (v: GeneratedVideo) => {
    if (!projectId) return;
    setEmbeddingId(v.id);
    try {
      const content = await persistWalkthroughVideo(projectId, v, heroRenderUrl ?? v.sourceImageUrl);
      setVideo(content);
      if (effectiveKit && effectiveSpec) {
        await compile(effectiveKit, effectiveStyle, { video: content, silent: true });
      } else {
        saveDeck.mutate({ content: { video: content } });
      }
      toast({
        title: "Walkthrough embedded",
        description: effectiveSpec
          ? "Added as its own slide right after the hero render."
          : "It will get its own slide after the hero render when you design the deck.",
      });
    } catch (err) {
      toast({
        title: "Couldn't embed the walkthrough",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setEmbeddingId(null);
    }
  };

  const handleRemoveVideo = async () => {
    const previous = effectiveVideo;
    setVideo(null);
    if (effectiveKit && effectiveSpec) {
      await compile(effectiveKit, effectiveStyle, { video: null, silent: true });
    } else {
      saveDeck.mutate({ content: { video: null } });
    }
    void removeWalkthroughVideo(previous?.path);
  };

  // ── Export ─────────────────────────────────────────────────────────────
  /** Treatments must exist before anything ships — compute (and persist)
   *  if a legacy deck still lacks them. */
  const ensureTreatments = async (k: BrandKit): Promise<LogoTreatments> => {
    if (effectiveTreatments) return effectiveTreatments;
    const t = await computeLogoTreatments(k, effectiveStyle);
    setTreatments(t);
    saveDeck.mutate({ settings: { logoTreatments: t } });
    return t;
  };

  const handleDownloadPptx = async () => {
    if (!effectiveSpec || !effectiveKit) return;
    setBuildingPptx(true);
    let skipped = 0;
    try {
      const t = await ensureTreatments(effectiveKit);
      const blob = await buildDeckPptx(effectiveSpec, effectiveKit, {
        style: effectiveStyle,
        logoTreatments: t,
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
        description: skipped > 0 ? `${skipped} asset${skipped === 1 ? "" : "s"} couldn't be fetched and were skipped.` : "Fully editable in PowerPoint.",
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

  const handlePrintPdf = async () => {
    if (!effectiveSpec || !effectiveKit) return;
    const t = await ensureTreatments(effectiveKit);
    const html = renderDeckHtml(effectiveSpec, effectiveKit, effectiveStyle, t);
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

      {/* ── Renders picker ─────────────────────────────────────────────── */}
      {activeRenders.length > 0 && (
        <div className="border-b border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setRendersOpen((o) => !o)}
            aria-expanded={rendersOpen}
            className="flex w-full items-center gap-2 text-left"
          >
            {rendersOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate" strokeWidth={1.5} />
            )}
            <SectionLabel accent="blue">Renders</SectionLabel>
            <SpecMono className="text-[11px] text-slate">
              {selectedCount} of {activeRenders.length} · {presentationLabel}
              {effectivePrefs.featured.length > 0 && effectivePrefs.presentation !== "full"
                ? ` · ${effectivePrefs.featured.length} featured`
                : ""}
            </SpecMono>
          </button>

          {rendersOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div role="radiogroup" aria-label="Render presentation" className="inline-flex rounded-lg border border-border bg-cloud/60 p-0.5">
                  {RENDER_PRESENTATIONS.map((p) => {
                    const active = effectivePrefs.presentation === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={p.blurb}
                        onClick={() => updatePrefs({ presentation: p.id })}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                          active ? "bg-navy text-white shadow-sm" : "text-slate hover:text-navy",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate">
                  {RENDER_PRESENTATIONS.find((p) => p.id === effectivePrefs.presentation)?.blurb}
                </p>
                <div className="ml-auto flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={() => selectAll(true)} className="text-slate underline-offset-2 hover:text-navy hover:underline">
                    Select all
                  </button>
                  <span className="text-border">·</span>
                  <button type="button" onClick={() => selectAll(false)} className="text-slate underline-offset-2 hover:text-navy hover:underline">
                    None
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeRenders.map((r) => {
                  const on = isSelected(r.angle_id);
                  const featured = effectivePrefs.featured.includes(r.angle_id);
                  const isPlan = FLOOR_PLAN_IDS.has(r.angle_id);
                  const canFeature = on && !isPlan && effectivePrefs.presentation !== "full";
                  return (
                    <div key={r.angle_id} className="relative" style={{ width: 128 }}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${on ? "Exclude" : "Include"} ${r.angle_name}`}
                        onClick={() => toggleSelected(r.angle_id)}
                        className={cn(
                          "block w-full overflow-hidden rounded-md border-2 text-left transition-all",
                          on ? "border-navy" : "border-border opacity-55 hover:opacity-80",
                        )}
                      >
                        <div className="relative aspect-video bg-cloud">
                          <img src={r.public_url} alt="" className={cn("h-full w-full", isPlan ? "object-contain" : "object-cover")} loading="lazy" />
                          <span
                            className={cn(
                              "absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-sm border",
                              on ? "border-navy bg-navy text-white" : "border-white/80 bg-black/30",
                            )}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                        </div>
                        <span className="block truncate px-1.5 py-1 text-[10px] font-medium text-charcoal">
                          {r.angle_name}
                          {isPlan ? " · plan" : ""}
                        </span>
                      </button>
                      {canFeature && (
                        <button
                          type="button"
                          aria-pressed={featured}
                          aria-label={`${featured ? "Unfeature" : "Feature"} ${r.angle_name} (own full-bleed slide)`}
                          title={featured ? "Featured — own full-bleed slide" : "Feature: give it a full-bleed slide"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFeatured(r.angle_id);
                          }}
                          className={cn(
                            "absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                            featured
                              ? "border-pink-deep bg-pink-deep text-white"
                              : "border-white/80 bg-black/30 text-white hover:bg-black/50",
                          )}
                        >
                          <Star className="h-3 w-3" strokeWidth={2} fill={featured ? "currentColor" : "none"} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Walkthrough video ──────────────────────────────────────────── */}
      <div className="border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <SectionLabel accent="pink">Walkthrough video</SectionLabel>
          {effectiveVideo && <StatusChip variant="pass">Embedded</StatusChip>}
        </div>
        {effectiveVideo ? (
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-cloud/50 p-2">
            <div className="flex h-12 w-[85px] shrink-0 items-center justify-center overflow-hidden rounded bg-navy">
              {effectiveVideo.posterUrl ? (
                <img src={effectiveVideo.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Film className="h-4 w-4 text-white" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-navy">{effectiveVideo.label}</p>
              <p className="text-[11px] text-slate">
                {effectiveVideo.durationSec ? `${effectiveVideo.durationSec}s · ` : ""}
                Own slide after the hero render · stored with the project
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRemoveVideo} className="gap-1.5 text-slate hover:text-navy">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Remove
            </Button>
          </div>
        ) : completedVideos.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {completedVideos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                <div className="h-12 w-[85px] shrink-0 overflow-hidden rounded bg-cloud">
                  <img src={v.sourceImageUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-navy">{walkthroughLabel(v)}</p>
                  <p className="text-[11px] text-slate">
                    {v.duration}s{v.provider ? ` · ${v.provider}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEmbedVideo(v)}
                  disabled={!!embeddingId || !projectId}
                  className="gap-1.5"
                >
                  {embeddingId === v.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Film className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  Embed walkthrough
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12px] text-slate">
            No walkthrough clips from this session.{" "}
            <Link to="/files?tab=video" className="font-semibold text-navy underline underline-offset-2">
              Generate walkthrough
            </Link>{" "}
            in Files → Video, then come back here to embed it as its own slide.
          </p>
        )}
      </div>

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
                  srcDoc={renderSlideHtml(
                    slide,
                    effectiveKit,
                    i,
                    effectiveSpec.slides.length,
                    effectiveSpec.meta,
                    effectiveStyle,
                    effectiveTreatments,
                  )}
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
        onConfirm={(chosenKit, chosenStyle) => {
          void compile(chosenKit, chosenStyle);
        }}
        onFixGaps={() => {
          setModeDialogOpen(false);
          openFixGaps();
        }}
      />
    </div>
  );
}
