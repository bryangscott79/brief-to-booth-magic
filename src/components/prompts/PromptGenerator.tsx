import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useRenderStore } from "@/store/renderStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ImageLightbox, useImageLightbox } from "@/components/common/ImageLightbox";
import { BriefReadinessPanel } from "@/components/common/BriefReadinessPanel";
import type { CheckResult } from "@/lib/briefReadiness";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  Camera,
  Sparkles,
  CheckCircle2,
  ImageIcon,
  X,
  Loader2,
  Download,
  RefreshCw,
  MessageSquare,
  Layers,
  FolderOpen,
  Maximize2,
  Send,
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useToast } from "@/hooks/use-toast";
import { useProjectImages, useSaveRenderImage, type ProjectImage } from "@/hooks/useProjectImages";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveProjectField } from "@/hooks/useProjectSync";

// Prompt transparency — every saved render carries its exact prompt in
// prompt_artifacts; this dialog surfaces it from the gallery cards.
import { RenderPromptDialog } from "@/components/common/RenderPromptDialog";
import { FileText } from "lucide-react";

// Hanging-element creative control: hero-first check gate + refine-in-
// place edit flow. Approval is scoped per config + hero version.
import { HangingElementCheck } from "@/components/prompts/HangingElementCheck";
import {
  hangingApprovalKey,
  buildHangingEditInstruction,
} from "@/lib/hangingRefinement";
import { useBrandIntelligence, useClient } from "@/hooks/useClients";
import { useBrandRAG } from "@/hooks/useBrandRAG";

// Import prompt building utilities
import {
  ANGLE_CONFIG,
  getZoneInteriorAngles,
  generatePrompt,
  normalizeZones,
  calculateBoothDimensions,
  type GeneratePromptParams,
} from "@/lib/promptBuilder";
import { buildDesignContext } from "@/lib/designContextBuilder";
import { rasterizePolygonMask } from "@/lib/rasterizePolygonMask";
import {
  normalizeBrief,
  validateBrief,
  composePrompt,
  composeViewPrompt,
  applyGapAnswer,
  type HeroSnapshot,
  type ViewAngle,
} from "@/lib/normalizedBrief";
import { BriefClarification } from "@/components/prompts/BriefClarification";
import { PromptDebugPanel } from "@/components/prompts/PromptDebugPanel";
import { PromptInspector } from "@/components/prompts/PromptInspector";
import { ModelBadge } from "@/components/prompts/ModelBadge";

/**
 * Map an internal angle id to the canonical ViewAngle the composer
 * understands. Zone-interior angles use the format
 * `zone_interior_<zoneId>`; detail_hero/detail_lounge land on "detail".
 */
function mapAngleIdToViewAngle(angleId: string): ViewAngle {
  if (angleId === "front") return "front";
  if (angleId === "left") return "side_left";
  if (angleId === "right") return "side_right";
  if (angleId === "back") return "back";
  if (angleId === "top") return "top";
  if (angleId === "detail_hero" || angleId === "detail_lounge") return "detail";
  if (angleId.startsWith("zone_interior_")) return "interior";
  return "front";
}

// Project units (imperial/metric) — preserved through render generation.
import { useMeasurementSystem } from "@/hooks/useMeasurementSystem";

// Project brand logo — passed to image gen as a reference image so the
// real mark renders on signage instead of a hallucinated approximation.
import { useBrandLogo } from "@/hooks/useBrandLogo";

// Agency-wide image-model preference — controls which provider every
// render call goes to. End users don't see the model selection; the
// platform leads with GPT-image-2 by default and super admins can
// override per agency from settings.
import { useAgencyImageModel } from "@/hooks/useAgencyImageModel";
import { useAgency } from "@/hooks/useAgency";

// Per-view supplemental references that the user attaches at regen time.
import { useRenderReferences } from "@/hooks/useRenderReferences";
import { AttachReference } from "@/components/prompts/AttachReference";

// Project-wide visual references — inspiration, brand images, etc.
// Routed into every render call so the model treats them as standing
// brand context (not just per-view attachments).
import { useProjectVisualReferences } from "@/hooks/useProjectVisualReferences";

// Pre-flight verification panel — shows the user every input the model
// is about to receive (brand identity, brief, spatial, references) so
// they can confirm or fix anything before kicking off generation.
import { PreflightChecklist } from "@/components/prompts/PreflightChecklist";

// Floor-plan rasterizer — pure render of the current geometry to a
// data-URL PNG. The Prompts step no longer mounts the spatial canvas
// (the dedicated Spatial step owns editing) but the image model still
// benefits from a top-down visual anchor for the hero generation, so
// we generate the floorplan PNG directly from the geometry here.
import { renderFloorPlanForExport } from "@/lib/renderFloorPlanForExport";
import {
  type BoothGeometry,
  boothGeometryFromLegacy,
} from "@/lib/geometryModel";
import { useGeometryReferences } from "@/hooks/useGeometryReferences";

// Versioning + style presets
import { usePromptVersions } from "@/hooks/usePromptVersions";
import { PromptVersionTabs } from "@/components/prompts/PromptVersionTabs";
import {
  applyStylePresetToPrompt,
  getPresetById,
  PROMPT_STYLE_PRESETS,
} from "@/lib/promptStylePresets";
import {
  makeVersionedAngleId,
  makeConfigScopedAngleId,
  parseVersionedAngleId,
  sanitizeConfigKey,
  findOrphanedVersions,
  LEGACY_VERSION_ID,
  type PromptVersionMeta,
} from "@/lib/promptVersions";

// Multi-config (booth size) support — persisted active footprint selection
// shared with the Spatial step, plus the same chip row UI.
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { ConfigSizeChips } from "@/components/common/ConfigSizeChips";


export function PromptGenerator() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  // (Copy-state moved into PromptInspector — each instance owns its
  // own "Copied" badge timeout. The page-level copiedId map was
  // retired with the move; the legacy handleCopy below is gone.)
  const [showGallery, setShowGallery] = useState(false);
  // Gallery size filter — "all" or a sanitized config key ("20x40"), or
  // "__untagged__" for legacy renders saved before multi-config support.
  const [gallerySizeFilter, setGallerySizeFilter] = useState<string>("all");
  // "Generate all sizes" batch flow: confirmation gate + per-config
  // progress. batchRuns is null when no batch has been started.
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchRuns, setBatchRuns] = useState<
    Array<{ key: string; label: string; status: "pending" | "generating" | "done" | "error"; error?: string }>
    | null
  >(null);
  // Lightbox for click-to-expand on any generated render.
  // useImageLightbox returns an open() trigger + props spread for
  // the ImageLightbox component instance below.
  const lightbox = useImageLightbox();
  // "View prompt" dialog target — a saved render whose stored
  // prompt_artifacts we're showing. null = closed.
  const [promptDialogImage, setPromptDialogImage] = useState<ProjectImage | null>(null);
  const queryClient = useQueryClient();

  // Global render store
  const renderStore = useRenderStore();
  const {
    phase, heroPrompt, heroImage, heroModelUsed, heroFeedback, heroThread,
    generatedPrompts, generatedImages, isGeneratingHero, isGenerating,
    generationProgress, currentlyGenerating, hydratedFromDb,
  } = renderStore;

  const effectiveProjectId = projectId || renderStore.projectId;
  const { data: savedImages = [] } = useProjectImages(effectiveProjectId);
  const saveImage = useSaveRenderImage(effectiveProjectId);

  // ── Prompt versions + active style preset ─────────────────────────────────
  // Each version is an independent "take" on the renders — different style
  // emphasis, different generated images. The active version determines:
  //   1. Which preset's emphasis block gets injected into the prompt body
  //   2. Which suffix gets appended to the angle_id when an image is saved,
  //      so versions don't clobber each other in project_images.
  const promptVersions = usePromptVersions(effectiveProjectId);
  const activeVersion = promptVersions.activeVersion;
  const activePreset = activeVersion ? getPresetById(activeVersion.preset) : PROMPT_STYLE_PRESETS[0]!;
  const activeCustomEmphasis = activeVersion?.customEmphasis;

  // ── Active footprint config (booth size) ──────────────────────────────────
  // Multi-config projects (e.g. 100x60 + 20x40 + 10x10) pick their active
  // size on the Spatial step OR via the chip row rendered below — both drive
  // the same persisted selection (spatial_strategy.activeConfigKey). Every
  // downstream input (dimensions, zones, geometry, composed prompts, hero
  // snapshot, saves) derives from the ACTIVE config instead of the old
  // hardcoded configs[0] (which always rendered the largest size).
  const spatialConfig = useActiveSpatialConfig(effectiveProjectId);
  const activeConfigKey = spatialConfig.activeConfigKey;
  const activeConfigLabel = spatialConfig.activeConfigLabel;

  useEffect(() => {
    renderStore.setProjectId(projectId);
  }, [projectId]);

  // Reset render state when the active version OR active booth size flips so
  // the UI re-hydrates from the project_images rows that belong to the new
  // version/config combination.
  useEffect(() => {
    if (!effectiveProjectId) return;
    renderStore.setHydratedFromDb(false);
    renderStore.setHeroImage(null);
    renderStore.setGeneratedImages({});
    renderStore.setHeroPrompt("");
    renderStore.setPhase("prompt");
    // We intentionally don't depend on renderStore — it's a stable reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptVersions.activeVersionId, activeConfigKey, effectiveProjectId]);

  const brief = currentProject?.parsedBrief;
  const spatialData = currentProject?.elements.spatialStrategy.data;
  const bigIdea = currentProject?.elements.bigIdea.data;
  const elements = currentProject?.elements;

  // Brand intelligence for render prompts
  const clientId = currentProject?.clientId ?? null;
  const { data: brandIntelEntries } = useBrandIntelligence(clientId);
  const approvedBrandIntel = useMemo(
    () => brandIntelEntries?.filter(e => e.is_approved).map(e => ({ category: e.category, title: e.title, content: e.content, tags: e.tags })),
    [brandIntelEntries]
  );
  // Client-level brand colors — extracted from the client's brand
  // book (Clients → Brand → Brand assets) and surfaced here so the
  // preflight panel doesn't false-warn "No brand colors" when the
  // brief PDF didn't mention them but the brand book did.
  const { data: clientRecord } = useClient(clientId);
  const clientBrandColors = useMemo(() => {
    const c: string[] = [];
    if (clientRecord?.primary_color) c.push(clientRecord.primary_color);
    if (clientRecord?.secondary_color) c.push(clientRecord.secondary_color);
    return c;
  }, [clientRecord?.primary_color, clientRecord?.secondary_color]);

  // Brand RAG context for edge function calls
  const parentId = currentProject?.hierarchy?.parentId ?? null;
  const showName = brief?.events?.primaryShow ?? undefined;
  const { brandContext: ragBrandContext, suiteContext: ragSuiteContext } = useBrandRAG({
    clientId,
    projectId,
    parentId,
    showName,
  });

  // Project measurement system — resolves user override > brief detection >
  // imperial fallback. Reused below to format dimensions and units inside
  // generated prompts so renders match what's shown on screen.
  const { system: measurementSystem } = useMeasurementSystem(projectId, brief);

  // Project brand logo — uploaded on the Upload page. When present we pass
  // its public URL into every generation call so the model treats it as a
  // brand-mark reference rather than relying on training data.
  const { activeLogo: brandLogo } = useBrandLogo(effectiveProjectId);
  const brandLogoUrl = brandLogo?.publicUrl;

  // Image model is determined by the agency, not the version. The
  // platform-level default is GPT-image-2 ("openai"); super admins can
  // override the agency to a Gemini tier from platform settings. Users
  // never see model selection. If OPENAI_API_KEY is missing in Supabase
  // secrets, the edge function falls back to Gemini automatically.
  const { provider: activeImageModel } = useAgencyImageModel();

  // Industry slug — resolved from the owning agency's primary_industry.
  // The `projects` table doesn't carry an industry column today, so we
  // mirror the same fallback BriefReview uses (see
  // BriefReview.tsx:industryInputMode). composePrompt dispatches the
  // existing-space-photo path off this; without it interior-design
  // projects silently fall through to the spatial-canvas renderer.
  const { agency } = useAgency();
  const projectIndustrySlug = agency?.primary_industry ?? undefined;

  // Per-view supplemental references — user attaches images via "Attach
  // reference" on each view card. URLs flow into the next regeneration of
  // that angle as extraReferenceUrls; cleared on success.
  const renderRefs = useRenderReferences(effectiveProjectId);

  // Project-wide visual references — inspiration images, brand assets, etc.
  // These are sent on EVERY generation call so the model has the user's
  // visual brand context as standing input, not just per-view attachments.
  const projectVisualRefs = useProjectVisualReferences(effectiveProjectId);
  const projectVisualRefUrls = projectVisualRefs.inspirationUrls;

  // Calculate booth dimensions — for the ACTIVE footprint config (was
  // hardcoded to configs[0], i.e. always the largest size).
  const activeSpatialConfigData = spatialConfig.activeConfig;
  const boothDimensions = useMemo(() => {
    const footprintStr = (activeSpatialConfigData?.footprintSize as string | undefined) ||
      brief?.spatial?.footprints?.[spatialConfig.activeIndex]?.size ||
      brief?.spatial?.footprints?.[0]?.size ||
      "30x30";
    // Override the unit detected from the string with the project's
    // resolved measurement system. This handles the case where the brief
    // string didn't carry a unit marker (e.g. "30x30") but the user has
    // chosen metric — interpret as 30m × 30m.
    return calculateBoothDimensions(footprintStr, measurementSystem);
  }, [activeSpatialConfigData, spatialConfig.activeIndex, brief, measurementSystem]);

  // Normalize zones — for the ACTIVE footprint config.
  const normalizedZones = useMemo(() => {
    const zones = activeSpatialConfigData?.zones;
    if (!zones || !Array.isArray(zones)) return [];
    return normalizeZones(zones as any[], boothDimensions.totalSqft);
  }, [activeSpatialConfigData, boothDimensions.totalSqft]);

  // Build combined angle list: standard + zone interiors
  const zoneInteriorAngles = useMemo(() => {
    return getZoneInteriorAngles(normalizedZones);
  }, [normalizedZones]);

  const allAngles = useMemo(() => [...ANGLE_CONFIG, ...zoneInteriorAngles], [zoneInteriorAngles]);

  // ── Spatial canvas geometry ─────────────────────────────────────────
  // The interactive canvas edits a BoothGeometry (absolute units, real
  // heights). On first render we derive it from the legacy spatialData
  // (percentage-based zones); user edits flow into local state. We
  // capture floor-plan + iso PNGs from this geometry at generation time
  // and pass them to the image model as visual ground truth.
  // Derive features + materials catalog from spatialData. Same shape
  // SpatialPlanner uses; centralizing here would be the next refactor
  // when we extract a useBoothGeometry hook. For now, inline.
  const promptBoothFeatures = useMemo(() => {
    const raw = (spatialData as any)?.features ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [spatialData]);
  const promptMaterialsCatalog = useMemo(() => {
    const raw = ((spatialData as any)?.materialsAndMood ?? []) as Array<{
      id?: string;
      material?: string;
      name?: string;
      feel?: string;
      description?: string;
    }>;
    return raw.map((m, i) => ({
      id: m.id ?? `mat_${i}`,
      name: m.name ?? m.material ?? `Material ${i + 1}`,
      description: m.description ?? m.feel ?? "",
    }));
  }, [spatialData]);

  // ⚠️  KNOWN GAP — TASK 5/I3 FOLLOW-UP
  // ───────────────────────────────────────────────────────────────
  // Hanging elements drawn on the spatial canvas (SpatialPlanner)
  // land on `spatialData.hangingElements` and have x/y/width/depth/
  // thicknessFt/suspensionDropFt. Hanging elements authored on the
  // Brief Review card land on `parsedBrief.hangingElements` and have
  // name/physicalForm/materials/surfaces/lighting/printed.
  //
  // Neither flows into the renderer prompt unless they go through
  // `parsedBrief.hangingElements` — `composePrompt` reads from the
  // normalized brief, and the normalizer reads from
  // `parsedBrief.hangingElements` only. The geometry's hanging
  // elements are NOT plumbed into the extras bag below, so a user
  // who only adds elements on the spatial canvas will see them on
  // the top-down and iso but the prompt will not mention them.
  //
  // Next step: merge the two stores at this site (or earlier in the
  // pipeline). TODO — track as a future task (no follow-ups doc
  // exists yet for hanging-elements specifically; see
  // `docs/superpowers/plans/2026-05-15-hanging-elements.md` for the
  // overall feature plan).
  // ───────────────────────────────────────────────────────────────
  const initialGeometry = useMemo<BoothGeometry>(
    () =>
      boothGeometryFromLegacy(boothDimensions, normalizedZones, 12, {
        features: promptBoothFeatures,
        materialsCatalog: promptMaterialsCatalog,
      }),
    // Re-derive only when the legacy source changes — user edits to
    // the canvas live in `geometry` below and aren't overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      boothDimensions.width,
      boothDimensions.depth,
      normalizedZones.length,
      promptBoothFeatures,
      promptMaterialsCatalog,
    ],
  );
  const [geometry, setGeometry] = useState<BoothGeometry>(initialGeometry);

  // When the legacy source genuinely changes (e.g., user edits zones
  // upstream in SpatialPlanner or switches projects), reset our local
  // geometry. The dependency on a stable hash avoids loops from our own
  // `setGeometry` calls.
  useEffect(() => {
    setGeometry(initialGeometry);
  }, [initialGeometry]);

  // (Geometry edits now happen exclusively in the dedicated Spatial
  // step — the canvas and its write-through handler used to live here
  // too, but were removed once the editing surface moved upstream. The
  // Prompts step still reads the latest geometry via `geometry` /
  // `setGeometry` above, just no longer mutates it locally.)

  const geometryRefs = useGeometryReferences(effectiveProjectId);

  /**
   * Rasterise the current geometry to a floor-plan PNG and upload it
   * to render-references storage so the image model has a top-down
   * visual anchor for the hero render. The iso reference was dropped
   * with the spatial-canvas removal from this step — the textual zone
   * program in the composed prompt now carries the 3-D intent.
   * Returns the URL on success, {} on failure (image still renders,
   * just without geometry anchors). Cached by geometry hash so
   * consecutive calls are free.
   */
  const captureGeometryRefs = useCallback(async () => {
    if (!effectiveProjectId) return {};
    return geometryRefs.captureAndUpload(geometry, {
      captureFloorplan: async () => renderFloorPlanForExport(geometry),
      captureIsometric: async () => null,
    });
  }, [geometry, effectiveProjectId, geometryRefs]);

  // Structured booth dimensions for the edge function — preferred over
  // the legacy footprint label (which the old regex parser silently
  // failed to match for metric and prime-mark inputs).
  const structuredBoothDims = useMemo(
    () => ({
      width: boothDimensions.width,
      depth: boothDimensions.depth,
      sqft: boothDimensions.totalSqft,
      system: boothDimensions.measurementSystem,
      ceilingHeightFt: geometry.ceilingHeightFt,
    }),
    [boothDimensions, geometry.ceilingHeightFt],
  );

  // ── Structured design context — fuels the edge function's prompt
  //    sections (SCENE, STRUCTURAL APPROACH, HERO INSTALLATION, ZONE
  //    LAYOUT, BRAND IDENTITY, MATERIALS, LIGHTING). Before this was
  //    wired up, the edge function received `designContext: null` and
  //    every brief-specific structured section was skipped, leaving the
  //    model with only generic defaults at the top of the prompt and
  //    the brief data buried at the bottom in NARRATIVE CONTEXT.
  //
  //    Zone names here are FUNCTIONAL descriptors ("lounge / informal
  //    seating area"), not the AI-authored proper names ("The
  //    Sanctuary") — the proper names made the image model render
  //    overhead wayfinding signs on the booth fascia.
  const designContext = useMemo(
    () =>
      buildDesignContext({
        brief,
        elements,
        spatialData,
        geometry,
        totalSqft: boothDimensions.totalSqft,
      }),
    [brief, elements, spatialData, geometry, boothDimensions.totalSqft],
  );

  // Push the design context into the render store before generation so
  // generateHeroImage / generateAllViews / regenerateView pick it up.
  // The store reads it inside the async action and forwards it to the
  // edge function on the request body.
  //
  // CRITICAL: do NOT add `renderStore` to the dep array. `const
  // renderStore = useRenderStore()` is a whole-store subscription, so
  // its identity changes on every store update. Adding it to the deps
  // creates this loop:
  //   effect runs → setDesignContext → store update → renderStore
  //   identity changes → deps changed → effect re-fires → setDesignContext
  //   → ... (React #185, "Maximum update depth exceeded")
  // The other store-writing effects in this component follow the same
  // pattern (line 184 has the same eslint-disable for the same reason).
  useEffect(() => {
    renderStore.setDesignContext(designContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designContext]);

  // ── Phase 3 of refactor: normalized brief → composer pipeline ──
  // Replaces the edge-function-side structured-prompt builder. The
  // client now owns prompt composition end-to-end:
  //   1. normalizeBrief projects parsedBrief + geometry + elements into
  //      the canonical NormalizedBrief shape.
  //   2. validateBrief surfaces gaps + failures for the clarification UI.
  //   3. composePrompt produces the 5 output stages
  //      (briefJson, geometrySummary, renderer, negative, compliance).
  //   4. The renderer text + artifacts get forwarded via renderStore as
  //      composedPrompt; the edge function uses renderer verbatim and
  //      persists artifacts as heroSnapshot.
  const normalizedBrief = useMemo(() => {
    if (!brief || !currentProject) return null;
    try {
      return normalizeBrief({
        project: {
          id: currentProject.id,
          name: currentProject.name,
          projectType: currentProject.projectType ?? "exhibition_booth",
          // industrySlug feeds composePrompt's dispatch onto the
          // existing-space vs spatial-canvas renderer path. Prefer the
          // per-project value if a future schema carries one; fall
          // back to the agency-level primary_industry (same fallback
          // BriefReview uses).
          industrySlug: currentProject.industrySlug ?? projectIndustrySlug,
        },
        parsedBrief: brief,
        geometry,
        elements,
      });
    } catch (e) {
      // Defense-in-depth — the normalizer applies safeBrief internally,
      // but a try/catch here means even an unexpected exception from
      // composePrompt / validateBrief / a future change doesn't trip
      // the app-level error boundary. Logs for diagnosis; returns null
      // so downstream memos cleanly skip composition.
      console.warn("[PromptGenerator] normalizeBrief failed:", e);
      return null;
    }
  }, [brief, currentProject, geometry, elements, projectIndustrySlug]);

  const composerOutput = useMemo(() => {
    if (!normalizedBrief) return null;
    try {
      return composePrompt(normalizedBrief);
    } catch (e) {
      console.warn("[PromptGenerator] composePrompt failed:", e);
      return null;
    }
  }, [normalizedBrief]);

  const briefValidation = useMemo(() => {
    if (!normalizedBrief) return { failures: [], gaps: [] };
    try {
      return validateBrief(normalizedBrief);
    } catch (e) {
      console.warn("[PromptGenerator] validateBrief failed:", e);
      return { failures: [], gaps: [] };
    }
  }, [normalizedBrief]);

  // ── Hanging-element check gate ─────────────────────────────────────
  // Only projects whose brief carries hanging elements see the gate —
  // everything below is a no-op for floor-only booths. Approval is
  // scoped per config + hero image URL: refining/regenerating the hero
  // produces a new URL, so the new hero starts unapproved.
  const hangingElements = useMemo(
    () => normalizedBrief?.hanging.elements ?? [],
    [normalizedBrief],
  );
  const hangingKey = hangingApprovalKey(activeConfigKey, heroImage);
  const hangingApproved = !!renderStore.hangingApprovals[hangingKey];

  // Re-hydrate approval from the persisted flag on the hero's saved
  // row (prompt_artifacts.hangingApproved) so it survives reloads.
  useEffect(() => {
    if (!heroImage || hangingElements.length === 0) return;
    const row = savedImages.find((img) => img.public_url === heroImage);
    if (row?.prompt_artifacts?.hangingApproved === true) {
      const state = useRenderStore.getState();
      if (!state.hangingApprovals[hangingKey]) {
        state.setHangingApproval(hangingKey, true);
      }
    }
  }, [heroImage, savedImages, hangingElements.length, hangingKey]);

  // Build per-angle composed view prompts once the hero has rendered.
  // Each view is composed against the hero snapshot, so all views share
  // the same canonical design state instead of diverging from the brief
  // independently.
  const composedViewPrompts = useMemo(() => {
    if (!composerOutput || !normalizedBrief || !heroImage)
      return {} as Record<
        string,
        { renderer: string; negative: string; geometrySummary?: string; compliance?: unknown[] }
      >;
    const snapshot: HeroSnapshot = {
      composerOutput,
      normalizedBrief,
      imageUrl: heroImage,
      generatedAt: new Date().toISOString(),
    };
    const out: Record<
      string,
      { renderer: string; negative: string; geometrySummary?: string; compliance?: unknown[] }
    > = {};
    for (const angle of allAngles) {
      if (angle.id === "hero_34") continue;
      const viewAngle = mapAngleIdToViewAngle(angle.id);
      // Zone-interior angles encode the zoneId in their angle.id
      // ("zone_interior_<zoneId>"). Strip the prefix to pass to the
      // composer. Detail angles resolve their zone by keyword inside
      // the composer (or just render without zone focus).
      const zoneId = angle.id.startsWith("zone_interior_")
        ? angle.id.slice("zone_interior_".length)
        : undefined;
      try {
        const viewOut = composeViewPrompt(snapshot, viewAngle, { zoneId });
        out[angle.id] = {
          renderer: viewOut.renderer,
          negative: viewOut.negative,
          // Carried for the prompt-transparency artifacts only — the
          // edge function still receives just renderer + negative.
          geometrySummary: viewOut.geometrySummary,
          compliance: viewOut.compliance,
        };
      } catch (e) {
        // Defense-in-depth — a single bad angle shouldn't break the
        // whole map. The edge function will fall back to its legacy
        // builder for any angle missing from composedPrompts.
        console.warn(`[PromptGenerator] composeViewPrompt(${angle.id}) failed:`, e);
      }
    }
    return out;
  }, [composerOutput, normalizedBrief, heroImage, allAngles]);

  // Phase 4: clarification handlers for the safety-net mount on the
  // Prompts step. Most gaps get filled at the Brief Review step
  // (primary surface); this catches anything that emerged downstream
  // (e.g. hero designed in elements step but missing physicalForm,
  // new zone created without a structural form binding).
  const handleClarificationAnswer = useCallback(
    (field: string, value: unknown) => {
      if (!brief || !currentProject) return;
      try {
        applyGapAnswer(brief, field, value, (next) => {
          useProjectStore.getState().setParsedBrief(next);
        });
      } catch (e) {
        console.warn(`[PromptGenerator] applyGapAnswer(${field}) failed:`, e);
      }
    },
    [brief, currentProject],
  );
  const handleClarificationSkip = useCallback(
    (field: string) => {
      const gap = briefValidation.gaps.find((g) => g.field === field);
      if (gap && brief && currentProject) {
        try {
          applyGapAnswer(brief, field, gap.fallback, (next) => {
            useProjectStore.getState().setParsedBrief(next);
          });
        } catch (e) {
          console.warn(`[PromptGenerator] applyGapAnswer skip(${field}) failed:`, e);
        }
      }
    },
    [briefValidation.gaps, brief, currentProject],
  );

  // Hydrate from saved images (filtered to the active version).
  //
  // project_images keys by angle_id. When a version is active we save under
  // a suffixed id like "hero_34__v__abc"; the parser strips the suffix so
  // the runtime store still operates on base ids. Images belonging to other
  // versions (different suffix) are ignored here.
  const versionScopedImages = useMemo(() => {
    const versionId = promptVersions.activeVersionId;
    const active = promptVersions.activeVersion;
    // A version flagged claimsUnversioned (or the synthetic LEGACY_VERSION_ID)
    // matches images saved BEFORE versioning shipped — no __v__ suffix.
    const matchesLegacy =
      active?.claimsUnversioned === true || versionId === LEGACY_VERSION_ID;
    const all = savedImages.map((img) => {
      const { baseAngleId, versionId: imgVersionId, configKey: parsedConfigKey } =
        parseVersionedAngleId(img.angle_id);
      // The angle_id suffix is the primary config channel (survives even if
      // the prompt_artifacts column is missing in prod); artifacts are the
      // fallback for saves that carried tags but no suffix.
      const artifactConfigKey =
        typeof img.prompt_artifacts?.configKey === "string"
          ? img.prompt_artifacts.configKey
          : null;
      return { img, baseAngleId, imgVersionId, imgConfigKey: parsedConfigKey ?? artifactConfigKey };
    });
    // Config scoping first: an image belongs to the active booth size when
    // its config key matches, OR when it's untagged (legacy — everything
    // generated before multi-config support) and the active size is the
    // project's FIRST config (the largest — the size the old pipeline
    // always rendered). Projects without configs skip this filter entirely.
    const configScoped = all.filter(({ imgConfigKey }) => {
      if (!activeConfigKey) return true;
      if (imgConfigKey === activeConfigKey) return true;
      if (imgConfigKey === null && activeConfigKey === spatialConfig.defaultConfigKey) return true;
      return false;
    });
    const scoped = configScoped.filter(({ imgVersionId }) => {
      if (matchesLegacy) return imgVersionId === null;
      if (versionId) return imgVersionId === versionId;
      // No version active → fall back to legacy untagged.
      return imgVersionId === null;
    });
    // Fallback: if the active version has no saved images yet (fresh
    // version, or the user's earlier iterations were saved under a
    // different version id), show all saved images FOR THIS BOOTH SIZE so
    // previous iterations are still browseable from the Prompts page
    // instead of vanishing until a new hero is generated. Deliberately
    // never falls back across booth sizes — a 100x60 hero must not hydrate
    // into the 20x40 view.
    return scoped.length > 0 ? scoped : configScoped;
  }, [
    savedImages,
    promptVersions.activeVersionId,
    promptVersions.activeVersion,
    activeConfigKey,
    spatialConfig.defaultConfigKey,
  ]);

  useEffect(() => {
    if (
      versionScopedImages.length > 0 &&
      !heroImage &&
      phase === "prompt" &&
      !hydratedFromDb &&
      !isGeneratingHero &&
      !isGenerating
    ) {
      const savedHero = versionScopedImages.find(
        (x) => x.baseAngleId === "hero_34" && x.img.is_current,
      );
      if (savedHero) {
        renderStore.setHeroImage(savedHero.img.public_url);
        // Restore hero's model badge from the persisted artifacts so
        // the Canopy 2.0 / Canopy Lite chip survives a page reload.
        const heroArtifacts = savedHero.img.prompt_artifacts;
        if (heroArtifacts && typeof heroArtifacts.modelUsed === "string") {
          renderStore.setHeroModelUsed(heroArtifacts.modelUsed);
        }
        if (heroArtifacts && typeof heroArtifacts.primaryError === "string") {
          renderStore.setHeroPrimaryError(heroArtifacts.primaryError);
        }
        versionScopedImages
          .filter((x) => x.baseAngleId === "hero_34")
          .forEach((x) => renderStore.addHeroIteration(x.img.public_url));

        const restoredImages: Record<string, {
          url: string;
          status: "complete";
          modelUsed?: string;
          primaryError?: string;
        }> = {};
        versionScopedImages
          .filter((x) => x.img.is_current)
          .forEach((x) => {
            const artifacts = x.img.prompt_artifacts;
            restoredImages[x.baseAngleId] = {
              url: x.img.public_url,
              status: "complete",
              modelUsed:
                artifacts && typeof artifacts.modelUsed === "string"
                  ? artifacts.modelUsed
                  : undefined,
              primaryError:
                artifacts && typeof artifacts.primaryError === "string"
                  ? artifacts.primaryError
                  : undefined,
            };
          });
        renderStore.setGeneratedImages(restoredImages);

        const hasOtherViews = versionScopedImages.some(
          (x) => x.baseAngleId !== "hero_34" && x.img.is_current,
        );
        renderStore.setPhase(hasOtherViews ? "all-views" : "hero-review");
        renderStore.setHydratedFromDb(true);
      }
    }
  }, [versionScopedImages, heroImage, phase, hydratedFromDb, isGeneratingHero, isGenerating]);

  // Track the active version id in a ref so doSave (which is called from
  // inside renderStore generators) always reads the current value, even when
  // a version is created mid-generation.
  const activeVersionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeVersionIdRef.current = promptVersions.activeVersionId;
  }, [promptVersions.activeVersionId]);

  // Auto-create a default "Balanced" version the first time the user
  // generates anything if no version exists yet. Returns the version id.
  const ensureActiveVersion = useCallback((): string => {
    if (activeVersionIdRef.current) return activeVersionIdRef.current;
    const meta = promptVersions.createVersion({
      preset: "balanced",
      label: `Balanced — ${new Date().toLocaleDateString()}`,
    });
    activeVersionIdRef.current = meta.id;
    return meta.id;
  }, [promptVersions]);

  // makeSaveHandler builds the onSave callback renderStore calls when a
  // render finishes. We rewrite the angle id to include the active version's
  // suffix AND the footprint config's suffix so storage stays partitioned
  // per version per booth size — UNLESS the active version claims
  // unversioned (legacy) renders, in which case we save without any suffix
  // so it stays attached to the same legacy bucket (legacy renders belong
  // to configs[0] by definition).
  //
  // It's a factory (rather than a single doSave) because "Generate all
  // sizes" needs a save handler bound to EACH config while it loops — the
  // config captured at generation start is the config the render belongs
  // to, even if the user flips chips mid-flight.
  const makeSaveHandler = useCallback(
    (configKey: string | null, configLabel: string | null) =>
      (
        angleId: string,
        angleName: string,
        imageDataUrl: string,
        // modelUsed + primaryError ride along so save-render-image can
        // persist them in project_images.prompt_artifacts. That's what
        // makes the Canopy 2.0 / Canopy Lite badge (and its hover-
        // tooltip with the gpt-image-2 failure reason) survive page
        // reload — without persistence the badge vanishes the first
        // time the user navigates away. promptArtifacts carries the
        // prompt-transparency payload (exact prompt, negative,
        // geometry, references, timestamp) built in renderStore.
        meta?: { modelUsed?: string; primaryError?: string; promptArtifacts?: Record<string, unknown> },
      ) => {
        const versionId = ensureActiveVersion();
        const active = promptVersions.activeVersion;
        const isLegacyVersion =
          active?.claimsUnversioned === true || versionId === LEGACY_VERSION_ID;
        // Legacy versions keep the bare angle id (their contract is "no
        // suffix at all"); everything else gets version + config suffixes.
        const versioned = isLegacyVersion ? angleId : makeVersionedAngleId(angleId, versionId);
        const finalAngleId =
          !isLegacyVersion && configKey ? makeConfigScopedAngleId(versioned, configKey) : versioned;
        saveImage.mutate(
          {
            angleId: finalAngleId,
            angleName,
            imageDataUrl,
            modelUsed: meta?.modelUsed,
            primaryError: meta?.primaryError,
            promptArtifacts: meta?.promptArtifacts,
            // Config tags always ride along (even for legacy versions) —
            // they land in prompt_artifacts and prefix the storage
            // filename so Files/gallery can organize renders per size.
            configKey: configKey ?? undefined,
            configLabel: configLabel ?? undefined,
          },
          {
            onSuccess: () => {
              promptVersions.touchActiveVersion();
            },
            onError: (err) => console.error(`Failed to save ${angleName}:`, err),
          },
        );
      },
    [saveImage, promptVersions, ensureActiveVersion],
  );

  // Default save handler — bound to the currently active booth size.
  const doSave = useMemo(
    () => makeSaveHandler(activeConfigKey, activeConfigLabel),
    [makeSaveHandler, activeConfigKey, activeConfigLabel],
  );

  /** Prompt builder params — shared across all generatePrompt calls.
   *  Built unconditionally so hook order downstream stays stable even
   *  when brief/spatial/bigIdea aren't ready yet. */
  const promptParams: GeneratePromptParams = {
    brief: brief!,
    bigIdea: bigIdea!,
    elements: elements!,
    spatialData: spatialData!,
    boothDimensions,
    normalizedZones,
    zoneInteriorAngles,
    projectType: currentProject?.projectType ?? null,
    brandIntelligence: approvedBrandIntel,
  };

  // (The previous `getZoneDefaultPrompt` helper, which fed the
  // SpatialCanvas's per-zone "default prompt" dialog, was removed
  // along with the canvas embed. Zone-interior generation still uses
  // `generatePrompt` directly via `promptParams` further below.)

  // ─── ADDITIONAL HOOKS HOISTED ABOVE EARLY-RETURN ──────────────────
  // Same reason: React requires identical hook count between the
  // loading-pass render (where the early-return below fires) and
  // the loaded-pass render. Anything below this block must NOT call
  // a hook.

  // Orphaned-versions detection — reads promptVersions + savedImages.
  // No dependency on brief/spatialData/bigIdea, safe on loading pass.
  const alreadyHasLegacyVersion = useMemo(
    () => promptVersions.versions.some((v) => v.claimsUnversioned === true),
    [promptVersions.versions],
  );
  const orphanedVersions = useMemo(() => {
    if (!effectiveProjectId) return [];
    return findOrphanedVersions({
      savedImages,
      knownVersionIds: promptVersions.versions.map((v) => v.id),
      includeLegacy: !alreadyHasLegacyVersion,
    });
  }, [effectiveProjectId, savedImages, promptVersions.versions, alreadyHasLegacyVersion]);

  // Map sanitized config key → human label, from the project's configs.
  // Used to label gallery filter chips and per-render size badges when
  // the saved artifacts didn't carry a configLabel.
  const configKeyLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cfg of spatialConfig.configs) {
      if (cfg?.footprintSize) {
        map.set(sanitizeConfigKey(String(cfg.footprintSize)), String(cfg.footprintSize));
      }
    }
    return map;
  }, [spatialConfig.configs]);

  // Every saved image annotated with its booth-size tag (angle_id suffix
  // first, prompt_artifacts fallback). Drives the gallery's size filter
  // chips + per-card badges. No brief/spatial deps → safe on loading pass.
  const taggedSavedImages = useMemo(
    () =>
      savedImages.map((img) => {
        const { configKey: parsedKey } = parseVersionedAngleId(img.angle_id);
        const artifactKey =
          typeof img.prompt_artifacts?.configKey === "string"
            ? img.prompt_artifacts.configKey
            : null;
        const cfgKey = parsedKey ?? artifactKey;
        const artifactLabel =
          typeof img.prompt_artifacts?.configLabel === "string"
            ? img.prompt_artifacts.configLabel
            : null;
        const cfgLabel = artifactLabel ?? (cfgKey ? configKeyLabelMap.get(cfgKey) ?? cfgKey : null);
        return { img, cfgKey, cfgLabel };
      }),
    [savedImages, configKeyLabelMap],
  );

  // Size filter chips for the gallery: distinct config keys present among
  // saved images (project-config order first), plus an untagged bucket.
  const gallerySizeChips = useMemo(() => {
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const { cfgKey } of taggedSavedImages) {
      if (cfgKey) counts.set(cfgKey, (counts.get(cfgKey) ?? 0) + 1);
      else untagged += 1;
    }
    const ordered: Array<{ key: string; label: string; count: number }> = [];
    // Project-config order first (largest → smallest as authored)…
    for (const [key, label] of configKeyLabelMap) {
      if (counts.has(key)) {
        ordered.push({ key, label, count: counts.get(key)! });
        counts.delete(key);
      }
    }
    // …then any keys from configs that no longer exist on the project.
    for (const [key, count] of counts) {
      ordered.push({ key, label: configKeyLabelMap.get(key) ?? key, count });
    }
    if (untagged > 0) {
      ordered.push({ key: "__untagged__", label: "Earlier renders", count: untagged });
    }
    return ordered;
  }, [taggedSavedImages, configKeyLabelMap]);

  const galleryFilteredImages = useMemo(() => {
    if (gallerySizeFilter === "all") return taggedSavedImages;
    if (gallerySizeFilter === "__untagged__")
      return taggedSavedImages.filter((t) => t.cfgKey === null);
    return taggedSavedImages.filter((t) => t.cfgKey === gallerySizeFilter);
  }, [taggedSavedImages, gallerySizeFilter]);

  // Brief-readiness jump handler — pure navigation, no brief deps.
  const handleReadinessJump = useCallback(
    (gap: CheckResult) => {
      const step = gap.jumpTo?.step;
      switch (step) {
        case "brief":
          navigate("/upload");
          break;
        case "review":
          navigate("/review");
          break;
        case "elements":
          navigate("/generate");
          break;
        case "spatial":
        case "materials":
          navigate("/spatial");
          break;
        case "prompts":
          break;
        default:
          break;
      }
    },
    [navigate],
  );

  if (!brief || !spatialData || !bigIdea) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Generate all elements first</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/generate")}>
          Go to Generation
        </Button>
      </div>
    );
  }

  /**
   * Local wrapper that closes over current project data + active style
   * preset. For zone-interior angles, checks if the zone has a
   * `customPromptOverride` set via the SpatialCanvas — if so, returns
   * the override verbatim (no style preset wrap; user wrote it as-is).
   */
  const buildPrompt = (angleId: string): string => {
    // Per-zone override path — user-edited prompts take precedence over
    // system-generated content. Scope: zone-interior renders only.
    if (angleId.startsWith("zone_interior_")) {
      const zoneId = angleId.slice("zone_interior_".length);
      const zone = geometry.zones.find((z) => z.id === zoneId);
      if (zone?.customPromptOverride) {
        return zone.customPromptOverride;
      }
    }
    const base = generatePrompt(angleId, promptParams);
    return applyStylePresetToPrompt(base, activePreset, activeCustomEmphasis);
  };

  // Compose the hero prompt without kicking off image generation. Lets
  // the user review (and optionally edit) the exact text the model will
  // see before paying for a render. The prompt is the same one
  // `handleGenerateHeroImage` would use, so the two-step flow always
  // matches what the one-shot button used to do.
  const handleComposeHeroPrompt = () => {
    const prompt = composerOutput?.renderer || buildPrompt("hero_34");
    renderStore.setHeroPrompt(prompt);
    toast({
      title: "Hero prompt ready",
      description: "Review or edit the prompt, then click Generate Hero Image.",
    });
  };

  // Commit an edited hero prompt and trigger a fresh render with it.
  // The override sticks via renderStore.setHeroPrompt, so subsequent
  // renders (and the PromptInspector's "Edited" badge) reflect the
  // user's text until they hit Reset.
  const handleSaveHeroPromptAndRerender = async (edited: string) => {
    renderStore.setHeroPrompt(edited);
    await handleGenerateHeroImage();
  };

  // Drop the user's hero-prompt override and recompose from current
  // brief/spatial/brand state. Doesn't auto-render — the user gets
  // the fresh prompt and decides whether to click Generate.
  const handleResetHeroPrompt = () => {
    const fresh = composerOutput?.renderer || buildPrompt("hero_34");
    renderStore.setHeroPrompt(fresh);
  };

  // Same pattern for an individual view: commit edited text into
  // generatedPrompts[angleId] and re-run regeneration so the new
  // image uses the override. handleRegenerateView already reads
  // from generatedPrompts so no further plumbing needed.
  const handleSaveViewPromptAndRerender = async (
    angleId: string,
    edited: string,
  ) => {
    renderStore.setGeneratedPrompts({
      ...generatedPrompts,
      [angleId]: edited,
    });
    await handleRegenerateView(angleId);
  };

  const handleResetViewPrompt = (angleId: string) => {
    const fresh = buildPrompt(angleId);
    renderStore.setGeneratedPrompts({
      ...generatedPrompts,
      [angleId]: fresh,
    });
  };

  /**
   * For the interior-design / existing-space-photo pipeline (Task 6 of
   * the Industries v2 + Interior Design feature) every render call
   * needs:
   *   - the photo URL (becomes the ONLY OpenAI reference image)
   *   - an optional alpha-mask PNG rasterized from the user's "change"
   *     polygons (constrains gpt-image-2's edits)
   *
   * Returns `{ existingSpacePhotoUrl: undefined, maskDataUrl: null }`
   * for spatial-canvas projects so call sites can spread this into
   * the store action params unconditionally — the store and the edge
   * functions both treat undefined/null as "skip this path".
   *
   * Mask rasterization is async (HTMLImageElement.load + canvas draw)
   * so callers must await this before invoking the store action.
   */
  const buildExistingSpaceParams = useCallback(async (): Promise<{
    existingSpacePhotoUrl: string | undefined;
    maskDataUrl: string | null;
  }> => {
    const existingSpace = brief?.existingSpace;
    if (!existingSpace?.photoUrl) {
      return { existingSpacePhotoUrl: undefined, maskDataUrl: null };
    }
    let maskDataUrl: string | null = null;
    try {
      maskDataUrl = await rasterizePolygonMask(
        existingSpace.photoUrl,
        existingSpace.annotations?.change ?? [],
      );
    } catch (e) {
      // Mask rasterization failing should never block the render —
      // worst case the model edits the whole photo per the prompt,
      // which is the correct fallback for a full-room redesign.
      console.warn("[PromptGenerator] Mask rasterization failed; rendering without mask:", e);
      maskDataUrl = null;
    }
    return { existingSpacePhotoUrl: existingSpace.photoUrl, maskDataUrl };
  }, [brief?.existingSpace]);

  const handleGenerateHeroImage = async () => {
    const prompt = heroPrompt || buildPrompt("hero_34");
    if (!heroPrompt) renderStore.setHeroPrompt(prompt);

    // Pull both per-hero file attachments and project-wide visual
    // references (inspiration images + brand assets) so the model has
    // every visual context it can use on the very first generation.
    const heroExtraRefs = renderRefs.urlsForAngle("hero_34");
    const visualRefUrls = projectVisualRefUrls;
    const combinedRefs = [...heroExtraRefs, ...visualRefUrls].filter(
      (url, idx, arr) => url && arr.indexOf(url) === idx,
    );

    // Capture + upload the floor plan and isometric reference PNGs
    // BEFORE kicking off generation. These are the visual scale anchors
    // the image model uses; without them the model regresses to its
    // training-data mean for "trade show booth" regardless of stated
    // dimensions.
    const geomRefs = await captureGeometryRefs();

    // Interior-design / existing-space-photo path (Task 6): when the
    // brief carries a photo, compute the alpha mask from the user's
    // "change" polygons and forward both to the store. For spatial-
    // canvas projects these come back undefined/null and the store
    // and edge function fall through to the normal spatial path.
    const existingSpaceParams = await buildExistingSpaceParams();

    try {
      await renderStore.generateHeroImage({
        // Phase 3: forward the pre-composed renderer + artifacts. Edge
        // function uses renderer verbatim and persists artifacts as
        // heroSnapshot so view renders can derive from it.
        composedPrompt: composerOutput
          ? {
              renderer: composerOutput.renderer,
              negative: composerOutput.negative,
              artifacts: composerOutput,
            }
          : undefined,
        prompt,
        feedback: heroFeedback || undefined,
        previousImageUrl: heroImage || undefined,
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        boothDimensions: structuredBoothDims,
        geometryReferences: geomRefs,
        projectType: currentProject?.projectType ?? null,
        brandIntelligence: approvedBrandIntel,
        brandContext: ragBrandContext || undefined,
        suiteContext: ragSuiteContext || undefined,
        brandLogoUrl,
        imageModel: activeImageModel,
        extraReferenceUrls: combinedRefs.length > 0 ? combinedRefs : undefined,
        ...existingSpaceParams,
        onSave: doSave,
      });

      // Clear the hero's per-attachment list on success; keep the project
      // visual references — those are passive context, not consumables.
      renderRefs.clear("hero_34");

      toast({
        title: "Hero image generated",
        description: heroExtraRefs.length > 0
          ? `Used ${heroExtraRefs.length} attached reference${heroExtraRefs.length === 1 ? "" : "s"} + ${visualRefUrls.length} project visual${visualRefUrls.length === 1 ? "" : "s"}.`
          : "Review the image and provide feedback or proceed to generate all views",
      });
    } catch (error) {
      console.error("Error generating hero:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateWithFeedback = async () => {
    if (!heroFeedback.trim()) {
      toast({
        title: "Feedback required",
        description: "Please enter feedback to refine the image",
        variant: "destructive",
      });
      return;
    }
    await handleGenerateHeroImage();
  };

  // ── Hanging-element gate handlers ──────────────────────────────────

  /**
   * Approve the hanging element for the CURRENT config + hero version.
   * Store flag flips immediately; persistence lands on the hero's saved
   * project_images row (prompt_artifacts.hangingApproved) so the
   * approval survives page reloads. RLS allows the update — the row is
   * owned by the current user.
   */
  const handleApproveHanging = async () => {
    renderStore.setHangingApproval(hangingKey, true);
    const row = savedImages.find((img) => img.public_url === heroImage);
    if (row) {
      try {
        const { error } = await supabase
          .from("project_images")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ prompt_artifacts: { ...(row.prompt_artifacts ?? {}), hangingApproved: true } } as any)
          .eq("id", row.id);
        if (error) {
          console.warn("[PromptGenerator] hangingApproved persist failed:", error.message);
        } else {
          queryClient.invalidateQueries({ queryKey: ["project-images", effectiveProjectId] });
        }
      } catch (e) {
        console.warn("[PromptGenerator] hangingApproved persist threw:", e);
      }
    }
    toast({
      title: "Hanging element approved",
      description: "Views generated from this hero will inherit it.",
    });
  };

  /**
   * Refine the hanging element in isolation. Calls generate-hero's EDIT
   * MODE (previousImageUrl + feedback, deliberately NO composedPrompt —
   * that branch takes priority and would regenerate from scratch). The
   * instruction locks booth/environment/lighting/camera and scopes the
   * change to the suspended element per the user's feedback + the
   * canonical spec. The result saves as a NEW hero version in the same
   * config's stack; iterating refine → refine always uses the latest.
   */
  const handleRefineHanging = async (feedbackText: string) => {
    if (!heroImage || !projectId) return;
    const instruction = buildHangingEditInstruction(
      hangingElements,
      feedbackText,
      boothDimensions.measurementSystem,
    );
    try {
      await renderStore.generateHeroImage({
        prompt: instruction,
        feedback: instruction,
        // Keep the conversation thread readable — show the user's own
        // words, not the machine-built edit instruction.
        threadMessage: `Refine hanging element: ${feedbackText}`,
        previousImageUrl: heroImage,
        projectId,
        boothSize: boothDimensions.footprintLabel,
        boothDimensions: structuredBoothDims,
        projectType: currentProject?.projectType ?? null,
        brandLogoUrl,
        imageModel: activeImageModel,
        onSave: doSave,
      });
      toast({
        title: "Hanging element refined",
        description: "Saved as a new hero version — approve it, refine again, or flip back in the conversation thread.",
      });
    } catch (error) {
      console.error("Error refining hanging element:", error);
      toast({
        title: "Refinement failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  /**
   * Persist a creative-direction edit (from the check panel) back into
   * parsed_brief.hangingElements[index] — same field the Review step's
   * hanging card authors, same saveProjectField write path.
   */
  const handleHangingCreativeDirection = (index: number, text: string) => {
    if (!brief) return;
    const list = Array.isArray(brief.hangingElements) ? brief.hangingElements : [];
    if (!list[index]) return;
    const trimmed = text.trim();
    const updated = {
      ...brief,
      hangingElements: list.map((el, i) =>
        i === index
          ? { ...el, creativeDirection: trimmed.length > 0 ? trimmed : undefined }
          : el,
      ),
    };
    useProjectStore.getState().setParsedBrief(updated);
    if (effectiveProjectId) {
      void saveProjectField(effectiveProjectId, "parsed_brief", updated);
    }
  };

  const handleGenerateAllViews = async () => {
    // Hanging gate: generating views while the hanging element is
    // unapproved is allowed, but warn once — every view inherits the
    // hero's hanging element.
    if (hangingElements.length > 0 && !hangingApproved) {
      toast({
        title: "Hanging element not approved",
        description:
          "All views will inherit the hanging element from the current hero. You can refine it on the hero first.",
      });
    }

    const prompts: Record<string, string> = {};
    allAngles.forEach(angle => {
      if (angle.id !== "hero_34") {
        prompts[angle.id] = buildPrompt(angle.id);
      }
    });

    // Capture geometry refs once and reuse across every view. The cache
    // in useGeometryReferences makes this effectively free if geometry
    // hasn't changed since the hero render.
    const geomRefs = await captureGeometryRefs();

    // Interior-design path: compute mask once and reuse across every
    // view (the user's "change" polygons don't vary per camera angle).
    const existingSpaceParams = await buildExistingSpaceParams();

    renderStore.generateAllViews({
      angles: allAngles,
      prompts,
      // Phase 3: per-angle composed renderer prompts derived from the
      // heroSnapshot. Each view reads from the same canonical hero
      // design state, so materials/palette/architecture stay locked
      // across all views.
      composedPrompts: composedViewPrompts,
      heroImageUrl: heroImage!,
      // Thread the hero prompt text through to every view. The model
      // gets both the hero pixels (palette/materials anchor) and the
      // original design intent that produced them — so a side / back /
      // interior / detail view can reason about both "what does this
      // booth look like" and "what was it designed to be."
      heroPromptText: heroPrompt || buildPrompt("hero_34"),
      projectId: projectId!,
      boothSize: boothDimensions.footprintLabel,
      boothDimensions: structuredBoothDims,
      geometryReferences: geomRefs,
      brandIntelligence: approvedBrandIntel,
      brandContext: ragBrandContext || undefined,
      suiteContext: ragSuiteContext || undefined,
      brandLogoUrl,
      imageModel: activeImageModel,
      // Project-wide visual references — applied on every view so the
      // model has consistent brand/material/mood context across angles.
      extraReferenceUrls: projectVisualRefUrls.length > 0 ? projectVisualRefUrls : undefined,
      ...existingSpaceParams,
      onSave: doSave,
    }).then(() => {
      toast({
        title: "All views generated!",
        description: projectVisualRefUrls.length > 0
          ? `Used ${projectVisualRefUrls.length} project visual reference${projectVisualRefUrls.length === 1 ? "" : "s"} on every view.`
          : "Your coordinated booth renders are ready",
      });
    });
  };

  const handleRegenerateView = async (angleId: string) => {
    const angle = allAngles.find(a => a.id === angleId);
    if (!angle || !heroImage) return;

    // Collect any user-attached references for this specific angle so the
    // model has them on this regeneration. Cleared after success.
    // Combine with project-wide visual references (deduped) so brand
    // context is always present even on a single-view regen.
    const angleAttachments = renderRefs.urlsForAngle(angleId);
    const extraReferenceUrls = [...angleAttachments, ...projectVisualRefUrls].filter(
      (url, idx, arr) => url && arr.indexOf(url) === idx,
    );

    const geomRefs = await captureGeometryRefs();
    const existingSpaceParams = await buildExistingSpaceParams();

    try {
      await renderStore.regenerateView({
        angle: { id: angle.id, name: angle.name, aspectRatio: angle.aspectRatio, isZoneInterior: !!(angle as any).isZoneInterior },
        prompt: generatedPrompts[angleId] || buildPrompt(angleId),
        // Phase 3: composed view prompt for this specific angle.
        composedPrompt: composedViewPrompts[angleId],
        heroImageUrl: heroImage,
        heroPromptText: heroPrompt || buildPrompt("hero_34"),
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        boothDimensions: structuredBoothDims,
        geometryReferences: geomRefs,
        brandIntelligence: approvedBrandIntel,
        brandContext: ragBrandContext || undefined,
        suiteContext: ragSuiteContext || undefined,
        brandLogoUrl,
        imageModel: activeImageModel,
        extraReferenceUrls: extraReferenceUrls.length > 0 ? extraReferenceUrls : undefined,
        ...existingSpaceParams,
        onSave: doSave,
      });

      // Clear pending refs for this angle on success.
      renderRefs.clear(angleId);

      toast({
        title: `${angle.name} regenerated`,
        description: extraReferenceUrls.length > 0
          ? `New view with ${extraReferenceUrls.length} attached reference${extraReferenceUrls.length === 1 ? "" : "s"}.`
          : "New view generated successfully",
      });
    } catch (error) {
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  /** Regenerate ALL views including hero */
  const handleRegenerateAll = async () => {
    // First regenerate the hero image
    const heroPromptText = heroPrompt || buildPrompt("hero_34");
    if (!heroPrompt) renderStore.setHeroPrompt(heroPromptText);

    try {
      toast({
        title: "Regenerating all renders",
        description: "Starting with hero image, then all views...",
      });

      // Capture geometry refs once for the whole regen-all sweep.
      const geomRefs = await captureGeometryRefs();
      // Interior-design path: mask is the same for every render in
      // this sweep — compute once.
      const existingSpaceParams = await buildExistingSpaceParams();

      // Generate new hero
      await renderStore.generateHeroImage({
        composedPrompt: composerOutput
          ? {
              renderer: composerOutput.renderer,
              negative: composerOutput.negative,
              artifacts: composerOutput,
            }
          : undefined,
        prompt: heroPromptText,
        feedback: undefined, // Fresh generation
        previousImageUrl: undefined, // Don't use previous as reference
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        boothDimensions: structuredBoothDims,
        geometryReferences: geomRefs,
        brandIntelligence: approvedBrandIntel,
        brandContext: ragBrandContext || undefined,
        suiteContext: ragSuiteContext || undefined,
        brandLogoUrl,
        imageModel: activeImageModel,
        extraReferenceUrls: projectVisualRefUrls.length > 0 ? projectVisualRefUrls : undefined,
        ...existingSpaceParams,
        onSave: doSave,
      });

      // Small delay to ensure hero is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now generate all other views using the new hero
      const prompts: Record<string, string> = {};
      allAngles.forEach(angle => {
        if (angle.id !== "hero_34") {
          prompts[angle.id] = buildPrompt(angle.id);
        }
      });

      const newHeroImage = renderStore.heroImage;
      if (!newHeroImage) {
        throw new Error("Hero image generation failed");
      }

      await renderStore.generateAllViews({
        angles: allAngles,
        prompts,
        // Phase 3: composed view prompts derived from the new hero's
        // snapshot. The composedViewPrompts memo recomputes when
        // heroImage updates, so by this point it reflects the new hero.
        composedPrompts: composedViewPrompts,
        heroImageUrl: newHeroImage,
        // Reuse the same hero prompt we just used to regenerate the
        // hero — guarantees the views' "ORIGINAL HERO DESIGN INTENT"
        // matches the actual pixels we're handing them as reference.
        heroPromptText: heroPromptText,
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        boothDimensions: structuredBoothDims,
        geometryReferences: geomRefs,
        brandIntelligence: approvedBrandIntel,
        brandContext: ragBrandContext || undefined,
        suiteContext: ragSuiteContext || undefined,
        brandLogoUrl,
        imageModel: activeImageModel,
        extraReferenceUrls: projectVisualRefUrls.length > 0 ? projectVisualRefUrls : undefined,
        ...existingSpaceParams,
        onSave: doSave,
      });

      toast({
        title: "All renders regenerated!",
        description: "Fresh set of coordinated booth views ready",
      });
    } catch (error) {
      console.error("Error regenerating all:", error);
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  // ── "Generate all sizes" batch flow ─────────────────────────────────
  // Queues ONE hero generation per footprint config, strictly
  // sequentially (never parallel — the image gateway already shows
  // rate-limit symptoms at low concurrency). Each run recomputes the
  // full prompt pipeline (dimensions → zones → geometry → floor-plan
  // reference → composed prompt) for ITS config and saves under that
  // config's key, reusing the exact same generateHeroImage machinery
  // (including its error unwrapping and the save-side retry).
  const isBatchRunning = !!batchRuns?.some(
    (r) => r.status === "pending" || r.status === "generating",
  );

  const runBatchAllSizes = async () => {
    const configs = spatialConfig.configs;
    if (configs.length <= 1 || !projectId) return;
    setShowBatchConfirm(false);
    setBatchRuns(
      configs.map((cfg, i) => ({
        key: cfg.footprintSize ? sanitizeConfigKey(String(cfg.footprintSize)) : `config-${i}`,
        label: String(cfg.footprintSize ?? `Config ${i + 1}`),
        status: "pending" as const,
      })),
    );
    const setRunStatus = (
      index: number,
      status: "pending" | "generating" | "done" | "error",
      error?: string,
    ) =>
      setBatchRuns((prev) =>
        prev ? prev.map((r, i) => (i === index ? { ...r, status, error } : r)) : prev,
      );

    // Interior-design mask is per-project, not per-size — compute once.
    const existingSpaceParams = await buildExistingSpaceParams();

    let succeeded = 0;
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!;
      setRunStatus(i, "generating");
      try {
        // Recompute the prompt pipeline for THIS config — the page-level
        // memos (boothDimensions, normalizedZones, composerOutput, …) are
        // bound to the ACTIVE config only.
        const dims = calculateBoothDimensions(
          String(cfg.footprintSize ?? "30x30"),
          measurementSystem,
        );
        const zones = Array.isArray(cfg.zones)
          ? normalizeZones(cfg.zones as any[], dims.totalSqft)
          : [];
        const geom = boothGeometryFromLegacy(dims, zones, 12, {
          features: promptBoothFeatures,
          materialsCatalog: promptMaterialsCatalog,
        });
        let cfgComposer: ReturnType<typeof composePrompt> | null = null;
        try {
          const nb = normalizeBrief({
            project: {
              id: currentProject!.id,
              name: currentProject!.name,
              projectType: currentProject!.projectType ?? "exhibition_booth",
              industrySlug: currentProject!.industrySlug ?? projectIndustrySlug,
            },
            parsedBrief: brief,
            geometry: geom,
            elements,
          });
          cfgComposer = composePrompt(nb);
        } catch (e) {
          console.warn(
            `[PromptGenerator] batch composePrompt failed for ${cfg.footprintSize}:`,
            e,
          );
        }
        const cfgPromptParams: GeneratePromptParams = {
          ...promptParams,
          boothDimensions: dims,
          normalizedZones: zones,
          zoneInteriorAngles: getZoneInteriorAngles(zones),
        };
        const promptText =
          cfgComposer?.renderer ||
          applyStylePresetToPrompt(
            generatePrompt("hero_34", cfgPromptParams),
            activePreset,
            activeCustomEmphasis,
          );
        // Floor-plan reference for THIS config's geometry — the visual
        // scale anchor. Cached by geometry hash inside the hook.
        const geomRefs = await geometryRefs.captureAndUpload(geom, {
          captureFloorplan: async () => renderFloorPlanForExport(geom),
          captureIsometric: async () => null,
        });
        const cfgKey = cfg.footprintSize ? sanitizeConfigKey(String(cfg.footprintSize)) : null;
        const cfgLabel = cfg.footprintSize ? String(cfg.footprintSize) : null;

        await renderStore.generateHeroImage({
          composedPrompt: cfgComposer
            ? {
                renderer: cfgComposer.renderer,
                negative: cfgComposer.negative,
                artifacts: cfgComposer,
              }
            : undefined,
          prompt: promptText,
          projectId,
          boothSize: dims.footprintLabel,
          boothDimensions: {
            width: dims.width,
            depth: dims.depth,
            sqft: dims.totalSqft,
            system: dims.measurementSystem,
            ceilingHeightFt: geom.ceilingHeightFt,
          },
          geometryReferences: geomRefs,
          projectType: currentProject?.projectType ?? null,
          brandIntelligence: approvedBrandIntel,
          brandContext: ragBrandContext || undefined,
          suiteContext: ragSuiteContext || undefined,
          brandLogoUrl,
          imageModel: activeImageModel,
          extraReferenceUrls: projectVisualRefUrls.length > 0 ? projectVisualRefUrls : undefined,
          ...existingSpaceParams,
          // Save under THIS config's key — not whatever chip happens to
          // be active by the time the render lands.
          onSave: makeSaveHandler(cfgKey, cfgLabel),
        });
        succeeded += 1;
        setRunStatus(i, "done");
      } catch (e) {
        console.error(`[PromptGenerator] batch hero failed for ${cfg.footprintSize}:`, e);
        setRunStatus(i, "error", e instanceof Error ? e.message : "Generation failed");
      }
    }

    // The loop leaves the LAST size's hero in the render store — reset so
    // the page re-hydrates the ACTIVE size's hero from the saved images.
    renderStore.setHydratedFromDb(false);
    renderStore.setHeroImage(null);
    renderStore.setGeneratedImages({});
    renderStore.setHeroPrompt("");
    renderStore.setPhase("prompt");

    toast({
      title: succeeded === configs.length ? "All sizes generated" : "Batch finished with errors",
      description: `${succeeded} of ${configs.length} hero renders completed. Switch size chips to review each one.`,
      variant: succeeded === configs.length ? undefined : "destructive",
    });
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleContinue = () => {
    setActiveStep("export");
    navigate("/export");
  };

  const completedCount = Object.values(generatedImages).filter(img => img.status === "complete").length;
  const totalViews = allAngles.length;

  // alreadyHasLegacyVersion + orphanedVersions are hoisted above the
  // early-return at the top of the component (React #310).

  const handleRecoverOrphan = (
    versionId: string,
    imageCount: number,
    latestImageAt: string | null,
    isLegacy: boolean,
  ) => {
    const created = latestImageAt ?? new Date().toISOString();
    const recoveredMeta: PromptVersionMeta = {
      id: versionId,
      preset: "balanced",
      label: isLegacy
        ? `Original — ${new Date(created).toLocaleDateString()}`
        : `Recovered — ${new Date(created).toLocaleDateString()}`,
      createdAt: created,
      updatedAt: new Date().toISOString(),
      notes: isLegacy
        ? `Renders from before prompt versions existed (${imageCount} render${imageCount === 1 ? "" : "s"}).`
        : `Restored from ${imageCount} saved render${imageCount === 1 ? "" : "s"}.`,
      ...(isLegacy ? { claimsUnversioned: true } : {}),
    };
    promptVersions.insertVersion(recoveredMeta);
    promptVersions.selectVersion(versionId);
  };

  // (The spatial canvas used to live here as well, mirrored from the
  // Spatial step. It was removed once the dedicated Spatial step shipped
  // — the zone program and sq-ft data still flow into the prompt via
  // composePrompt + the floorplan PNG anchor captured by
  // captureGeometryRefs(), so the model receives the full layout
  // without duplicating the editing surface on this page.)

  // Versions header — shown above every phase. Lets the user switch between
  // saved versions (each with its own preset + render set) or spin up a new
  // one. Generation handlers auto-create "Balanced" on first use.
  const versionsHeader = effectiveProjectId ? (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
      {/* Booth-size selector — same chips as the Spatial step, driving the
        * same persisted selection. Hidden for single-config projects. */}
      <ConfigSizeChips
        configs={spatialConfig.configs}
        activeIndex={spatialConfig.activeIndex}
        onSelect={spatialConfig.setActiveIndex}
        disabled={isGeneratingHero || isGenerating || isBatchRunning}
      />

      {/* "Generate all sizes" confirmation. Mounted here (the header is
        * rendered on every phase) so the dialogs survive phase flips
        * during the batch run. */}
      <Dialog open={showBatchConfirm} onOpenChange={setShowBatchConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate hero renders for all sizes?</DialogTitle>
            <DialogDescription>
              This will run {spatialConfig.configs.length} generations (
              {spatialConfig.configs.length} sizes × 1 hero view each), one size at a
              time to avoid rate limits. You can then switch size chips to review each
              hero and generate its remaining views.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {spatialConfig.configs.map((cfg, i) => (
              <Badge key={`${cfg.footprintSize ?? "config"}-${i}`} variant="secondary">
                {String(cfg.footprintSize ?? `Config ${i + 1}`)}
              </Badge>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={runBatchAllSizes}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate {spatialConfig.configs.length} heroes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-config batch progress. */}
      <Dialog
        open={!!batchRuns}
        onOpenChange={(open) => {
          if (!open && !isBatchRunning) setBatchRuns(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Generating all sizes</DialogTitle>
            <DialogDescription>
              {isBatchRunning
                ? "Running one size at a time — keep this tab open."
                : "Batch finished. Switch size chips to review each hero."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {batchRuns?.map((run) => (
              <div
                key={run.key}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{run.label}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  {run.status === "pending" && (
                    <span className="text-muted-foreground">Waiting…</span>
                  )}
                  {run.status === "generating" && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-primary">Generating…</span>
                    </>
                  )}
                  {run.status === "done" && (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span>Done</span>
                    </>
                  )}
                  {run.status === "error" && (
                    <>
                      <X className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-destructive" title={run.error}>
                        Failed
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchRuns(null)}
              disabled={isBatchRunning}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PromptVersionTabs
        versions={promptVersions.versions}
        activeVersionId={promptVersions.activeVersionId}
        onSelectVersion={promptVersions.selectVersion}
        onCreateVersion={promptVersions.createVersion}
        onUpdateVersion={promptVersions.updateVersion}
        onDeleteVersion={promptVersions.deleteVersion}
        disabled={isGeneratingHero || isGenerating}
      />

      {orphanedVersions.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-amber-600">
            Found {orphanedVersions.length} unattached render set{orphanedVersions.length === 1 ? "" : "s"}
          </div>
          <p className="text-xs text-muted-foreground">
            Saved renders that aren't tied to any current version chip — most often this is your earlier
            work from before prompt versions existed. Click to bring them back as a switchable version.
          </p>
          <div className="flex flex-wrap gap-2">
            {orphanedVersions.map((orph) => (
              <button
                key={orph.versionId}
                type="button"
                onClick={() =>
                  handleRecoverOrphan(
                    orph.versionId,
                    orph.imageCount,
                    orph.latestImageAt,
                    orph.isLegacy === true,
                  )
                }
                className="text-xs rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 transition-colors"
              >
                {orph.isLegacy ? "Restore original" : "Recover"}
                {" — "}
                {orph.imageCount} render{orph.imageCount === 1 ? "" : "s"}
                {orph.latestImageAt && (
                  <span className="ml-1.5 text-amber-600/70">
                    · {new Date(orph.latestImageAt).toLocaleDateString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  // Phase 1: Generate Hero Image
  if (phase === "prompt" || phase === "hero-generation") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {versionsHeader}

        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Generate Booth Renders</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Generating renders for {boothDimensions.footprintLabel} ({boothDimensions.totalAreaNative} {boothDimensions.measurementSystem === "metric" ? "sqm" : "sqft"}) booth with {normalizedZones.length} zones
          </p>
        </div>

        {/* Booth Info Card */}
        <Card className="element-card bg-muted/30">
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{boothDimensions.footprintLabel}</div>
                <div className="text-xs text-muted-foreground">Dimensions</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{boothDimensions.totalAreaNative}</div>
                <div className="text-xs text-muted-foreground">
                  {boothDimensions.measurementSystem === "metric" ? "Square Meters" : "Square Feet"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{normalizedZones.length}</div>
                <div className="text-xs text-muted-foreground">Zones</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pre-flight check — collapsible "what's the AI about to see"
          * panel. Surfaces brand, brief, spatial, dimensions, logo, and
          * visual references with one-click edit links so the user can
          * fix anything before kicking off the hero generation. */}
        <PreflightChecklist
          projectId={effectiveProjectId}
          brief={brief}
          elements={elements}
          boothDimensions={boothDimensions}
          brandLogo={brandLogo ?? null}
          visualReferences={projectVisualRefs.selected.filter((r) => r.role !== "brand-logo")}
          clientId={clientId}
          clientBrandColors={clientBrandColors}
        />

        {/* Step 1: Generate Hero */}
        <Card className="element-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
                  Generate 3/4 Hero View
                </CardTitle>
                <CardDescription>
                  Click to generate the primary hero image for your booth
                </CardDescription>
              </div>
              <Badge variant="secondary">16:9</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reference attachments for the hero generation. Same per-angle
             * scratchpad as the standard views — uploads land in project KB
             * tagged "render-reference" and pass through as
             * extraReferenceUrls on the next hero gen. */}
            <AttachReference
              angleId="hero_34"
              refs={renderRefs.byAngle["hero_34"] ?? []}
              onAttach={renderRefs.attach}
              onRemove={renderRefs.remove}
              disabled={isGeneratingHero}
            />

            {briefValidation.gaps.length > 0 && (
              <BriefClarification
                gaps={briefValidation.gaps}
                onAnswer={handleClarificationAnswer}
                onSkip={handleClarificationSkip}
              />
            )}

            {/* Two-step flow:
             *   1. "Generate Hero Prompt" composes and shows the prompt
             *      without spending a render call. PromptInspector below
             *      lets the user review, copy, or edit before rendering.
             *   2. Once a prompt exists, the primary action becomes
             *      "Generate Hero Image" and a "Re-compose" link sits
             *      alongside for the user to drop edits and pull a
             *      fresh prompt from the current brief state.
             * The composed-stages debug panel stays available as
             * supplementary context for what the composer produced. */}
            {!heroPrompt ? (
              <Button
                onClick={handleComposeHeroPrompt}
                variant="generative"
                className="w-full"
                disabled={isGeneratingHero}
              >
                <span className="mr-2" aria-hidden="true">✦</span>
                Generate Hero Prompt
              </Button>
            ) : (
              <div className="space-y-3">
                <PromptInspector
                  prompt={heroPrompt}
                  defaultPrompt={composerOutput?.renderer || buildPrompt("hero_34")}
                  onSaveAndRerender={handleSaveHeroPromptAndRerender}
                  onReset={handleResetHeroPrompt}
                  disabled={isGeneratingHero}
                  label="Hero prompt"
                  defaultOpen
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleGenerateHeroImage}
                    variant="generative"
                    className="flex-1"
                    disabled={isGeneratingHero}
                  >
                    {isGeneratingHero ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Hero Image...
                      </>
                    ) : (
                      <>
                        <span className="mr-2" aria-hidden="true">✦</span>
                        Generate Hero Image
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleComposeHeroPrompt}
                    disabled={isGeneratingHero}
                    title="Discard the current prompt and recompose from the latest brief / spatial state"
                  >
                    Re-compose
                  </Button>
                </div>
              </div>
            )}

            {/* Batch alternative to the single-size Generate above: queue a
              * hero render for EVERY footprint config, sequentially. Only
              * shown for multi-config projects. */}
            {spatialConfig.configs.length > 1 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowBatchConfirm(true)}
                disabled={isGeneratingHero || isBatchRunning}
              >
                <Layers className="mr-2 h-4 w-4" />
                Generate all sizes ({spatialConfig.configs.length})
              </Button>
            )}

            <PromptDebugPanel output={composerOutput} />

            {isGeneratingHero && (
              <p className="text-xs text-muted-foreground text-center">
                This may take 30-60 seconds...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 2: Review Hero & Provide Feedback
  if (phase === "hero-review") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {versionsHeader}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Review Hero Image</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Review the generated {boothDimensions.footprintLabel} booth. Provide feedback to refine it, or approve to generate all views.
          </p>
        </div>

        <Card className="element-card border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                3/4 Hero View
              </CardTitle>
              <Badge className="bg-primary/20 text-primary">Generated</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              className="block w-full rounded-lg overflow-hidden border bg-muted cursor-zoom-in transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={(e) => {
                // Stop propagation so the click can't be interpreted
                // by Radix Dialog's outside-click detector if the
                // lightbox happens to be in the middle of opening.
                e.stopPropagation();
                lightbox.open(heroImage!, "Generated Hero", "Hero render");
              }}
              title="Click to view full size"
            >
              <img
                src={heroImage!}
                alt="Generated Hero"
                className="w-full h-auto"
              />
            </button>

            {/* "Which engine produced this image" — Canopy 2.0 vs Canopy
              * Lite. Tiny inline chip so the user can tell at a glance
              * which model rendered the hero. Hidden when modelUsed is
              * unknown (older renders pre-dating the badge). */}
            {heroModelUsed && (
              <div className="flex justify-end -mt-1">
                <ModelBadge model={heroModelUsed} primaryError={renderStore.heroPrimaryError} />
              </div>
            )}

            {/* The exact prompt that produced the visible hero — always
              * accessible for review, copy (take to another model), or
              * edit + re-render. The chat input below is for
              * natural-language refinements; this is for full prompt
              * control when the user wants the literal text. */}
            {heroPrompt && (
              <PromptInspector
                prompt={heroPrompt}
                defaultPrompt={composerOutput?.renderer || buildPrompt("hero_34")}
                onSaveAndRerender={handleSaveHeroPromptAndRerender}
                onReset={handleResetHeroPrompt}
                disabled={isGeneratingHero}
                label="Prompt used for this hero"
              />
            )}

            {/* ── Hero refinement thread ───────────────────────────
               ChatGPT-style iteration: each render appends a turn,
               user types refinements, each turn's thumbnail is
               clickable to branch off that point. */}
            {heroThread.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Conversation</span>
                  <span className="text-xs text-muted-foreground">
                    {heroThread.length} {heroThread.length === 1 ? "turn" : "turns"}
                  </span>
                </div>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {heroThread.map((turn, idx) => (
                    <div key={`${turn.generatedAt}-${idx}`} className="flex gap-3 items-start">
                      <button
                        onClick={() => renderStore.setHeroImage(turn.imageUrl)}
                        className={cn(
                          "flex-shrink-0 w-20 h-14 rounded border overflow-hidden transition-all",
                          heroImage === turn.imageUrl
                            ? "ring-2 ring-primary"
                            : "opacity-70 hover:opacity-100",
                        )}
                        title="Click to set this as the current hero"
                      >
                        <img
                          src={turn.imageUrl}
                          alt={`Turn ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        {turn.userMessage ? (
                          <p className="text-sm text-foreground leading-snug">
                            <span className="font-medium text-muted-foreground mr-1">You:</span>
                            {turn.userMessage}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic leading-snug">
                            Initial generation
                          </p>
                        )}
                        {heroImage === turn.imageUrl && idx === heroThread.length - 1 && (
                          <span className="text-xs text-primary mt-0.5 inline-block">
                            current
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Chat-style refinement input ───────────────────── */}
            <div className="space-y-3 pt-4 border-t">
              <Textarea
                value={heroFeedback}
                onChange={(e) => renderStore.setHeroFeedback(e.target.value)}
                onKeyDown={(e) => {
                  // ⌘/Ctrl+Enter sends; plain Enter inserts newline so
                  // multi-line refinements stay possible. Matches the
                  // pattern most chat UIs settle on.
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    !isGeneratingHero &&
                    heroFeedback.trim().length > 0
                  ) {
                    e.preventDefault();
                    handleRegenerateWithFeedback();
                  }
                }}
                placeholder={
                  heroThread.length === 0
                    ? "Refinement instructions appear here once the hero is generated…"
                    : "Type a refinement and press ⌘+Enter — e.g. 'make the canopy curvier', 'add more LED line work', 'simpler — too busy'"
                }
                className="min-h-[80px]"
                disabled={heroThread.length === 0 || isGeneratingHero}
              />
              <div className="flex gap-3">
                <Button
                  onClick={handleRegenerateWithFeedback}
                  disabled={isGeneratingHero || !heroFeedback.trim() || heroThread.length === 0}
                  className="flex-1"
                >
                  {isGeneratingHero ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refining…
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send refinement
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    renderStore.setHeroFeedback("");
                    handleGenerateHeroImage();
                  }}
                  disabled={isGeneratingHero}
                  title="Generate from scratch (no refinement)"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => downloadImage(heroImage!, "hero_view")}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                onClick={handleGenerateAllViews}
                className="flex-1 btn-glow"
                disabled={isGeneratingHero}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Approve & Generate All Views
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Hanging-element check gate — only for briefs that carry
          * hanging elements. Spec next to the render, hero-first
          * approve/refine before fanning out to the other views. */}
        {hangingElements.length > 0 && (
          <HangingElementCheck
            elements={hangingElements}
            units={boothDimensions.measurementSystem}
            approved={hangingApproved}
            disabled={isGeneratingHero}
            refining={isGeneratingHero}
            onApprove={handleApproveHanging}
            onRefine={handleRefineHanging}
            onCreativeDirectionChange={handleHangingCreativeDirection}
          />
        )}
      </div>
    );
  }

  // handleReadinessJump hoisted above the early-return at the top of
  // the component (React #310). The duplicate that lived here was the
  // bug.
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {versionsHeader}
      {/* Brief readiness pre-flight. Surfaces a score + top gaps so
          the user fixes thin briefs BEFORE spending tokens on a
          generic render. Click any gap to jump to the surface that
          owns it. */}
      <BriefReadinessPanel
        inputs={{
          brief,
          bigIdea,
          elements,
          spatialData,
          boothDimensions,
        }}
        onJump={handleReadinessJump}
      />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Generated Renders</h2>
          <p className="text-muted-foreground">
            {isGenerating 
              ? `Generating views... ${completedCount} of ${totalViews} complete`
              : `${completedCount} coordinated renders for ${boothDimensions.footprintLabel} booth`
            }
          </p>
        </div>
        <div className="flex gap-3">
          {spatialConfig.configs.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBatchConfirm(true)}
              disabled={isGenerating || isGeneratingHero || isBatchRunning}
            >
              <Layers className="mr-2 h-4 w-4" />
              Generate all sizes
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerateAll}
            disabled={isGenerating || isGeneratingHero}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate All
          </Button>
          <Dialog open={showGallery} onOpenChange={setShowGallery}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="mr-2 h-4 w-4" />
                All Images ({savedImages.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Project Image Gallery</DialogTitle>
              </DialogHeader>
              {/* Size filter — driven by the configKey tags on each saved
                * render. Only shown when there's more than one bucket. */}
              {gallerySizeChips.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setGallerySizeFilter("all")}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      gallerySizeFilter === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    All sizes
                    <span className="ml-1.5 opacity-70">{savedImages.length}</span>
                  </button>
                  {gallerySizeChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setGallerySizeFilter(chip.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                        gallerySizeFilter === chip.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                      )}
                    >
                      {chip.label}
                      <span className="ml-1.5 opacity-70">{chip.count}</span>
                    </button>
                  ))}
                </div>
              )}
              <ScrollArea className="h-[60vh] pr-4">
                {galleryFilteredImages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No images saved yet.</p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(
                      galleryFilteredImages.reduce((acc, tagged) => {
                        const key = tagged.img.angle_name;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(tagged);
                        return acc;
                      }, {} as Record<string, typeof galleryFilteredImages>)
                    ).map(([angleName, images]) => (
                      <div key={angleName}>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-semibold">{angleName}</h4>
                          <Badge variant="secondary" className="text-xs">{images.length} version{images.length > 1 ? "s" : ""}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {images.map(({ img, cfgLabel }) => (
                            <div key={img.id} className="group relative rounded-lg overflow-hidden border bg-muted">
                              <button
                                type="button"
                                className="block w-full cursor-zoom-in focus:outline-none"
                                onClick={() =>
                                  lightbox.open(
                                    img.public_url,
                                    img.angle_name,
                                    img.angle_name,
                                  )
                                }
                                title="Click to view full size"
                              >
                                <img
                                  src={img.public_url}
                                  alt={img.angle_name}
                                  className="w-full aspect-video object-cover"
                                />
                              </button>
                              {cfgLabel && (
                                <Badge className="absolute top-2 left-2 bg-black/60 text-white border-0 text-[10px]">
                                  {cfgLabel}
                                </Badge>
                              )}
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="pointer-events-auto"
                                  onClick={() =>
                                    lightbox.open(
                                      img.public_url,
                                      img.angle_name,
                                      img.angle_name,
                                    )
                                  }
                                >
                                  <Maximize2 className="h-3 w-3 mr-1" />
                                  Expand
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="pointer-events-auto"
                                  onClick={() => downloadImage(img.public_url, img.angle_name)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="pointer-events-auto"
                                  onClick={() => setPromptDialogImage(img)}
                                  title="View the exact prompt that produced this render"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Prompt
                                </Button>
                              </div>
                              {img.is_current && (
                                <Badge className="absolute bottom-2 right-2 bg-primary/80 text-xs">Current</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Button onClick={handleContinue} className="btn-glow" disabled={isGenerating}>
            Export Package
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {isGenerating && (
        <Card className="element-card border-primary/30">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Generating {currentlyGenerating && allAngles.find(a => a.id === currentlyGenerating)?.name}...
                </span>
                <span className="text-muted-foreground">{Math.round(generationProgress)}%</span>
              </div>
              <Progress value={generationProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference Image */}
      <Card className="element-card border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Style Reference (3/4 Hero View)
            <Badge className="bg-primary/20 text-primary ml-2">Source</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-[400px,1fr] gap-4">
            <button
              type="button"
              className="block rounded-lg overflow-hidden border cursor-zoom-in transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
              onClick={() =>
                lightbox.open(heroImage!, "Style reference", "Style reference (3/4 hero)")
              }
              title="Click to view full size"
            >
              <img
                src={heroImage!}
                alt="Reference"
                className="w-full h-auto object-contain"
              />
            </button>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Booth Specifications</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Size:</span> {boothDimensions.footprintLabel}
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Area:</span> {boothDimensions.totalAreaNative} {boothDimensions.measurementSystem === "metric" ? "sqm" : "sqft"}
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Type:</span> {boothDimensions.scaleDescription}
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Zones:</span> {normalizedZones.length}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Zone Allocation</h4>
                <div className="space-y-1">
                  {normalizedZones.slice(0, 5).map((zone) => (
                    <div key={zone.id} className="flex items-center justify-between text-xs">
                      <span>{zone.name}</span>
                      <span className="text-muted-foreground">{zone.percentage}% ({zone.sqft} sqft)</span>
                    </div>
                  ))}
                  {normalizedZones.length > 5 && (
                    <div className="text-xs text-muted-foreground">+{normalizedZones.length - 5} more zones</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standard Views */}
      <h3 className="text-lg font-semibold">Standard Views</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ANGLE_CONFIG.filter(a => a.id !== "hero_34").map((angle) => {
          const imageData = generatedImages[angle.id];
          const prompt = generatedPrompts[angle.id] || "";
          
          return (
            <Card key={angle.id} className={cn(
              "prompt-card overflow-hidden transition-all",
              imageData?.status === "generating" && "ring-2 ring-primary/50",
              imageData?.status === "complete" && "ring-1 ring-primary/20"
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Camera className="h-4 w-4 text-primary" />
                      {angle.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {angle.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {angle.aspectRatio}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className={cn(
                  "aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center",
                  imageData?.status === "generating" && "animate-pulse"
                )}>
                  {/* No data at all — view never generated for this version. */}
                  {!imageData && (
                    <div className="text-center text-muted-foreground">
                      <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs mb-2">Not generated yet</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRegenerateView(angle.id)}
                        disabled={currentlyGenerating === angle.id || !heroImage}
                      >
                        <RefreshCw className="h-3 w-3 mr-1.5" />
                        Generate this view
                      </Button>
                    </div>
                  )}
                  {imageData?.status === "pending" && (
                    <div className="text-center text-muted-foreground">
                      <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Waiting...</p>
                    </div>
                  )}
                  {imageData?.status === "generating" && (
                    <div className="text-center text-primary">
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Generating...</p>
                    </div>
                  )}
                  {imageData?.status === "complete" && imageData.url && (
                    <button
                      type="button"
                      className="w-full h-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary block"
                      onClick={() =>
                        lightbox.open(imageData.url!, angle.name, angle.name)
                      }
                      title="Click to view full size"
                    >
                      <img
                        src={imageData.url}
                        alt={angle.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}
                  {imageData?.status === "error" && (
                    <div className="text-center text-destructive">
                      <X className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-xs">{imageData.error || "Failed"}</p>
                    </div>
                  )}
                </div>

                {/* Engine badge — same Canopy 2.0 / Canopy Lite chip
                  * as the hero, scoped to this view's render. */}
                {imageData?.status === "complete" && imageData.modelUsed && (
                  <div className="flex justify-end -mt-1">
                    <ModelBadge model={imageData.modelUsed} primaryError={imageData.primaryError} />
                  </div>
                )}

                {/* Always-accessible prompt: review, edit + re-render,
                  * copy to another model, or reset to default. Hidden
                  * until the angle has a prompt to show (no image
                  * generated yet = no prompt yet). */}
                {prompt && (
                  <PromptInspector
                    prompt={prompt}
                    defaultPrompt={buildPrompt(angle.id)}
                    onSaveAndRerender={(edited) =>
                      handleSaveViewPromptAndRerender(angle.id, edited)
                    }
                    onReset={() => handleResetViewPrompt(angle.id)}
                    disabled={currentlyGenerating === angle.id}
                  />
                )}

                <div className="flex gap-2">
                  {imageData?.status === "complete" && imageData.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadImage(imageData.url, angle.name)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                  {/* Retry / regen — show whenever we have a known status that
                   * could've failed silently OR explicitly failed. Includes
                   * "no data at all" (undefined) so missing views get a path
                   * back to generation. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRegenerateView(angle.id)}
                    disabled={
                      currentlyGenerating === angle.id ||
                      imageData?.status === "generating" ||
                      !heroImage
                    }
                    title={!heroImage ? "Generate the hero view first" : "Regenerate this view"}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>

                {/* Attach a reference image for the next regeneration of
                  * this view. Useful when the model needs help with a
                  * specific material, finish, or signage detail. */}
                <AttachReference
                  angleId={angle.id}
                  refs={renderRefs.byAngle[angle.id] ?? []}
                  onAttach={renderRefs.attach}
                  onRemove={renderRefs.remove}
                  disabled={currentlyGenerating === angle.id}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Zone Interior Views */}
      {zoneInteriorAngles.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-6">Zone Interior Views</h3>
          <p className="text-sm text-muted-foreground -mt-4">
            Interior perspectives of each zone, featuring content strategy items
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zoneInteriorAngles.map((angle: any) => {
              const imageData = generatedImages[angle.id];
              const prompt = generatedPrompts[angle.id] || "";
              
              return (
                <Card key={angle.id} className={cn(
                  "prompt-card overflow-hidden transition-all border-primary/10",
                  imageData?.status === "generating" && "ring-2 ring-primary/50",
                  imageData?.status === "complete" && "ring-1 ring-primary/20"
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          {angle.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {angle.zoneData?.sqft} sqft • {angle.zoneData?.percentage}% of booth
                        </p>
                      </div>
                      <Badge className="bg-primary/10 text-primary text-xs">Interior</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className={cn(
                      "aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center",
                      imageData?.status === "generating" && "animate-pulse"
                    )}>
                      {(!imageData || imageData?.status === "pending") && (
                        <div className="text-center text-muted-foreground">
                          <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Waiting...</p>
                        </div>
                      )}
                      {imageData?.status === "generating" && (
                        <div className="text-center text-primary">
                          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                          <p className="text-xs">Generating...</p>
                        </div>
                      )}
                      {imageData?.status === "complete" && imageData.url && (
                        <button
                          type="button"
                          className="w-full h-full cursor-zoom-in focus:outline-none"
                          onClick={() =>
                            lightbox.open(imageData.url!, angle.name, angle.name)
                          }
                          title="Click to view full size"
                        >
                          <img
                            src={imageData.url}
                            alt={angle.name}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                      {imageData?.status === "error" && (
                        <div className="text-center text-destructive">
                          <X className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-xs">{imageData.error || "Failed"}</p>
                        </div>
                      )}
                    </div>

                    {/* Engine badge for this zone interior. */}
                    {imageData?.status === "complete" && imageData.modelUsed && (
                      <div className="flex justify-end -mt-1">
                        <ModelBadge model={imageData.modelUsed} primaryError={imageData.primaryError} />
                      </div>
                    )}

                    {/* Always-accessible prompt for this zone interior:
                      * review, edit + re-render, copy to another model,
                      * or reset to the auto-composed default. Same UX
                      * as the standard view cards above. */}
                    {prompt && (
                      <PromptInspector
                        prompt={prompt}
                        defaultPrompt={buildPrompt(angle.id)}
                        onSaveAndRerender={(edited) =>
                          handleSaveViewPromptAndRerender(angle.id, edited)
                        }
                        onReset={() => handleResetViewPrompt(angle.id)}
                        disabled={currentlyGenerating === angle.id}
                      />
                    )}

                    <div className="flex gap-2">
                      {imageData?.status === "complete" && imageData.url && (
                        <Button variant="outline" size="sm" onClick={() => downloadImage(imageData.url, angle.name)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      {(imageData?.status === "error" || imageData?.status === "complete") && (
                        <Button variant="outline" size="sm" onClick={() => handleRegenerateView(angle.id)} disabled={currentlyGenerating === angle.id}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <AttachReference
                      angleId={angle.id}
                      refs={renderRefs.byAngle[angle.id] ?? []}
                      onAttach={renderRefs.attach}
                      onRemove={renderRefs.remove}
                      disabled={currentlyGenerating === angle.id}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Click-to-expand lightbox for any generated render. Mounted
          once at the page level; consumed by every <img onClick={…}>
          via the lightbox.open() helper. */}
      <ImageLightbox {...lightbox.props} />

      {/* "View prompt" dialog — shows the stored prompt_artifacts for
          any saved render clicked from the gallery. */}
      <RenderPromptDialog
        image={promptDialogImage}
        onClose={() => setPromptDialogImage(null)}
      />
    </div>
  );
}
