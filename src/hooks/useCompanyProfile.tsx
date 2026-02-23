import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface CompanyProfile {
  id: string;
  user_id: string;
  company_name: string | null;
  industry: string | null;
  default_booth_sizes: string[] | null;
  notes: string | null;
  // Branding fields for proposals
  logo_url: string | null;
  logo_dark_url: string | null;
  brand_color: string | null;
  secondary_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website: string | null;
  tagline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShowCost {
  id: string;
  user_id: string;
  show_name: string;
  city: string;
  venue: string | null;
  industry: string | null;
  estimated_booth_cost_per_sqft: number | null;
  estimated_drayage_per_cwt: number | null;
  estimated_labor_rate_per_hr: number | null;
  estimated_electrical_per_outlet: number | null;
  estimated_internet_cost: number | null;
  estimated_lead_retrieval_cost: number | null;
  badge_scan_cost: number | null;
  union_labor_required: boolean;
  notes: string | null;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

export function useCompanyProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_profiles" as any)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CompanyProfile | null;
    },
    enabled: !!user,
  });

  const upsertProfile = useMutation({
    mutationFn: async (profile: Partial<CompanyProfile>) => {
      if (!user) throw new Error("Not authenticated");
      const existing = profileQuery.data;
      if (existing) {
        const { error } = await supabase
          .from("company_profiles" as any)
          .update(profile)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_profiles" as any)
          .insert({ ...profile, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
    },
  });

  return { profile: profileQuery.data, isLoading: profileQuery.isLoading, upsertProfile };
}

export function useShowCosts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const costsQuery = useQuery({
    queryKey: ["show-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_costs" as any)
        .select("*")
        .order("show_name");
      if (error) throw error;
      return data as unknown as ShowCost[];
    },
    enabled: !!user,
  });

  const addShowCost = useMutation({
    mutationFn: async (cost: Partial<ShowCost>) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("show_costs" as any)
        .insert({ ...cost, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-costs"] });
    },
  });

  const updateShowCost = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ShowCost> & { id: string }) => {
      const { error } = await supabase
        .from("show_costs" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-costs"] });
    },
  });

  const deleteShowCost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("show_costs" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-costs"] });
    },
  });

  return {
    costs: costsQuery.data || [],
    isLoading: costsQuery.isLoading,
    addShowCost,
    updateShowCost,
    deleteShowCost,
  };
}
