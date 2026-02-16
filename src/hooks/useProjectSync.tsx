import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useProject } from "./useProjects";
import { useProjectStore } from "@/store/projectStore";
import { supabase } from "@/integrations/supabase/client";
import type { ElementType, ParsedBrief } from "@/types/brief";

const ELEMENT_DB_KEYS: Record<ElementType, string> = {
  bigIdea: "big_idea",
  experienceFramework: "experience_framework",
  interactiveMechanics: "interactive_mechanics",
  digitalStorytelling: "digital_storytelling",
  humanConnection: "human_connection",
  adjacentActivations: "adjacent_activations",
  spatialStrategy: "spatial_strategy",
  budgetLogic: "budget_logic",
};

const ALL_ELEMENT_TYPES: ElementType[] = [
  "bigIdea",
  "experienceFramework",
  "interactiveMechanics",
  "digitalStorytelling",
  "humanConnection",
  "adjacentActivations",
  "spatialStrategy",
  "budgetLogic",
];

/**
 * Syncs the DB project (from ?project= query param) into the zustand store.
 * Also provides a `saveToDb` function to persist zustand changes back.
 */
export function useProjectSync() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const { data: dbProject, isLoading } = useProject(projectId ?? undefined);
  const { currentProject, loadFromDb } = useProjectStore();
  const hasHydrated = useRef(false);

  // Hydrate zustand from DB on first load
  useEffect(() => {
    if (dbProject && !hasHydrated.current) {
      hasHydrated.current = true;

      // Build elements from DB columns
      const elements: Record<ElementType, { type: ElementType; status: "pending" | "complete"; data: any }> = {} as any;
      for (const et of ALL_ELEMENT_TYPES) {
        const dbKey = ELEMENT_DB_KEYS[et] as keyof typeof dbProject;
        const data = dbProject[dbKey];
        elements[et] = {
          type: et,
          status: data ? "complete" : "pending",
          data: data ?? null,
        };
      }

      loadFromDb({
        id: dbProject.id,
        name: dbProject.name,
        rawBrief: dbProject.brief_text || "",
        parsedBrief: dbProject.parsed_brief as ParsedBrief | null,
        elements,
        renderPrompts: dbProject.render_prompts as any,
      });
    }
  }, [dbProject, loadFromDb]);

  // Reset hydration flag AND clear stale store data when projectId changes
  useEffect(() => {
    hasHydrated.current = false;
    // Clear the old project so components don't render stale data
    if (currentProject && currentProject.id !== projectId) {
      useProjectStore.getState().resetProject();
    }
  }, [projectId]);

  return { projectId, isLoading: isLoading && !currentProject, dbProject };
}

/**
 * Persist a specific field update to the DB for the current project.
 */
export async function saveProjectField(projectId: string, field: string, value: any) {
  const { error } = await supabase
    .from("projects")
    .update({ [field]: value } as any)
    .eq("id", projectId);
  if (error) console.error("Failed to save to DB:", field, error);
}

export { ELEMENT_DB_KEYS };
