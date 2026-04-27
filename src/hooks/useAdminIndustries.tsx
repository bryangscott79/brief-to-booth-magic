// useAdminIndustries — super-admin CRUD on the industries table + the
// activation/project types tagged to each.
//
// All hooks call SECURITY DEFINER RPCs that enforce is_super_admin server-side.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IndustryVocabulary } from "./useIndustries";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AdminIndustryRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  vocabulary: IndustryVocabulary;
  sort_order: number;
  is_builtin: boolean;
  project_type_count: number;
  agency_count: number;
  primary_agency_count: number;
  knowledge_doc_count: number;
  created_at: string;
  updated_at: string;
}

export interface IndustryActivationTypeRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  category: string;
  default_scale: string | null;
  default_sqft: number | null;
  industries: string[];
  is_builtin: boolean;
  user_id: string | null;
}

// ─── Queries ───────────────────────────────────────────────────────────────

export function useAdminIndustries() {
  return useQuery({
    queryKey: ["admin", "industries"],
    queryFn: async (): Promise<AdminIndustryRow[]> => {
      const { data, error } = await (supabase.rpc as any)("list_industries_for_admin");
      if (error) throw error;
      return (data ?? []) as AdminIndustryRow[];
    },
    staleTime: 30_000,
  });
}

export function useActivationTypesByIndustry(industrySlug: string | undefined) {
  return useQuery({
    queryKey: ["admin", "industry-types", industrySlug],
    enabled: !!industrySlug,
    queryFn: async (): Promise<IndustryActivationTypeRow[]> => {
      if (!industrySlug) return [];
      const { data, error } = await (supabase.rpc as any)("list_activation_types_by_industry", {
        _industry_slug: industrySlug,
      });
      if (error) throw error;
      return (data ?? []) as IndustryActivationTypeRow[];
    },
  });
}

/** All activation types (across every industry) for the assignment picker. */
export function useAllActivationTypes() {
  return useQuery({
    queryKey: ["admin", "all-activation-types"],
    queryFn: async (): Promise<IndustryActivationTypeRow[]> => {
      const { data, error } = await (supabase.from("activation_types" as any) as any)
        .select("id, slug, label, description, icon, category, default_scale, default_sqft, industries, is_builtin, user_id")
        .order("is_builtin", { ascending: false })
        .order("category")
        .order("label");
      if (error) throw error;
      return (data ?? []) as IndustryActivationTypeRow[];
    },
    staleTime: 60_000,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin", "industries"] });
  qc.invalidateQueries({ queryKey: ["industries"] });
  qc.invalidateQueries({ queryKey: ["activation-types"] });
}

export function useCreateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      slug: string;
      label: string;
      description?: string | null;
      icon?: string | null;
      vocabulary?: IndustryVocabulary;
      sort_order?: number;
    }) => {
      const { data, error } = await (supabase.rpc as any)("admin_create_industry", {
        _slug: input.slug.toLowerCase(),
        _label: input.label,
        _description: input.description ?? null,
        _icon: input.icon ?? null,
        _vocabulary: input.vocabulary ?? {},
        _sort_order: input.sort_order ?? 100,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      slug: string;
      label?: string;
      description?: string | null;
      icon?: string | null;
      vocabulary?: IndustryVocabulary;
      sort_order?: number;
    }) => {
      const { data, error } = await (supabase.rpc as any)("admin_update_industry", {
        _slug: input.slug,
        _label: input.label ?? null,
        _description: input.description ?? null,
        _icon: input.icon ?? null,
        _vocabulary: input.vocabulary ?? null,
        _sort_order: input.sort_order ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, force = false }: { slug: string; force?: boolean }) => {
      const { error } = await (supabase.rpc as any)("admin_delete_industry", {
        _slug: slug,
        _force: force,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSetActivationTypeIndustries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      activationTypeId,
      industries,
    }: {
      activationTypeId: string;
      industries: string[];
    }) => {
      const { error } = await (supabase.rpc as any)("admin_set_activation_type_industries", {
        _activation_type_id: activationTypeId,
        _industries: industries,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ["admin", "industry-types"] });
      qc.invalidateQueries({ queryKey: ["admin", "all-activation-types"] });
      // Note: industries array changed for one type — also invalidate by-industry caches
      void vars;
    },
  });
}

/**
 * Fallback for environments where the seed migration didn't auto-apply:
 * calls the seed_canopy_defaults() RPC which inserts the 5 launch
 * industries (idempotent) and returns before/after counts.
 */
export function useSeedCanopyDefaults() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("seed_canopy_defaults");
      if (error) throw error;
      return data as {
        industries_before: number;
        industries_after: number;
        industries_added: number;
        types_before: number;
        types_after: number;
      };
    },
    onSuccess: () => {
      invalidate(qc);
    },
  });
}
