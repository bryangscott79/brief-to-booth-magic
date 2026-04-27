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

export type AgencyAccessStatus = "active" | "trial" | "suspended" | "disabled" | "trial_expired";

export interface AgencyAccessState {
  /** Raw access_status column value. */
  accessStatus: "active" | "trial" | "suspended" | "disabled";
  /** Computed: same as accessStatus, but flips trial → trial_expired when trial_ends_at has passed. */
  effectiveStatus: AgencyAccessStatus;
  /** True when the agency may write data (active or unexpired trial). */
  canWrite: boolean;
  /** True for the harshest state — disabled or trial_expired. */
  isLockedOut: boolean;
  /** True for any non-active state that should show a banner. */
  isRestricted: boolean;
  /** Reason text shown to the user when suspended. */
  suspensionReason: string | null;
  /** When the trial ends (if on trial). */
  trialEndsAt: Date | null;
  /** Days remaining on trial; null if not on trial. */
  trialDaysRemaining: number | null;
}

export interface UseAgencyResult {
  agency: Tables<"agencies"> | null;
  role: AgencyRole | null;
  access: AgencyAccessState | null;
  isLoading: boolean;
  refresh: () => void;
}

function deriveAccessState(agency: Tables<"agencies"> | null): AgencyAccessState | null {
  if (!agency) return null;
  const raw = ((agency as any).access_status ?? "active") as AgencyAccessState["accessStatus"];
  const trialEndsAt = (agency as any).trial_ends_at ? new Date((agency as any).trial_ends_at as string) : null;

  let effective: AgencyAccessStatus = raw;
  if (raw === "trial" && trialEndsAt && trialEndsAt.getTime() <= Date.now()) {
    effective = "trial_expired";
  }

  const canWrite = raw === "active" || (raw === "trial" && effective !== "trial_expired");
  const isLockedOut = effective === "disabled" || effective === "trial_expired";
  const isRestricted = effective !== "active";

  let trialDaysRemaining: number | null = null;
  if (raw === "trial" && trialEndsAt) {
    const ms = trialEndsAt.getTime() - Date.now();
    trialDaysRemaining = Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  return {
    accessStatus: raw,
    effectiveStatus: effective,
    canWrite,
    isLockedOut,
    isRestricted,
    suspensionReason: ((agency as any).suspension_reason as string | null) ?? null,
    trialEndsAt,
    trialDaysRemaining,
  };
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

  const agency = query.data?.agency ?? null;
  return {
    agency,
    role: query.data?.role ?? null,
    access: deriveAccessState(agency),
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
