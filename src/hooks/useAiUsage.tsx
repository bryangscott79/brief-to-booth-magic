// useAiUsage — React Query hooks for the ai_usage_* RPCs.
//
// Schema alignment: this file targets the RPC signatures defined in
// supabase/migrations/20260507214400_*.sql:
//   • ai_usage_fleet_totals(_from, _to)  → totals + unique counts
//   • ai_usage_by_agency(_from, _to)     → per-agency leaderboard
//   • ai_usage_by_user(_from, _to)       → cross-agency per-user totals
//   • ai_usage_by_feature(_from, _to)    → per-feature breakdown
//
// All RPCs are SECURITY DEFINER and gate on is_super_admin server-side,
// so unauthorized callers get an empty result rather than a 403 — the
// UI just shows "no data" gracefully.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The new ai_usage_* RPCs aren't in the generated Database types until
// types are regenerated. Cast the rpc surface through `any` so we can
// reference functions by string name.
const rpc = (supabase.rpc as unknown) as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: any; error: any }>;

export interface UsageRange {
  since: Date;
  until: Date;
}

/** Build a UsageRange from a UI preset chip. */
export function rangeFromPreset(preset: "today" | "7d" | "30d" | "90d"): UsageRange {
  const until = new Date();
  const since = new Date(until);
  if (preset === "today") {
    since.setHours(0, 0, 0, 0);
  } else if (preset === "7d") {
    since.setDate(since.getDate() - 7);
  } else if (preset === "30d") {
    since.setDate(since.getDate() - 30);
  } else if (preset === "90d") {
    since.setDate(since.getDate() - 90);
  }
  return { since, until };
}

// ─── Fleet totals ──────────────────────────────────────────────────────────

export interface FleetTotals {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  unique_agencies: number;
  unique_users: number;
}

export function useAiUsageFleetTotals(range: UsageRange) {
  return useQuery({
    queryKey: ["ai-usage", "fleet-totals", range.since.toISOString(), range.until.toISOString()],
    queryFn: async (): Promise<FleetTotals | null> => {
      const { data, error } = await rpc("ai_usage_fleet_totals", {
        _from: range.since.toISOString(),
        _to: range.until.toISOString(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        total_calls: Number(row.total_calls ?? 0),
        total_input_tokens: Number(row.total_input_tokens ?? 0),
        total_output_tokens: Number(row.total_output_tokens ?? 0),
        total_cost_usd: Number(row.total_cost_usd ?? 0),
        unique_agencies: Number(row.unique_agencies ?? 0),
        unique_users: Number(row.unique_users ?? 0),
      };
    },
  });
}

// ─── Per-agency leaderboard ────────────────────────────────────────────────

export interface AgencyUsageRow {
  agency_id: string | null;
  agency_name: string | null;
  calls: number;
  total_tokens: number;
  cost_usd: number;
}

export function useAiUsageByAgency(range: UsageRange) {
  return useQuery({
    queryKey: ["ai-usage", "by-agency", range.since.toISOString(), range.until.toISOString()],
    queryFn: async (): Promise<AgencyUsageRow[]> => {
      const { data, error } = await rpc("ai_usage_by_agency", {
        _from: range.since.toISOString(),
        _to: range.until.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        agency_id: r.agency_id ?? null,
        agency_name: r.agency_name ?? null,
        calls: Number(r.calls ?? 0),
        total_tokens: Number(r.total_tokens ?? 0),
        cost_usd: Number(r.cost_usd ?? 0),
      }));
    },
  });
}

// ─── Cross-agency per-user (global) ────────────────────────────────────────

export interface UserUsageRow {
  user_id: string | null;
  user_email: string | null;
  calls: number;
  total_tokens: number;
  cost_usd: number;
}

export function useAiUsageByUser(range: UsageRange) {
  return useQuery({
    queryKey: ["ai-usage", "by-user", range.since.toISOString(), range.until.toISOString()],
    queryFn: async (): Promise<UserUsageRow[]> => {
      const { data, error } = await rpc("ai_usage_by_user", {
        _from: range.since.toISOString(),
        _to: range.until.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id ?? null,
        user_email: r.user_email ?? null,
        calls: Number(r.calls ?? 0),
        total_tokens: Number(r.total_tokens ?? 0),
        cost_usd: Number(r.cost_usd ?? 0),
      }));
    },
  });
}

// ─── Per-feature breakdown ─────────────────────────────────────────────────

export interface FeatureUsageRow {
  feature: string;
  model: string | null;
  calls: number;
  total_tokens: number;
  cost_usd: number;
}

export function useAiUsageByFeature(range: UsageRange) {
  return useQuery({
    queryKey: ["ai-usage", "by-feature", range.since.toISOString(), range.until.toISOString()],
    queryFn: async (): Promise<FeatureUsageRow[]> => {
      const { data, error } = await rpc("ai_usage_by_feature", {
        _from: range.since.toISOString(),
        _to: range.until.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        feature: String(r.feature ?? ""),
        model: r.model ?? null,
        calls: Number(r.calls ?? 0),
        total_tokens: Number(r.total_tokens ?? 0),
        cost_usd: Number(r.cost_usd ?? 0),
      }));
    },
  });
}

// ─── Index helpers for inline join into other lists ────────────────────────

export function indexUsageByUserId(rows: UserUsageRow[]): Map<string, UserUsageRow> {
  const m = new Map<string, UserUsageRow>();
  for (const r of rows) if (r.user_id) m.set(r.user_id, r);
  return m;
}

export function indexUsageByAgencyId(rows: AgencyUsageRow[]): Map<string, AgencyUsageRow> {
  const m = new Map<string, AgencyUsageRow>();
  for (const r of rows) if (r.agency_id) m.set(r.agency_id, r);
  return m;
}
