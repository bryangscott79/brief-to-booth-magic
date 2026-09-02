// useProjectDeck — persistence for the export deck, one row per project in
// project_decks (settings jsonb = brand mode + kit choices, content jsonb =
// compiled slides). The table ships in
// supabase/migrations/20260825000000_project_decks.sql; until that migration
// is applied the hooks transparently fall back to localStorage so the export
// step keeps working (schemaReady=false lets the UI nudge about the migration).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BrandMode } from "@/lib/brandKit";
import type { DeckStyleId } from "@/lib/deckStyle";
import type { DeckSpec } from "@/lib/deckSpec";
import type { RenderPresentation } from "@/lib/compileDeckSpec";
import type { LogoTreatments } from "@/lib/logoContrast";

// ─── SHAPES ──────────────────────────────────────────────────────────────────

export interface DeckSettings {
  /** Which brand the deck renders in (agency / client / blend). */
  brandMode?: BrandMode;
  /** Style preset (pitch / executive / editorial / tactical). Missing → pitch. */
  style?: DeckStyleId;
  /** How renders are laid out: one per slide (default) / mixed / compact grids. */
  renderPresentation?: RenderPresentation;
  /** angle_ids of the renders to include. null / missing → every current render. */
  selectedRenderIds?: string[] | null;
  /** angle_ids forced to their own full-bleed slide in mixed / grid modes. */
  featuredRenderIds?: string[];
  /** Logo plate decisions (logoContrast) for the kit + style this deck was
   *  compiled with — persisted so a rehydrated preview matches the download. */
  logoTreatments?: LogoTreatments | null;
  [key: string]: unknown;
}

/** A walkthrough video persisted for deck use (provider URLs expire, so the
 *  mp4 is copied into the public project-images bucket first). */
export interface DeckVideoContent {
  /** Public URL of the copied mp4. */
  url: string;
  /** Storage path inside project-images — `{projectId}/walkthrough_{ts}.mp4`. */
  path: string;
  /** Poster frame (first selected render, or the video's source image). */
  posterUrl?: string;
  label: string;
  durationSec?: number;
  /** videoStore id the clip came from, for de-duping the picker. */
  sourceVideoId?: string;
}

export interface DeckContent {
  spec?: DeckSpec;
  video?: DeckVideoContent | null;
  [key: string]: unknown;
}

export interface ProjectDeckState {
  settings: DeckSettings;
  content: DeckContent;
  /** false → the project_decks table isn't in the schema yet (localStorage fallback active). */
  schemaReady: boolean;
}

export interface SaveProjectDeckInput {
  settings?: DeckSettings;
  content?: DeckContent;
}

// ─── FALLBACK PLUMBING ───────────────────────────────────────────────────────

const isMissingTable = (message: string) =>
  /does not exist|could not find the table|schema cache/i.test(message);

const lsKey = (projectId: string) => `canopy:project-deck:${projectId}`;

function readLocalDeck(projectId: string): ProjectDeckState {
  try {
    const raw = localStorage.getItem(lsKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as { settings?: DeckSettings; content?: DeckContent };
      return {
        settings: parsed.settings ?? {},
        content: parsed.content ?? {},
        schemaReady: false,
      };
    }
  } catch {
    // corrupted entry — treat as empty
  }
  return { settings: {}, content: {}, schemaReady: false };
}

function writeLocalDeck(projectId: string, settings: DeckSettings, content: DeckContent) {
  try {
    localStorage.setItem(lsKey(projectId), JSON.stringify({ settings, content }));
  } catch {
    // storage full / unavailable — nothing else to do
  }
}

// ─── QUERY ───────────────────────────────────────────────────────────────────

export function useProjectDeck(projectId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["project-deck", projectId],
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<ProjectDeckState> => {
      const { data, error } = await supabase
        .from("project_decks" as any)
        .select("settings, content")
        .eq("project_id", projectId!)
        .maybeSingle();

      if (error) {
        if (isMissingTable(error.message)) return readLocalDeck(projectId!);
        throw error;
      }

      const row = data as any;
      return {
        settings: (row?.settings ?? {}) as DeckSettings,
        content: (row?.content ?? {}) as DeckContent,
        schemaReady: true,
      };
    },
  });
}

// ─── MUTATION ────────────────────────────────────────────────────────────────

/** Upserts the deck row (onConflict project_id) with a shallow merge over
 *  what's already loaded, so callers can save just { settings: { brandMode } }
 *  or just { content } without clobbering the other half. Falls back to
 *  localStorage when the table doesn't exist yet. */
export function useSaveProjectDeck(projectId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveProjectDeckInput): Promise<ProjectDeckState> => {
      if (!projectId) throw new Error("No project selected");
      if (!user) throw new Error("Not authenticated");

      const current =
        queryClient.getQueryData<ProjectDeckState>(["project-deck", projectId]) ??
        ({ settings: {}, content: {}, schemaReady: true } as ProjectDeckState);

      const settings: DeckSettings = { ...current.settings, ...(input.settings ?? {}) };
      const content: DeckContent = { ...current.content, ...(input.content ?? {}) };

      const { error } = await supabase
        .from("project_decks" as any)
        .upsert(
          {
            project_id: projectId,
            created_by: user.id,
            settings: settings as never,
            content: content as never,
          } as any,
          { onConflict: "project_id" },
        );

      if (error) {
        if (isMissingTable(error.message)) {
          writeLocalDeck(projectId, settings, content);
          return { settings, content, schemaReady: false };
        }
        throw error;
      }

      return { settings, content, schemaReady: true };
    },
    onSuccess: (state) => {
      if (projectId) queryClient.setQueryData(["project-deck", projectId], state);
    },
  });
}
