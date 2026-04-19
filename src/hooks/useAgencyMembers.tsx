import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AgencyMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email?: string;
  full_name?: string;
}

export interface UseAgencyMembersResult {
  members: AgencyMember[];
  isLoading: boolean;
}

/**
 * Returns the list of members for an agency.
 *
 * Attempts to enrich each row with email/display_name from `profiles` table
 * (best-effort — missing rows are handled gracefully).
 */
export function useAgencyMembers(agencyId: string | undefined): UseAgencyMembersResult {
  const query = useQuery({
    queryKey: ["agency-members", agencyId],
    queryFn: async (): Promise<AgencyMember[]> => {
      if (!agencyId) return [];

      const { data: rows, error } = await supabase
        .from("agency_members")
        .select("id, user_id, role, joined_at")
        .eq("agency_id", agencyId)
        .order("joined_at", { ascending: true });

      if (error) throw error;
      if (!rows || rows.length === 0) return [];

      const userIds = rows.map((r) => r.user_id);

      // Best-effort profile enrichment — profiles table may or may not
      // contain a row for each user. Missing rows are handled gracefully.
      const { data: profiles } = await supabase
        .from("profiles" as any)
        .select("user_id, email, display_name")
        .in("user_id", userIds);

      const byId = new Map<string, { email?: string; display_name?: string }>();
      if (Array.isArray(profiles)) {
        const profileRows = profiles as unknown as Array<{
          user_id: string;
          email?: string;
          display_name?: string;
        }>;
        for (const p of profileRows) {
          byId.set(p.user_id, { email: p.email, display_name: p.display_name });
        }
      }

      return rows.map((r) => {
        const profile = byId.get(r.user_id);
        return {
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          joined_at: r.joined_at,
          email: profile?.email,
          full_name: profile?.display_name,
        };
      });
    },
    enabled: !!agencyId,
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
  };
}
