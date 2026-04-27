/**
 * Access gate for edge functions.
 *
 * Use at the top of any sensitive edge function to short-circuit calls from
 * suspended / disabled / trial-expired agencies. Returns a 403 Response with
 * a structured payload the frontend can show to the user.
 *
 * Usage:
 *   const gate = await checkAgencyAccess(supabase, agency_id, "generate");
 *   if (gate) return gate;  // 403 response, return immediately
 *
 * Super admins always pass (when serviceRoleClient is used the helper trusts
 * the caller to have done their own super-admin check upstream).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface AccessDeniedPayload {
  error: "access_denied";
  reason: "suspended" | "disabled" | "trial_expired" | "feature_disabled" | "agency_missing";
  message: string;
  feature?: string;
}

/**
 * Returns null when access is allowed; otherwise returns a Response (403 or 404).
 * The caller should `return` it immediately.
 *
 * @param supabase a service-role client (RLS bypass) so the gate works regardless of caller
 * @param agencyId the agency to check (typically pulled from the request body)
 * @param feature optional feature flag name; when set, the gate also checks
 *   that feature_flags[feature] !== false. Pass undefined to skip feature check.
 */
export async function checkAgencyAccess(
  supabase: SupabaseClient,
  agencyId: string | null | undefined,
  feature?: string,
): Promise<Response | null> {
  if (!agencyId) {
    // No agency context — fail closed.
    return jsonResponse(403, {
      error: "access_denied",
      reason: "agency_missing",
      message: "No agency context for this request.",
    });
  }

  const { data, error } = await supabase
    .from("agencies")
    .select("access_status, trial_ends_at, suspension_reason, feature_flags")
    .eq("id", agencyId)
    .maybeSingle();

  if (error) {
    console.error("[access-gate] agency lookup failed:", error.message);
    return jsonResponse(500, {
      error: "access_denied",
      reason: "agency_missing",
      message: "Could not verify agency access.",
    });
  }

  if (!data) {
    return jsonResponse(404, {
      error: "access_denied",
      reason: "agency_missing",
      message: "Agency not found.",
    });
  }

  const status = data.access_status as "active" | "trial" | "suspended" | "disabled";
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at as string) : null;

  // disabled → harshest
  if (status === "disabled") {
    return jsonResponse(403, {
      error: "access_denied",
      reason: "disabled",
      message: data.suspension_reason || "This agency's access has been disabled.",
    });
  }

  // suspended → softer than disabled, same effect at the API layer
  if (status === "suspended") {
    return jsonResponse(403, {
      error: "access_denied",
      reason: "suspended",
      message: data.suspension_reason || "This agency's access is suspended.",
    });
  }

  // trial expired
  if (status === "trial" && trialEndsAt && trialEndsAt.getTime() <= Date.now()) {
    return jsonResponse(403, {
      error: "access_denied",
      reason: "trial_expired",
      message: "This agency's trial has ended.",
    });
  }

  // Optional per-feature flag check
  if (feature) {
    const flags = (data.feature_flags as Record<string, unknown>) ?? {};
    if (flags[feature] === false) {
      return jsonResponse(403, {
        error: "access_denied",
        reason: "feature_disabled",
        message: `The "${feature}" feature is disabled for this agency.`,
        feature,
      });
    }
  }

  return null; // access granted
}

function jsonResponse(status: number, payload: AccessDeniedPayload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
