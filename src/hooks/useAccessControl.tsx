// useAccessControl — super-admin operations on agencies.
//
// Wraps the SECURITY DEFINER RPCs added in
// supabase/migrations/20260427120000_agency_access_control.sql.
//
// All mutations require the caller to be a super admin (server-enforced).
// Hooks return `useMutation` instances, so callers get .mutateAsync(),
// .isPending, .error etc. for free.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EffectiveAccessStatus =
  | "active"
  | "trial"
  | "suspended"
  | "disabled"
  | "trial_expired";

export interface AgencyAdminRow {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  owner_email: string | null;
  access_status: "active" | "trial" | "suspended" | "disabled";
  effective_status: EffectiveAccessStatus;
  trial_ends_at: string | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  feature_flags: Record<string, unknown>;
  quotas: Record<string, unknown>;
  admin_notes: string | null;
  member_count: number;
  client_count: number;
  project_count: number;
  last_activity_at: string;
  created_at: string;
}

export interface AgencyAccessLogEntry {
  id: string;
  action: string;
  performed_by: string | null;
  performer_email: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * List every agency with status, owner email, and counts.
 * Server-side enforces super-admin.
 */
export function useAdminAgencies() {
  return useQuery({
    queryKey: ["admin", "agencies"],
    queryFn: async (): Promise<AgencyAdminRow[]> => {
      const { data, error } = await (supabase.rpc as any)("list_agencies_for_admin");
      if (error) throw error;
      return (data ?? []) as AgencyAdminRow[];
    },
    staleTime: 30_000,
  });
}

/** Audit log for one agency. */
export function useAgencyAccessLog(agencyId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["admin", "agency-access-log", agencyId, limit],
    enabled: !!agencyId,
    queryFn: async (): Promise<AgencyAccessLogEntry[]> => {
      if (!agencyId) return [];
      const { data, error } = await (supabase.rpc as any)("get_agency_access_log", {
        _agency_id: agencyId,
        _limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as AgencyAccessLogEntry[];
    },
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

function invalidateAgencies(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin", "agencies"] });
  qc.invalidateQueries({ queryKey: ["agency"] });
}

export function useSuspendAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, reason }: { agencyId: string; reason?: string | null }) => {
      const { error } = await (supabase.rpc as any)("suspend_agency", {
        _agency_id: agencyId,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useReactivateAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, reason }: { agencyId: string; reason?: string | null }) => {
      const { error } = await (supabase.rpc as any)("reactivate_agency", {
        _agency_id: agencyId,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useDisableAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, reason }: { agencyId: string; reason?: string | null }) => {
      const { error } = await (supabase.rpc as any)("disable_agency", {
        _agency_id: agencyId,
        _reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useSetAgencyTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, endsAt }: { agencyId: string; endsAt: Date | null }) => {
      const { error } = await (supabase.rpc as any)("set_agency_trial", {
        _agency_id: agencyId,
        _ends_at: endsAt ? endsAt.toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useUpdateAgencyFeatureFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, flags }: { agencyId: string; flags: Record<string, unknown> }) => {
      const { error } = await (supabase.rpc as any)("update_agency_feature_flags", {
        _agency_id: agencyId,
        _flags: flags,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useUpdateAgencyQuotas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, quotas }: { agencyId: string; quotas: Record<string, unknown> }) => {
      const { error } = await (supabase.rpc as any)("update_agency_quotas", {
        _agency_id: agencyId,
        _quotas: quotas,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidateAgencies(qc);
      qc.invalidateQueries({ queryKey: ["admin", "agency-access-log", vars.agencyId] });
    },
  });
}

export function useUpdateAgencyAdminNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, notes }: { agencyId: string; notes: string }) => {
      const { error } = await (supabase.rpc as any)("update_agency_admin_notes", {
        _agency_id: agencyId,
        _notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAgencies(qc),
  });
}
