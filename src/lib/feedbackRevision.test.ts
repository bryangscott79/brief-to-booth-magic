import { describe, expect, it, vi } from "vitest";
import {
  applyFeedbackRound,
  buildRevisionEditInstruction,
  collectRevisedTargets,
  resolveItemTargets,
  selectCurrentRenders,
  summarizeRoundProgress,
  type CurrentRender,
  type EditRenderFn,
  type FeedbackRevisionItem,
} from "./feedbackRevision";

// ─── fixtures ────────────────────────────────────────────────────────────────

const RENDERS: CurrentRender[] = [
  {
    angleId: "hero_34__v__abc__cfg__20x40",
    baseAngleId: "hero_34",
    angleName: "3/4 Hero View",
    imageUrl: "https://img/hero.png",
    configKey: "20x40",
  },
  {
    angleId: "front__v__abc__cfg__20x40",
    baseAngleId: "front",
    angleName: "Front Elevation",
    imageUrl: "https://img/front.png",
    configKey: "20x40",
  },
  {
    angleId: "lounge__v__abc__cfg__20x40",
    baseAngleId: "lounge",
    angleName: "Lounge Interior",
    imageUrl: "https://img/lounge.png",
    configKey: "20x40",
  },
];

function item(over: Partial<FeedbackRevisionItem> = {}): FeedbackRevisionItem {
  return {
    id: "i1",
    angleId: "all",
    instruction: "Make the lounge feel more open.",
    scope: "global",
    confidence: 0.8,
    include: true,
    status: "pending",
    ...over,
  };
}

// ─── item → target-image resolution ──────────────────────────────────────────

describe("resolveItemTargets", () => {
  it("fans a global item out to every current render", () => {
    const targets = resolveItemTargets({ angleId: "all", scope: "global" }, RENDERS);
    expect(targets).toHaveLength(3);
    expect(targets.map((t) => t.angleId)).toEqual([
      "hero_34__v__abc__cfg__20x40",
      "front__v__abc__cfg__20x40",
      "lounge__v__abc__cfg__20x40",
    ]);
    expect(targets.every((t) => t.status === "pending")).toBe(true);
    expect(targets[0].beforeUrl).toBe("https://img/hero.png");
  });

  it("fans out on scope=global even when an angleId was named", () => {
    const targets = resolveItemTargets({ angleId: "front", scope: "global" }, RENDERS);
    expect(targets).toHaveLength(3);
  });

  it("targets a single render by BASE angle id", () => {
    const targets = resolveItemTargets({ angleId: "lounge", scope: "single" }, RENDERS);
    expect(targets).toHaveLength(1);
    expect(targets[0].angleName).toBe("Lounge Interior");
    expect(targets[0].beforeUrl).toBe("https://img/lounge.png");
  });

  it("targets a single render by its FULL versioned/config-scoped angle id", () => {
    const targets = resolveItemTargets(
      { angleId: "front__v__abc__cfg__20x40", scope: "single" },
      RENDERS,
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].baseAngleId).toBe("front");
  });

  it("returns nothing when a single item names an angle that isn't rendered", () => {
    expect(resolveItemTargets({ angleId: "rear", scope: "single" }, RENDERS)).toEqual([]);
  });

  it("returns nothing when there are no renders at all", () => {
    expect(resolveItemTargets({ angleId: "all", scope: "global" }, [])).toEqual([]);
  });
});

describe("selectCurrentRenders", () => {
  const images = [
    {
      angle_id: "hero_34__v__abc__cfg__20x40",
      angle_name: "3/4 Hero View",
      public_url: "https://img/hero.png",
      is_current: true,
      prompt_artifacts: null,
    },
    {
      angle_id: "front__v__abc__cfg__20x40",
      angle_name: "Front",
      public_url: "https://img/front.png",
      is_current: true,
      prompt_artifacts: null,
    },
    {
      angle_id: "front__v__abc__cfg__10x10",
      angle_name: "Front",
      public_url: "https://img/front-small.png",
      is_current: true,
      prompt_artifacts: null,
    },
    {
      angle_id: "front__v__old__cfg__20x40",
      angle_name: "Front",
      public_url: "https://img/front-old.png",
      is_current: false,
      prompt_artifacts: null,
    },
  ];

  it("keeps only current renders for the active config, hero first", () => {
    const out = selectCurrentRenders(images, "20x40", "20x40");
    expect(out.map((r) => r.angleId)).toEqual([
      "hero_34__v__abc__cfg__20x40",
      "front__v__abc__cfg__20x40",
    ]);
  });

  it("treats untagged legacy renders as belonging to the first config", () => {
    const legacy = [
      {
        angle_id: "hero_34",
        angle_name: "3/4 Hero View",
        public_url: "https://img/legacy.png",
        is_current: true,
        prompt_artifacts: null,
      },
    ];
    expect(selectCurrentRenders(legacy, "20x40", "20x40")).toHaveLength(1);
    expect(selectCurrentRenders(legacy, "10x10", "20x40")).toHaveLength(0);
  });

  it("skips the config filter when the project has no configs", () => {
    expect(selectCurrentRenders(images, null, null)).toHaveLength(3);
  });
});

// ─── the edit-instruction builder ────────────────────────────────────────────

describe("buildRevisionEditInstruction", () => {
  const note = "Can the header sign be about 30% bigger? The client wants it readable from the aisle.";

  it("includes the client's note verbatim", () => {
    const out = buildRevisionEditInstruction({
      instruction: note,
      angleName: "Front Elevation",
      scope: "single",
    });
    expect(out).toContain(note);
  });

  it("locks booth, camera, lighting, people and environment", () => {
    const out = buildRevisionEditInstruction({
      instruction: note,
      angleName: "Front Elevation",
      scope: "single",
    }).toLowerCase();
    for (const locked of [
      "booth structure",
      "floor",
      "furnishings",
      "people",
      "environment",
      "lighting",
      "camera angle",
    ]) {
      expect(out).toContain(locked);
    }
    expect(out).toContain("identical to the reference image");
    // Must NOT invite a regeneration.
    expect(out).toContain("do not redesign");
  });

  it("names the view being edited and the booth size when given", () => {
    const out = buildRevisionEditInstruction({
      instruction: note,
      angleName: "Lounge Interior",
      scope: "single",
      boothSizeLabel: "20x40",
    });
    expect(out).toContain("VIEW BEING EDITED: Lounge Interior · 20x40");
  });

  it("marks a global change as applying consistently across views", () => {
    const out = buildRevisionEditInstruction({
      instruction: "Swap the blue panels for warm oak.",
      angleName: "Front Elevation",
      scope: "global",
    });
    expect(out).toContain("every view");
    expect(out).not.toContain("this view only");
  });

  it("marks a single change as scoped to one view", () => {
    const out = buildRevisionEditInstruction({
      instruction: "Move the counter right.",
      angleName: "Front Elevation",
      scope: "single",
    });
    expect(out).toContain("this view only");
  });
});

// ─── batch status transitions ────────────────────────────────────────────────

describe("summarizeRoundProgress", () => {
  it("is parsed with nothing started", () => {
    const p = summarizeRoundProgress([item(), item({ id: "i2" })]);
    expect(p.status).toBe("parsed");
    expect(p).toMatchObject({ total: 2, pending: 2, applied: 0, failed: 0 });
  });

  it("ignores excluded items entirely", () => {
    const p = summarizeRoundProgress([
      item({ id: "i1", include: false, status: "pending" }),
      item({ id: "i2", status: "applied" }),
    ]);
    expect(p.total).toBe(1);
    expect(p.applied).toBe(1);
    expect(p.status).toBe("applied");
  });

  it("is applying while any included item is in flight", () => {
    const p = summarizeRoundProgress([
      item({ id: "i1", status: "applied" }),
      item({ id: "i2", status: "applying" }),
    ]);
    expect(p.status).toBe("applying");
    expect(p.running).toBe(1);
  });

  it("is applied once every included item reaches a terminal state", () => {
    const p = summarizeRoundProgress([
      item({ id: "i1", status: "applied" }),
      item({ id: "i2", status: "error" }),
      item({ id: "i3", status: "skipped" }),
    ]);
    expect(p.status).toBe("applied");
    expect(p).toMatchObject({ applied: 1, failed: 1, skipped: 1 });
  });

  it("counts finished target images for the progress bar", () => {
    const p = summarizeRoundProgress([
      item({
        id: "i1",
        status: "applying",
        targets: [
          { angleId: "a", baseAngleId: "a", angleName: "A", beforeUrl: "u", status: "done" },
          { angleId: "b", baseAngleId: "b", angleName: "B", beforeUrl: "u", status: "error" },
          { angleId: "c", baseAngleId: "c", angleName: "C", beforeUrl: "u", status: "running" },
        ],
      }),
    ]);
    expect(p.imagesTotal).toBe(3);
    expect(p.imagesDone).toBe(2);
  });

  it("stays parsed when nothing is included", () => {
    expect(summarizeRoundProgress([item({ include: false })]).status).toBe("parsed");
    expect(summarizeRoundProgress([]).status).toBe("parsed");
  });
});

// ─── the batch runner ────────────────────────────────────────────────────────

describe("applyFeedbackRound", () => {
  const okEdit: EditRenderFn = async (input) => ({
    imageUrl: `${input.previousImageUrl}#revised`,
    modelUsed: "google/gemini-3-pro-image-preview",
    promptUsed: input.feedback,
  });

  it("edits every render for a global item and saves under the same angle id", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [item()],
      renders: RENDERS,
      edit: okEdit,
      save,
    });

    expect(items[0].status).toBe("applied");
    expect(items[0].targets).toHaveLength(3);
    expect(items[0].targets?.every((t) => t.status === "done")).toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
    // Same full angle id in → same full angle id out (save-render-image then
    // flips the previous row to is_current=false).
    expect(save.mock.calls.map((c) => c[0].angleId)).toEqual(
      RENDERS.map((r) => r.angleId),
    );
    expect(save.mock.calls[0][0].imageDataUrl).toBe("https://img/hero.png#revised");
  });

  it("passes the locked instruction (not the bare note) to the edit call", async () => {
    const edit = vi.fn(okEdit);
    await applyFeedbackRound({
      projectId: "p1",
      items: [item({ angleId: "front", scope: "single" })],
      renders: RENDERS,
      edit,
      save: vi.fn().mockResolvedValue(undefined),
      boothSizeLabel: "20x40",
    });
    const sent = edit.mock.calls[0][0];
    expect(sent.previousImageUrl).toBe("https://img/front.png");
    expect(sent.feedback).toContain("Make the lounge feel more open.");
    expect(sent.feedback.toLowerCase()).toContain("identical to the reference image");
  });

  it("skips an item whose target no longer exists, without touching the others", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [
        item({ id: "gone", angleId: "rear", scope: "single" }),
        item({ id: "ok", angleId: "front", scope: "single" }),
      ],
      renders: RENDERS,
      edit: okEdit,
      save,
    });
    expect(items.find((i) => i.id === "gone")?.status).toBe("skipped");
    expect(items.find((i) => i.id === "ok")?.status).toBe("applied");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("leaves excluded items untouched", async () => {
    const edit = vi.fn(okEdit);
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [item({ id: "off", include: false })],
      renders: RENDERS,
      edit,
      save: vi.fn().mockResolvedValue(undefined),
    });
    expect(items[0].status).toBe("pending");
    expect(edit).not.toHaveBeenCalled();
  });

  it("does not abort the batch when one image fails", async () => {
    const edit: EditRenderFn = async (input) => {
      if (input.previousImageUrl.includes("front")) throw new Error("content filter");
      return { imageUrl: `${input.previousImageUrl}#revised` };
    };
    const save = vi.fn().mockResolvedValue(undefined);
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [item()],
      renders: RENDERS,
      edit,
      save,
    });

    expect(save).toHaveBeenCalledTimes(2);
    const targets = items[0].targets ?? [];
    expect(targets.find((t) => t.baseAngleId === "front")?.status).toBe("error");
    expect(targets.filter((t) => t.status === "done")).toHaveLength(2);
    // Partial success still counts as applied, with the failure surfaced.
    expect(items[0].status).toBe("applied");
    expect(items[0].error).toBe("1 of 3 views failed");
  });

  it("marks an item errored when every one of its images fails", async () => {
    const edit: EditRenderFn = async () => {
      throw new Error("gateway exploded");
    };
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [item({ angleId: "front", scope: "single" })],
      renders: RENDERS,
      edit,
      save: vi.fn().mockResolvedValue(undefined),
    });
    expect(items[0].status).toBe("error");
    expect(items[0].error).toContain("gateway exploded");
  });

  it("retries once on a transient error and succeeds", async () => {
    let calls = 0;
    const edit: EditRenderFn = async (input) => {
      calls += 1;
      if (calls === 1) throw new Error("503 BOOT_ERROR");
      return { imageUrl: `${input.previousImageUrl}#revised` };
    };
    const items = await applyFeedbackRound({
      projectId: "p1",
      items: [item({ angleId: "front", scope: "single" })],
      renders: RENDERS,
      edit,
      save: vi.fn().mockResolvedValue(undefined),
    });
    expect(calls).toBe(2);
    expect(items[0].status).toBe("applied");
  });

  it("never runs more than `concurrency` edits at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const edit: EditRenderFn = async (input) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { imageUrl: `${input.previousImageUrl}#revised` };
    };
    await applyFeedbackRound({
      projectId: "p1",
      items: [item(), item({ id: "i2" })],
      renders: RENDERS,
      edit,
      save: vi.fn().mockResolvedValue(undefined),
      concurrency: 3,
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("reports live status transitions through onItemsChange", async () => {
    const seen: string[] = [];
    await applyFeedbackRound({
      projectId: "p1",
      items: [item({ angleId: "front", scope: "single" })],
      renders: RENDERS,
      edit: okEdit,
      save: vi.fn().mockResolvedValue(undefined),
      onItemsChange: (items) => {
        const target = items[0].targets?.[0]?.status ?? "none";
        seen.push(`${items[0].status}:${target}`);
      },
    });
    expect(seen[0]).toBe("applying:pending");
    expect(seen).toContain("applying:running");
    expect(seen[seen.length - 1]).toBe("applied:done");
  });
});

describe("collectRevisedTargets", () => {
  it("returns one before/after pair per revised angle, keeping the original before image", () => {
    const pairs = collectRevisedTargets([
      item({
        id: "global",
        targets: [
          {
            angleId: "front",
            baseAngleId: "front",
            angleName: "Front",
            beforeUrl: "v1",
            afterUrl: "v2",
            status: "done",
          },
        ],
      }),
      item({
        id: "single",
        targets: [
          {
            angleId: "front",
            baseAngleId: "front",
            angleName: "Front",
            beforeUrl: "v2",
            afterUrl: "v3",
            status: "done",
          },
        ],
      }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ beforeUrl: "v1", afterUrl: "v3" });
  });

  it("ignores targets that failed or never ran", () => {
    expect(
      collectRevisedTargets([
        item({
          targets: [
            { angleId: "a", baseAngleId: "a", angleName: "A", beforeUrl: "u", status: "error" },
            { angleId: "b", baseAngleId: "b", angleName: "B", beforeUrl: "u", status: "pending" },
          ],
        }),
      ]),
    ).toEqual([]);
  });
});
