// What this pins: an automatic writer into the corpus that retrieval reads
// is a loaded gun. Two properties keep it safe, and both are easy to break
// by accident —
//
//   1. capture is CLIENT-scoped, so it informs the next job rather than
//      filing a note where only the project that wrote it can see it;
//   2. capture is IDEMPOTENT, so toggling "carry forward" five times leaves
//      one document, not five near-duplicates competing in the ranking.
//
// Plus the rule that outranks both: capture is a side effect, and a failed
// side effect must never cost the user the work they were actually doing.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { auth, storage, tables, invoke, scope } = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  storage: { upload: vi.fn() },
  tables: {} as Record<string, any>,
  invoke: vi.fn(),
  scope: { resolve: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth,
    storage: { from: () => storage },
    from: (t: string) => tables[t],
    functions: { invoke },
  },
}));

vi.mock("@/lib/knowledgeScope", () => ({
  resolveKnowledgeScope: (...a: unknown[]) => scope.resolve(...a),
}));

import {
  captureToKnowledgeBase,
  approvedDirectionBody,
  clientFeedbackBody,
  AUTO_CAPTURE_TAG,
} from "./knowledgeCapture";

/** knowledge_documents double. `existingId` null → nothing filed yet. */
function docsTable(existingId: string | null) {
  const maybeSingle = vi.fn(async () => ({ data: existingId ? { id: existingId } : null, error: null }));
  const insertSingle = vi.fn(async () => ({ data: { id: "doc-new" }, error: null }));
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const insert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }));
  return {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    insert,
    update,
    _insert: insert,
    _update: update,
  };
}

const request = {
  kind: "approved_direction" as const,
  projectId: "proj-1",
  projectName: "Samsung 5/5",
  title: "Approved direction — Machined Lens Canopy",
  body: "## Direction taken forward\n\nsomething",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  storage.upload.mockResolvedValue({ error: null });
  invoke.mockResolvedValue({ error: null });
  scope.resolve.mockResolvedValue({
    agency_id: "agency-1",
    client_id: "client-2",
    project_id: "proj-1",
  });
  tables.knowledge_documents = docsTable(null);
});

describe("captureToKnowledgeBase", () => {
  it("files against the CLIENT, not the project", async () => {
    const res = await captureToKnowledgeBase(request);
    expect(res).toEqual({ status: "written", documentId: "doc-new", scope: "client" });

    const row = tables.knowledge_documents._insert.mock.calls[0][0];
    expect(row.scope).toBe("client");
    expect(row.scope_id).toBe("client-2");
    // Provenance still records the project it came from.
    expect(row.metadata.project_id).toBe("proj-1");
  });

  it("falls back to agency scope when the project has no client", async () => {
    scope.resolve.mockResolvedValue({ agency_id: "agency-1", project_id: "proj-1" });
    const res = await captureToKnowledgeBase(request);
    expect(res).toMatchObject({ scope: "agency" });
    expect(tables.knowledge_documents._insert.mock.calls[0][0].scope_id).toBe("agency-1");
  });

  it("replaces a project's earlier contribution instead of duplicating it", async () => {
    tables.knowledge_documents = docsTable("doc-existing");
    const res = await captureToKnowledgeBase(request);

    expect(res).toEqual({ status: "written", documentId: "doc-existing", scope: "client" });
    expect(tables.knowledge_documents._update).toHaveBeenCalledTimes(1);
    expect(tables.knowledge_documents._insert).not.toHaveBeenCalled();
    // And it re-embeds, so the replaced text is what retrieval sees.
    expect(invoke).toHaveBeenCalledWith("embed-document", { body: { document_id: "doc-existing" } });
  });

  it("uses a stable storage path so repeat captures overwrite", async () => {
    await captureToKnowledgeBase(request);
    await captureToKnowledgeBase({ ...request, title: "changed", body: "different" });

    const [pathA, , optsA] = storage.upload.mock.calls[0];
    const [pathB] = storage.upload.mock.calls[1];
    expect(pathA).toBe(pathB);
    expect(pathA).toBe("agency-1/client/client-2/auto/approved_direction__proj-1.md");
    expect(optsA.upsert).toBe(true);
  });

  it("tags every captured document so they can be found and removed", async () => {
    await captureToKnowledgeBase(request);
    const row = tables.knowledge_documents._insert.mock.calls[0][0];
    expect(row.user_tags).toContain(AUTO_CAPTURE_TAG);
    expect(row.user_tags).toContain("approved_direction");
    expect(row.metadata.auto_captured).toBe(true);
  });

  it("skips an empty body without touching storage", async () => {
    const res = await captureToKnowledgeBase({ ...request, body: "   \n  " });
    expect(res).toEqual({ status: "skipped", reason: "empty body" });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("skips when there is no agency to file against", async () => {
    scope.resolve.mockResolvedValue({ project_id: "proj-1" });
    expect(await captureToKnowledgeBase(request)).toEqual({ status: "skipped", reason: "no agency" });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("never throws — a failed capture must not cost the user their work", async () => {
    storage.upload.mockRejectedValue(new Error("bucket on fire"));
    await expect(captureToKnowledgeBase(request)).resolves.toMatchObject({ status: "skipped" });

    tables.knowledge_documents = {
      select: () => {
        throw new Error("postgrest exploded");
      },
    };
    storage.upload.mockResolvedValue({ error: null });
    await expect(captureToKnowledgeBase(request)).resolves.toMatchObject({ status: "skipped" });
  });

  it("still reports written when embedding fails", async () => {
    // The row exists and shows as pending in the KB; the capture itself
    // succeeded and the caller has nothing to do about the queue.
    invoke.mockResolvedValue({ error: new Error("edge down") });
    await expect(captureToKnowledgeBase(request)).resolves.toMatchObject({ status: "written" });
  });
});

describe("document bodies", () => {
  it("records what was rejected, not only what was chosen", () => {
    // The scarcer signal: a hundred approvals say less about a client's
    // taste than the things they turned down.
    const body = approvedDirectionBody({
      label: "Machined Lens Canopy",
      rationale: "Reads from three aisles away",
      prompt: "# SCENE ...",
      rejectedLabels: ["Suspended Light Blades", "Expanding Modular Lattice"],
    });
    expect(body).toContain("Machined Lens Canopy");
    expect(body).toContain("Suspended Light Blades");
    expect(body).toContain("Do not re-propose these");
  });

  it("omits the rejected section when nothing was dropped", () => {
    const body = approvedDirectionBody({ label: "A", prompt: "p", rejectedLabels: [] });
    expect(body).not.toContain("dropped");
  });

  it("keeps the client's own words and only the changes actually made", () => {
    const body = clientFeedbackBody({
      summary: "Wants it warmer",
      rawFeedback: "The arch feels cold and corporate.",
      items: [
        { instruction: "Warm the lighting", status: "applied" },
        { instruction: "Remove the arch entirely", status: "skipped" },
      ],
    });
    expect(body).toContain("The arch feels cold and corporate.");
    expect(body).toContain("Warm the lighting");
    expect(body).not.toContain("Remove the arch entirely");
  });
});
