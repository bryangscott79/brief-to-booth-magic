// usePlanningCanvas — persistence for the post-brief PLANNING CANVAS, one
// row per project in `planning_canvas` (messages / cards / board jsonb).
//
// The table ships in
// supabase/migrations/20260914000000_planning_blender_feedback.sql; until
// that migration is applied the hooks transparently fall back to
// localStorage so the Planning step keeps working (schemaReady=false lets
// the UI nudge about the migration). Same contract as useProjectDeck.
//
// Every mutation is expressed as a pure reducer from src/lib/planningCanvas
// applied to the CURRENT cached snapshot, then upserted whole. Concept
// rendering runs several images in parallel, so writes are serialized
// through the react-query cache rather than read-modify-written against the
// database — the cache is always the newest state.

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  EMPTY_PLANNING_CANVAS,
  addCardVersion,
  addCards,
  appendMessage,
  clearCompare,
  promoteVersionToCover,
  normalizeSnapshot,
  planningLsKey,
  removeCard,
  setCardNotes,
  setCurrentVersion,
  toggleCardFlag,
  toggleCompare,
  updateCard,
  type PlanningCanvasSnapshot,
  type PlanningCanvasState,
  type PlanningCard,
  type PlanningCardVersion,
  type PlanningMessage,
} from "@/lib/planningCanvas";

const QUERY_KEY = (projectId: string | null | undefined) => ["planning-canvas", projectId];

const isMissingTable = (message: string) =>
  /does not exist|could not find the table|schema cache/i.test(message);

// ─── FALLBACK PLUMBING ───────────────────────────────────────────────────────

function readLocalCanvas(projectId: string): PlanningCanvasState {
  try {
    const raw = localStorage.getItem(planningLsKey(projectId));
    if (raw) return { ...normalizeSnapshot(JSON.parse(raw)), schemaReady: false };
  } catch {
    // corrupted entry — treat as empty
  }
  return { ...EMPTY_PLANNING_CANVAS, schemaReady: false };
}

function writeLocalCanvas(projectId: string, snapshot: PlanningCanvasSnapshot) {
  try {
    localStorage.setItem(planningLsKey(projectId), JSON.stringify(snapshot));
  } catch {
    // storage full / unavailable — nothing else to do
  }
}

// ─── QUERY ───────────────────────────────────────────────────────────────────

export function usePlanningCanvas(projectId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: QUERY_KEY(projectId),
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<PlanningCanvasState> => {
      const { data, error } = await supabase
        .from("planning_canvas")
        .select("messages, cards, board")
        .eq("project_id", projectId!)
        .maybeSingle();

      if (error) {
        if (isMissingTable(error.message)) return readLocalCanvas(projectId!);
        throw error;
      }

      return { ...normalizeSnapshot(data), schemaReady: true };
    },
  });
}

// ─── MUTATION ────────────────────────────────────────────────────────────────

/** Upsert the whole snapshot (onConflict project_id), falling back to
 *  localStorage when the table isn't there yet. Callers hand it a reducer
 *  so the write always builds on the newest cached state. */
export function useSavePlanningCanvas(projectId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    // The reducer runs HERE and only here. onMutate is invoked synchronously
    // inside mutate(), so two actions fired back to back (append the chat
    // turn, then add its cards) serialize: the second reduces a cache that
    // already contains the first. Reducing inside mutationFn instead is
    // async, so both would read the same pre-change snapshot and the later
    // write would drop the earlier one.
    onMutate: (reduce: (current: PlanningCanvasSnapshot) => PlanningCanvasSnapshot) => {
      if (!projectId) return;
      const cached = queryClient.getQueryData<PlanningCanvasState>(QUERY_KEY(projectId));
      const current: PlanningCanvasSnapshot = cached
        ? { messages: cached.messages, cards: cached.cards, board: cached.board }
        : { ...EMPTY_PLANNING_CANVAS };
      queryClient.setQueryData<PlanningCanvasState>(QUERY_KEY(projectId), {
        ...reduce(current),
        schemaReady: cached?.schemaReady ?? true,
      });
    },

    // Persist whatever the cache now holds. It must NOT reduce again —
    // applying the same change twice doubled every message and card.
    mutationFn: async (): Promise<PlanningCanvasState> => {
      if (!projectId) throw new Error("No project selected");
      if (!user) throw new Error("Not authenticated");

      const cached = queryClient.getQueryData<PlanningCanvasState>(QUERY_KEY(projectId));
      const next: PlanningCanvasSnapshot = cached
        ? { messages: cached.messages, cards: cached.cards, board: cached.board }
        : { ...EMPTY_PLANNING_CANVAS };

      const { error } = await supabase.from("planning_canvas").upsert(
        {
          project_id: projectId,
          created_by: user.id,
          messages: next.messages as never,
          cards: next.cards as never,
          board: next.board as never,
        },
        { onConflict: "project_id" },
      );

      if (error) {
        if (isMissingTable(error.message)) {
          writeLocalCanvas(projectId, next);
          return { ...next, schemaReady: false };
        }
        throw error;
      }

      return { ...next, schemaReady: true };
    },

    // Reconcile only the schema flag. The cache is already authoritative and
    // may hold changes newer than this write — overwriting it wholesale here
    // is what dropped the cards.
    onSuccess: (state) => {
      if (!projectId) return;
      queryClient.setQueryData<PlanningCanvasState>(QUERY_KEY(projectId), (prev) =>
        prev ? { ...prev, schemaReady: state.schemaReady } : state,
      );
    },
  });
}

// ─── TYPED ACTIONS ───────────────────────────────────────────────────────────

export interface PlanningCanvasActions {
  appendMessage: (message: PlanningMessage) => void;
  addCards: (cards: PlanningCard[]) => void;
  updateCard: (cardId: string, patch: Partial<Omit<PlanningCard, "id">>) => void;
  removeCard: (cardId: string) => void;
  /** Append a rendered version to a card and make it the current one. */
  addVersion: (cardId: string, version: PlanningCardVersion) => void;
  /** Show a different version — never touches the card's cover. */
  setVersion: (cardId: string, versionId: string) => void;
  /** "Make hero": that version becomes the card's cover image + prompt. */
  promoteVersion: (cardId: string, versionId: string) => void;
  toggleFlag: (cardId: string, flag: "pinned" | "favorite") => void;
  setNotes: (cardId: string, notes: string) => void;
  toggleCompare: (cardId: string) => void;
  clearCompare: () => void;
  isSaving: boolean;
  saveError: Error | null;
}

/** Named wrappers over the reducer mutation — what the page actually calls. */
export function usePlanningCanvasActions(
  projectId: string | null | undefined,
): PlanningCanvasActions {
  const save = useSavePlanningCanvas(projectId);
  const { mutate } = save;

  const run = useCallback(
    (reduce: (s: PlanningCanvasSnapshot) => PlanningCanvasSnapshot) => {
      mutate(reduce);
    },
    [mutate],
  );

  return {
    appendMessage: useCallback((m: PlanningMessage) => run((s) => appendMessage(s, m)), [run]),
    addCards: useCallback((cards: PlanningCard[]) => run((s) => addCards(s, cards)), [run]),
    updateCard: useCallback(
      (cardId: string, patch: Partial<Omit<PlanningCard, "id">>) =>
        run((s) => updateCard(s, cardId, patch)),
      [run],
    ),
    removeCard: useCallback((cardId: string) => run((s) => removeCard(s, cardId)), [run]),
    addVersion: useCallback(
      (cardId: string, version: PlanningCardVersion) =>
        run((s) => addCardVersion(s, cardId, version)),
      [run],
    ),
    setVersion: useCallback(
      (cardId: string, versionId: string) => run((s) => setCurrentVersion(s, cardId, versionId)),
      [run],
    ),
    promoteVersion: useCallback(
      (cardId: string, versionId: string) =>
        run((s) => promoteVersionToCover(s, cardId, versionId)),
      [run],
    ),
    toggleFlag: useCallback(
      (cardId: string, flag: "pinned" | "favorite") => run((s) => toggleCardFlag(s, cardId, flag)),
      [run],
    ),
    setNotes: useCallback(
      (cardId: string, notes: string) => run((s) => setCardNotes(s, cardId, notes)),
      [run],
    ),
    toggleCompare: useCallback((cardId: string) => run((s) => toggleCompare(s, cardId)), [run]),
    clearCompare: useCallback(() => run((s) => clearCompare(s)), [run]),
    isSaving: save.isPending,
    saveError: (save.error as Error) ?? null,
  };
}
