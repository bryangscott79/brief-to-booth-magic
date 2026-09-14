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

/** One mark the user drew on a concept image in the focus view.
 *  Coordinates are NORMALIZED (0..1 on each axis) against the image's own
 *  box, so a mark survives every resize, zoom and re-render. */
export interface ConceptAnnotation {
  id: string;
  /** A pin is a point; a region is a rectangle (w/h) or a lasso (points). */
  kind: "pin" | "region";
  /** Pin: the point itself. Region: the bounding box's top-left corner. */
  x: number;
  y: number;
  /** Region only — bounding-box size. */
  w?: number;
  h?: number;
  /** Freehand lasso outline, when the region wasn't a plain rectangle. */
  points?: Array<{ x: number; y: number }>;
  comment: string;
}

/** How a version came to exist. "initial" is the card's first render,
 *  "annotated" an edit driven by marks on the image, "prompt-edit" a fresh
 *  generation from a hand-edited prompt. */
export type PlanningVersionSource = "initial" | "annotated" | "prompt-edit";

/** One image in a card's version stack. Versions are APPEND-ONLY and
 *  oldest-first — nothing ever overwrites an earlier one. */
export interface PlanningCardVersion {
  id: string;
  imageUrl: string | null;
  /** The GENERATIVE prompt this version descends from — an annotated
   *  version carries its source version's prompt forward so the prompt
   *  editor always has something runnable. */
  prompt: string;
  /** Short human line for the filmstrip ("3 marks · move this"). */
  note: string;
  /** The marks that produced an "annotated" version. */
  annotations?: ConceptAnnotation[];
  createdAt: string;
  source: PlanningVersionSource;
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
  /**
   * Version stack, oldest first. ABSENT on legacy cards (and on cards that
   * have only ever had their first render) — `cardVersions()` derives the
   * "initial" version from imageUrl/prompt in that case, so nothing here
   * has to be backfilled eagerly.
   */
  versions?: PlanningCardVersion[];
  /** Which version the focus view is showing. Null/absent → the newest. */
  currentVersionId?: string | null;
  createdAt: string;
}

/** Free-form board state — ordering / filters / view mode. */
export interface PlanningBoard {
  /** Card ids the user has selected for the compare view. */
  compareIds?: string[];
  /**
   * The ONE concept the team decided to build on. Set by "Carry this
   * direction forward" on a card; read by the Generate step, which sends
   * it to generate-element as an APPROVED creative direction. Null /
   * absent → Generate behaves exactly as it did before this existed.
   */
  carriedDirectionId?: string | null;
  /**
   * Labels of directions the team explicitly threw away (card removal).
   * Sent alongside the carried direction so the element model doesn't
   * re-propose something already killed. Bounded and deduped.
   */
  rejectedLabels?: string[];
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

/** How many rejected labels the board remembers. The list only exists to
 *  tell the element model "don't re-propose these", so a long tail of
 *  ancient throwaways is noise — keep the most recent ones. */
export const MAX_REJECTED_LABELS = 12;

/** Remove a card and scrub every dangling reference to it (compare
 *  selection, the carried direction, and the cardIds recorded on the turn
 *  that produced it).
 *
 *  Removal is the user saying "not this" out loud, so it is also the one
 *  place a REJECTED label is recorded: the removed card's label joins
 *  `board.rejectedLabels` (deduped, most recent MAX_REJECTED_LABELS kept)
 *  and rides along to element generation as a do-not-propose list. */
export function removeCard(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
): PlanningCanvasSnapshot {
  const removed = snapshot.cards.find((c) => c.id === cardId);
  if (!removed) return snapshot;

  const cards = snapshot.cards.filter((c) => c.id !== cardId);
  const compareIds = (snapshot.board.compareIds ?? []).filter((id) => id !== cardId);
  const messages = snapshot.messages.map((m) =>
    m.cardIds?.includes(cardId) ? { ...m, cardIds: m.cardIds.filter((id) => id !== cardId) } : m,
  );

  const label = removed.label.trim();
  const known = snapshot.board.rejectedLabels ?? [];
  const rejectedLabels =
    label.length > 0 && !known.includes(label)
      ? [...known, label].slice(-MAX_REJECTED_LABELS)
      : known;

  const board: PlanningBoard = { ...snapshot.board, compareIds, rejectedLabels };
  // Throwing away the carried card un-carries it — Generate must never
  // build on a direction the board no longer holds.
  if (board.carriedDirectionId === cardId) board.carriedDirectionId = null;

  return { messages, cards, board };
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

// ─── VERSION STACK ───────────────────────────────────────────────────────────
//
// A card's image is not a single artifact: the focus view can mark it up,
// or re-run a hand-edited prompt, and each run lands as a NEW version on
// the same card. Nothing is replaced — promoting a version only changes
// which one the board shows as the card's cover.
//
// Legacy cards (written before versions existed) carry no `versions` array
// at all. Rather than rewrite every stored board, `cardVersions()` derives
// the "initial" version from the card's own imageUrl/prompt, with an id
// derived from the card id so it is STABLE across reads (React keys and
// currentVersionId both depend on that).

/** Deterministic id for the derived first version of a card. */
export const initialVersionId = (cardId: string): string => `${cardId}__v0`;

export interface NewVersionInput {
  imageUrl: string | null;
  prompt: string;
  source: PlanningVersionSource;
  note?: string;
  annotations?: ConceptAnnotation[];
  /** Pre-seed an id so the caller can correlate before persistence. */
  id?: string;
}

export function makeVersion(input: NewVersionInput): PlanningCardVersion {
  return {
    id: input.id ?? planningId("ver"),
    imageUrl: input.imageUrl,
    prompt: input.prompt,
    note: input.note ?? "",
    ...(input.annotations && input.annotations.length > 0
      ? { annotations: input.annotations }
      : {}),
    source: input.source,
    createdAt: new Date().toISOString(),
  };
}

/** Every version of a card, oldest first — migrating legacy cards on read.
 *  Always returns at least one entry. */
export function cardVersions(card: PlanningCard): PlanningCardVersion[] {
  if (Array.isArray(card.versions) && card.versions.length > 0) return card.versions;
  return [
    {
      id: initialVersionId(card.id),
      imageUrl: card.imageUrl,
      prompt: card.prompt,
      note: "",
      source: "initial",
      createdAt: card.createdAt,
    },
  ];
}

/** The version the focus view should show: `currentVersionId` when it still
 *  resolves, otherwise the newest one. */
export function currentVersion(card: PlanningCard): PlanningCardVersion {
  const versions = cardVersions(card);
  const found = card.currentVersionId
    ? versions.find((v) => v.id === card.currentVersionId)
    : undefined;
  return found ?? versions[versions.length - 1]!;
}

/** Materialize the derived version stack onto a card. Idempotent: a card
 *  that already has versions comes back untouched (same reference). */
export function migrateCard(card: PlanningCard): PlanningCard {
  if (Array.isArray(card.versions) && card.versions.length > 0) {
    return card.currentVersionId ? card : { ...card, currentVersionId: currentVersion(card).id };
  }
  // A card whose first image is still in flight has nothing to freeze — its
  // initial version stays derived until the render lands, so a refetch
  // mid-render can't bake a null imageUrl into the stack.
  if (card.status !== "complete") return card;
  const versions = cardVersions(card);
  return { ...card, versions, currentVersionId: card.currentVersionId ?? versions[0]!.id };
}

/** Append a version to a card and make it current. The new version is the
 *  one the focus view shows immediately; the card's COVER (imageUrl) is
 *  untouched until the user promotes it. Unknown ids are a no-op. */
export function addCardVersion(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  version: PlanningCardVersion,
): PlanningCanvasSnapshot {
  const card = snapshot.cards.find((c) => c.id === cardId);
  if (!card) return snapshot;
  const versions = [...cardVersions(card), version];
  return updateCard(snapshot, cardId, { versions, currentVersionId: version.id });
}

/** Point the card at an existing version. Non-destructive — the cover and
 *  every other version stay exactly as they were. Unknown card OR unknown
 *  version is a no-op. */
export function setCurrentVersion(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  versionId: string,
): PlanningCanvasSnapshot {
  const card = snapshot.cards.find((c) => c.id === cardId);
  if (!card) return snapshot;
  const versions = cardVersions(card);
  if (!versions.some((v) => v.id === versionId)) return snapshot;
  if (card.currentVersionId === versionId && card.versions) return snapshot;
  return updateCard(snapshot, cardId, { versions, currentVersionId: versionId });
}

/** "Make hero": the named version becomes the card's cover — what the
 *  board, the compare view and the prompt dialog all read. Still
 *  non-destructive: every version stays in the stack. */
export function promoteVersionToCover(
  snapshot: PlanningCanvasSnapshot,
  cardId: string,
  versionId: string,
): PlanningCanvasSnapshot {
  const card = snapshot.cards.find((c) => c.id === cardId);
  if (!card) return snapshot;
  const versions = cardVersions(card);
  const version = versions.find((v) => v.id === versionId);
  if (!version) return snapshot;
  return updateCard(snapshot, cardId, {
    versions,
    currentVersionId: versionId,
    imageUrl: version.imageUrl,
    prompt: version.prompt,
  });
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

// ─── CARRIED DIRECTION ───────────────────────────────────────────────────────
//
// Planning used to be a dead end: the team picked a winner on the board and
// the Generate step then invented a Big Idea from scratch that could
// contradict it. "Carry this direction forward" closes that loop — ONE card
// per project becomes strong, explicit context for element generation.
//
// The decision lives on the board (not on the card) so there is exactly one
// of it, and so clearing it never has to touch a card.

/** Carry a card forward, move the selection to a different card, or clear
 *  it (`null`).
 *
 *  Rules:
 *    • passing the id of the card ALREADY carried clears the selection —
 *      the board action is a toggle;
 *    • passing a different card's id moves the selection to it;
 *    • an unknown card id is a no-op;
 *    • a change that wouldn't alter anything (clearing when nothing is
 *      carried) returns the SAME snapshot, so the save path can skip it. */
export function setCarriedDirection(
  snapshot: PlanningCanvasSnapshot,
  cardId: string | null,
): PlanningCanvasSnapshot {
  const current = snapshot.board.carriedDirectionId ?? null;

  if (cardId === null) {
    if (current === null) return snapshot;
    return { ...snapshot, board: { ...snapshot.board, carriedDirectionId: null } };
  }

  if (!snapshot.cards.some((c) => c.id === cardId)) return snapshot;

  const next = current === cardId ? null : cardId;
  return { ...snapshot, board: { ...snapshot.board, carriedDirectionId: next } };
}

/** The carried card itself, or null when nothing is carried (or the id
 *  points at a card that's no longer on the board). */
export function carriedDirection(snapshot: PlanningCanvasSnapshot): PlanningCard | null {
  const id = snapshot.board.carriedDirectionId;
  if (!id) return null;
  return snapshot.cards.find((c) => c.id === id) ?? null;
}

/** What the Generate step sends to generate-element as `creativeDirection`.
 *  The prompt is ART DIRECTION, never a source of facts — the edge
 *  function's system prompt says so explicitly. */
export interface CreativeDirectionPayload {
  label: string;
  rationale: string;
  prompt: string;
  notes: string;
  imageUrl: string | null;
}

export function creativeDirectionPayload(card: PlanningCard): CreativeDirectionPayload {
  return {
    label: card.label,
    rationale: card.rationale ?? "",
    prompt: card.prompt,
    notes: card.notes ?? "",
    imageUrl: card.imageUrl,
  };
}

// ─── SERIALIZATION ───────────────────────────────────────────────────────────

/** Coerce whatever came back from jsonb / localStorage into a valid
 *  snapshot. Anything malformed degrades to empty rather than throwing —
 *  a corrupt blob must never brick the page.
 *
 *  Cards written before the version stack existed are MIGRATED here, on
 *  read: each gets a single derived "initial" version (stable id) so the
 *  focus view, the filmstrip and every version reducer can assume the
 *  stack is there. Nothing is rewritten in the database until the next
 *  save, and a re-read of an already-migrated board is a no-op. */
export function normalizeSnapshot(raw: unknown): PlanningCanvasSnapshot {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PLANNING_CANVAS };
  const r = raw as Partial<PlanningCanvasSnapshot>;
  return {
    messages: Array.isArray(r.messages) ? (r.messages as PlanningMessage[]) : [],
    cards: Array.isArray(r.cards) ? (r.cards as PlanningCard[]).map(migrateCard) : [],
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
