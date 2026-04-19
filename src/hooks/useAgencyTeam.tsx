// useAgencyTeam — list + invite + update-role + remove agency members.
// Uses SECURITY DEFINER RPC list_agency_members() which returns emails.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface AgencyMemberRow {
  id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
  is_primary_owner: boolean;
}

export interface AgencyInvite {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: string;
  expires_at: string | null;
  status: string;
}

export function useAgencyTeam(agencyId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency-team", agencyId],
    enabled: !!user && !!agencyId,
    queryFn: async (): Promise<AgencyMemberRow[]> => {
      const { data, error } = await supabase.rpc("list_agency_members", {
        _agency_id: agencyId!,
      });
      if (error) throw error;
      return (data ?? []) as AgencyMemberRow[];
    },
  });
}

export function useAgencyInvites(agencyId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["agency-invites", agencyId],
    enabled: !!user && !!agencyId,
    queryFn: async (): Promise<AgencyInvite[]> => {
      const { data, error } = await supabase
        .from("pending_invites")
        .select("id, email, role, invited_by, created_at, expires_at, status")
        .eq("invite_type", "agency_member")
        .eq("agency_id", agencyId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgencyInvite[];
    },
  });
}

export function useInviteAgencyMember(agencyId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: "admin" | "member" | "viewer" }) => {
      if (!user || !agencyId) throw new Error("Missing agency context");
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !trimmed.includes("@")) throw new Error("Invalid email");

      const { data, error } = await supabase
        .from("pending_invites")
        .insert({
          email: trimmed,
          invite_type: "agency_member",
          agency_id: agencyId,
          role,
          invited_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-invites", agencyId] });
    },
  });
}

export function useCancelAgencyInvite(agencyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("pending_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-invites", agencyId] });
    },
  });
}

export function useUpdateAgencyMemberRole(agencyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: "owner" | "admin" | "member" | "viewer" }) => {
      const { error } = await supabase
        .from("agency_members")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-team", agencyId] });
    },
  });
}

export function useRemoveAgencyMember(agencyId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("agency_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-team", agencyId] });
    },
  });
}

// For invitees: list my pending invites
export function useMyPendingInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-pending-invites", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pending_invites");
      if (error) throw error;
      return data as Array<{
        id: string;
        invite_type: string;
        agency_id: string | null;
        agency_name: string | null;
        role: string | null;
        invited_by: string;
        created_at: string;
        expires_at: string | null;
      }>;
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc("accept_pending_invite", { _invite_id: inviteId });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-pending-invites"] });
      qc.invalidateQueries({ queryKey: ["agency"] });
      qc.invalidateQueries({ queryKey: ["super-admins"] });
    },
  });
}
