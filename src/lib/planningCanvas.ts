// planningCanvas — the shapes and pure reducers behind the post-brief
// PLANNING CANVAS (chat thread + concept board).
//
// One row per project in `planning_canvas` (messages / cards / board
// jsonb) — see supabase/migrations/20260914000000_planning_blender_feedback.sql.
// Everything here is pure so the board logic is testable without React,
// Supabase, or an image model: usePlanningCanvas owns persistence and
// calls these to compute the next state.
//
// Cards are APPEND-ONLY by design. A follow-up on a card ("make this one
// warmer") renders a NEW card that records the one it came from
// (`parentId`); the original is never mutated or replaced. Removal is the
// only destructive op and it is always explicit.

// ─── SHAPES ──────────────────────────────────────────────────────────────────

export type PlanningRole = "user" | "assistant";

export interface PlanningMessage {
  id: string;
  role: PlanningRole;
  content: string;
  /** Cards this assistant turn produced, in board order. */
  cardIds?: string[];
  /** Card the user aimed this turn at (follow-up feedback). */
  targetCardId?: string | null;
  /** The turn failed (the director or an image call errored). */
  error?: boolean;
  createdAt: string;
}

export interface PlanningCard {
  id: string;
  /** Board title from the director — never "Concept 1". */
  label: string;
  /** The complete renderer prompt this card was generated from. */
  prompt: string;
  /** One line tying the direction back to the brief. */
  rationale?: string;
  /** Rendered image (a short storage URL from generate-hero). */
  imageUrl: string | null;
  /** Set while the image is in flight / when it failed. */
  status: "generating" | "complete" | "error";
  error?: string;
  /** Image model that produced it, for the Canopy 2.0 / Lite badge. */
  modelUsed?: string;
  /** Negative list sent alongside the prompt (prompt transparency). */
  negative?: string;
  pinned: boolean;
  favorite: boolean;
  notes: string;
  /** The card this one is a variant of, when it came from feedback. */
  parentId?: string | null;
  /** angle_id once the user pushes the card into project renders. */
  angleId?: string | null;
  createdAt: string;
}

/** Free-form board state — ordering / filters / view mode. */
export interface PlanningBoard {
  /** Card ids the user has selected for the compare view. */
  compareIds?: string[];
  [key: string]: unknown;
}

export interface PlanningCanvasState {
  messages: PlanningMessage[];
  cards: PlanningCard[];
  board: PlanningBoard;
  /** false → the planning_canvas table isn't in the schema yet
   *  (localStorage fallback active). */
  schemaReady: boolean;
}

/** The exact JSON we persist — to the row's three jsonb columns, and, when
 *  the table is missing, to localStorage under the same shape. */
export interface PlanningCanvasSnapshot {
  messages: PlanningMessage[];
  cards: PlanningCard[];
  board: PlanningBoard;
}

export const EMPTY_PLANNING_CANVAS: PlanningCanvasSnapshot = {
  messages: [],
  cards: [],
  board: {},
};

/** Keep the persisted thread bounded — the director only ever reads the
 *  last 10 turns and the row is a single jsonb blob. */
export const MAX_PLANNING_MESSAGES = 120;

// ─── ID + CLOCK ──────────────────────────────────────────────────────────────

let counter = 0;

/** Stable-ish unique id. crypto.randomUUID when available (browsers and
 *  jsdom ≥ 20), otherwise a monotonic fallback so tests stay hermetic. */
export function planningId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${(counter += 1).toString(36)}`;
  return `${prefix}_${uuid}`;
}

// ─── MESSAGE REDUCERS ────────────────────────────────────────────────────────

export function makeMessage(
  role: PlanningRole,
  content: string,
  extra: Partial<Omit<PlanningMessage, "id" | "role" | "content" | "createdAt">> = {},
): PlanningMessage {
  return {
    id: planningId("msg"),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

export function appendMessage(
  snapshot: PlanningCanvasSnapshot,
  message: PlanningMessage,
): PlanningCanvasSnapshot {
  const messages = [...snapshot.messages, message];
  return {
    ...snapshot,
    messages:
      messages.length > MAX_PLANNING_MESSAGES
        ? messages.slice(messages.length - MAX_PLANNING_MESSAGES)
        : messages,
  };
}

/** The last `n` turns, flattened to the director's history shape. */
export function historyForDirector(
  messages: PlanningMessage[],
  n = 10,
): Array<{ role: PlanningRole; content: string }> {
  return messages
    .filter((m) => !m.error && m.content.trim().length > 0)
    .slice(-n)
    .map((m) => ({ role: m.role, content: m.content }));
}

// ─── CARD REDUCERS ───────────────────────────────────────────────────────────

export interface NewCardInput {
  label: string;
  prompt: string;
  rationale?: string;
  negative?: string;
  parentId?: string | null;
  /** Pre-seed an id so the caller can correlate before the image lands. */
  id?: string;
}

export function makeCard(input: NewCardInput): PlanningCard {
  return {
    id: input.id ?? planningId("card"),
    label: input.label,
    prompt: input.prompt,
    rationale: input.rationale,
    negative: input.negative,
    parentId: input.parentId ?? null,
    imageUrl: null,
    status: "generating",
    pinned: false,
    favorite: false,
    notes: "",
    angleId: null,
    createdAt: new Date().toISOString(),
  };
}

export function addCards(
  snapshot: PlanningCanvasSnapshot,
  cards: PlanningCard[],
): PlanningCanvasSnapshot {
  if (cards.length === 0) return snapshot;
  // Newest first — the board reads top-left as "what we just made".
  return { ...snapshot, cards: [...cards, ...snapshot.cards] };
}

/** Shallow-merge a patch into one card. Unknown ids are a no-op (the card
 *  may have been removed while its image was still rendering). */
export function updateCard(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  patch: Partial<Omit<PlanningCard, "id">>,
): PlanningCanvasSnapshot {
  let changed = false;
  const cards = snapshot.cards.map((c) => {
    if (c.id !== cardId) return c;
    changed = true;
    return { ...c, ...patch, id: c.id };
  });
  return changed ? { ...snapshot, cards } : snapshot;
}

/** Remove a card and scrub every dangling reference to it (compare
 *  selection, and the cardIds recorded on the turn that produced it). */
export function removeCard(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
): PlanningCanvasSnapshot {
  const cards = snapshot.cards.filter((c) => c.id !== cardId);
  if (cards.length === snapshot.cards.length) return snapshot;

  const compareIds = (snapshot.board.compareIds ?? []).filter((id) => id !== cardId);
  const messages = snapshot.messages.map((m) =>
    m.cardIds?.includes(cardId) ? { ...m, cardIds: m.cardIds.filter((id) => id !== cardId) } : m,
  );
  return { messages, cards, board: { ...snapshot.board, compareIds } };
}

export function toggleCardFlag(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  flag: "pinned" | "favorite",
): PlanningCanvasSnapshot {
  const card = snapshot.cards.find((c) => c.id === cardId);
  if (!card) return snapshot;
  return updateCard(snapshot, cardId, { [flag]: !card[flag] });
}

export function setCardNotes(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  notes: string,
): PlanningCanvasSnapshot {
  return updateCard(snapshot, cardId, { notes });
}

/** Pinned cards float to the front; everything else keeps board order. */
export function sortedCards(cards: PlanningCard[]): PlanningCard[] {
  return [...cards].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

// ─── COMPARE SELECTION ───────────────────────────────────────────────────────

export const MAX_COMPARE = 4;

export function toggleCompare(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
): PlanningCanvasSnapshot {
  const current = snapshot.board.compareIds ?? [];
  const next = current.includes(cardId)
    ? current.filter((id) => id !== cardId)
    : [...current, cardId].slice(-MAX_COMPARE);
  return { ...snapshot, board: { ...snapshot.board, compareIds: next } };
}

export function clearCompare(snapshot: PlanningCanvasSnapshot): PlanningCanvasSnapshot {
  return { ...snapshot, board: { ...snapshot.board, compareIds: [] } };
}

// ─── SERIALIZATION ───────────────────────────────────────────────────────────

/** Coerce whatever came back from jsonb / localStorage into a valid
 *  snapshot. Anything malformed degrades to empty rather than throwing —
 *  a corrupt blob must never brick the page. */
export function normalizeSnapshot(raw: unknown): PlanningCanvasSnapshot {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PLANNING_CANVAS };
  const r = raw as Partial<PlanningCanvasSnapshot>;
  return {
    messages: Array.isArray(r.messages) ? (r.messages as PlanningMessage[]) : [],
    cards: Array.isArray(r.cards) ? (r.cards as PlanningCard[]) : [],
    board: r.board && typeof r.board === "object" ? (r.board as PlanningBoard) : {},
  };
}

/** localStorage key for the pre-migration fallback. Mirrors
 *  useProjectDeck's `canopy:project-deck:{projectId}`. */
export const planningLsKey = (projectId: string): string =>
  `canopy:planning-canvas:${projectId}`;

// ─── STARTER PROMPTS ─────────────────────────────────────────────────────────

/** Seed the empty state with asks drawn from the brief's own objectives so
 *  the first turn is grounded in the project, not in generic prompt-craft.
 *  Falls back to three evergreen asks when the brief is thin. */
export function starterPrompts(brief: {
  objectives?: { primary?: string; secondary?: string[] };
  brand?: { name?: string };
  spatial?: { footprints?: Array<{ size?: string }> };
} | null | undefined): string[] {
  const out: string[] = [];
  const brand = brief?.brand?.name?.trim();
  const primary = brief?.objectives?.primary?.trim();
  const size = brief?.spatial?.footprints?.[0]?.size?.trim();
  const secondary = (brief?.objectives?.secondary ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );

  if (primary) {
    out.push(`Show me three directions that deliver on "${truncate(primary, 90)}".`);
  }
  if (size) {
    out.push(`What does the hero moment look like in the ${size} footprint?`);
  }
  if (secondary[0]) {
    out.push(`Give me one concept built around ${truncate(secondary[0], 80)}.`);
  }
  if (brand) {
    out.push(`Express ${brand}'s visual language as architecture, not as graphics.`);
  }

  const fallback = [
    "Show me three directions for this booth.",
    "What's the boldest version of this we could build in budget?",
    "Give me a concept that maximizes open-side visibility.",
  ];
  for (const f of fallback) {
    if (out.length >= 3) break;
    out.push(f);
  }
  return out.slice(0, 3);
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}
