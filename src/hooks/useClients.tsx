import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  industry: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandIntelligenceEntry {
  id: string;
  user_id: string;
  client_id: string;
  category: "visual_identity" | "strategic_voice" | "vendor_material" | "process_procedure" | "cost_benchmark" | "past_learning";
  title: string;
  content: string;
  tags: string[] | null;
  source: "manual" | "ai_extracted" | "feedback";
  confidence_score: number | null;
  source_project_id: string | null;
  is_approved: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTypeConfig {
  id: string;
  user_id: string;
  project_type_id: string;
  label: string | null;
  tagline: string | null;
  description: string | null;
  render_context: string | null;
  element_overrides: any | null;
  cost_category_overrides: any | null;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export function useClients() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["clients", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user,
  });
}

export function useClient(clientId?: string | null) {
  return useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId!)
        .single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!clientId,
  });
}

export function useUpsertClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Partial<Client> & { name: string }) => {
      const payload = { ...data, user_id: user!.id };
      if (data.id) {
        const { data: result, error } = await supabase
          .from("clients")
          .update(payload)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      } else {
        const { data: result, error } = await supabase
          .from("clients")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return result;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client saved" });
    },
    onError: (e: any) => toast({ title: "Error saving client", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client deleted" });
    },
    onError: (e: any) => toast({ title: "Error deleting client", description: e.message, variant: "destructive" }),
  });
}

// ─── BRAND INTELLIGENCE ───────────────────────────────────────────────────────

export function useBrandIntelligence(clientId?: string | null) {
  return useQuery({
    queryKey: ["brand-intelligence", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_intelligence")
        .select("*")
        .eq("client_id", clientId!)
        .order("category")
        .order("created_at");
      if (error) throw error;
      return data as BrandIntelligenceEntry[];
    },
    enabled: !!clientId,
  });
}

export function useUpsertBrandIntelligence() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Partial<BrandIntelligenceEntry> & { client_id: string; category: BrandIntelligenceEntry["category"]; title: string; content: string }) => {
      const payload = { ...data, user_id: user!.id };
      if (data.id) {
        const { data: result, error } = await supabase
          .from("brand_intelligence")
          .update(payload)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      } else {
        const { data: result, error } = await supabase
          .from("brand_intelligence")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return result;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["brand-intelligence", vars.client_id] });
      toast({ title: "Intelligence saved" });
    },
    onError: (e: any) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteBrandIntelligence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase.from("brand_intelligence").delete().eq("id", id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => {
      qc.invalidateQueries({ queryKey: ["brand-intelligence", clientId] });
      toast({ title: "Entry deleted" });
    },
    onError: (e: any) => toast({ title: "Error deleting", description: e.message, variant: "destructive" }),
  });
}

export function useApproveBrandIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase
        .from("brand_intelligence")
        .update({ is_approved: true, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => qc.invalidateQueries({ queryKey: ["brand-intelligence", clientId] }),
  });
}

// ─── PROJECT TYPE CONFIGS ─────────────────────────────────────────────────────

export function useProjectTypeConfigs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project-type-configs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_type_configs")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as ProjectTypeConfig[];
    },
    enabled: !!user,
  });
}

export function useUpsertProjectTypeConfig() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Partial<ProjectTypeConfig> & { project_type_id: string }) => {
      const payload = { ...data, user_id: user!.id };
      const { data: result, error } = await supabase
        .from("project_type_configs")
        .upsert(payload, { onConflict: "user_id,project_type_id" })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-type-configs"] });
      toast({ title: "Project type config saved" });
    },
    onError: (e: any) => toast({ title: "Error saving config", description: e.message, variant: "destructive" }),
  });
}
