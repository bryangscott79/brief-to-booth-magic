/**
 * The one place that answers "which knowledge applies to this call?".
 *
 * Every generation edge function gates retrieval on `agency_id`: when it is
 * missing, buildRagContext returns an empty context and the agency's corpus
 * is never consulted. Assembling those keys used to be each call site's own
 * job, so almost none of them did it — the knowledge base was written to
 * constantly and read never. Routing every call through this module makes
 * retrieval the default instead of something a new call site has to
 * remember.
 *
 * Nothing here may throw or block generation. A render that loses its
 * knowledge context is worse than one without it, but a render that never
 * happens is worse still, so every failure degrades to a narrower scope.
 */

import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeScope {
  /** Required by every retrieval path — no agency, no knowledge. */
  agency_id?: string;
  client_id?: string;
  activation_type_id?: string;
  project_id?: string;
}

/** Scope keys, so tests and call-site audits agree on the contract. */
export const KNOWLEDGE_SCOPE_KEYS = [
  "agency_id",
  "client_id",
  "activation_type_id",
  "project_id",
] as const;

// ── caches ──────────────────────────────────────────────────────────────────
// A batch run generates eight elements back to back; without caching that is
// eight identical membership lookups before any work starts. Agency
// membership and activation-type slugs are stable for a session; the project
// row is cached briefly so a batch shares one read without going stale
// across a step change.

const PROJECT_TTL_MS = 30_000;

type ProjectRow = {
  agency_id: string | null;
  client_id: string | null;
  activation_type: string | null;
} | null;

// Promises, not values. Generating eight elements fires eight resolutions
// in the same tick, so a cache that only fills on completion is a cache
// every one of them misses — eight identical round trips before any work
// starts. Storing the in-flight promise collapses them into one.
let agencyPromise: { userId: string; promise: Promise<string | null> } | null = null;
let activationPromise: Promise<Map<string, string>> | null = null;
const projectPromises = new Map<string, { at: number; promise: Promise<ProjectRow> }>();

/** Drops every cached lookup. Call on sign-out and between tests. */
export function clearKnowledgeScopeCache(): void {
  agencyPromise = null;
  activationPromise = null;
  projectPromises.clear();
}

// ── lookups ─────────────────────────────────────────────────────────────────

async function currentUserAgencyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return null;
  if (agencyPromise?.userId === userId) return agencyPromise.promise;

  const promise = (async () => {
    const { data, error } = await supabase
      .from("agency_members")
      .select("agency_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1);
    return error ? null : (data?.[0]?.agency_id ?? null);
  })();

  agencyPromise = { userId, promise };
  return promise;
}

/**
 * Reads the project's own scope keys.
 *
 * `projects.agency_id` is added by migration 20260915000000; until that is
 * applied the column is absent and PostgREST answers 42703. Retrying
 * without it keeps this working on both sides of the deploy rather than
 * failing closed and silently dropping the client and activation scopes
 * too.
 */
async function projectRow(projectId: string): Promise<ProjectRow> {
  const hit = projectPromises.get(projectId);
  if (hit && Date.now() - hit.at < PROJECT_TTL_MS) return hit.promise;

  const promise = readProjectRow(projectId);
  projectPromises.set(projectId, { at: Date.now(), promise });
  return promise;
}

async function readProjectRow(projectId: string): Promise<ProjectRow> {
  const read = async (withAgency: boolean) =>
    await supabase
      .from("projects")
      .select(withAgency ? "agency_id, client_id, activation_type" : "client_id, activation_type")
      .eq("id", projectId)
      .maybeSingle();

  let res = await read(true);
  if (res.error?.code === "42703") res = await read(false);

  const raw = (res.error ? null : res.data) as
    | { agency_id?: string | null; client_id?: string | null; activation_type?: string | null }
    | null;

  return raw
    ? {
        agency_id: raw.agency_id ?? null,
        client_id: raw.client_id ?? null,
        activation_type: raw.activation_type ?? null,
      }
    : null;
}

/**
 * `projects.activation_type` stores the activation-type SLUG, while the
 * knowledge layer scopes chunks by the activation type's UUID. Without this
 * translation the activation scope is simply never searched — which is what
 * the Export step has been doing, reading a `currentProject.activation_type_id`
 * that has never existed.
 */
async function activationTypeIdForSlug(slug: string): Promise<string | null> {
  activationPromise ??= (async () => {
    const { data, error } = await supabase.from("activation_types").select("id, slug");
    const map = new Map<string, string>();
    if (!error && data) {
      for (const t of data as Array<{ id: string; slug: string }>) map.set(t.slug, t.id);
    }
    return map;
  })();
  return (await activationPromise).get(slug) ?? null;
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Builds the knowledge scope for a generation call. Spread the result into
 * the edge-function body:
 *
 *   const body = { ...rest, ...(await resolveKnowledgeScope(projectId)) };
 *
 * Keys are omitted rather than set to null, so an unknown scope is simply
 * not searched instead of being searched for nothing.
 */
export async function resolveKnowledgeScope(
  projectId?: string | null,
): Promise<KnowledgeScope> {
  try {
    const scope: KnowledgeScope = {};
    if (projectId) scope.project_id = projectId;

    const row = projectId ? await projectRow(projectId) : null;

    // The project's own agency wins: a super admin has no membership row of
    // their own, and must still retrieve against the agency that owns the
    // work rather than against nothing.
    const agencyId = row?.agency_id ?? (await currentUserAgencyId());
    if (agencyId) scope.agency_id = agencyId;

    if (row?.client_id) scope.client_id = row.client_id;
    if (row?.activation_type) {
      const id = await activationTypeIdForSlug(row.activation_type);
      if (id) scope.activation_type_id = id;
    }

    return scope;
  } catch {
    // Retrieval is an enhancement; never let it take generation down.
    return projectId ? { project_id: projectId } : {};
  }
}
