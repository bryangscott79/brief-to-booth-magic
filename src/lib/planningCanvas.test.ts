import { describe, expect, it } from "vitest";
import {
  EMPTY_PLANNING_CANVAS,
  MAX_COMPARE,
  MAX_PLANNING_MESSAGES,
  MAX_REJECTED_LABELS,
  addCardVersion,
  addCards,
  appendMessage,
  cardVersions,
  carriedDirection,
  clearCompare,
  creativeDirectionPayload,
  currentVersion,
  initialVersionId,
  makeVersion,
  migrateCard,
  promoteVersionToCover,
  setCurrentVersion,
  historyForDirector,
  makeCard,
  makeMessage,
  normalizeSnapshot,
  planningLsKey,
  removeCard,
  setCardNotes,
  setCarriedDirection,
  sortedCards,
  starterPrompts,
  toggleCardFlag,
  toggleCompare,
  updateCard,
  type PlanningCanvasSnapshot,
  type PlanningCard,
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

describe("carried direction", () => {
  it("carries one card forward and reads it back", () => {
    const s = withCards("Canopy of light", "Monolith");
    const chosen = s.cards[0]!;
    const next = setCarriedDirection(s, chosen.id);

    expect(next.board.carriedDirectionId).toBe(chosen.id);
    expect(carriedDirection(next)!.label).toBe("Canopy of light");
    // Cards are untouched — the decision lives on the board.
    expect(next.cards).toBe(s.cards);
  });

  it("selecting another card MOVES the selection — only one at a time", () => {
    let s = withCards("A", "B");
    s = setCarriedDirection(s, s.cards[0]!.id);
    s = setCarriedDirection(s, s.cards[1]!.id);

    expect(s.board.carriedDirectionId).toBe(s.cards[1]!.id);
    expect(carriedDirection(s)!.label).toBe("B");
  });

  it("selecting the carried card again clears it", () => {
    let s = withCards("A");
    const id = s.cards[0]!.id;
    s = setCarriedDirection(s, id);
    s = setCarriedDirection(s, id);

    expect(s.board.carriedDirectionId).toBeNull();
    expect(carriedDirection(s)).toBeNull();
  });

  it("explicitly clearing with null clears it", () => {
    let s = withCards("A");
    s = setCarriedDirection(s, s.cards[0]!.id);
    expect(setCarriedDirection(s, null).board.carriedDirectionId).toBeNull();
  });

  it("clearing when nothing is carried is a no-op (same snapshot)", () => {
    const s = withCards("A");
    expect(setCarriedDirection(s, null)).toBe(s);
  });

  it("an unknown card id is a no-op and never disturbs the current pick", () => {
    let s = withCards("A");
    expect(setCarriedDirection(s, "card_nope")).toBe(s);

    s = setCarriedDirection(s, s.cards[0]!.id);
    expect(setCarriedDirection(s, "card_nope")).toBe(s);
    expect(s.board.carriedDirectionId).toBe(s.cards[0]!.id);
  });

  it("carriedDirection returns null when the id dangles", () => {
    const s = withCards("A");
    const dangling: PlanningCanvasSnapshot = {
      ...s,
      board: { ...s.board, carriedDirectionId: "card_gone" },
    };
    expect(carriedDirection(dangling)).toBeNull();
    expect(carriedDirection(s)).toBeNull();
  });

  it("removing the carried card un-carries it", () => {
    let s = withCards("A", "B");
    const doomed = s.cards[0]!;
    s = setCarriedDirection(s, doomed.id);
    const next = removeCard(s, doomed.id);

    expect(next.board.carriedDirectionId).toBeNull();
    expect(carriedDirection(next)).toBeNull();
  });

  it("removing a different card leaves the carried one alone", () => {
    let s = withCards("A", "B");
    const kept = s.cards[0]!;
    s = setCarriedDirection(s, kept.id);
    const next = removeCard(s, s.cards[1]!.id);

    expect(next.board.carriedDirectionId).toBe(kept.id);
    expect(carriedDirection(next)!.label).toBe("A");
  });

  it("creativeDirectionPayload flattens the card, defaulting the optional text", () => {
    let s = addCards(empty(), [
      makeCard({ label: "Canopy", prompt: "# SCENE\ncanopy", rationale: "Owns the aisle" }),
    ]);
    const id = s.cards[0]!.id;
    s = setCardNotes(s, id, "keep the ceiling low");
    s = updateCard(s, id, { status: "complete", imageUrl: "https://x/a.png" });

    expect(creativeDirectionPayload(s.cards[0]!)).toEqual({
      label: "Canopy",
      rationale: "Owns the aisle",
      prompt: "# SCENE\ncanopy",
      notes: "keep the ceiling low",
      imageUrl: "https://x/a.png",
    });

    const bare = makeCard({ label: "Bare", prompt: "p" });
    expect(creativeDirectionPayload(bare)).toEqual({
      label: "Bare",
      rationale: "",
      prompt: "p",
      notes: "",
      imageUrl: null,
    });
  });
});

describe("rejected labels", () => {
  it("removing a card records its label as rejected", () => {
    const s = withCards("Canopy of light", "Monolith");
    const next = removeCard(s, s.cards[1]!.id);
    expect(next.board.rejectedLabels).toEqual(["Monolith"]);
  });

  it("dedupes repeats of the same label", () => {
    let s = withCards("Same", "Same");
    s = removeCard(s, s.cards[0]!.id);
    s = removeCard(s, s.cards[0]!.id);
    expect(s.board.rejectedLabels).toEqual(["Same"]);
  });

  it("caps the list, keeping the most recent rejections", () => {
    const labels = Array.from({ length: MAX_REJECTED_LABELS + 3 }, (_, i) => `Dir ${i}`);
    let s = withCards(...labels);
    // Always remove the front card — that walks the list in label order.
    for (let i = 0; i < labels.length; i++) s = removeCard(s, s.cards[0]!.id);

    expect(s.cards).toHaveLength(0);
    expect(s.board.rejectedLabels).toHaveLength(MAX_REJECTED_LABELS);
    expect(s.board.rejectedLabels).toEqual(labels.slice(-MAX_REJECTED_LABELS));
    expect(s.board.rejectedLabels).not.toContain("Dir 0");
  });

  it("ignores a blank label rather than recording an empty rejection", () => {
    const s = addCards(empty(), [makeCard({ label: "   ", prompt: "p" })]);
    expect(removeCard(s, s.cards[0]!.id).board.rejectedLabels).toEqual([]);
  });

  it("an unknown id records nothing and returns the same snapshot", () => {
    const s = withCards("A");
    expect(removeCard(s, "card_nope")).toBe(s);
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
    expect(restored.messages).toEqual(s.messages);
    expect(restored.board).toEqual(s.board);
    // Cards come back identical apart from the version stack, which the
    // read migrates in (one derived "initial" version each).
    const bare = (cards: PlanningCard[]) =>
      cards.map(({ versions, currentVersionId, ...rest }) => {
        void versions;
        void currentVersionId;
        return rest;
      });
    expect(bare(restored.cards)).toEqual(bare(s.cards));
    // The rendered card gets its derived stack; the one still generating
    // keeps none until its image lands.
    expect(restored.cards[0]!.versions).toHaveLength(1);
    expect(restored.cards[0]!.currentVersionId).toBe(initialVersionId(s.cards[0]!.id));
    expect(restored.cards[1]!.versions).toBeUndefined();
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

describe("version stack", () => {
  // A card that has only ever had its first render — and every card
  // written before versions existed — looks exactly like this.
  const legacy = (): PlanningCanvasSnapshot => {
    const s = withCards("Atrium");
    return updateCard(s, s.cards[0]!.id, {
      status: "complete",
      imageUrl: "https://cdn/atrium.png",
    });
  };
  const only = (s: PlanningCanvasSnapshot): PlanningCard => s.cards[0]!;

  it("derives an initial version from a legacy card, with a stable id", () => {
    const card = only(legacy());
    const versions = cardVersions(card);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: initialVersionId(card.id),
      imageUrl: "https://cdn/atrium.png",
      prompt: card.prompt,
      source: "initial",
    });
    // Stable across reads — React keys and currentVersionId depend on it.
    expect(cardVersions(card)[0]!.id).toBe(cardVersions(card)[0]!.id);
  });

  it("migrateCard materializes the stack and is idempotent", () => {
    const card = only(legacy());
    const migrated = migrateCard(card);
    expect(migrated.versions).toHaveLength(1);
    expect(migrated.currentVersionId).toBe(initialVersionId(card.id));
    // Second pass changes nothing (same reference, nothing re-derived).
    expect(migrateCard(migrated)).toBe(migrated);
  });

  it("leaves a still-rendering card's stack derived rather than freezing a null image", () => {
    const s = withCards("Pending");
    const card = migrateCard(only(s));
    expect(card.versions).toBeUndefined();
    // Derived on demand, and correct the moment the image lands.
    expect(cardVersions(card)[0]!.imageUrl).toBeNull();
    const done = updateCard(s, card.id, { status: "complete", imageUrl: "https://cdn/late.png" });
    expect(cardVersions(only(done))[0]!.imageUrl).toBe("https://cdn/late.png");
  });

  it("normalizeSnapshot migrates legacy cards on read so old boards keep working", () => {
    const stored = JSON.parse(JSON.stringify(legacy())) as unknown;
    // Whatever was persisted has no versions key at all.
    expect((stored as PlanningCanvasSnapshot).cards[0]!.versions).toBeUndefined();

    const restored = normalizeSnapshot(stored);
    const card = restored.cards[0]!;
    expect(card.versions).toHaveLength(1);
    expect(card.currentVersionId).toBe(initialVersionId(card.id));
    expect(currentVersion(card).imageUrl).toBe("https://cdn/atrium.png");
    // Everything else about the card survives untouched.
    expect(card.label).toBe("Atrium");
    expect(card.imageUrl).toBe("https://cdn/atrium.png");
  });

  it("addCardVersion appends and makes the new version current, without touching the cover", () => {
    const s = legacy();
    const id = only(s).id;
    const v = makeVersion({
      imageUrl: "https://cdn/atrium-v2.png",
      prompt: only(s).prompt,
      source: "annotated",
      note: "2 marks · move this",
      annotations: [{ id: "a1", kind: "pin", x: 0.2, y: 0.8, comment: "move this" }],
    });
    const next = addCardVersion(s, id, v);
    const card = only(next);

    expect(card.versions).toHaveLength(2);
    expect(card.currentVersionId).toBe(v.id);
    expect(currentVersion(card).imageUrl).toBe("https://cdn/atrium-v2.png");
    expect(currentVersion(card).annotations).toHaveLength(1);
    // The board still shows the original — promotion is a separate act.
    expect(card.imageUrl).toBe("https://cdn/atrium.png");
    // Nothing was overwritten.
    expect(card.versions![0]!.imageUrl).toBe("https://cdn/atrium.png");
  });

  it("addCardVersion on an unknown card is a no-op", () => {
    const s = legacy();
    const v = makeVersion({ imageUrl: "x", prompt: "p", source: "prompt-edit" });
    expect(addCardVersion(s, "card_nope", v)).toBe(s);
  });

  it("setCurrentVersion switches without changing the cover", () => {
    const s = legacy();
    const id = only(s).id;
    const v = makeVersion({ imageUrl: "https://cdn/v2.png", prompt: "p2", source: "prompt-edit" });
    const withV2 = addCardVersion(s, id, v);

    const back = setCurrentVersion(withV2, id, initialVersionId(id));
    expect(only(back).currentVersionId).toBe(initialVersionId(id));
    expect(currentVersion(only(back)).imageUrl).toBe("https://cdn/atrium.png");
    expect(only(back).imageUrl).toBe("https://cdn/atrium.png");
    expect(only(back).versions).toHaveLength(2);
  });

  it("setCurrentVersion ignores an unknown version or an unknown card", () => {
    const s = legacy();
    const id = only(s).id;
    expect(setCurrentVersion(s, id, "ver_nope")).toBe(s);
    expect(setCurrentVersion(s, "card_nope", initialVersionId(id))).toBe(s);
  });

  it("promoteVersionToCover makes that version the card's image and prompt", () => {
    const s = legacy();
    const id = only(s).id;
    const v = makeVersion({
      imageUrl: "https://cdn/v2.png",
      prompt: "# SCENE\nrounder",
      source: "prompt-edit",
    });
    const next = promoteVersionToCover(addCardVersion(s, id, v), id, v.id);
    const card = only(next);

    expect(card.imageUrl).toBe("https://cdn/v2.png");
    expect(card.prompt).toBe("# SCENE\nrounder");
    expect(card.currentVersionId).toBe(v.id);
    // Still non-destructive: the original version is right where it was.
    expect(card.versions).toHaveLength(2);
    expect(card.versions![0]!.imageUrl).toBe("https://cdn/atrium.png");
  });

  it("currentVersion falls back to the newest when the pointer dangles", () => {
    const s = legacy();
    const id = only(s).id;
    const v = makeVersion({ imageUrl: "https://cdn/v2.png", prompt: "p2", source: "annotated" });
    const withV2 = addCardVersion(s, id, v);
    const broken = updateCard(withV2, id, { currentVersionId: "ver_gone" });
    expect(currentVersion(only(broken)).id).toBe(v.id);
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
