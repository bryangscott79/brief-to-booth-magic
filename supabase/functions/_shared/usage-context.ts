// Extracts caller identity (user_id, agency_id) from a request.
// Edge functions invoke this once per request and pass the result down to
// ai-gateway calls so logged events are correctly attributed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface UsageContext {
  user_id?: string | null;
  agency_id?: string | null;
  project_id?: string | null;
  client_id?: string | null;
  /** Logical feature name (e.g. "generate-hero"). Always set by caller. */
  feature: string;
}

/**
 * Resolve user_id from JWT in Authorization header. Returns null if no
 * valid auth (anonymous calls still get logged, just without user attribution).
 */
export async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data } = await supabase.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve user_id, then look up the user's primary agency_id (first
 * membership). For multi-agency users, callers should pass agency_id
 * explicitly via the request body.
 */
export async function resolveAgencyId(
  userId: string | null,
  hint?: string | null,
): Promise<string | null> {
  if (hint) return hint;
  if (!userId) return null;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await supabase
      .from("agency_members")
      .select("agency_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return data?.agency_id ?? null;
  } catch {
    return null;
  }
}

/**
 * One-shot: build a UsageContext from a request + feature name + optional hints.
 */
export async function buildUsageContext(
  req: Request,
  feature: string,
  hints?: { agency_id?: string | null; project_id?: string | null; client_id?: string | null },
): Promise<UsageContext> {
  const user_id = await resolveUserId(req);
  const agency_id = await resolveAgencyId(user_id, hints?.agency_id);
  return {
    feature,
    user_id,
    agency_id,
    project_id: hints?.project_id ?? null,
    client_id: hints?.client_id ?? null,
  };
}
