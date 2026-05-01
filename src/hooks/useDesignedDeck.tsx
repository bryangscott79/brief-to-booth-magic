// useDesignedDeck — calls generate-designed-deck and tracks deck state.
//
// Persists the most recent deck per project to localStorage so users don't
// re-spend tokens on a refresh. The DB column for AI decks is intentionally
// not added yet — Lovable's migration pipeline is unreliable; we'll move
// to DB persistence once schema management stabilises.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "@/hooks/useAgency";

export interface DesignedSlide {
  id: string;
  title: string;
  slideType: string;
  html: string;
  usedImageAngles?: string[];
}

export interface DesignedDeck {
  projectId: string;
  generatedAt: string;
  slides: DesignedSlide[];
}

interface GenerateInput {
  parsedBrief: any;
  elements: any;
  projectName?: string;
  imageUrls?: Array<{ angle: string; url: string }>;
  brandColor?: string;
  secondaryColor?: string;
  agencyName?: string;
  stylePreset?: string;
  /** When set: only those slide ids are regenerated. */
  regenerateSlideIds?: string[];
  /** Required when regenerating — gives Claude full deck context. */
  existingSlides?: DesignedSlide[];
  deckOverrides?: Record<string, { title?: string; narrative?: string; bullets?: string[] }>;
}

const LS_PREFIX = "canopy:designed-deck:";

function readCachedDeck(projectId: string): DesignedDeck | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.projectId === projectId && Array.isArray(parsed?.slides)) {
      return parsed as DesignedDeck;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedDeck(deck: DesignedDeck) {
  try {
    localStorage.setItem(`${LS_PREFIX}${deck.projectId}`, JSON.stringify(deck));
  } catch {
    /* ignore */
  }
}

export function useDesignedDeck(projectId: string | null | undefined) {
  const { agency } = useAgency();
  const [deck, setDeck] = useState<DesignedDeck | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingSlideIds, setGeneratingSlideIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Hydrate from local cache on project change.
  useEffect(() => {
    if (!projectId) {
      setDeck(null);
      return;
    }
    const cached = readCachedDeck(projectId);
    if (cached) setDeck(cached);
    else setDeck(null);
  }, [projectId]);

  // Generate a fresh deck.
  const generate = useCallback(
    async (input: GenerateInput) => {
      if (!projectId) {
        setError("No project");
        return;
      }
      setIsGenerating(true);
      setError(null);
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke(
          "generate-presentation",
          {
            body: {
              // mode flag — generate-presentation routes to the HTML-deck
              // designer when set. Without it, the function returns the
              // legacy slide-structure shape used by pptxgenjs.
              mode: "designed-deck",
              parsedBrief: input.parsedBrief,
              elements: input.elements,
              projectName: input.projectName,
              imageUrls: input.imageUrls,
              brandColor: input.brandColor,
              secondaryColor: input.secondaryColor,
              agencyName: input.agencyName,
              stylePreset: input.stylePreset,
              deckOverrides: input.deckOverrides,
              agency_id: (agency as any)?.id ?? null,
              project_id: projectId,
            },
          },
        );
        if (invokeErr) throw invokeErr;
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.slides)) throw new Error("No slides returned");

        const next: DesignedDeck = {
          projectId,
          generatedAt: new Date().toISOString(),
          slides: data.slides,
        };
        setDeck(next);
        writeCachedDeck(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, agency],
  );

  // Regenerate one or more slides in place.
  const regenerateSlides = useCallback(
    async (slideIds: string[], input: Omit<GenerateInput, "regenerateSlideIds" | "existingSlides">) => {
      if (!projectId || !deck) return;
      const newGenerating = new Set(generatingSlideIds);
      slideIds.forEach((id) => newGenerating.add(id));
      setGeneratingSlideIds(newGenerating);
      setError(null);
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke(
          "generate-presentation",
          {
            body: {
              mode: "designed-deck",
              parsedBrief: input.parsedBrief,
              elements: input.elements,
              projectName: input.projectName,
              imageUrls: input.imageUrls,
              brandColor: input.brandColor,
              secondaryColor: input.secondaryColor,
              agencyName: input.agencyName,
              stylePreset: input.stylePreset,
              deckOverrides: input.deckOverrides,
              regenerateSlideIds: slideIds,
              existingSlides: deck.slides,
              agency_id: (agency as any)?.id ?? null,
              project_id: projectId,
            },
          },
        );
        if (invokeErr) throw invokeErr;
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.slides)) throw new Error("No slides returned");

        // Splice regenerated slides back into the existing deck, matched by id.
        const replacements = new Map<string, DesignedSlide>();
        for (const s of data.slides as DesignedSlide[]) replacements.set(s.id, s);

        const merged = deck.slides.map((s) => replacements.get(s.id) ?? s);
        // If Claude returned a slide for an id we didn't have, append it.
        for (const s of data.slides as DesignedSlide[]) {
          if (!deck.slides.some((existing) => existing.id === s.id)) merged.push(s);
        }
        const next: DesignedDeck = {
          ...deck,
          generatedAt: new Date().toISOString(),
          slides: merged,
        };
        setDeck(next);
        writeCachedDeck(next);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        const cleared = new Set(generatingSlideIds);
        slideIds.forEach((id) => cleared.delete(id));
        setGeneratingSlideIds(cleared);
      }
    },
    [projectId, deck, agency, generatingSlideIds],
  );

  // Reorder a slide.
  const moveSlide = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!deck) return;
      const idx = deck.slides.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= deck.slides.length) return;
      const next = [...deck.slides];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      const updated: DesignedDeck = { ...deck, slides: next };
      setDeck(updated);
      writeCachedDeck(updated);
    },
    [deck],
  );

  // Remove a slide (caller can confirm).
  const removeSlide = useCallback(
    (id: string) => {
      if (!deck) return;
      const next = deck.slides.filter((s) => s.id !== id);
      const updated: DesignedDeck = { ...deck, slides: next };
      setDeck(updated);
      writeCachedDeck(updated);
    },
    [deck],
  );

  // Direct HTML edit (for power users).
  const updateSlideHtml = useCallback(
    (id: string, html: string) => {
      if (!deck) return;
      const next = deck.slides.map((s) => (s.id === id ? { ...s, html } : s));
      const updated: DesignedDeck = { ...deck, slides: next };
      setDeck(updated);
      writeCachedDeck(updated);
    },
    [deck],
  );

  const reset = useCallback(() => {
    if (!projectId) return;
    try {
      localStorage.removeItem(`${LS_PREFIX}${projectId}`);
    } catch {
      /* ignore */
    }
    setDeck(null);
  }, [projectId]);

  /**
   * Cheap deployment + secrets check. Hits the edge function with { ping: true }
   * which short-circuits before any AI call and reports whether the
   * ANTHROPIC_API_KEY secret is configured. Used by the UI's "Test connection"
   * button so the user can distinguish "function not deployed" from "function
   * deployed but missing API key" without spending tokens.
   */
  const ping = useCallback(async (): Promise<{
    ok: boolean;
    anthropicKey?: "configured" | "missing";
    deployToken?: string;
    alternativeKeysFound?: string[];
    error?: string;
  }> => {
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "generate-presentation",
        { body: { ping: true } },
      );
      if (invokeErr) {
        return { ok: false, error: invokeErr.message ?? "Function unreachable" };
      }
      if (data?.error) return { ok: false, error: data.error };
      return {
        ok: true,
        anthropicKey: data?.anthropicKey,
        deployToken: data?.deployToken,
        alternativeKeysFound: Array.isArray(data?.alternativeKeysFound)
          ? data.alternativeKeysFound
          : undefined,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  return {
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
  };
}
