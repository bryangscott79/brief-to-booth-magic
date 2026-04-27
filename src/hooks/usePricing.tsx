// usePricing — read/write the BOM (plan_items) and call the pricing engine.
//
// Phase 1A capabilities:
//   - List/create/update/delete plan_items for a project
//   - Run price_plan() RPC to get priced BOM
//   - Run project_pricing_summary() RPC for header roll-ups
// Deferred (Phase 1B+):
//   - rate-card CSV import, AI estimate trigger, snapshots, inventory

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "./useAgency";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlanItem {
  id: string;
  project_id: string;
  agency_id: string;
  csi_division: string | null;
  uniformat_class: string | null;
  category: string | null;
  item_key: string;
  description: string;
  manufacturer: string | null;
  model_number: string | null;
  quantity: number;
  unit: string;
  quality_tier: "basic" | "standard" | "premium" | "custom";
  position: Record<string, unknown> | null;
  override_unit_price: number | null;
  override_currency: string | null;
  override_reason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PricedItem {
  item_id: string;
  item_key: string;
  description: string;
  manufacturer: string | null;
  csi_division: string | null;
  category: string | null;
  quality_tier: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  total_price: number | null;
  currency: string;
  source: string;
  source_id: string | null;
  source_label: string | null;
  region_used: string | null;
  regional_factor: number;
  fetched_at: string | null;
  confidence: "high" | "medium" | "low" | null;
  is_priced: boolean;
}

export interface PricingSummaryRow {
  csi_division: string | null;
  category: string | null;
  item_count: number;
  priced_count: number;
  subtotal: number;
  unpriced_count: number;
}

interface PricingOptions {
  region?: string | null;
  quality_tier?: "basic" | "standard" | "premium" | "custom" | null;
}

// ─── Plan items: list + CRUD ────────────────────────────────────────────────

export function usePlanItems(projectId: string | undefined) {
  return useQuery({
    queryKey: ["plan-items", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<PlanItem[]> => {
      const { data, error } = await (supabase.from("plan_items" as any) as any)
        .select("*")
        .eq("project_id", projectId)
        .order("csi_division", { ascending: true, nullsFirst: false })
        .order("category", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanItem[];
    },
  });
}

interface CreatePlanItemInput {
  project_id: string;
  item_key: string;
  description: string;
  quantity?: number;
  unit?: string;
  category?: string | null;
  csi_division?: string | null;
  uniformat_class?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  quality_tier?: "basic" | "standard" | "premium" | "custom";
  override_unit_price?: number | null;
  notes?: string | null;
}

export function useCreatePlanItem() {
  const qc = useQueryClient();
  const { agency } = useAgency();
  return useMutation({
    mutationFn: async (input: CreatePlanItemInput) => {
      if (!agency?.id) throw new Error("No active agency");
      const { data, error } = await (supabase.from("plan_items" as any) as any)
        .insert({
          project_id: input.project_id,
          agency_id: agency.id,
          item_key: input.item_key,
          description: input.description,
          quantity: input.quantity ?? 1,
          unit: input.unit ?? "each",
          category: input.category ?? null,
          csi_division: input.csi_division ?? null,
          uniformat_class: input.uniformat_class ?? null,
          manufacturer: input.manufacturer ?? null,
          model_number: input.model_number ?? null,
          quality_tier: input.quality_tier ?? "standard",
          override_unit_price: input.override_unit_price ?? null,
          notes: input.notes ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as PlanItem;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["plan-items", variables.project_id] });
      qc.invalidateQueries({ queryKey: ["priced-plan", variables.project_id] });
      qc.invalidateQueries({ queryKey: ["pricing-summary", variables.project_id] });
    },
  });
}

export function useUpdatePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      project_id: string;
      updates: Partial<PlanItem>;
    }) => {
      const { error } = await (supabase.from("plan_items" as any) as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["plan-items", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["priced-plan", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["pricing-summary", vars.project_id] });
    },
  });
}

export function useDeletePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_id }: { id: string; project_id: string }) => {
      const { error } = await (supabase.from("plan_items" as any) as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { project_id };
    },
    onSuccess: ({ project_id }) => {
      qc.invalidateQueries({ queryKey: ["plan-items", project_id] });
      qc.invalidateQueries({ queryKey: ["priced-plan", project_id] });
      qc.invalidateQueries({ queryKey: ["pricing-summary", project_id] });
    },
  });
}

// ─── Pricing engine ─────────────────────────────────────────────────────────

export function usePricedPlan(projectId: string | undefined, options: PricingOptions = {}) {
  return useQuery({
    queryKey: ["priced-plan", projectId, options.region, options.quality_tier],
    enabled: !!projectId,
    queryFn: async (): Promise<PricedItem[]> => {
      const { data, error } = await (supabase.rpc as any)("price_plan", {
        _project_id: projectId,
        _region: options.region ?? null,
        _quality_tier: options.quality_tier ?? null,
      });
      if (error) throw error;
      return (data ?? []) as PricedItem[];
    },
    staleTime: 30_000,
  });
}

export function usePricingSummary(projectId: string | undefined, options: PricingOptions = {}) {
  return useQuery({
    queryKey: ["pricing-summary", projectId, options.region, options.quality_tier],
    enabled: !!projectId,
    queryFn: async (): Promise<PricingSummaryRow[]> => {
      const { data, error } = await (supabase.rpc as any)("project_pricing_summary", {
        _project_id: projectId,
        _region: options.region ?? null,
        _quality_tier: options.quality_tier ?? null,
      });
      if (error) throw error;
      return (data ?? []) as PricingSummaryRow[];
    },
    staleTime: 30_000,
  });
}
