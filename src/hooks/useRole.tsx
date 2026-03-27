import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "member" | "client";

const ROLE_PRIORITY: Record<AppRole, number> = {
  super_admin: 4,
  admin: 3,
  member: 2,
  client: 1,
};

export interface UseRoleResult {
  role: AppRole | null;
  companyId: string | null;
  isLoading: boolean;
}

export function useRole(): UseRoleResult {
  const { user } = useAuth();

  const roleQuery = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Fetch all roles for this user
      const { data: roles, error: rolesError } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);

      if (rolesError) throw rolesError;

      // Determine highest-priority role
      let bestRole: AppRole | null = null;
      let bestPriority = 0;

      for (const row of (roles as { role: string }[]) ?? []) {
        const r = row.role as AppRole;
        const p = ROLE_PRIORITY[r] ?? 0;
        if (p > bestPriority) {
          bestPriority = p;
          bestRole = r;
        }
      }

      // Fetch company membership
      const { data: membership, error: memberError } = await (supabase as any)
        .from("company_members")
        .select("company_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (memberError && memberError.code !== "PGRST116") throw memberError;

      return {
        role: bestRole,
        companyId: (membership?.company_id as string) ?? null,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  return {
    role: roleQuery.data?.role ?? null,
    companyId: roleQuery.data?.companyId ?? null,
    isLoading: roleQuery.isLoading,
  };
}
