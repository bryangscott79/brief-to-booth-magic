import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BrandGuidelines } from "@/types/brief";

// ─── DB ROW SHAPE ─────────────────────────────────────────────────────────────

interface BrandGuidelinesRow {
  id: string;
  client_id: string;
  user_id: string;
  color_system: BrandGuidelines["colorSystem"];
  typography: BrandGuidelines["typography"];
  logo_rules: BrandGuidelines["logoRules"];
  photography_style: BrandGuidelines["photographyStyle"];
  tone_of_voice: BrandGuidelines["toneOfVoice"];
  materials_finishes: BrandGuidelines["materialsFinishes"];
  guidelines_version: string | null;
  created_at: string;
  updated_at: string;
}

function rowToGuidelines(r: BrandGuidelinesRow): BrandGuidelines {
  return {
    id: r.id,
    clientId: r.client_id,
    colorSystem: r.color_system,
    typography: r.typography,
    logoRules: r.logo_rules,
    photographyStyle: r.photography_style,
    toneOfVoice: r.tone_of_voice,
    materialsFinishes: r.materials_finishes,
    guidelinesVersion: r.guidelines_version,
  };
}

// ─── QUERY: FETCH BRAND GUIDELINES (1:1 with client) ─────────────────────────

export function useBrandGuidelines(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["brand-guidelines", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<BrandGuidelines | null> => {
      const { data, error } = await supabase
        .from("brand_guidelines" as any)
        .select("*")
        .eq("client_id", clientId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return rowToGuidelines(data as unknown as BrandGuidelinesRow);
    },
  });
}

// ─── MUTATION: UPSERT ─────────────────────────────────────────────────────────

interface UpsertBrandGuidelinesInput {
  clientId: string;
  colorSystem?: BrandGuidelines["colorSystem"];
  typography?: BrandGuidelines["typography"];
  logoRules?: BrandGuidelines["logoRules"];
  photographyStyle?: BrandGuidelines["photographyStyle"];
  toneOfVoice?: BrandGuidelines["toneOfVoice"];
  materialsFinishes?: BrandGuidelines["materialsFinishes"];
  guidelinesVersion?: string | null;
}

export function useUpsertBrandGuidelines() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertBrandGuidelinesInput) => {
      const payload: Record<string, unknown> = {
        client_id: input.clientId,
        user_id: user!.id,
      };

      if (input.colorSystem !== undefined) payload.color_system = input.colorSystem;
      if (input.typography !== undefined) payload.typography = input.typography;
      if (input.logoRules !== undefined) payload.logo_rules = input.logoRules;
      if (input.photographyStyle !== undefined) payload.photography_style = input.photographyStyle;
      if (input.toneOfVoice !== undefined) payload.tone_of_voice = input.toneOfVoice;
      if (input.materialsFinishes !== undefined) payload.materials_finishes = input.materialsFinishes;
      if (input.guidelinesVersion !== undefined) payload.guidelines_version = input.guidelinesVersion;

      const { data, error } = await supabase
        .from("brand_guidelines" as any)
        .upsert(payload as any, { onConflict: "client_id" })
        .select()
        .single();

      if (error) throw error;
      return rowToGuidelines(data as unknown as BrandGuidelinesRow);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["brand-guidelines", result.clientId] });
    },
  });
}
