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
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  generateAllViews: (params: {
    angles: Array<{ id: string; name: string; aspectRatio: string; isZoneInterior?: boolean }>;
    prompts: Record<string, string>;
    heroImageUrl: string;
    projectId: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;

  regenerateView: (params: {
    angle: { id: string; name: string; aspectRatio: string; isZoneInterior?: boolean };
    prompt: string;
    heroImageUrl: string;
    projectId: string;
    onSave: (angleId: string, angleName: string, imageDataUrl: string) => void;
  }) => Promise<void>;
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

  generateHeroImage: async ({ prompt, feedback, previousImageUrl, projectId, onSave }) => {
    set({ isGeneratingHero: true, phase: "hero-generation" });

    try {
      const { data, error } = await supabase.functions.invoke("generate-hero", {
        body: { prompt, feedback: feedback || undefined, previousImageUrl: previousImageUrl || undefined },
      });

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
      }));

      // Save to storage
      onSave("hero_34", "3/4 Hero View", data.imageUrl);
    } catch (error) {
      if (get().projectId !== projectId) return;
      set({ phase: "prompt", isGeneratingHero: false });
      throw error;
    }
  },

  generateAllViews: async ({ angles, prompts, heroImageUrl, projectId, onSave }) => {
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
        const { data, error } = await supabase.functions.invoke("generate-view", {
          body: {
            referenceImageUrl: referenceUrl,
            viewPrompt: prompts[angle.id],
            viewName: angle.name,
            aspectRatio: angle.aspectRatio,
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        if (get().projectId !== projectId) return;

        const imageUrl = data.imageUrl;
        set((s) => ({
          generatedImages: {
            ...s.generatedImages,
            [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
          },
          generationProgress: ((i + 1) / viewsToGenerate.length) * 100,
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

  regenerateView: async ({ angle, prompt, heroImageUrl, projectId, onSave }) => {
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
      const { data, error } = await supabase.functions.invoke("generate-view", {
        body: {
          referenceImageUrl: referenceUrl,
          viewPrompt: prompt,
          viewName: angle.name,
          aspectRatio: angle.aspectRatio,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (get().projectId !== projectId) return;

      const imageUrl = data.imageUrl;
      set((s) => ({
        generatedImages: {
          ...s.generatedImages,
          [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
        },
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
}));
