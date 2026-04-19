import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

// ---------- Types ----------

export interface TeamMember {
  id: string;
  user_id: string;
  team_owner_id: string;
  role: "admin" | "designer" | "viewer";
  display_name: string;
  invited_email: string | null;
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface ProjectInvite {
  id: string;
  project_id: string;
  created_by: string;
  token: string;
  email: string | null;
  scope: "upload_only" | "view_comment" | "full_edit";
  label: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
}

// ---------- Team Members ----------

export function useTeamMembers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["team-members", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .or(`team_owner_id.eq.${user.id},user_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as TeamMember[];
    },
    enabled: !!user,
  });
}

export function useInviteTeamMember() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      email,
      displayName,
      role,
    }: {
      email: string;
      displayName: string;
      role: "admin" | "designer" | "viewer";
    }) => {
      if (!user) throw new Error("Not authenticated");

      // For now, create the team member record with a placeholder user_id.
      // When the invited user signs up / accepts, we update user_id.
      // We use the owner's ID as a placeholder — the accept flow will update it.
      const { data, error } = await supabase
        .from("team_members" as any)
        .insert({
          user_id: user.id, // placeholder until invite is accepted
          team_owner_id: user.id,
          role,
          display_name: displayName,
          invited_email: email,
          invited_by: user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as TeamMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", user?.id] });
      toast({ title: "Team member invited", description: "Invitation sent successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error inviting team member", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTeamMember() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<TeamMember, "role" | "display_name">>;
    }) => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as TeamMember;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", user?.id] });
      toast({ title: "Team member updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating team member", description: error.message, variant: "destructive" });
    },
  });
}

export function useRemoveTeamMember() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_members" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", user?.id] });
      toast({ title: "Team member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error removing team member", description: error.message, variant: "destructive" });
    },
  });
}

// ---------- Project Invites ----------

export function useProjectInvites(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-invites", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_invites" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ProjectInvite[];
    },
    enabled: !!projectId,
  });
}

export function useCreateInviteLink() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      projectId,
      scope,
      label,
      email,
      expiresInDays = 7,
    }: {
      projectId: string;
      scope: "upload_only" | "view_comment" | "full_edit";
      label?: string;
      email?: string;
      expiresInDays?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const { data, error } = await supabase
        .from("project_invites" as any)
        .insert({
          project_id: projectId,
          created_by: user.id,
          scope,
          label: label || null,
          email: email || null,
          expires_at: expiresAt.toISOString(),
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as ProjectInvite;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-invites", variables.projectId] });
      toast({ title: "Invite link created", description: "Share this link with your contractor." });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating invite", description: error.message, variant: "destructive" });
    },
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from("project_invites" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ["project-invites", projectId] });
      toast({ title: "Invite revoked" });
    },
    onError: (error: Error) => {
      toast({ title: "Error revoking invite", description: error.message, variant: "destructive" });
    },
  });
}

export function useAcceptInvite() {
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (token: string) => {
      if (!user) throw new Error("Not authenticated");

      // Find the invite by token
      const { data: invite, error: fetchError } = await supabase
        .from("project_invites" as any)
        .select("*")
        .eq("token", token)
        .is("accepted_at", null)
        .single();

      if (fetchError || !invite) throw new Error("Invalid or expired invite link");

      const inviteData = invite as unknown as ProjectInvite;

      // Check expiry
      if (new Date(inviteData.expires_at) < new Date()) {
        throw new Error("This invite link has expired");
      }

      // Accept the invite
      const { error: updateError } = await supabase
        .from("project_invites" as any)
        .update({
          accepted_at: new Date().toISOString(),
          accepted_by: user.id,
        } as any)
        .eq("id", inviteData.id);

      if (updateError) throw updateError;

      return inviteData;
    },
    onSuccess: (invite) => {
      toast({
        title: "Invite accepted!",
        description: `You now have ${invite.scope.replace("_", " ")} access to this project.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error accepting invite", description: error.message, variant: "destructive" });
    },
  });
}

// ---------- Role helpers ----------

export type UserRole = "owner" | "admin" | "designer" | "viewer" | "contractor";

export function useCurrentRole(): { role: UserRole; isLoading: boolean } {
  const { user } = useAuth();
  const { data: teamMembers, isLoading } = useTeamMembers();

  if (!user || isLoading) return { role: "owner", isLoading };

  // Check if this user is a team member of someone else's team
  const membership = teamMembers?.find(
    (tm) => tm.user_id === user.id && tm.team_owner_id !== user.id && tm.accepted_at
  );

  if (membership) {
    return { role: membership.role, isLoading: false };
  }

  // Default: the user is the owner of their own workspace
  return { role: "owner", isLoading: false };
}
