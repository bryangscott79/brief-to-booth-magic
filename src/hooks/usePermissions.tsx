import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

export interface UsePermissionsResult {
  canViewProject: boolean;
  canEditProject: boolean;
  canGenerate: boolean;
  canManageTeam: boolean;
  canAccessAdmin: boolean;
  canViewAllProjects: boolean;
  isLoading: boolean;
}

export function usePermissions(projectId?: string): UsePermissionsResult {
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useRole();

  const assignmentQuery = useQuery({
    queryKey: ["project-assignment", user?.id, projectId],
    enabled: !!user?.id && !!projectId && (role === "member" || role === "client"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_assignments")
        .select("id, role")
        .eq("user_id", user!.id)
        .eq("project_id", projectId!)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data as { id: string; role: string } | null;
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = roleLoading || assignmentQuery.isLoading;
  const assignment = assignmentQuery.data;
  const isAssigned = !!assignment;

  if (role === "super_admin") {
    return {
      canViewProject: true,
      canEditProject: true,
      canGenerate: true,
      canManageTeam: true,
      canAccessAdmin: true,
      canViewAllProjects: true,
      isLoading,
    };
  }

  if (role === "admin") {
    return {
      canViewProject: true,
      canEditProject: true,
      canGenerate: true,
      canManageTeam: true,
      canAccessAdmin: true,
      canViewAllProjects: true,
      isLoading,
    };
  }

  if (role === "member") {
    const hasAccess = projectId ? isAssigned : true;
    return {
      canViewProject: hasAccess,
      canEditProject: hasAccess,
      canGenerate: hasAccess,
      canManageTeam: false,
      canAccessAdmin: false,
      canViewAllProjects: false,
      isLoading,
    };
  }

  if (role === "client") {
    const hasAccess = projectId ? isAssigned : false;
    return {
      canViewProject: hasAccess,
      canEditProject: false,
      canGenerate: false,
      canManageTeam: false,
      canAccessAdmin: false,
      canViewAllProjects: false,
      isLoading,
    };
  }

  // No role — no permissions
  return {
    canViewProject: false,
    canEditProject: false,
    canGenerate: false,
    canManageTeam: false,
    canAccessAdmin: false,
    canViewAllProjects: false,
    isLoading,
  };
}
