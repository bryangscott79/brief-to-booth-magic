// useIndustries — list seeded industries + their per-industry vocabulary.
//
// Industries are the top-level taxonomy. Every agency picks at least one;
// the platform's vocabulary (project types, deliverable, render, etc.) bends
// to match the agency's primary industry.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgency } from "./useAgency";

// Mirrors the JSONB shape seeded in 20260427180000_industries_engine.sql
export interface IndustryVocabulary {
  project_type?: string;
  project_types?: string;
  project?: string;
  projects?: string;
  deliverable?: string;
  render?: string;
  spatial_plan?: string;
  brief?: string;
  client?: string;
}

export interface Industry {
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  vocabulary: IndustryVocabulary;
  sort_order: number;
  is_builtin: boolean;
}

const DEFAULT_VOCAB: Required<IndustryVocabulary> = {
  project_type: "Activation type",
  project_types: "Activation types",
  project: "Project",
  projects: "Projects",
  deliverable: "Deliverable",
  render: "Render",
  spatial_plan: "Floor plan",
  brief: "Brief",
  client: "Client",
};

/** Fetch all industries, sorted by sort_order. */
export function useIndustries() {
  return useQuery({
    queryKey: ["industries"],
    staleTime: 5 * 60 * 1000, // industries rarely change — cache 5min
    queryFn: async (): Promise<Industry[]> => {
      const { data, error } = await (supabase.from("industries" as any) as any)
        .select("slug, label, description, icon, vocabulary, sort_order, is_builtin")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Industry[];
    },
  });
}

/** Look up a single industry by slug from the cached list. */
export function useIndustry(slug: string | null | undefined) {
  const { data, isLoading } = useIndustries();
  const industry = useMemo(
    () => (slug ? (data ?? []).find((i) => i.slug === slug) ?? null : null),
    [data, slug],
  );
  return { industry, isLoading };
}

/**
 * Resolve the active vocabulary for the current agency.
 * Falls back to experiential defaults when no agency is set yet.
 */
export function useVocabulary(): Required<IndustryVocabulary> {
  const { agency } = useAgency();
  const { industry } = useIndustry((agency as any)?.primary_industry ?? "experiential");

  return useMemo(() => {
    return {
      ...DEFAULT_VOCAB,
      ...(industry?.vocabulary ?? {}),
    };
  }, [industry]);
}
