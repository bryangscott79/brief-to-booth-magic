import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ─── Is current user admin (agency admin OR super admin)? ─────────────────────
export function useIsAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("id, role")
        .eq("user_id", user!.id)
        .in("role" as any, ["admin", "super_admin"]);

      if (error) return false;
      return !!(data as any[])?.length;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Is current user super admin (platform owner)? ────────────────────────────
export function useIsSuperAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-super-admin", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("id")
        .eq("user_id", user!.id)
        .eq("role" as any, "super_admin")
        .maybeSingle();

      if (error) return false;
      return !!data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Profile type ─────────────────────────────────────────────────────────────
export interface UserProfile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_super_admin: boolean;
  created_at: string;
  projects?: ProjectSummary[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  project_type: string;
  updated_at: string;
  created_at: string;
}

// ─── All user profiles (admin/super_admin only) ───────────────────────────────
export function useAdminProfiles() {
  const { data: isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-all-profiles"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data: profiles, error: profilesErr } = await supabase
        .rpc("get_all_user_profiles" as any);
      if (profilesErr) throw profilesErr;

      const { data: projects, error: projectsErr } = await supabase
        .from("projects")
        .select("id, name, status, project_type, user_id, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (projectsErr) throw projectsErr;

      const byUser: Record<string, ProjectSummary[]> = {};
      for (const p of projects ?? []) {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
      }

      return ((profiles as UserProfile[]) ?? []).map((profile) => ({
        ...profile,
        is_super_admin: (profile as any).is_super_admin ?? false,
        projects: byUser[profile.user_id] ?? [],
      }));
    },
  });
}

// Legacy hook (still used elsewhere)
export function useAdminUsers() {
  const { data: isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-all-users"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data: projects, error } = await supabase
        .from("projects")
        .select("id, name, status, project_type, user_id, created_at, updated_at, client_id")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const byUser: Record<string, typeof projects> = {};
      for (const p of projects ?? []) {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
      }

      return byUser;
    },
  });
}

// ─── Invite user (admin/super_admin only) ─────────────────────────────────────
export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-invite-user", {
        body: { email, role },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-all-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-platform-invites"] });
    },
  });
}

// ─── Platform invites list ────────────────────────────────────────────────────
export function usePlatformInvites() {
  const { data: isAdmin } = useIsAdmin();

  return useQuery({
    queryKey: ["admin-platform-invites"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_invites" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as Array<{
        id: string;
        email: string;
        role: string;
        accepted_at: string | null;
        expires_at: string;
        created_at: string;
      }>;
    },
  });
}

// ─── Manage role (super_admin only) ──────────────────────────────────────────
export function useManageAdminRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      target_user_id,
      action,
    }: {
      target_user_id: string;
      action: "grant_admin" | "revoke_admin" | "grant_super_admin" | "revoke_super_admin";
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-manage-role", {
        body: { target_user_id, action },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-all-profiles"] });
      qc.invalidateQueries({ queryKey: ["is-admin"] });
      qc.invalidateQueries({ queryKey: ["is-super-admin"] });
    },
  });
}

// ─── Grant/Revoke helpers (kept for backward compat) ─────────────────────────
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

// ─── Ensure profile row exists for current user ───────────────────────────────
export function useEnsureProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ensure-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { error } = await supabase
        .from("profiles" as any)
        .upsert(
          {
            user_id: user.id,
            email: user.email,
            display_name: user.user_metadata?.display_name ?? null,
          },
          { onConflict: "user_id" }
        );
      if (error) console.error("Profile upsert error:", error);
      return true;
    },
    staleTime: Infinity,
  });
}
