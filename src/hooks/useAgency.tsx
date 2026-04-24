import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

export type AgencyRole = "owner" | "admin" | "member" | "viewer";

const ROLE_PRIORITY: Record<AgencyRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};

function normalizeRole(role: string | null | undefined): AgencyRole | null {
  if (!role) return null;
  if (role === "owner" || role === "admin" || role === "member" || role === "viewer") {
    return role;
  }
  return null;
}

export interface UseAgencyResult {
  agency: Tables<"agencies"> | null;
  role: AgencyRole | null;
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Returns the current user's primary agency (highest-role membership).
 *
 * If a user has multiple memberships, priority is: owner > admin > member > viewer.
 */
export function useAgency(): UseAgencyResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["agency", user?.id];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return { agency: null, role: null } as const;

      const { data, error } = await supabase
        .from("agency_members")
        .select("role, agencies:agency_id(*)")
        .eq("user_id", user.id);

      if (error) throw error;

      if (!data || data.length === 0) {
        return { agency: null, role: null } as const;
      }

      // Pick the highest-priority role membership
      const sorted = [...data].sort((a, b) => {
        const aRole = normalizeRole(a.role) ?? "viewer";
        const bRole = normalizeRole(b.role) ?? "viewer";
        return ROLE_PRIORITY[aRole] - ROLE_PRIORITY[bRole];
      });

      const top = sorted[0];
      const role = normalizeRole(top.role);
      // Supabase's embed type can be an array in some cases; narrow to the row.
      const agencyRel = top.agencies as unknown;
      let agency: Tables<"agencies"> | null = null;
      if (Array.isArray(agencyRel)) {
        agency = (agencyRel[0] as Tables<"agencies"> | undefined) ?? null;
      } else if (agencyRel) {
        agency = agencyRel as Tables<"agencies">;
      }

      return { agency, role } as const;
    },
    enabled: !!user,
  });

  return {
    agency: query.data?.agency ?? null,
    role: query.data?.role ?? null,
    isLoading: query.isLoading,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  };
}

/** Mutation: update fields on the user's primary agency. */
export function useUpdateAgency() {
  const { agency } = useAgency();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Tables<"agencies">>) => {
      if (!agency?.id) throw new Error("No active agency");
      const { error } = await supabase
        .from("agencies")
        .update(updates)
        .eq("id", agency.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agency"] });
    },
  });
}
