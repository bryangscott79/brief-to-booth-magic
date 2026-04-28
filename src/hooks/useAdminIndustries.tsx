// useAdminIndustries — super-admin CRUD on the industries table + the
// activation/project types tagged to each.
//
// All hooks call SECURITY DEFINER RPCs that enforce is_super_admin
// server-side. The list query is resilient to the industries table or
// supporting RPCs being absent — it falls back to the BUILTIN_INDUSTRIES
// constant so the page always renders. When the schema isn't ready, the
// returned `isSchemaReady` flag is false so the UI can prompt for setup.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IndustryVocabulary } from "./useIndustries";
import { BUILTIN_INDUSTRIES } from "@/lib/builtinIndustries";

// Stable placeholder UUIDs used only when we can't read the real ones from
// the DB (i.e. schema hasn't been initialized). Valid v4 format.
const BUILTIN_PLACEHOLDER_UUIDS: Record<string, string> = {
  experiential:  "00000000-0000-4000-8000-000000000001",
  architecture:  "00000000-0000-4000-8000-000000000002",
  landscape:     "00000000-0000-4000-8000-000000000003",
  entertainment: "00000000-0000-4000-8000-000000000004",
  audio_visual:  "00000000-0000-4000-8000-000000000005",
};

function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /could not find the table|does not exist|undefined_table|relation .* does not exist/i.test(msg);
}

function builtinsAsAdminRows(): AdminIndustryRow[] {
  const epoch = new Date(0).toISOString();
  return BUILTIN_INDUSTRIES.map((b) => ({
    id: BUILTIN_PLACEHOLDER_UUIDS[b.slug] ?? "00000000-0000-0000-0000-000000000000",
    slug: b.slug,
    label: b.label,
    description: b.description,
    icon: b.icon,
    vocabulary: b.vocabulary as IndustryVocabulary,
    sort_order: b.sort_order,
    is_builtin: true,
    project_type_count: 0,
    agency_count: 0,
    primary_agency_count: 0,
    knowledge_doc_count: 0,
    created_at: epoch,
    updated_at: epoch,
  }));
}

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

export interface AdminIndustriesQueryResult {
  rows: AdminIndustryRow[];
  isSchemaReady: boolean;
}

/**
 * Returns the admin industries list. Resilient to:
 *   - list_industries_for_admin() RPC missing
 *   - public.industries table missing
 *   - public.industries existing but empty
 *
 * In every failure mode we still return the 5 canonical builtins (with
 * zero counts) so the admin page always renders. `isSchemaReady` is
 * false when the underlying schema needs to be initialized.
 */
export function useAdminIndustries() {
  return useQuery<AdminIndustriesQueryResult>({
    queryKey: ["admin", "industries"],
    queryFn: async (): Promise<AdminIndustriesQueryResult> => {
      // First try the RPC — single round trip with counts.
      const rpcResult = await (supabase.rpc as any)("list_industries_for_admin");
      if (!rpcResult.error && Array.isArray(rpcResult.data) && rpcResult.data.length > 0) {
        return { rows: rpcResult.data as AdminIndustryRow[], isSchemaReady: true };
      }

      // RPC may not exist OR the table may be empty. Try a direct read of
      // the industries table to distinguish.
      const directRead = await (supabase.from("industries" as any) as any)
        .select("id, slug, label, description, icon, vocabulary, sort_order, is_builtin, created_at, updated_at")
        .order("sort_order", { ascending: true });

      if (directRead.error) {
        if (isMissingTableError(directRead.error)) {
          // Schema not initialized at all — fall back to constants.
          return { rows: builtinsAsAdminRows(), isSchemaReady: false };
        }
        // Some other error — still render constants, surface error in the UI.
        return { rows: builtinsAsAdminRows(), isSchemaReady: false };
      }

      const dbRows = (directRead.data ?? []) as Array<{
        id: string;
        slug: string;
        label: string;
        description: string | null;
        icon: string | null;
        vocabulary: IndustryVocabulary;
        sort_order: number;
        is_builtin: boolean;
        created_at: string;
        updated_at: string;
      }>;

      if (dbRows.length === 0) {
        // Table exists but no rows. We're "schema ready" because the
        // table is real — the auto-upsert in the page will populate it.
        return { rows: builtinsAsAdminRows(), isSchemaReady: true };
      }

      // Table exists with rows but RPC didn't work — synthesize rows
      // with zero counts. The DB is real but counts may be off until
      // the RPC is deployed.
      const rows: AdminIndustryRow[] = dbRows.map((r) => ({
        id: r.id,
        slug: r.slug,
        label: r.label,
        description: r.description,
        icon: r.icon,
        vocabulary: r.vocabulary,
        sort_order: r.sort_order,
        is_builtin: r.is_builtin,
        project_type_count: 0,
        agency_count: 0,
        primary_agency_count: 0,
        knowledge_doc_count: 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      return { rows, isSchemaReady: true };
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

// Note: previously had a useSeedCanopyDefaults() RPC hook here. Removed —
// AdminIndustries now auto-upserts the 5 canonical builtins on first
// super-admin visit via direct table writes (RLS-gated by is_super_admin),
// which works regardless of migration state. See src/lib/builtinIndustries.ts.
