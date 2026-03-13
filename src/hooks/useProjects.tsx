import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import type { ParsedBrief } from "@/types/brief";

export interface DBProject {
  id: string;
  user_id: string;
  name: string;
  status: string;
  project_type: string;
  client_id: string | null;
  brief_text: string | null;
  brief_file_name: string | null;
  brief_file_url: string | null;
  parsed_brief: ParsedBrief | null;
  big_idea: any;
  experience_framework: any;
  interactive_mechanics: any;
  digital_storytelling: any;
  human_connection: any;
  adjacent_activations: any;
  spatial_strategy: any;
  budget_logic: any;
  hero_prompt: string | null;
  hero_style_confirmed: boolean;
  render_prompts: any;
  created_at: string;
  updated_at: string;
}

export function useProjects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as DBProject[];
    },
    enabled: !!user,
  });

  const createProject = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name,
          status: "draft",
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as unknown as DBProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
      toast({
        title: "Project created",
        description: "Your new project is ready.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProject = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Omit<DBProject, 'id' | 'user_id' | 'created_at'>> }) => {
      const { data, error } = await supabase
        .from("projects")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data as unknown as DBProject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
    },
    onError: (error) => {
      toast({
        title: "Error updating project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
      toast({
        title: "Project deleted",
        description: "Your project has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting project",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    projects,
    isLoading,
    createProject,
    updateProject,
    deleteProject,
  };
}

export function useProject(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as DBProject | null;
    },
    enabled: !!id && !!user,
  });
}
