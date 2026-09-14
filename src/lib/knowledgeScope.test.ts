// Regression coverage for the knowledge scope resolver.
//
// What this pins: the agency corpus is only ever searched when these keys
// reach the edge function. The layer was fully built and returned nothing
// for months because the keys were each call site's own responsibility and
// almost no call site supplied them. These tests hold the resolver to the
// contract; knowledgeScopeWiring.test.ts holds the call sites to using it.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted: vi.mock is lifted above the module body, so the doubles it
// closes over have to be created there too.
const { auth, tables } = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  tables: {} as Record<string, any>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth,
    from: (table: string) => tables[table],
  },
}));

import { resolveKnowledgeScope, clearKnowledgeScopeCache } from "./knowledgeScope";

/** `agency_members` — select().eq().order().limit() */
function membership(rows: Array<{ agency_id: string; joined_at: string }>) {
  const limit = vi.fn(async () => ({ data: rows, error: null }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, _limit: limit };
}

/** `projects` — select().eq().maybeSingle() */
function project(
  result: { data: Record<string, unknown> | null; error?: { code: string } | null },
  onSelect?: (cols: string) => void,
) {
  const maybeSingle = vi.fn(async () => ({ data: result.data, error: result.error ?? null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn((cols: string) => {
    onSelect?.(cols);
    return { eq };
  });
  return { select };
}

/** `activation_types` — select() resolves directly */
function activationTypes(rows: Array<{ id: string; slug: string }>) {
  return { select: vi.fn(async () => ({ data: rows, error: null })) };
}

beforeEach(() => {
  clearKnowledgeScopeCache();
  vi.clearAllMocks();
  auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  tables.agency_members = membership([{ agency_id: "agency-1", joined_at: "2026-01-01" }]);
  tables.projects = project({
    data: { agency_id: "agency-9", client_id: "client-2", activation_type: "demo_station" },
  });
  tables.activation_types = activationTypes([{ id: "type-7", slug: "demo_station" }]);
});

describe("resolveKnowledgeScope", () => {
  it("resolves every scope key for a project", async () => {
    expect(await resolveKnowledgeScope("proj-1")).toEqual({
      project_id: "proj-1",
      agency_id: "agency-9",
      client_id: "client-2",
      activation_type_id: "type-7",
    });
  });

  it("translates the activation-type slug to its id", async () => {
    // projects stores the SLUG; the knowledge layer scopes chunks by the
    // activation type's UUID. Passing the slug through searches nothing —
    // which is what the Export step did with a field that never existed.
    const scope = await resolveKnowledgeScope("proj-1");
    expect(scope.activation_type_id).toBe("type-7");
    expect(scope.activation_type_id).not.toBe("demo_station");
  });

  it("falls back to the caller's own agency when the project has none", async () => {
    tables.projects = project({ data: { agency_id: null, client_id: null, activation_type: null } });
    expect(await resolveKnowledgeScope("proj-1")).toEqual({
      project_id: "proj-1",
      agency_id: "agency-1",
    });
  });

  it("prefers the project's agency over the caller's own", async () => {
    // A super admin working another agency's project must retrieve against
    // the agency that owns the work, not against their own membership.
    const scope = await resolveKnowledgeScope("proj-1");
    expect(scope.agency_id).toBe("agency-9");
  });

  it("retries without agency_id when the column is not deployed yet", async () => {
    // migration 20260915000000 adds projects.agency_id. Before it lands
    // PostgREST answers 42703, and failing closed there would silently drop
    // the client and activation scopes too.
    const seen: string[] = [];
    let first = true;
    const maybeSingle = vi.fn(async () =>
      first
        ? ((first = false), { data: null, error: { code: "42703" } })
        : { data: { client_id: "client-2", activation_type: "demo_station" }, error: null },
    );
    tables.projects = {
      select: vi.fn((cols: string) => {
        seen.push(cols);
        return { eq: () => ({ maybeSingle }) };
      }),
    };

    const scope = await resolveKnowledgeScope("proj-1");
    expect(seen[0]).toContain("agency_id");
    expect(seen[1]).not.toContain("agency_id");
    expect(scope).toEqual({
      project_id: "proj-1",
      agency_id: "agency-1",
      client_id: "client-2",
      activation_type_id: "type-7",
    });
  });

  it("omits unknown keys rather than sending nulls", async () => {
    // An absent scope must not be searched. A null scope_id would be.
    tables.projects = project({ data: { agency_id: "agency-9", client_id: null, activation_type: null } });
    const scope = await resolveKnowledgeScope("proj-1");
    expect(Object.keys(scope).sort()).toEqual(["agency_id", "project_id"]);
  });

  it("never throws, and never blocks generation", async () => {
    auth.getUser.mockRejectedValue(new Error("network down"));
    tables.projects = {
      select: () => {
        throw new Error("postgrest exploded");
      },
    };
    await expect(resolveKnowledgeScope("proj-1")).resolves.toEqual({ project_id: "proj-1" });
  });

  it("reads membership once across a batch of eight elements", async () => {
    const members = membership([{ agency_id: "agency-1", joined_at: "2026-01-01" }]);
    tables.agency_members = members;
    tables.projects = project({ data: { agency_id: null, client_id: null, activation_type: null } });

    await Promise.all(Array.from({ length: 8 }, () => resolveKnowledgeScope("proj-1")));
    expect(members._limit).toHaveBeenCalledTimes(1);
  });
});
