// DeckStudio — the flagship deck path on the Export step.
//
// Flow: pick a brand mode (agency / client / blend — BrandModeDialog, with
// inline gap-fixing via BrandKitPanel) → compile the designed slide system
// deterministically from the project's real data (compileDeckSpec) → preview
// the slides → give feedback in plain language (deck-revise → DeckOps →
// applyDeckOps, re-rendered instantly, every batch a version) → download an
// EDITABLE .pptx (buildDeckPptx) or a print-perfect PDF (renderDeckHtml +
// the browser's print dialog).
//
// Compilation is free and instant — no AI. Feedback IS an AI call, but the
// model only emits structured ops over a closed vocabulary; the designed
// renderers redraw, so accuracy and design consistency survive every round.
//
// State model (all "local ?? saved", so a reload lands where you left off):
//   · working deck  — spec + design settings (brand mode, style, palette /
//     font overrides, render presentation, per-slide overrides). Feedback,
//     recompiles and restores replace it.
//   · history       — linear versions (compile / feedback / restore) +
//     the chat thread. Never rewritten; restoring appends.
//   · viewing       — a version being previewed. The grid, focus view and
//     downloads follow it; the composer locks until it's restored.
//   · focus         — the slide open in the focus view; it is ALSO the
//     target for feedback (the chat's "Slide N" chip). One source of truth.
//
// Controls between the header and the preview:
//   · Renders — which of the active booth size's renders go in, which are
//     featured, and how the rest are presented. Persisted in deck settings.
//   · Walkthrough video — embed a clip generated in Files → Video (copied
//     into project storage by deckVideo.ts because provider URLs expire).
//   · Logo contrast (invisible) — before every compile / download the kit's
//     marks are analysed (logoContrast.ts) and plated where the ground
//     would swallow them, for every ground an override can choose. Cached
//     per kit + style + palette; the current deck's decision is persisted.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DeckChat } from "@/components/export/DeckChat";
import { DeckVersionRail } from "@/components/export/DeckVersionRail";
import { DeckSlideFocus } from "@/components/export/DeckSlideFocus";
import { SectionLabel, SpecMono, StatusChip } from "@/components/shell";
import { resolveBrandKit, type BrandKit, type BrandMode } from "@/lib/brandKit";
import {
  compileDeckSpec,
  DEFAULT_RENDER_PRESENTATION,
  RENDER_PRESENTATIONS,
  isRenderPresentation,
  relayoutRenderSlides,
  type DeckRenderImage,
  type RenderPresentation,
} from "@/lib/compileDeckSpec";
import { buildDeckPptx } from "@/lib/deckBuilder";
import { renderSlideHtml, renderDeckHtml } from "@/lib/deckSlideHtml";
import { DECK_STYLES, DEFAULT_DECK_STYLE, isDeckStyleId, type DeckStyleId } from "@/lib/deckStyle";
import type { DeckSpec } from "@/lib/deckSpec";
import {
  applyDeckOps,
  carryOverridesAcrossCompile,
  describeSkippedOp,
  effectiveBrandKit,
  newChatMessageId,
  overrideTags,
  pushChatMessage,
  recordVersion,
  remapOverrides,
  renameVersion,
  restoreVersion,
  summarizeDeckForModel,
  versionNumber,
  type DeckChatMessage,
  type DeckDesignSettings,
  type DeckState,
  type DeckVersion,
  type SlideOverrides,
} from "@/lib/deckOps";
import { requestDeckRevision } from "@/lib/deckRevise";
import {
  computeLogoTreatments,
  logoCacheKey,
  logoPaletteKey,
  logoTreatmentsCoverOverrides,
  logoTreatmentsMatch,
  type LogoTreatments,
} from "@/lib/logoContrast";
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

/** The chat-editable design overrides that live beside brand mode / style. */
interface DesignOverrides {
  paletteOverride?: DeckDesignSettings["paletteOverride"];
  fontOverride?: DeckDesignSettings["fontOverride"];
  slideOverrides?: Record<string, SlideOverrides>;
}

interface DeckHistoryState {
  versions: DeckVersion[];
  currentVersionId: string | null;
  chat: DeckChatMessage[];
}

const FLOOR_PLAN_IDS = new Set(["floor_plan_2d", "top"]);
const EMPTY_HISTORY: DeckHistoryState = { versions: [], currentVersionId: null, chat: [] };
const CHAT_CONTEXT_TURNS = 8;

/** Cheap stable hash for keying srcdoc iframes on their content. */
const hashStr = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Cache key for logo treatments: marks + style + the grounds they sit on. */
const treatmentKey = (k: BrandKit, s: DeckStyleId): string =>
  [
    k.leadLogoUrl ? logoCacheKey(k.leadLogoUrl) : "",
    k.coLogoUrl ? logoCacheKey(k.coLogoUrl) : "",
    s,
    logoPaletteKey(k),
  ].join("|");

const designSettingsOf = (settings: DeckDesignSettings): DesignOverrides => ({
  paletteOverride: settings.paletteOverride,
  fontOverride: settings.fontOverride,
  slideOverrides: settings.slideOverrides,
});

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
  const [design, setDesign] = useState<DesignOverrides | null>(null);
  const [history, setHistory] = useState<DeckHistoryState | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [revising, setRevising] = useState(false);
  const [treatmentsByKey, setTreatmentsByKey] = useState<Record<string, LogoTreatments>>({});
  const [buildingPptx, setBuildingPptx] = useState(false);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const brandPanelRef = useRef<HTMLDivElement>(null);
  const treatmentsInflight = useRef(new Set<string>());

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
  // overrides / logo treatments + saved spec + video + history). Decks saved
  // before a field existed fall back to that field's default.
  const savedSettings = (deck?.settings ?? {}) as DeckSettings;
  const savedContent = (deck?.content ?? {}) as DeckContent;
  const savedMode = savedSettings.brandMode as BrandMode | undefined;
  const savedStyle = savedSettings.style;
  const savedSpec = savedContent.spec;
  const currentSpec = spec ?? savedSpec ?? null;
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
  const effectiveDesign: DesignOverrides = design ?? {
    paletteOverride: savedSettings.paletteOverride,
    fontOverride: savedSettings.fontOverride,
    slideOverrides: savedSettings.slideOverrides,
  };
  const effectiveHistory: DeckHistoryState = history ?? {
    versions: Array.isArray(savedContent.versions) ? savedContent.versions : EMPTY_HISTORY.versions,
    currentVersionId: savedContent.currentVersionId ?? null,
    chat: Array.isArray(savedContent.chat) ? savedContent.chat : EMPTY_HISTORY.chat,
  };

  // Brand sources are rebuilt every render; key the kit on their content so
  // downstream memos (rendered HTML, treatments) only move when they do.
  const agencyKey = JSON.stringify(agency);
  const clientKey = JSON.stringify(client);
  const baseKit = useMemo<BrandKit | null>(() => {
    if (kit) return kit;
    if (savedMode) return resolveBrandKit(savedMode, agency, client);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, savedMode, agencyKey, clientKey]);

  /** The working deck's design settings — what feedback edits and versions snapshot. */
  const currentDesign = useMemo<DeckDesignSettings>(
    () => ({
      brandMode: baseKit?.mode,
      style: effectiveStyle,
      paletteOverride: effectiveDesign.paletteOverride,
      fontOverride: effectiveDesign.fontOverride,
      renderPresentation: effectivePrefs.presentation,
      slideOverrides: effectiveDesign.slideOverrides,
    }),
    [
      baseKit?.mode,
      effectiveStyle,
      effectiveDesign.paletteOverride,
      effectiveDesign.fontOverride,
      effectivePrefs.presentation,
      effectiveDesign.slideOverrides,
    ],
  );

  // ── Display projection: the viewed version, else the working deck ──────
  const viewed = useMemo<DeckVersion | null>(() => {
    if (!viewingId || viewingId === effectiveHistory.currentVersionId) return null;
    return effectiveHistory.versions.find((v) => v.id === viewingId) ?? null;
  }, [viewingId, effectiveHistory.versions, effectiveHistory.currentVersionId]);
  const displaySpec = viewed?.spec ?? currentSpec;
  const displayDesign = viewed?.settings ?? currentDesign;
  const displayStyle: DeckStyleId = isDeckStyleId(displayDesign.style) ? displayDesign.style : effectiveStyle;
  const displayOverrides = displayDesign.slideOverrides;
  const displayKit = useMemo<BrandKit | null>(() => {
    if (!baseKit) return null;
    const base =
      viewed && viewed.settings.brandMode && viewed.settings.brandMode !== baseKit.mode
        ? resolveBrandKit(viewed.settings.brandMode, agency, client)
        : baseKit;
    return effectiveBrandKit(base, displayDesign);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKit, viewed, displayDesign.paletteOverride, displayDesign.fontOverride, agencyKey, clientKey]);

  // ── Logo treatments (cached per kit + style + palette) ─────────────────
  const treatmentsFor = useCallback(
    (k: BrandKit, s: DeckStyleId): LogoTreatments | null => {
      const cached = treatmentsByKey[treatmentKey(k, s)];
      if (cached) return cached;
      const saved = savedSettings.logoTreatments;
      // Saved treatments count when they were computed for these marks, this
      // style and this palette — and carry the per-ground map overrides need.
      if (saved && logoTreatmentsMatch(saved, k, s) && logoTreatmentsCoverOverrides(saved)) return saved;
      return null;
    },
    [treatmentsByKey, savedSettings.logoTreatments],
  );
  const displayTreatments = displayKit ? treatmentsFor(displayKit, displayStyle) : null;

  /** Compute (and cache) treatments for a kit + style; persist when they
   *  belong to the working deck. Never throws — an unreadable logo is "none". */
  const ensureTreatments = useCallback(
    async (k: BrandKit, s: DeckStyleId, persist: boolean): Promise<LogoTreatments> => {
      const hit = treatmentsFor(k, s);
      if (hit) return hit;
      const key = treatmentKey(k, s);
      const t = await computeLogoTreatments(k, s);
      setTreatmentsByKey((m) => ({ ...m, [key]: t }));
      if (persist) saveDeck.mutate({ settings: { logoTreatments: t } });
      return t;
    },
    // saveDeck is a stable mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [treatmentsFor],
  );

  // Decks compiled before logo intelligence (or before per-ground plates)
  // existed: analyse on load so the preview never shows a swallowed mark.
  useEffect(() => {
    if (!displayKit || !displaySpec || displayTreatments) return;
    const key = treatmentKey(displayKit, displayStyle);
    if (treatmentsInflight.current.has(key)) return;
    treatmentsInflight.current.add(key);
    void ensureTreatments(displayKit, displayStyle, !viewed).finally(() => treatmentsInflight.current.delete(key));
  }, [displayKit, displaySpec, displayStyle, displayTreatments, viewed, ensureTreatments]);

  // ── Rendered slides (thumbnails + focus) ───────────────────────────────
  const slideHtml = useMemo<string[]>(() => {
    if (!displaySpec || !displayKit) return [];
    return displaySpec.slides.map((slide, i) =>
      renderSlideHtml(
        slide,
        displayKit,
        i,
        displaySpec.slides.length,
        displaySpec.meta,
        displayStyle,
        displayTreatments,
        displayOverrides?.[String(i)] ?? null,
      ),
    );
  }, [displaySpec, displayKit, displayStyle, displayTreatments, displayOverrides]);
  const slideKeys = useMemo(() => slideHtml.map((h, i) => `${i}:${hashStr(h)}`), [slideHtml]);

  // ── Persistence helpers ────────────────────────────────────────────────
  const prefsSettings = (p: RenderPrefs): Partial<DeckSettings> => ({
    renderPresentation: p.presentation,
    selectedRenderIds: p.selected,
    featuredRenderIds: p.featured,
  });
  const designSettings = (d: DeckDesignSettings): Partial<DeckSettings> => ({
    brandMode: d.brandMode,
    style: d.style,
    renderPresentation: d.renderPresentation,
    paletteOverride: d.paletteOverride,
    fontOverride: d.fontOverride,
    slideOverrides: d.slideOverrides,
  });
  const historyContent = (h: DeckHistoryState): Partial<DeckContent> => ({
    versions: h.versions,
    currentVersionId: h.currentVersionId,
    chat: h.chat,
  });

  /** Make a spec + design settings the working deck (feedback / restore). */
  const adoptState = (nextSpec: DeckSpec, next: DeckDesignSettings) => {
    setSpec(nextSpec);
    if (isDeckStyleId(next.style)) setStyle(next.style);
    if (next.brandMode && next.brandMode !== baseKit?.mode) setKit(resolveBrandKit(next.brandMode, agency, client));
    if (isRenderPresentation(next.renderPresentation) && next.renderPresentation !== effectivePrefs.presentation) {
      setPrefs({ ...effectivePrefs, presentation: next.renderPresentation });
    }
    setDesign(designSettingsOf(next));
    setFocusIndex((f) => (f !== null && f >= nextSpec.slides.length ? null : f));
  };

  // ── Compile ────────────────────────────────────────────────────────────
  const compile = async (
    chosenKit: BrandKit,
    chosenStyle: DeckStyleId,
    overrides: { prefs?: RenderPrefs; video?: DeckVideoContent | null; silent?: boolean; reason?: string } = {},
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
    // Per-slide overrides follow their slides only where the structure held.
    const carried = carryOverridesAcrossCompile(effectiveDesign.slideOverrides, currentSpec, compiled);
    const nextDesign: DeckDesignSettings = {
      brandMode: chosenKit.mode,
      style: chosenStyle,
      paletteOverride: effectiveDesign.paletteOverride,
      fontOverride: effectiveDesign.fontOverride,
      renderPresentation: p.presentation,
      slideOverrides: carried,
    };
    // Logo contrast is decided BEFORE the deck is shown, for the kit it
    // will actually render with (palette override included).
    const t = await ensureTreatments(effectiveBrandKit(chosenKit, nextDesign), chosenStyle, false);
    const { history: h } = recordVersion(
      { versions: effectiveHistory.versions, currentVersionId: effectiveHistory.currentVersionId },
      { message: overrides.reason ?? "Compiled", spec: compiled, settings: nextDesign },
    );
    const nextHistory: DeckHistoryState = { ...h, chat: effectiveHistory.chat };
    setKit(chosenKit);
    setStyle(chosenStyle);
    setSpec(compiled);
    setPrefs(p);
    setVideo(v);
    setDesign(designSettingsOf(nextDesign));
    setHistory(nextHistory);
    setViewingId(null);
    setFocusIndex((f) => (f !== null && f >= compiled.slides.length ? null : f));
    saveDeck.mutate({
      settings: { ...prefsSettings(p), ...designSettings(nextDesign), logoTreatments: t },
      content: { spec: compiled, video: v, ...historyContent(nextHistory) },
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
    if (baseKit && currentSpec) {
      void compile(baseKit, effectiveStyle, { prefs: next, silent: true, reason: "Render picker" });
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
    const hero = currentSpec?.slides.find((s) => s.layout === "renderFull");
    return hero && hero.layout === "renderFull" ? hero.image.url : null;
  }, [currentSpec]);

  const handleEmbedVideo = async (v: GeneratedVideo) => {
    if (!projectId) return;
    setEmbeddingId(v.id);
    try {
      const content = await persistWalkthroughVideo(projectId, v, heroRenderUrl ?? v.sourceImageUrl);
      setVideo(content);
      if (baseKit && currentSpec) {
        await compile(baseKit, effectiveStyle, { video: content, silent: true, reason: "Walkthrough embedded" });
      } else {
        saveDeck.mutate({ content: { video: content } });
      }
      toast({
        title: "Walkthrough embedded",
        description: currentSpec
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
    if (baseKit && currentSpec) {
      await compile(baseKit, effectiveStyle, { video: null, silent: true, reason: "Walkthrough removed" });
    } else {
      saveDeck.mutate({ content: { video: null } });
    }
    void removeWalkthroughVideo(previous?.path);
  };

  // ── Feedback → ops → new version ───────────────────────────────────────
  const applyFeedback = async (feedback: string, targetSlide: number | null) => {
    if (!currentSpec || !baseKit || revising) return;
    const state: DeckState = { spec: currentSpec, settings: currentDesign };
    const now = new Date().toISOString();
    let chat = pushChatMessage(effectiveHistory.chat, {
      id: newChatMessageId(),
      role: "user",
      content: feedback,
      createdAt: now,
      targetSlide,
    });
    setHistory({ ...effectiveHistory, chat });
    setRevising(true);
    try {
      const { ops, reply } = await requestDeckRevision({
        summary: summarizeDeckForModel(state.spec, state.settings),
        feedback,
        selectedSlide: targetSlide,
        history: effectiveHistory.chat
          .slice(-CHAT_CONTEXT_TURNS)
          .filter((m) => !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      const { state: next, applied, skipped } = applyDeckOps(state, ops);
      let nextSpec = next.spec;
      let nextSettings = next.settings;
      // A render-presentation change re-lays the render block in place, so
      // content edits elsewhere in the deck survive (no recompile).
      if (
        applied.some((op) => op.op === "set_render_presentation") &&
        isRenderPresentation(nextSettings.renderPresentation)
      ) {
        const featuredUrls = new Set(
          activeRenders.filter((r) => effectivePrefs.featured.includes(r.angle_id)).map((r) => r.public_url),
        );
        const relaid = relayoutRenderSlides(nextSpec, nextSettings.renderPresentation, featuredUrls);
        nextSpec = relaid.spec;
        nextSettings = { ...nextSettings, slideOverrides: remapOverrides(nextSettings.slideOverrides, relaid.indexMap) };
      }
      adoptState(nextSpec, nextSettings);
      const { history: h, version } = recordVersion(
        { versions: effectiveHistory.versions, currentVersionId: effectiveHistory.currentVersionId },
        { message: feedback, summary: reply, spec: nextSpec, settings: nextSettings },
      );
      chat = pushChatMessage(chat, {
        id: newChatMessageId(),
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
        appliedCount: applied.length,
        skipped: skipped.map(describeSkippedOp),
        versionId: version.id,
      });
      const nextHistory: DeckHistoryState = { ...h, chat };
      setHistory(nextHistory);
      setViewingId(null);
      saveDeck.mutate({
        settings: designSettings(nextSettings),
        content: { spec: nextSpec, ...historyContent(nextHistory) },
      });
    } catch (err) {
      chat = pushChatMessage(chat, {
        id: newChatMessageId(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Unknown error",
        createdAt: new Date().toISOString(),
        error: true,
      });
      setHistory({ ...effectiveHistory, chat });
      saveDeck.mutate({ content: { chat } });
    } finally {
      setRevising(false);
    }
  };

  // ── Versions ───────────────────────────────────────────────────────────
  const handleRestore = (versionId: string) => {
    const restored = restoreVersion(
      { versions: effectiveHistory.versions, currentVersionId: effectiveHistory.currentVersionId },
      versionId,
    );
    if (!restored) return;
    adoptState(restored.version.spec, restored.version.settings);
    const nextHistory: DeckHistoryState = { ...restored.history, chat: effectiveHistory.chat };
    setHistory(nextHistory);
    setViewingId(null);
    saveDeck.mutate({
      settings: designSettings(restored.version.settings),
      content: { spec: restored.version.spec, ...historyContent(nextHistory) },
    });
    toast({ title: restored.version.message, description: "Restored as a new version — history stays linear." });
  };

  const handleRename = (versionId: string, label: string) => {
    const nextHistory: DeckHistoryState = {
      ...renameVersion(
        { versions: effectiveHistory.versions, currentVersionId: effectiveHistory.currentVersionId },
        versionId,
        label,
      ),
      chat: effectiveHistory.chat,
    };
    setHistory(nextHistory);
    saveDeck.mutate({ content: { versions: nextHistory.versions } });
  };

  // ── Export (always the DISPLAYED deck: the viewed version or current) ──
  const handleDownloadPptx = async () => {
    if (!displaySpec || !displayKit) return;
    setBuildingPptx(true);
    let skipped = 0;
    try {
      const t = await ensureTreatments(displayKit, displayStyle, !viewed);
      const blob = await buildDeckPptx(displaySpec, displayKit, {
        style: displayStyle,
        logoTreatments: t,
        slideOverrides: displayOverrides,
        onImageSkipped: () => {
          skipped += 1;
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stem = (displaySpec.meta.clientName || displaySpec.meta.projectName || "Canopy").replace(/[^a-zA-Z0-9]+/g, "_");
      a.download = viewed ? `${stem}_Deck_v${versionNumber(effectiveHistory.versions, viewed)}.pptx` : `${stem}_Deck.pptx`;
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
    if (!displaySpec || !displayKit) return;
    const t = await ensureTreatments(displayKit, displayStyle, !viewed);
    const html = renderDeckHtml(displaySpec, displayKit, displayStyle, t, displayOverrides);
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

  // ── Focus / selection ──────────────────────────────────────────────────
  const slideCount = displaySpec?.slides.length ?? 0;
  const focused = focusIndex !== null && focusIndex < slideCount ? focusIndex : null;
  const stepFocus = useCallback(
    (delta: number) => setFocusIndex((f) => (f === null ? f : Math.min(Math.max(0, f + delta), Math.max(0, slideCount - 1)))),
    [slideCount],
  );
  const focusPrev = useCallback(() => stepFocus(-1), [stepFocus]);
  const focusNext = useCallback(() => stepFocus(1), [stepFocus]);
  const closeFocus = useCallback(() => setFocusIndex(null), []);
  /** The last reply, when the last ask was aimed at the focused slide. */
  const focusedReply = useMemo<DeckChatMessage | null>(() => {
    if (focused === null) return null;
    const chat = effectiveHistory.chat;
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].role === "user") {
        return chat[i].targetSlide === focused && chat[i + 1]?.role === "assistant" ? chat[i + 1] : null;
      }
    }
    return null;
  }, [focused, effectiveHistory.chat]);

  const composerLocked = !!viewed;
  const composerReason = viewed
    ? `Viewing v${versionNumber(effectiveHistory.versions, viewed)} — restore it to keep editing from there.`
    : undefined;

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
        {displayKit && (
          <StatusChip variant="neutral">
            {displayKit.mode === "blend" ? "Blended brand" : `${displayKit.mode} brand`}
          </StatusChip>
        )}
        {displaySpec && displayKit && <StatusChip variant="neutral">{styleLabel}</StatusChip>}
        {activeConfigLabel && <SpecMono className="text-[11px] text-slate">{activeConfigLabel}</SpecMono>}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={openFixGaps} className="gap-1.5">
            <Palette className="h-3.5 w-3.5" strokeWidth={1.5} />
            Brand kit
          </Button>
          <Button size="sm" onClick={() => setModeDialogOpen(true)} className="gap-1.5">
            {currentSpec ? <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> : null}
            {currentSpec ? "Recompile" : "Design deck"}
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

      {displaySpec && displayKit ? (
        <div className="space-y-4 px-5 py-4">
          <DeckVersionRail
            versions={effectiveHistory.versions}
            currentVersionId={effectiveHistory.currentVersionId}
            viewingId={viewingId}
            onView={setViewingId}
            onRestore={handleRestore}
            onRename={handleRename}
          />

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <SpecMono className="text-[12px] text-charcoal">{displaySpec.slides.length} slides</SpecMono>
                {viewed && (
                  <StatusChip variant="attention">v{versionNumber(effectiveHistory.versions, viewed)}</StatusChip>
                )}
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

              {focused !== null && slideHtml[focused] !== undefined && (
                <DeckSlideFocus
                  html={slideHtml[focused]}
                  renderKey={slideKeys[focused]}
                  index={focused}
                  total={displaySpec.slides.length}
                  layout={displaySpec.slides[focused].layout}
                  overrides={displayOverrides?.[String(focused)] ?? null}
                  onPrev={focusPrev}
                  onNext={focusNext}
                  onClose={closeFocus}
                  onSend={(feedback) => applyFeedback(feedback, focused)}
                  busy={revising}
                  lastReply={focusedReply}
                  disabled={composerLocked}
                  disabledReason={composerReason}
                />
              )}

              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, 243px)" }}>
                {displaySpec.slides.map((slide, i) => {
                  const active = focused === i;
                  const tags = overrideTags(displayOverrides?.[String(i)]);
                  return (
                    <button
                      key={slideKeys[i]}
                      type="button"
                      onClick={() => setFocusIndex(active ? null : i)}
                      aria-pressed={active}
                      aria-label={`${active ? "Close" : "Open"} slide ${i + 1} (${slide.layout})`}
                      className={cn(
                        "relative overflow-hidden rounded-lg border bg-cloud text-left transition-shadow",
                        active ? "border-navy ring-2 ring-navy ring-offset-1" : "border-border hover:border-navy/40",
                      )}
                      style={{ width: 243, height: 137 }}
                    >
                      <iframe
                        title={`Slide ${i + 1}`}
                        srcDoc={slideHtml[i]}
                        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                        style={{ width: 1280, height: 720, transform: "scale(0.19)" }}
                        scrolling="no"
                        loading="lazy"
                      />
                      {tags.length > 0 && (
                        <span className="absolute bottom-1 left-1.5 rounded bg-white/85 px-1 font-mono text-[9px] text-slate">
                          {tags.join(" · ")}
                        </span>
                      )}
                      <span
                        className={cn(
                          "absolute bottom-1 right-1.5 rounded px-1 font-mono text-[9px]",
                          active ? "bg-navy text-white" : "bg-white/80 text-slate",
                        )}
                      >
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <DeckChat
              className="mt-5 lg:sticky lg:top-4 lg:mt-0"
              messages={effectiveHistory.chat}
              selectedSlide={focused}
              onClearSelection={closeFocus}
              onSend={(feedback) => applyFeedback(feedback, focused)}
              busy={revising}
              disabled={composerLocked}
              disabledReason={composerReason}
            />
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
