import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

export interface GeneratedImage {
  url: string;
  status: "pending" | "generating" | "complete" | "error";
  error?: string;
}

export type WorkflowPhase = "prompt" | "hero-generation" | "hero-review" | "all-views";

interface RenderState {
  // Keyed by projectId so switching projects works
  projectId: string | null;
  phase: WorkflowPhase;
  heroPrompt: string;
  heroImage: string | null;
  heroFeedback: string;
  heroIterations: string[];
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
  /** Phase 4: Design context and consistency tokens for enhanced rendering */
  designContext: Record<string, unknown> | null;
  consistencyTokens: Record<string, unknown> | null;
}

interface RenderActions {
  setProjectId: (id: string | null) => void;
  setPhase: (phase: WorkflowPhase) => void;
  setHeroPrompt: (prompt: string) => void;
  setHeroImage: (url: string | null) => void;
  setHeroFeedback: (feedback: string) => void;
  addHeroIteration: (url: string) => void;
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
    prompt: string;
    feedback?: string;
    previousImageUrl?: string;
    projectId: string;
    boothSize?: string;
    projectType?: string | null;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  generateAllViews: (params: {
    angles: Array<{ id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }>;
    prompts: Record<string, string>;
    heroImageUrl: string;
    projectId: string;
    boothSize?: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  regenerateView: (params: {
    angle: { id: string; name: string; aspectRatio: string; isZoneInterior?: boolean };
    prompt: string;
    heroImageUrl: string;
    projectId: string;
    boothSize?: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  /** Phase 4E: Cascade regenerate all views after hero change */
  cascadeRegenerateViews: (params: {
    angles: Array<{ id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }>;
    prompts: Record<string, string>;
    newHeroImageUrl: string;
    projectId: string;
    boothSize?: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  /** Phase 4: Set design context for hero generation */
  setDesignContext: (ctx: Record<string, unknown> | null) => void;
  /** Phase 4: Set consistency tokens for view generation */
  setConsistencyTokens: (tokens: Record<string, unknown> | null) => void;
}

type RenderStore = RenderState & RenderActions;

const initialState: RenderState = {
  projectId: null,
  phase: "prompt",
  heroPrompt: "",
  heroImage: null,
  heroFeedback: "",
  heroIterations: [],
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
  setHeroFeedback: (heroFeedback) => set({ heroFeedback }),
  addHeroIteration: (url) => set((s) => ({ heroIterations: [...s.heroIterations, url] })),
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

  generateHeroImage: async ({ prompt, feedback, previousImageUrl, projectId, boothSize, projectType, onSave }) => {
    set({ isGeneratingHero: true, phase: "hero-generation" });

    try {
      const { designContext } = get();
      const body: Record<string, unknown> = {
        prompt,
        feedback: feedback || undefined,
        previousImageUrl: previousImageUrl || undefined,
        boothSize: boothSize || undefined,
        projectType: projectType || undefined,
      };
      if (designContext) {
        body.designContext = designContext;
      }

      const { data, error } = await supabase.functions.invoke("generate-hero", { body });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Only update if still on the same project
      if (get().projectId !== projectId) return;

      set((s) => ({
        heroImage: data.imageUrl,
        heroIterations: [...s.heroIterations, data.imageUrl],
        phase: "hero-review",
        heroFeedback: "",
        isGeneratingHero: false,
        heroVersion: s.heroVersion + 1,
      }));

      // Save to storage
      onSave("hero_34", "3/4 Hero View", data.imageUrl);
    } catch (error) {
      if (get().projectId !== projectId) return;
      set({ phase: "prompt", isGeneratingHero: false });
      throw error;
    }
  },

  generateAllViews: async ({ angles, prompts, heroImageUrl, projectId, boothSize, onSave }) => {
    // Split into exterior views first, then interiors — so interiors can reference exterior images
    const exteriorViews = angles.filter((a) => a.id !== "hero_34" && !a.isZoneInterior);
    const interiorViews = angles.filter((a) => a.isZoneInterior);
    const viewsToGenerate = [...exteriorViews, ...interiorViews];

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

    for (let i = 0; i < viewsToGenerate.length; i++) {
      const angle = viewsToGenerate[i];
      if (get().projectId !== projectId) return;

      set((s) => ({
        currentlyGenerating: angle.id,
        generatedImages: { ...s.generatedImages, [angle.id]: { url: "", status: "generating" } },
      }));

      // For interior views, use the best available exterior view as reference
      let referenceUrl = heroImageUrl;
      if (angle.isZoneInterior) {
        const currentImages = get().generatedImages;
        // Try front, then left, then right as better references for interiors
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
          viewPrompt: prompts[angle.id],
          viewName: angle.name,
          aspectRatio: angle.aspectRatio,
          boothSize: boothSize || undefined,
        };
        if (consistencyTokens) {
          viewBody.consistencyTokens = consistencyTokens;
        }

        const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        if (get().projectId !== projectId) return;

        const imageUrl = data.imageUrl;
        const currentHeroVersion = get().heroVersion;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
          },
          generationProgress: ((i + 1) / viewsToGenerate.length) * 100,
          viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
        }));

        if (imageUrl) {
          onSave(angle.id, angle.name, imageUrl);
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
          generationProgress: ((i + 1) / viewsToGenerate.length) * 100,
        }));
      }
    }

    if (get().projectId !== projectId) return;
    set({ isGenerating: false, currentlyGenerating: null });
  },

  regenerateView: async ({ angle, prompt, heroImageUrl, projectId, boothSize, onSave }) => {
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
      };
      if (consistencyTokens) {
        viewBody.consistencyTokens = consistencyTokens;
      }

      const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (get().projectId !== projectId) return;

      const imageUrl = data.imageUrl;
      const currentHeroVersion = get().heroVersion;
      set((s) => ({
        generatedImages: {
          ...s.generatedImages,
          [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
        },
        viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
      }));

      if (imageUrl) {
        onSave(angle.id, angle.name, imageUrl);
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
  cascadeRegenerateViews: async ({ angles, prompts, newHeroImageUrl, projectId, boothSize, onSave }) => {
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

        const { data, error } = await supabase.functions.invoke("generate-view", { body: viewBody });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        if (get().projectId !== projectId) return;

        const imageUrl = data.imageUrl;
        const currentHeroVersion = get().heroVersion;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
          },
          generationProgress: ((i + 1) / viewsToRegenerate.length) * 100,
          viewVersions: { ...s.viewVersions, [angle.id]: currentHeroVersion },
        }));

        if (imageUrl) {
          onSave(angle.id, angle.name, imageUrl);
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
