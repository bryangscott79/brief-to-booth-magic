import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useToast } from "@/hooks/use-toast";

export interface Client {
  id: string;
  user_id: string;
  agency_id: string | null;
  name: string;
  industry: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  notes: string | null;
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
  const { agency } = useAgency();
  return useQuery({
    queryKey: ["clients", agency?.id],
    queryFn: async () => {
      let query = supabase.from("clients").select("*").order("name");
      if (agency?.id) {
        query = query.eq("agency_id", agency.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
    enabled: !!user && !!agency?.id,
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
      return data as unknown as Client;
    },
    enabled: !!clientId,
  });
}

export function useUpsertClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { agency } = useAgency();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: Partial<Client> & { name: string }) => {
      const payload: Partial<Client> & { name: string; user_id: string; agency_id?: string | null } = {
        ...data,
        user_id: user!.id,
      };
      // Stamp agency_id on new clients (and keep it in sync on updates when present).
      if (agency?.id) payload.agency_id = agency.id;
      if (data.id) {
        const { data: result, error } = await supabase
          .from("clients")
          .update(payload as any)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      } else {
        const { data: result, error } = await supabase
          .from("clients")
          .insert(payload as any)
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
        .eq("client_id" as any, clientId!)
        .order("category")
        .order("created_at");
      if (error) throw error;
      return data as unknown as BrandIntelligenceEntry[];
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
          .update(payload as any)
          .eq("id", data.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      } else {
        const { data: result, error } = await supabase
          .from("brand_intelligence")
          .insert(payload as any)
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
        .update({ is_approved: true, approved_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
      return clientId;
    },
    onSuccess: (clientId) => qc.invalidateQueries({ queryKey: ["brand-intelligence", clientId] }),
  });
}

export function useBatchCreateIntelligence() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (entries: Array<Omit<BrandIntelligenceEntry, "id" | "user_id" | "created_at" | "updated_at">>) => {
      if (!user) throw new Error("Not authenticated");
      const payload = entries.map((e) => ({ ...e, user_id: user.id }));
      const { data, error } = await supabase
        .from("brand_intelligence")
        .insert(payload as any)
        .select();
      if (error) throw error;
      return data as unknown as BrandIntelligenceEntry[];
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        qc.invalidateQueries({ queryKey: ["brand-intelligence", data[0].client_id] });
      }
      toast({ title: `${data.length} intelligence entries created` });
    },
    onError: (e: any) => toast({ title: "Error creating intelligence entries", description: e.message, variant: "destructive" }),
  });
}

// ─── PROJECT TYPE CONFIGS ─────────────────────────────────────────────────────

export function useProjectTypeConfigs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project-type-configs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_type_configs" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as unknown as ProjectTypeConfig[];
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
        .from("project_type_configs" as any)
        .upsert(payload as any, { onConflict: "user_id,project_type_id" })
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
