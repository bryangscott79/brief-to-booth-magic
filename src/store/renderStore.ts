import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import type { DesignContext } from "@/lib/designContextBuilder";
import { unwrapInvokeError } from "@/lib/supabaseInvokeError";

export interface GeneratedImage {
  url: string;
  status: "pending" | "generating" | "complete" | "error";
  error?: string;
  /**
   * Canonical model id that produced the image (e.g.
   * "openai/gpt-image-2", "google/gemini-3-pro-image-preview"). Set
   * from the edge function response so the UI can show a "Canopy 2.0"
   * or "Canopy Lite" badge under each render. Undefined for legacy
   * renders saved before the badge existed.
   */
  modelUsed?: string;
  /**
   * When the render fell back to Canopy Lite, the gpt-image-2 error
   * chain that caused it. Surfaced on hover in the UI so the user
   * can see WHY the primary model didn't run for this render.
   */
  primaryError?: string;
}

/**
 * One turn in the hero refinement thread. Each call to
 * generateHeroImage appends a turn. The first turn (initial
 * generation) has `userMessage: null`; subsequent turns carry the
 * refinement instruction the user typed.
 *
 * The thread lets the user iterate ChatGPT-style: type → render →
 * type → render. Each turn can be clicked to set `heroImage` back to
 * that turn's url — branching off any point in the thread.
 */
export interface HeroTurn {
  /** The refinement instruction for this turn. null on the initial generation. */
  userMessage: string | null;
  /** Resulting image URL after this turn's generation. */
  imageUrl: string;
  /** ISO timestamp of when this turn completed. */
  generatedAt: string;
}

export type WorkflowPhase = "prompt" | "hero-generation" | "hero-review" | "all-views";

interface RenderState {
  // Keyed by projectId so switching projects works
  projectId: string | null;
  phase: WorkflowPhase;
  heroPrompt: string;
  heroImage: string | null;
  /**
   * Canonical model id that produced the current heroImage (e.g.
   * "openai/gpt-image-2", "google/gemini-3-pro-image-preview"). Powers
   * the "Canopy 2.0" / "Canopy Lite" badge under the hero. Set from
   * the edge function response on each successful generation; null
   * when no render exists yet OR when an older render predates the
   * badge.
   */
  heroModelUsed: string | null;
  /**
   * When the hero fell back to Canopy Lite, the gpt-image-2 error
   * chain that caused it. Surfaced on hover in the UI.
   */
  heroPrimaryError: string | null;
  heroFeedback: string;
  heroIterations: string[];
  /**
   * Conversation thread for hero refinement. Each successful hero
   * render appends a turn. The latest turn's imageUrl matches
   * heroImage. Users can click an earlier turn to branch off it
   * (sets heroImage back to that turn's url). The first turn has
   * userMessage: null (initial generation); subsequent turns carry
   * the refinement instruction.
   */
  heroThread: HeroTurn[];
  generatedPrompts: Record<string, string>;
  generatedImages: Record<string, GeneratedImage>;
  isGeneratingHero: boolean;
  isGenerating: boolean;
  generationProgress: number;
  currentlyGenerating: string | null;
  hydratedFromDb: boolean;
  /** Phase 4E: Track generation versions for cascade regeneration */
  heroVersion: number;
  viewVersions: Record<string, number>;
  /**
   * Phase 4: Design context — the typed structured payload built by
   * `buildDesignContext()` and forwarded to both generate-hero and
   * generate-view edge functions. Each section of the markdown prompts
   * (SCENE, STRUCTURAL APPROACH, ZONE LAYOUT, MATERIALS, etc.) reads
   * off this object, so populating it pushes brief-driven design data
   * to the top of the prompt where image-model attention is highest.
   */
  designContext: DesignContext | null;
  consistencyTokens: Record<string, unknown> | null;
}

interface RenderActions {
  setProjectId: (id: string | null) => void;
  setPhase: (phase: WorkflowPhase) => void;
  setHeroPrompt: (prompt: string) => void;
  setHeroImage: (url: string | null) => void;
  /** Set the model id badge shown under the hero (Canopy 2.0 / Canopy Lite). */
  setHeroModelUsed: (model: string | null) => void;
  /** Set the gpt-image-2 failure reason shown in the hero badge tooltip. */
  setHeroPrimaryError: (msg: string | null) => void;
  setHeroFeedback: (feedback: string) => void;
  addHeroIteration: (url: string) => void;
  /**
   * Append a turn to the hero refinement thread. Called from inside
   * generateHeroImage after a successful render. Users can also call
   * directly when seeding a thread from saved images (e.g. on
   * project rehydration).
   */
  appendHeroTurn: (turn: HeroTurn) => void;
  /**
   * Replace the entire thread (used on project switch / hydration).
   */
  setHeroThread: (thread: HeroTurn[]) => void;
  setGeneratedPrompts: (prompts: Record<string, string>) => void;
  setGeneratedImage: (angleId: string, image: GeneratedImage) => void;
  setGeneratedImages: (images: Record<string, GeneratedImage>) => void;
  setIsGeneratingHero: (v: boolean) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationProgress: (v: number) => void;
  setCurrentlyGenerating: (id: string | null) => void;
  setHydratedFromDb: (v: boolean) => void;
  resetForProject: (projectId: string | null) => void;

  // Async generation actions
  generateHeroImage: (params: {
    /**
     * NEW (Phase 3): pre-composed renderer prompt + artifacts from the
     * client's composePrompt(normalizedBrief). When present, the edge
     * function uses the renderer text verbatim and persists artifacts
     * as heroSnapshot for downstream view composition. The legacy
     * `prompt` field is still required for backward compat.
     */
    composedPrompt?: {
      renderer: string;
      negative: string;
      artifacts: import("@/lib/normalizedBrief").ComposerOutput;
    };
    prompt: string;
    feedback?: string;
    previousImageUrl?: string;
    projectId: string;
    boothSize?: string;
    /** Structured booth dimensions — preferred over boothSize. */
    boothDimensions?: {
      width: number;
      depth: number;
      sqft: number;
      system: "imperial" | "metric";
      ceilingHeightFt?: number;
    };
    /** Geometry reference image URLs (floor plan + iso) — visual ground truth. */
    geometryReferences?: { floorplan?: string; isometric?: string };
    projectType?: string | null;
    brandIntelligence?: Array<{ category: string; title: string; content: string; tags?: string[] | null }>;
    brandContext?: string;
    suiteContext?: string;
    /** Public URL of the brand logo — passed to the image model as a reference. */
    brandLogoUrl?: string;
    /** Optional one-off references attached at regen time. */
    extraReferenceUrls?: string[];
    /** Which image model to use. Default "gemini". Set to "openai" for gpt-image-2. */
    imageModel?: "gemini" | "openai";
    /**
     * Interior-design / existing-space-photo path: when present, the
     * edge function uses THIS as the only reference image for gpt-
     * image-2's /v1/images/edits and ignores the spatial-canvas
     * reference list. Combined with maskDataUrl below to constrain
     * which regions of the photo get edited.
     */
    existingSpacePhotoUrl?: string;
    /**
     * Optional alpha-mask PNG data URL (transparent = editable,
     * opaque = preserved) for the existing-space path. Pass null
     * when the user has no change polygons — the whole photo is
     * editable per the prompt.
     */
    maskDataUrl?: string | null;
    onSave: (angleId: string, angleName: string, imageDataUrl: string, meta?: { modelUsed?: string; primaryError?: string }) => void;
  }) => Promise<void>;

  generateAllViews: (params: {
    angles: Array<{ id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }>;
    prompts: Record<string, string>;
    /**
     * Per-angle composed prompts. Keys are angle ids; values come from
     * composeViewPrompt(heroSnapshot, angle). When present, the edge
     * function uses each renderer verbatim. Falls back to legacy
     * builder per-angle for any missing key.
     */
    composedPrompts?: Record<string, { renderer: string; negative: string }>;
    heroImageUrl: string;
    /**
     * Original hero prompt text — the full prompt that produced the hero
     * image. Threaded through to every view so the model sees both the
     * hero pixels AND the design intent that drove them. Without this
     * the model only had the visual reference to extrapolate from, and
     * downstream views drifted on materials/finishes/scale.
     */
    heroPromptText?: string;
    projectId: string;
    boothSize?: string;
    /** Structured booth dimensions — preferred over boothSize. */
    boothDimensions?: {
      width: number;
      depth: number;
      sqft: number;
      system: "imperial" | "metric";
      ceilingHeightFt?: number;
    };
    /** Geometry reference image URLs (floor plan + iso) — visual ground truth. */
    geometryReferences?: { floorplan?: string; isometric?: string };
    brandIntelligence?: Array<{ category: string; title: string; content: string; tags?: string[] | null }>;
    brandContext?: string;
    suiteContext?: string;
    /** Public URL of the brand logo — passed to the image model as a reference. */
    brandLogoUrl?: string;
    /** Optional one-off references attached at regen time. */
    extraReferenceUrls?: string[];
    /** Which image model to use. Default "gemini". Set to "openai" for gpt-image-2. */
    imageModel?: "gemini" | "openai";
    /**
     * Interior-design / existing-space-photo path: when present, every
     * view render uses this as its only reference image for gpt-
     * image-2's /v1/images/edits and ignores the hero/exterior
     * reference fallback chain. Combined with maskDataUrl to
     * constrain which regions get edited.
     */
    existingSpacePhotoUrl?: string;
    /**
     * Optional alpha-mask PNG data URL (transparent = editable,
     * opaque = preserved) applied to every view in the batch.
     * Pass null when the user has no change polygons.
     */
    maskDataUrl?: string | null;
    onSave: (angleId: string, angleName: string, imageDataUrl: string, meta?: { modelUsed?: string; primaryError?: string }) => void;
  }) => Promise<void>;

  regenerateView: (params: {
    angle: { id: string; name: string; aspectRatio: string; isZoneInterior?: boolean };
    prompt: string;
    /** Pre-composed renderer for this single angle (Phase 3). */
    composedPrompt?: { renderer: string; negative: string };
    heroImageUrl: string;
    /** Original hero prompt text — see generateAllViews for rationale. */
    heroPromptText?: string;
    projectId: string;
    boothSize?: string;
    /** Structured booth dimensions — preferred over boothSize. */
    boothDimensions?: {
      width: number;
      depth: number;
      sqft: number;
      system: "imperial" | "metric";
      ceilingHeightFt?: number;
    };
    /** Geometry reference image URLs (floor plan + iso) — visual ground truth. */
    geometryReferences?: { floorplan?: string; isometric?: string };
    brandIntelligence?: Array<{ category: string; title: string; content: string; tags?: string[] | null }>;
    brandContext?: string;
    suiteContext?: string;
    /** Public URL of the brand logo — passed to the image model as a reference. */
    brandLogoUrl?: string;
    /** Optional one-off references attached at regen time. */
    extraReferenceUrls?: string[];
    /** Which image model to use. Default "gemini". Set to "openai" for gpt-image-2. */
    imageModel?: "gemini" | "openai";
    /**
     * Interior-design / existing-space-photo path — see
     * generateHeroImage for full semantics. When present, the view
     * is rendered as an edit of THIS photo (constrained by
     * maskDataUrl if provided) rather than a transform of the
     * hero/exterior reference.
     */
    existingSpacePhotoUrl?: string;
    /** Optional alpha-mask PNG data URL for the existing-space path. */
    maskDataUrl?: string | null;
    onSave: (angleId: string, angleName: string, imageDataUrl: string, meta?: { modelUsed?: string; primaryError?: string }) => void;
  }) => Promise<void>;

  /** Phase 4E: Cascade regenerate all views after hero change */
  cascadeRegenerateViews: (params: {
    angles: Array<{ id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }>;
    prompts: Record<string, string>;
    /** Pre-composed renderer prompts per angle (Phase 3 of refactor). */
    composedPrompts?: Record<string, { renderer: string; negative: string }>;
    newHeroImageUrl: string;
    projectId: string;
    boothSize?: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string, meta?: { modelUsed?: string; primaryError?: string }) => void;
  }) => Promise<void>;

  /** Phase 4: Set design context for hero generation */
  setDesignContext: (ctx: DesignContext | null) => void;
  /** Phase 4: Set consistency tokens for view generation */
  setConsistencyTokens: (tokens: Record<string, unknown> | null) => void;
}

type RenderStore = RenderState & RenderActions;

const initialState: RenderState = {
  projectId: null,
  phase: "prompt",
  heroPrompt: "",
  heroImage: null,
  heroModelUsed: null,
  heroPrimaryError: null,
  heroFeedback: "",
  heroIterations: [],
  heroThread: [],
  generatedPrompts: {},
  generatedImages: {},
  isGeneratingHero: false,
  isGenerating: false,
  generationProgress: 0,
  currentlyGenerating: null,
  hydratedFromDb: false,
  heroVersion: 0,
  viewVersions: {},
  designContext: null,
  consistencyTokens: null,
};

export const useRenderStore = create<RenderStore>((set, get) => ({
  ...initialState,

  setProjectId: (id) => {
    const current = get().projectId;
    if (current !== id) {
      // Reset state when switching projects
      set({ ...initialState, projectId: id });
    }
  },
  setPhase: (phase) => set({ phase }),
  setHeroPrompt: (heroPrompt) => set({ heroPrompt }),
  setHeroImage: (heroImage) => set({ heroImage }),
  setHeroModelUsed: (heroModelUsed) => set({ heroModelUsed }),
  setHeroPrimaryError: (heroPrimaryError) => set({ heroPrimaryError }),
  setHeroFeedback: (heroFeedback) => set({ heroFeedback }),
  addHeroIteration: (url) => set((s) => ({ heroIterations: [...s.heroIterations, url] })),
  appendHeroTurn: (turn) => set((s) => ({ heroThread: [...s.heroThread, turn] })),
  setHeroThread: (thread) => set({ heroThread: thread }),
  setGeneratedPrompts: (generatedPrompts) => set({ generatedPrompts }),
  setGeneratedImage: (angleId, image) =>
    set((s) => ({ generatedImages: { ...s.generatedImages, [angleId]: image } })),
  setGeneratedImages: (generatedImages) => set({ generatedImages }),
  setIsGeneratingHero: (isGeneratingHero) => set({ isGeneratingHero }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationProgress: (generationProgress) => set({ generationProgress }),
  setCurrentlyGenerating: (currentlyGenerating) => set({ currentlyGenerating }),
  setHydratedFromDb: (hydratedFromDb) => set({ hydratedFromDb }),
  resetForProject: (projectId) => set({ ...initialState, projectId }),
  setDesignContext: (designContext) => set({ designContext }),
  setConsistencyTokens: (consistencyTokens) => set({ consistencyTokens }),

  generateHeroImage: async ({ composedPrompt, prompt, feedback, previousImageUrl, projectId, boothSize, boothDimensions, geometryReferences, projectType, brandIntelligence, brandContext, suiteContext, brandLogoUrl, extraReferenceUrls, imageModel, existingSpacePhotoUrl, maskDataUrl, onSave }) => {
    set({ isGeneratingHero: true, phase: "hero-generation" });

    try {
      const { designContext } = get();
      const body: Record<string, unknown> = {
        prompt,
        // CRITICAL: project_id gates the server-side Storage upload in
        // generate-hero. Without it, the edge function returns the full
        // base64 data URL (often 5-10 MB), the client's follow-up
        // save-render-image invoke silently drops on the size, and
        // nothing lands in project_images -> Files stays empty.
        project_id: projectId,
        feedback: feedback || undefined,
        previousImageUrl: previousImageUrl || undefined,
        boothSize: boothSize || undefined,
        boothDimensions: boothDimensions || undefined,
        geometryReferences: geometryReferences && (geometryReferences.floorplan || geometryReferences.isometric)
          ? geometryReferences
          : undefined,
        projectType: projectType || undefined,
        brandIntelligence: brandIntelligence && brandIntelligence.length > 0 ? brandIntelligence : undefined,
        brandContext: brandContext || undefined,
        suiteContext: suiteContext || undefined,
        brandLogoUrl: brandLogoUrl || undefined,
        extraReferenceUrls: extraReferenceUrls && extraReferenceUrls.length > 0 ? extraReferenceUrls : undefined,
        imageModel: imageModel ?? undefined,
        // Interior-design path: existing-space photo + optional mask.
        // When existingSpacePhotoUrl is set, the edge function uses
        // THIS as the only reference image and ignores the
        // hero/logo/extras chain. The mask (when set) constrains
        // gpt-image-2's edits to the change regions.
        existingSpacePhotoUrl: existingSpacePhotoUrl || undefined,
        maskDataUrl: maskDataUrl ?? undefined,
      };
      if (designContext) {
        body.designContext = designContext;
      }
      if (composedPrompt) {
        // Phase 3 of refactor: forward pre-composed renderer + artifacts.
        // The edge function uses renderer verbatim and persists artifacts
        // as heroSnapshot for downstream view composition.
        body.composedPrompt = {
          renderer: composedPrompt.renderer,
          negative: composedPrompt.negative,
          artifacts: composedPrompt.artifacts,
        };
      }

      const { data, error } = await supabase.functions.invoke("generate-hero", { body });

      // supabase-js wraps non-2xx with a generic "non-2xx status code"
      // message and stashes the real response body on error.context.
      // Unwrap it so toasts surface the actual OpenAI / edge-function
      // error (model not found, content filter, quota, etc.) instead
      // of the opaque wrapper string.
      if (error) {
        const msg = await unwrapInvokeError(error);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      // Only update if still on the same project
      if (get().projectId !== projectId) return;

      // Append a turn to the conversation thread. The user's
      // refinement instruction lives in `feedback` (null on the
      // initial generation, populated when they typed something to
      // refine). Each turn carries its own imageUrl so the user can
      // click any thumbnail to branch off.
      const turn: HeroTurn = {
        userMessage: feedback && feedback.trim().length > 0 ? feedback.trim() : null,
        imageUrl: data.imageUrl,
        generatedAt: new Date().toISOString(),
      };

      set((s) => ({
        heroImage: data.imageUrl,
        heroModelUsed: typeof data.modelUsed === "string" ? data.modelUsed : null,
        heroPrimaryError: typeof data.primaryError === "string" ? data.primaryError : null,
        heroIterations: [...s.heroIterations, data.imageUrl],
        heroThread: [...s.heroThread, turn],
        phase: "hero-review",
        heroFeedback: "",
        isGeneratingHero: false,
        heroVersion: s.heroVersion + 1,
      }));

      // Save to storage. modelUsed + primaryError ride along so the
      // edge function can persist them into project_images.prompt_
      // artifacts — that's what makes the "Canopy 2.0" / "Canopy
      // Lite" badge survive a page reload.
      onSave("hero_34", "3/4 Hero View", data.imageUrl, {
        modelUsed: typeof data.modelUsed === "string" ? data.modelUsed : undefined,
        primaryError: typeof data.primaryError === "string" ? data.primaryError : undefined,
      });
    } catch (error) {
      if (get().projectId !== projectId) return;
      set({ phase: "prompt", isGeneratingHero: false });
      throw error;
    }
  },

  generateAllViews: async ({ angles, prompts, composedPrompts, heroImageUrl, heroPromptText, projectId, boothSize, boothDimensions, geometryReferences, brandIntelligence, brandContext, suiteContext, brandLogoUrl, extraReferenceUrls, imageModel, existingSpacePhotoUrl, maskDataUrl, onSave }) => {
    // Split into exterior views first, then interiors — interiors can
    // reference a finished exterior render as their visual anchor.
    const exteriorViews = angles.filter((a) => a.id !== "hero_34" && !a.isZoneInterior);
    const interiorViews = angles.filter((a) => a.isZoneInterior);
    const viewsToGenerate = [...exteriorViews, ...interiorViews];
    const total = viewsToGenerate.length;

    set({
      phase: "all-views",
      isGenerating: true,
      generationProgress: 0,
      generatedPrompts: prompts,
      generatedImages: {
        hero_34: { url: heroImageUrl, status: "complete" },
        ...Object.fromEntries(viewsToGenerate.map((a) => [a.id, { url: "", status: "pending" as const }])),
      },
    });

    // Concurrency cap. We previously ran one view at a time (≈21min
    // for 7 views at ~180s each). Three concurrent calls drops that
    // to ≈9min. We don't go higher because gpt-image-2 already
    // shows rate-limit symptoms at concurrency=1 — pushing past 3
    // would trade speed for more 429s and more Lite-fallback drift.
    // The 429-retry logic in ai-gateway absorbs the burst we DO emit.
    const BATCH_SIZE = 3;
    let completedCount = 0;

    // Generate ONE view (used by both the exterior and interior
    // phases below). Extracted from the old for-loop body so it can
    // be invoked concurrently via Promise.allSettled. All store
    // updates use the functional `set` form so concurrent updates
    // don't clobber each other.
    const runOne = async (angle: { id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }) => {
      if (get().projectId !== projectId) return;

      set((s) => ({
        // Note: currentlyGenerating is the "last-started" angle; with
        // parallel batches it doesn't reflect a single in-flight call,
        // but the per-card "Generating…" overlay reads from each
        // angle's own status field anyway, so this is just a hint.
        currentlyGenerating: angle.id,
        generatedImages: { ...s.generatedImages, [angle.id]: { url: "", status: "generating" } },
      }));

      // For interior views, pick the best already-finished exterior
      // as visual reference. Falls back to the hero.
      let referenceUrl = heroImageUrl;
      if (angle.isZoneInterior) {
        const currentImages = get().generatedImages;
        const preferredRefs = ["front", "left", "right", "hero_34"];
        for (const refId of preferredRefs) {
          if (currentImages[refId]?.status === "complete" && currentImages[refId]?.url) {
            referenceUrl = currentImages[refId].url;
            break;
          }
        }
      }

      try {
        const { consistencyTokens, designContext } = get();
        const viewBody: Record<string, unknown> = {
          // See generateHeroImage: project_id gates server-side Storage
          // upload; without it we return multi-MB base64 and the client
          // save-render-image hop silently drops -> Files stays empty.
          project_id: projectId,
          referenceImageUrl: referenceUrl,
          viewPrompt: prompts[angle.id],
          viewName: angle.name,
          aspectRatio: angle.aspectRatio,
          boothSize: boothSize || undefined,
          boothDimensions: boothDimensions || undefined,
          geometryReferences:
            geometryReferences && (geometryReferences.floorplan || geometryReferences.isometric)
              ? geometryReferences
              : undefined,
          brandIntelligence: brandIntelligence && brandIntelligence.length > 0 ? brandIntelligence : undefined,
          brandContext: brandContext || undefined,
          suiteContext: suiteContext || undefined,
          brandLogoUrl: brandLogoUrl || undefined,
          extraReferenceUrls:
            extraReferenceUrls && extraReferenceUrls.length > 0 ? extraReferenceUrls : undefined,
          imageModel: imageModel ?? undefined,
          heroPromptText: heroPromptText || undefined,
          // Interior-design path — same semantics as generateHeroImage.
          // When set, the view is rendered as an edit of THIS photo
          // (masked to change regions) rather than transforming the
          // hero reference.
          existingSpacePhotoUrl: existingSpacePhotoUrl || undefined,
          maskDataUrl: maskDataUrl ?? undefined,
        };
        if (consistencyTokens) viewBody.consistencyTokens = consistencyTokens;
        if (designContext) viewBody.designContext = designContext;
        if (composedPrompts?.[angle.id]) {
          viewBody.composedPrompt = {
            renderer: composedPrompts[angle.id].renderer,
            negative: composedPrompts[angle.id].negative,
          };
        }

        const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

        if (error) {
          const msg = await unwrapInvokeError(error);
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);

        if (get().projectId !== projectId) return;

        const imageUrl = data.imageUrl;
        const currentHeroVersion = get().heroVersion;
        completedCount++;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: {
              url: imageUrl || "",
              status: imageUrl ? "complete" : "error",
              modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
              primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
            },
          },
          generationProgress: (completedCount / total) * 100,
          viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
        }));

        if (imageUrl) {
          onSave(angle.id, angle.name, imageUrl, {
            modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
            primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
          });
        }
      } catch (error) {
        if (get().projectId !== projectId) return;
        completedCount++;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: {
              url: "",
              status: "error",
              error: error instanceof Error ? error.message : "Failed to generate",
            },
          },
          generationProgress: (completedCount / total) * 100,
        }));
      }
    };

    // Run a list of views in concurrent batches of BATCH_SIZE.
    // Promise.allSettled means one view's failure doesn't abort the
    // batch — the failing view's card shows its error and we move on.
    const runBatched = async (views: typeof exteriorViews) => {
      for (let i = 0; i < views.length; i += BATCH_SIZE) {
        if (get().projectId !== projectId) return;
        await Promise.allSettled(views.slice(i, i + BATCH_SIZE).map(runOne));
      }
    };

    // Phase 1: exteriors in parallel batches. Phase 2: interiors,
    // also in parallel batches but only after ALL exteriors are
    // done so interior reference selection has a finished exterior
    // to pick from.
    await runBatched(exteriorViews);
    await runBatched(interiorViews);

    if (get().projectId !== projectId) return;
    set({ isGenerating: false, currentlyGenerating: null });
  },

  regenerateView: async ({ angle, prompt, composedPrompt, heroImageUrl, heroPromptText, projectId, boothSize, boothDimensions, geometryReferences, brandIntelligence, brandContext, suiteContext, brandLogoUrl, extraReferenceUrls, imageModel, existingSpacePhotoUrl, maskDataUrl, onSave }) => {
    set((s) => ({
      generatedImages: { ...s.generatedImages, [angle.id]: { url: "", status: "generating" } },
    }));

    // For interior views, use the best available exterior view as reference
    let referenceUrl = heroImageUrl;
    if (angle.isZoneInterior) {
      const currentImages = get().generatedImages;
      const preferredRefs = ["front", "left", "right", "hero_34"];
      for (const refId of preferredRefs) {
        if (currentImages[refId]?.status === "complete" && currentImages[refId]?.url) {
          referenceUrl = currentImages[refId].url;
          break;
        }
      }
    }

    try {
      // Phase 4: Include consistency tokens if available
      const { consistencyTokens } = get();
      const viewBody: Record<string, unknown> = {
        referenceImageUrl: referenceUrl,
        viewPrompt: prompt,
        viewName: angle.name,
        aspectRatio: angle.aspectRatio,
        boothSize: boothSize || undefined,
        boothDimensions: boothDimensions || undefined,
        geometryReferences:
          geometryReferences && (geometryReferences.floorplan || geometryReferences.isometric)
            ? geometryReferences
            : undefined,
        brandIntelligence: brandIntelligence && brandIntelligence.length > 0 ? brandIntelligence : undefined,
        brandContext: brandContext || undefined,
        suiteContext: suiteContext || undefined,
        brandLogoUrl: brandLogoUrl || undefined,
        extraReferenceUrls:
          extraReferenceUrls && extraReferenceUrls.length > 0 ? extraReferenceUrls : undefined,
        imageModel: imageModel ?? undefined,
        heroPromptText: heroPromptText || undefined,
        // Interior-design path — see generateHeroImage for semantics.
        existingSpacePhotoUrl: existingSpacePhotoUrl || undefined,
        maskDataUrl: maskDataUrl ?? undefined,
      };
      if (consistencyTokens) {
        viewBody.consistencyTokens = consistencyTokens;
      }
      if (composedPrompt) {
        // Phase 3: forward pre-composed renderer for this angle.
        viewBody.composedPrompt = {
          renderer: composedPrompt.renderer,
          negative: composedPrompt.negative,
        };
      }

      const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

      if (error) {
        const msg = await unwrapInvokeError(error);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      if (get().projectId !== projectId) return;

      const imageUrl = data.imageUrl;
      const currentHeroVersion = get().heroVersion;
      set((s) => ({
        generatedImages: {
          ...s.generatedImages,
          [angle.id]: {
            url: imageUrl || "",
            status: imageUrl ? "complete" : "error",
            modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
            primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
          },
        },
        viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
      }));

      if (imageUrl) {
        onSave(angle.id, angle.name, imageUrl, {
          modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
          primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
        });
      }
    } catch (error) {
      if (get().projectId !== projectId) return;
      set((s) => ({
        generatedImages: {
          ...s.generatedImages,
          [angle.id]: {
            url: "",
            status: "error",
            error: error instanceof Error ? error.message : "Failed to generate",
          },
        },
      }));
      throw error;
    }
  },

  // Phase 4E: Cascade regenerate all views when hero changes
  cascadeRegenerateViews: async ({ angles, prompts, composedPrompts, newHeroImageUrl, projectId, boothSize, onSave }) => {
    const exteriorViews = angles.filter((a) => a.id !== "hero_34" && !a.isZoneInterior);
    const interiorViews = angles.filter((a) => a.isZoneInterior);
    const viewsToRegenerate = [...exteriorViews, ...interiorViews];

    set({
      isGenerating: true,
      generationProgress: 0,
      generatedImages: {
        hero_34: { url: newHeroImageUrl, status: "complete" },
        ...Object.fromEntries(viewsToRegenerate.map((a) => [a.id, { url: "", status: "pending" as const }])),
      },
    });

    for (let i = 0; i < viewsToRegenerate.length; i++) {
      const angle = viewsToRegenerate[i];
      if (get().projectId !== projectId) return;

      set((s) => ({
        currentlyGenerating: angle.id,
        generatedImages: { ...s.generatedImages, [angle.id]: { url: "", status: "generating" } },
      }));

      // For interior views, use best exterior as reference
      let referenceUrl = newHeroImageUrl;
      if (angle.isZoneInterior) {
        const currentImages = get().generatedImages;
        const preferredRefs = ["front", "left", "right", "hero_34"];
        for (const refId of preferredRefs) {
          if (currentImages[refId]?.status === "complete" && currentImages[refId]?.url) {
            referenceUrl = currentImages[refId].url;
            break;
          }
        }
      }

      try {
        const { consistencyTokens } = get();
        const viewBody: Record<string, unknown> = {
          referenceImageUrl: referenceUrl,
          viewPrompt: prompts[angle.id],
          viewName: angle.name,
          aspectRatio: angle.aspectRatio,
          boothSize: boothSize || undefined,
        };
        if (consistencyTokens) {
          viewBody.consistencyTokens = consistencyTokens;
        }
        // Phase 3: forward pre-composed renderer for each angle if present.
        if (composedPrompts?.[angle.id]) {
          viewBody.composedPrompt = {
            renderer: composedPrompts[angle.id].renderer,
            negative: composedPrompts[angle.id].negative,
          };
        }

        const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

        if (error) {
          const msg = await unwrapInvokeError(error);
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);

        if (get().projectId !== projectId) return;

        const imageUrl = data.imageUrl;
        const currentHeroVersion = get().heroVersion;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: {
              url: imageUrl || "",
              status: imageUrl ? "complete" : "error",
              modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
              primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
            },
          },
          generationProgress: ((i + 1) / viewsToRegenerate.length) * 100,
          viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
        }));

        if (imageUrl) {
          onSave(angle.id, angle.name, imageUrl, {
            modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
            primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
          });
        }
      } catch (_err) {
        if (get().projectId !== projectId) return;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: {
              url: "",
              status: "error",
              error: _err instanceof Error ? _err.message : "Failed to generate",
            },
          },
          generationProgress: ((i + 1) / viewsToRegenerate.length) * 100,
        }));
      }
    }

    if (get().projectId !== projectId) return;
    set({ isGenerating: false, currentlyGenerating: null });
  },
}));
