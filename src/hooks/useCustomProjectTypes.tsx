import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CustomProjectType {
  id: string;
  user_id: string;
  type_id: string;
  label: string;
  short_label: string | null;
  tagline: string | null;
  description: string | null;
  icon: string | null;
  accent_color: string | null;
  render_context: string | null;
  spatial_unit: string | null;
  default_size: number | null;
  is_ai_detected: boolean;
  confirmed_by_user: boolean;
  source_brief_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomProjectTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["custom-project-types", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_project_types" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as CustomProjectType[];
    },
  });
}

export function useUpsertCustomProjectType() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<CustomProjectType> & { type_id: string; label: string }) => {
      const { data, error } = await supabase
        .from("custom_project_types" as any)
        .upsert({ ...input, user_id: user!.id } as any, { onConflict: "user_id,type_id" })
        .select()
        .single();

      if (error) throw error;
      return data as CustomProjectType;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-project-types", user?.id] });
    },
  });
}

export function useConfirmCustomProjectType() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (typeId: string) => {
      const { error } = await supabase
        .from("custom_project_types" as any)
        .update({ confirmed_by_user: true } as any)
        .eq("user_id", user!.id)
        .eq("type_id", typeId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-project-types", user?.id] });
    },
  });
}

export function useDeleteCustomProjectType() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("custom_project_types" as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-project-types", user?.id] });
    },
  });
}
