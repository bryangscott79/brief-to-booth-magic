import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useIsAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("id")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();

      if (error) return false;
      return !!data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useAdminUsers() {
  const { data: isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-all-users"],
    enabled: !!isAdmin,
    queryFn: async () => {
      // Fetch all projects — admin RLS policy allows this
      const { data: projects, error } = await supabase
        .from("projects")
        .select("id, name, status, project_type, user_id, created_at, updated_at, client_id")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Group by user
      const byUser: Record<string, typeof projects> = {};
      for (const p of projects ?? []) {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
      }

      return byUser;
    },
  });
}

export function useGrantAdminRole() {
  return async (userId: string) => {
    const { error } = await supabase
      .from("user_roles" as any)
      .insert({ user_id: userId, role: "admin" } as any);
    if (error) throw error;
  };
}

export function useRevokeAdminRole() {
  return async (userId: string) => {
    const { error } = await supabase
      .from("user_roles" as any)
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) throw error;
  };
}
