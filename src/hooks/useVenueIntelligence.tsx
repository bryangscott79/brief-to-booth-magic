import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { VenueIntelligence } from "@/types/brief";

// ─── DB ROW SHAPE ─────────────────────────────────────────────────────────────

interface VenueIntelligenceRow {
  id: string;
  user_id: string;
  show_name: string;
  venue: string | null;
  city: string | null;
  industry: string | null;
  design_tips: string[];
  traffic_patterns: string | null;
  audience_notes: string | null;
  logistics_notes: string | null;
  booth_placement_tips: string | null;
  typical_booth_sizes: string[];
  union_labor_required: boolean | null;
  source: string;
  source_project_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToVenue(r: VenueIntelligenceRow): VenueIntelligence {
  return {
    id: r.id,
    showName: r.show_name,
    venue: r.venue,
    city: r.city,
    industry: r.industry,
    designTips: r.design_tips ?? [],
    trafficPatterns: r.traffic_patterns,
    audienceNotes: r.audience_notes,
    logisticsNotes: r.logistics_notes,
    boothPlacementTips: r.booth_placement_tips,
    typicalBoothSizes: r.typical_booth_sizes ?? [],
    unionLaborRequired: r.union_labor_required,
    source: r.source,
    sourceProjectId: r.source_project_id,
  };
}

// ─── QUERY: ALL FOR USER ──────────────────────────────────────────────────────

export function useVenueIntelligence() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["venue-intelligence", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_intelligence" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("show_name");

      if (error) throw error;
      return ((data ?? []) as unknown as VenueIntelligenceRow[]).map(rowToVenue);
    },
  });
}

// ─── QUERY: BY SHOW NAME ─────────────────────────────────────────────────────

export function useVenueIntelligenceForShow(showName: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["venue-intelligence-show", user?.id, showName],
    enabled: !!user?.id && !!showName,
    queryFn: async (): Promise<VenueIntelligence | null> => {
      const { data, error } = await supabase
        .from("venue_intelligence" as any)
        .select("*")
        .eq("user_id", user!.id)
        .ilike("show_name" as any, showName!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return rowToVenue(data as unknown as VenueIntelligenceRow);
    },
  });
}

// ─── MUTATION: CREATE ─────────────────────────────────────────────────────────

interface CreateVenueInput {
  showName: string;
  venue?: string | null;
  city?: string | null;
  industry?: string | null;
  designTips?: string[];
  trafficPatterns?: string | null;
  audienceNotes?: string | null;
  logisticsNotes?: string | null;
  boothPlacementTips?: string | null;
  typicalBoothSizes?: string[];
  unionLaborRequired?: boolean | null;
  source?: string;
  sourceProjectId?: string | null;
}

export function useCreateVenueIntelligence() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateVenueInput) => {
      const { data, error } = await supabase
        .from("venue_intelligence" as any)
        .insert({
          user_id: user!.id,
          show_name: input.showName,
          venue: input.venue ?? null,
          city: input.city ?? null,
          industry: input.industry ?? null,
          design_tips: input.designTips ?? [],
          traffic_patterns: input.trafficPatterns ?? null,
          audience_notes: input.audienceNotes ?? null,
          logistics_notes: input.logisticsNotes ?? null,
          booth_placement_tips: input.boothPlacementTips ?? null,
          typical_booth_sizes: input.typicalBoothSizes ?? [],
          union_labor_required: input.unionLaborRequired ?? null,
          source: input.source ?? "manual",
          source_project_id: input.sourceProjectId ?? null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return rowToVenue(data as unknown as VenueIntelligenceRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue-intelligence", user?.id] });
    },
  });
}

// ─── MUTATION: UPDATE ─────────────────────────────────────────────────────────

interface UpdateVenueInput extends Partial<CreateVenueInput> {
  id: string;
}

export function useUpdateVenueIntelligence() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateVenueInput) => {
      const updates: Record<string, unknown> = {};
      if (input.showName !== undefined) updates.show_name = input.showName;
      if (input.venue !== undefined) updates.venue = input.venue;
      if (input.city !== undefined) updates.city = input.city;
      if (input.industry !== undefined) updates.industry = input.industry;
      if (input.designTips !== undefined) updates.design_tips = input.designTips;
      if (input.trafficPatterns !== undefined) updates.traffic_patterns = input.trafficPatterns;
      if (input.audienceNotes !== undefined) updates.audience_notes = input.audienceNotes;
      if (input.logisticsNotes !== undefined) updates.logistics_notes = input.logisticsNotes;
      if (input.boothPlacementTips !== undefined) updates.booth_placement_tips = input.boothPlacementTips;
      if (input.typicalBoothSizes !== undefined) updates.typical_booth_sizes = input.typicalBoothSizes;
      if (input.unionLaborRequired !== undefined) updates.union_labor_required = input.unionLaborRequired;
      if (input.source !== undefined) updates.source = input.source;
      if (input.sourceProjectId !== undefined) updates.source_project_id = input.sourceProjectId;

      const { data, error } = await supabase
        .from("venue_intelligence" as any)
        .update(updates as any)
        .eq("id", id)
        .eq("user_id", user!.id)
        .select()
        .single();

      if (error) throw error;
      return rowToVenue(data as unknown as VenueIntelligenceRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue-intelligence", user?.id] });
    },
  });
}

// ─── MUTATION: DELETE ─────────────────────────────────────────────────────────

export function useDeleteVenueIntelligence() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("venue_intelligence" as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venue-intelligence", user?.id] });
    },
  });
}
