// useSuperAdmins — list + invite + revoke super admin global role.
// Uses SECURITY DEFINER RPCs list_super_admins() and revoke_super_admin()
// which enforce is_super_admin() on the server side.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SuperAdminRow {
  user_id: string;
  email: string;
  created_at: string;
}

export interface SuperAdminInvite {
  id: string;
  email: string;
  invited_by: string;
  created_at: string;
  expires_at: string | null;
  status: string;
}

export function useSuperAdmins() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["super-admins"],
    enabled: !!user,
    queryFn: async (): Promise<SuperAdminRow[]> => {
      const { data, error } = await supabase.rpc("list_super_admins");
      if (error) throw error;
      return (data ?? []) as SuperAdminRow[];
    },
  });
}

export function useSuperAdminInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["super-admin-invites"],
    enabled: !!user,
    queryFn: async (): Promise<SuperAdminInvite[]> => {
      const { data, error } = await supabase
        .from("pending_invites")
        .select("id, email, invited_by, created_at, expires_at, status")
        .eq("invite_type", "super_admin")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SuperAdminInvite[];
    },
  });
}

export function useInviteSuperAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      if (!user) throw new Error("Not authenticated");
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !trimmed.includes("@")) throw new Error("Invalid email");

      const { data, error } = await supabase
        .from("pending_invites")
        .insert({
          email: trimmed,
          invite_type: "super_admin",
          invited_by: user.id,
          agency_id: null,
          role: null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-invites"] });
    },
  });
}

export function useCancelSuperAdminInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("pending_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-invites"] });
    },
  });
}

export function useRevokeSuperAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.rpc("revoke_super_admin", {
        _target_user_id: targetUserId,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admins"] });
    },
  });
}
