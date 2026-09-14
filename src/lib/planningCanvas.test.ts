import { describe, expect, it } from "vitest";
import {
  EMPTY_PLANNING_CANVAS,
  MAX_COMPARE,
  MAX_PLANNING_MESSAGES,
  addCards,
  appendMessage,
  clearCompare,
  historyForDirector,
  makeCard,
  makeMessage,
  normalizeSnapshot,
  planningLsKey,
  removeCard,
  setCardNotes,
  sortedCards,
  starterPrompts,
  toggleCardFlag,
  toggleCompare,
  updateCard,
  type PlanningCanvasSnapshot,
} from "@/lib/planningCanvas";

const empty = (): PlanningCanvasSnapshot => ({ ...EMPTY_PLANNING_CANVAS, cards: [], messages: [] });

const withCards = (...labels: string[]): PlanningCanvasSnapshot =>
  addCards(
    empty(),
    labels.map((label) => makeCard({ label, prompt: `# SCENE\n${label}` })),
  );

describe("card reducers", () => {
  it("adds cards newest-first and starts them generating", () => {
    const s = withCards("First", "Second");
    // addCards prepends the batch, preserving batch order inside it.
    expect(s.cards.map((c) => c.label)).toEqual(["First", "Second"]);
    expect(s.cards.every((c) => c.status === "generating")).toBe(true);
    expect(s.cards.every((c) => c.imageUrl === null)).toBe(true);
    expect(s.cards.every((c) => c.pinned === false && c.favorite === false)).toBe(true);
  });

  it("a second batch lands in front of the first", () => {
    const first = withCards("Old");
    const next = addCards(first, [makeCard({ label: "New", prompt: "# SCENE\nNew" })]);
    expect(next.cards.map((c) => c.label)).toEqual(["New", "Old"]);
  });

  it("addCards with an empty batch returns the same snapshot", () => {
    const s = withCards("Only");
    expect(addCards(s, [])).toBe(s);
  });

  it("updateCard merges a patch without touching siblings or the id", () => {
    const s = withCards("A", "B");
    const target = s.cards[1]!;
    const next = updateCard(s, target.id, { status: "complete", imageUrl: "https://x/y.png" });

    expect(next.cards[1]!.status).toBe("complete");
    expect(next.cards[1]!.imageUrl).toBe("https://x/y.png");
    expect(next.cards[1]!.id).toBe(target.id);
    expect(next.cards[1]!.label).toBe("B");
    // Untouched sibling keeps its identity.
    expect(next.cards[0]).toBe(s.cards[0]);
  });

  it("updateCard on an unknown id is a no-op", () => {
    const s = withCards("A");
    expect(updateCard(s, "card_nope", { status: "complete" })).toBe(s);
  });

  it("removeCard drops the card and scrubs dangling references", () => {
    let s = withCards("A", "B");
    const doomed = s.cards[0]!;
    s = appendMessage(
      s,
      makeMessage("assistant", "made two", { cardIds: [doomed.id, s.cards[1]!.id] }),
    );
    s = toggleCompare(s, doomed.id);
    s = toggleCompare(s, s.cards[1]!.id);

    const next = removeCard(s, doomed.id);
    expect(next.cards.map((c) => c.label)).toEqual(["B"]);
    expect(next.board.compareIds).toEqual([s.cards[1]!.id]);
    expect(next.messages[0]!.cardIds).toEqual([s.cards[1]!.id]);
  });

  it("removeCard on an unknown id is a no-op", () => {
    const s = withCards("A");
    expect(removeCard(s, "card_nope")).toBe(s);
  });

  it("toggleCardFlag flips pinned and favorite independently", () => {
    const s = withCards("A");
    const id = s.cards[0]!.id;
    const pinned = toggleCardFlag(s, id, "pinned");
    expect(pinned.cards[0]!.pinned).toBe(true);
    expect(pinned.cards[0]!.favorite).toBe(false);

    const both = toggleCardFlag(pinned, id, "favorite");
    expect(both.cards[0]!.pinned).toBe(true);
    expect(both.cards[0]!.favorite).toBe(true);

    expect(toggleCardFlag(both, id, "pinned").cards[0]!.pinned).toBe(false);
  });

  it("setCardNotes stores notes on just that card", () => {
    const s = withCards("A", "B");
    const next = setCardNotes(s, s.cards[0]!.id, "too cold");
    expect(next.cards[0]!.notes).toBe("too cold");
    expect(next.cards[1]!.notes).toBe("");
  });

  it("sortedCards floats pinned cards to the front, stable otherwise", () => {
    let s = withCards("A", "B", "C");
    s = toggleCardFlag(s, s.cards[2]!.id, "pinned");
    expect(sortedCards(s.cards).map((c) => c.label)).toEqual(["C", "A", "B"]);
  });

  it("a variant records its parent and never replaces it", () => {
    const s = withCards("Original");
    const parent = s.cards[0]!;
    const next = addCards(s, [
      makeCard({ label: "Warmer", prompt: "# SCENE\nwarmer", parentId: parent.id }),
    ]);
    expect(next.cards).toHaveLength(2);
    expect(next.cards[0]!.parentId).toBe(parent.id);
    expect(next.cards[1]!.id).toBe(parent.id);
  });
});

describe("compare selection", () => {
  it("toggles on and off", () => {
    const s = withCards("A");
    const id = s.cards[0]!.id;
    const on = toggleCompare(s, id);
    expect(on.board.compareIds).toEqual([id]);
    expect(toggleCompare(on, id).board.compareIds).toEqual([]);
  });

  it("caps the selection at MAX_COMPARE, dropping the oldest", () => {
    let s = withCards("A", "B", "C", "D", "E");
    for (const c of s.cards) s = toggleCompare(s, c.id);
    expect(s.board.compareIds).toHaveLength(MAX_COMPARE);
    expect(s.board.compareIds).not.toContain(s.cards[0]!.id);
  });

  it("clearCompare empties the selection", () => {
    let s = withCards("A");
    s = toggleCompare(s, s.cards[0]!.id);
    expect(clearCompare(s).board.compareIds).toEqual([]);
  });
});

describe("messages", () => {
  it("appends in order and bounds the thread", () => {
    let s = empty();
    for (let i = 0; i < MAX_PLANNING_MESSAGES + 5; i++) {
      s = appendMessage(s, makeMessage("user", `turn ${i}`));
    }
    expect(s.messages).toHaveLength(MAX_PLANNING_MESSAGES);
    expect(s.messages.at(-1)!.content).toBe(`turn ${MAX_PLANNING_MESSAGES + 4}`);
    expect(s.messages[0]!.content).toBe("turn 5");
  });

  it("historyForDirector takes the last n turns and drops errored/empty ones", () => {
    let s = empty();
    s = appendMessage(s, makeMessage("user", "one"));
    s = appendMessage(s, makeMessage("assistant", "boom", { error: true }));
    s = appendMessage(s, makeMessage("assistant", "  "));
    s = appendMessage(s, makeMessage("user", "two"));

    expect(historyForDirector(s.messages, 10)).toEqual([
      { role: "user", content: "one" },
      { role: "user", content: "two" },
    ]);
    expect(historyForDirector(s.messages, 1)).toEqual([{ role: "user", content: "two" }]);
  });
});

describe("fallback persistence shape", () => {
  it("round-trips through JSON unchanged", () => {
    let s = withCards("A", "B");
    s = updateCard(s, s.cards[0]!.id, { status: "complete", imageUrl: "https://x/a.png" });
    s = setCardNotes(s, s.cards[1]!.id, "keep the canopy");
    s = toggleCardFlag(s, s.cards[1]!.id, "favorite");
    s = toggleCompare(s, s.cards[0]!.id);
    s = appendMessage(s, makeMessage("user", "three directions please"));

    const restored = normalizeSnapshot(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual({ messages: s.messages, cards: s.cards, board: s.board });
  });

  it("normalizeSnapshot degrades malformed blobs to empty instead of throwing", () => {
    expect(normalizeSnapshot(null)).toEqual(EMPTY_PLANNING_CANVAS);
    expect(normalizeSnapshot("nope")).toEqual(EMPTY_PLANNING_CANVAS);
    expect(normalizeSnapshot({ cards: "not an array", messages: 3, board: 7 })).toEqual(
      EMPTY_PLANNING_CANVAS,
    );
  });

  it("normalizeSnapshot keeps the halves it can read", () => {
    const restored = normalizeSnapshot({ cards: [], messages: null, board: { compareIds: ["x"] } });
    expect(restored.messages).toEqual([]);
    expect(restored.board).toEqual({ compareIds: ["x"] });
  });

  it("uses the project-scoped localStorage key", () => {
    expect(planningLsKey("abc-123")).toBe("canopy:planning-canvas:abc-123");
  });
});

describe("starterPrompts", () => {
  it("draws from the brief's objectives, footprint and brand", () => {
    const out = starterPrompts({
      brand: { name: "Samsung" },
      objectives: { primary: "Own the AI conversation at CES", secondary: ["Drive partner meetings"] },
      spatial: { footprints: [{ size: "20x40" }] },
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("Own the AI conversation at CES");
    expect(out[1]).toContain("20x40");
    expect(out[2]).toContain("Drive partner meetings");
  });

  it("falls back to evergreen asks when the brief is thin", () => {
    const out = starterPrompts(null);
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.length > 0)).toBe(true);
  });

  it("truncates a very long objective rather than pasting an essay", () => {
    const out = starterPrompts({ objectives: { primary: "x".repeat(400) } });
    expect(out[0]!.length).toBeLessThan(160);
    expect(out[0]).toContain("…");
  });
});
