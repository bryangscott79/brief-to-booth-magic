// useOnboarding — gating + creation hooks for the mandatory-agency flow.
//
// Every signed-in user must belong to an agency or be a super admin. This
// module exposes:
//
//   useOnboardingState() — { needsOnboarding, hasAgency, hasPendingInvites,
//                            isLoading } — used by ProtectedRoute to redirect
//   useCreateMyAgency()  — mutation that calls create_my_agency RPC

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { useMyPendingInvites } from "@/hooks/useAgencyTeam";

export interface OnboardingState {
  needsOnboarding: boolean;
  hasAgency: boolean;
  hasPendingAgencyInvites: boolean;
  pendingInviteCount: number;
  isLoading: boolean;
}

/**
 * Server + client view of the user's onboarding state.
 * Returns isLoading until every dependency has resolved so callers can avoid
 * UI flicker on first paint.
 */
export function useOnboardingState(): OnboardingState {
  const { user, isLoading: authLoading } = useAuth();
  const { agency, isLoading: agencyLoading } = useAgency();
  const { data: isSuperAdmin, isLoading: superLoading } = useIsSuperAdmin();
  const { data: pendingInvites, isLoading: invitesLoading } = useMyPendingInvites();

  const isLoading =
    authLoading || agencyLoading || superLoading || (!!user && invitesLoading);

  const hasAgency = !!agency;
  const agencyInvites = (pendingInvites || []).filter((i) => i.invite_type === "agency_member");
  const hasPendingAgencyInvites = agencyInvites.length > 0;

  // A user needs onboarding if they're authenticated, have no agency,
  // are not a super admin, AND have no pending agency invites to accept.
  // (If they have a pending invite, they should accept it instead of creating
  // a new agency.)
  const needsOnboarding =
    !!user && !isLoading && !hasAgency && !isSuperAdmin && !hasPendingAgencyInvites;

  return {
    needsOnboarding,
    hasAgency,
    hasPendingAgencyInvites,
    pendingInviteCount: agencyInvites.length,
    isLoading,
  };
}

interface CreateAgencyInput {
  name: string;
  logo_url?: string | null;
  brand_colors?: { primary?: string; secondary?: string } | null;
}

/** Mutation: create the caller's agency. Server backfills orphaned data. */
export function useCreateMyAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAgencyInput) => {
      const { data, error } = await (supabase.rpc as any)("create_my_agency", {
        _name: input.name,
        _logo_url: input.logo_url ?? null,
        _brand_colors: input.brand_colors ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Force every cached query touching agency state to refetch.
      qc.invalidateQueries({ queryKey: ["agency"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["my-pending-invites"] });
    },
  });
}
