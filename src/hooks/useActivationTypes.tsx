import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ActivationType, ActivationCategory, ElementEmphasis } from "@/types/brief";

// ─── DB ROW SHAPE ─────────────────────────────────────────────────────────────

interface ActivationTypeRow {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  category: ActivationCategory;
  parent_type_affinity: string[];
  default_scale: string | null;
  default_sqft: number | null;
  element_emphasis: Record<string, ElementEmphasis> | null;
  render_context_override: string | null;
  is_builtin: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToActivationType(r: ActivationTypeRow): ActivationType {
  return {
    id: r.id,
    slug: r.slug,
    label: r.label,
    description: r.description,
    icon: r.icon,
    category: r.category,
    parentTypeAffinity: r.parent_type_affinity ?? [],
    defaultScale: r.default_scale,
    defaultSqft: r.default_sqft,
    elementEmphasis: r.element_emphasis,
    renderContextOverride: r.render_context_override,
    isBuiltin: r.is_builtin,
  };
}

// ─── QUERY: ALL ACTIVATION TYPES ──────────────────────────────────────────────

export function useActivationTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activation-types", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Fetch builtins + user's custom types
      const { data, error } = await supabase
        .from("activation_types" as any)
        .select("*")
        .or(`is_builtin.eq.true,user_id.eq.${user!.id}`)
        .order("category")
        .order("label");

      if (error) throw error;
      return ((data ?? []) as unknown as ActivationTypeRow[]).map(rowToActivationType);
    },
  });
}

// ─── MUTATION: CREATE ─────────────────────────────────────────────────────────

interface CreateActivationTypeInput {
  slug: string;
  label: string;
  description?: string | null;
  icon?: string | null;
  category: ActivationCategory;
  parentTypeAffinity?: string[];
  defaultScale?: string | null;
  defaultSqft?: number | null;
  elementEmphasis?: Record<string, ElementEmphasis> | null;
  renderContextOverride?: string | null;
}

export function useCreateActivationType() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivationTypeInput) => {
      const { data, error } = await supabase
        .from("activation_types" as any)
        .insert({
          slug: input.slug,
          label: input.label,
          description: input.description ?? null,
          icon: input.icon ?? null,
          category: input.category,
          parent_type_affinity: input.parentTypeAffinity ?? [],
          default_scale: input.defaultScale ?? null,
          default_sqft: input.defaultSqft ?? null,
          element_emphasis: input.elementEmphasis ?? null,
          render_context_override: input.renderContextOverride ?? null,
          is_builtin: false,
          user_id: user!.id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return rowToActivationType(data as unknown as ActivationTypeRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation-types", user?.id] });
    },
  });
}

// ─── MUTATION: UPDATE ─────────────────────────────────────────────────────────

interface UpdateActivationTypeInput {
  id: string;
  slug?: string;
  label?: string;
  description?: string | null;
  icon?: string | null;
  category?: ActivationCategory;
  parentTypeAffinity?: string[];
  defaultScale?: string | null;
  defaultSqft?: number | null;
  elementEmphasis?: Record<string, ElementEmphasis> | null;
  renderContextOverride?: string | null;
}

export function useUpdateActivationType() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateActivationTypeInput) => {
      const updates: Record<string, unknown> = {};
      if (input.slug !== undefined) updates.slug = input.slug;
      if (input.label !== undefined) updates.label = input.label;
      if (input.description !== undefined) updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.category !== undefined) updates.category = input.category;
      if (input.parentTypeAffinity !== undefined) updates.parent_type_affinity = input.parentTypeAffinity;
      if (input.defaultScale !== undefined) updates.default_scale = input.defaultScale;
      if (input.defaultSqft !== undefined) updates.default_sqft = input.defaultSqft;
      if (input.elementEmphasis !== undefined) updates.element_emphasis = input.elementEmphasis;
      if (input.renderContextOverride !== undefined) updates.render_context_override = input.renderContextOverride;

      const { data, error } = await supabase
        .from("activation_types" as any)
        .update(updates as any)
        .eq("id", id)
        .eq("user_id", user!.id)
        .select()
        .single();

      if (error) throw error;
      return rowToActivationType(data as unknown as ActivationTypeRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation-types", user?.id] });
    },
  });
}

// ─── MUTATION: DELETE ─────────────────────────────────────────────────────────

export function useDeleteActivationType() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("activation_types" as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation-types", user?.id] });
    },
  });
}
