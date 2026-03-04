// ============================================================
// CONTENT VALIDATOR
// Cross-element validation after all elements are generated.
// Surfaces warnings before the user proceeds to rendering.
// ============================================================

import type { ElementType, ElementState, ParsedBrief } from "@/types/brief";

export interface ContentValidationResult {
  severity: "error" | "warning" | "info";
  category: string;
  elementA: ElementType;
  elementB?: ElementType;
  message: string;
  suggestion?: string;
}

/**
 * Run all cross-element validations.
 * Call this after all 8 elements are generated, before rendering.
 */
export function validateContent(
  elements: Record<ElementType, ElementState>,
  brief: ParsedBrief
): ContentValidationResult[] {
  const results: ContentValidationResult[] = [];

  // Only validate complete elements
  const complete = (type: ElementType) =>
    elements[type]?.status === "complete" && elements[type]?.data;

  // 1. Hero installation consistency
  if (complete("interactiveMechanics") && complete("experienceFramework")) {
    const im = elements.interactiveMechanics.data as Record<string, unknown>;
    const ef = elements.experienceFramework.data as Record<string, unknown>;
    const heroName = ((im.hero as Record<string, unknown>)?.name as string) || "";
    const journey = (ef.visitorJourney as Array<Record<string, unknown>>) || [];

    // Check if hero is mentioned in visitor journey
    const heroMentionedInJourney = journey.some(
      (stage) =>
        ((stage.description as string) || "").toLowerCase().includes(heroName.toLowerCase()) ||
        ((stage.touchpoints as string[]) || []).some((tp) =>
          tp.toLowerCase().includes(heroName.toLowerCase())
        )
    );

    if (heroName && !heroMentionedInJourney) {
      results.push({
        severity: "warning",
        category: "Hero Consistency",
        elementA: "interactiveMechanics",
        elementB: "experienceFramework",
        message: `Hero installation "${heroName}" is not referenced in the visitor journey stages`,
        suggestion:
          "Regenerate Experience Framework to incorporate the hero installation as a key touchpoint",
      });
    }
  }

  // 2. Spatial zones match human connection zones
  if (complete("spatialStrategy") && complete("humanConnection")) {
    const spatial = elements.spatialStrategy.data as Record<string, unknown>;
    const hc = elements.humanConnection.data as Record<string, unknown>;
    const spatialZones =
      ((spatial.configs as Array<Record<string, unknown>>)?.[0]?.zones as Array<Record<string, unknown>>) || [];
    const hcZones =
      ((hc.configs as Array<Record<string, unknown>>)?.[0]?.zones as Array<Record<string, unknown>>) || [];

    const spatialMeetingZones = spatialZones.filter((z) => {
      const name = ((z.name as string) || (z.id as string) || "").toLowerCase();
      return (
        name.includes("meeting") ||
        name.includes("suite") ||
        name.includes("lounge") ||
        name.includes("hospitality")
      );
    });

    if (spatialMeetingZones.length > 0 && hcZones.length === 0) {
      results.push({
        severity: "warning",
        category: "Zone Alignment",
        elementA: "spatialStrategy",
        elementB: "humanConnection",
        message: `Spatial strategy includes ${spatialMeetingZones.length} meeting/lounge zones but Human Connection has no zone configurations`,
        suggestion:
          "Regenerate Human Connection to define configurations for the meeting/lounge zones in the spatial layout",
      });
    }
  }

  // 3. Budget vs brief budget range
  if (complete("budgetLogic")) {
    const budget = elements.budgetLogic.data as Record<string, unknown>;
    const totalPerShow = budget.totalPerShow as number;
    const briefBudget = brief.budget;

    if (totalPerShow && briefBudget) {
      if (briefBudget.perShow && Math.abs(totalPerShow - briefBudget.perShow) / briefBudget.perShow > 0.2) {
        results.push({
          severity: "warning",
          category: "Budget Alignment",
          elementA: "budgetLogic",
          message: `Budget Logic total ($${totalPerShow.toLocaleString()}) differs from brief budget ($${briefBudget.perShow.toLocaleString()}) by more than 20%`,
          suggestion: "Regenerate Budget Logic to align with the brief's stated budget",
        });
      }
      if (
        briefBudget.range &&
        (totalPerShow < briefBudget.range.min || totalPerShow > briefBudget.range.max)
      ) {
        results.push({
          severity: "error",
          category: "Budget Alignment",
          elementA: "budgetLogic",
          message: `Budget Logic total ($${totalPerShow.toLocaleString()}) is outside the brief's range ($${briefBudget.range.min.toLocaleString()} - $${briefBudget.range.max.toLocaleString()})`,
          suggestion: "Regenerate Budget Logic within the brief's budget range",
        });
      }
    }
  }

  // 4. Audience coverage check
  if (brief.audiences && brief.audiences.length > 0) {
    const audienceNames = brief.audiences.map((a) => (a.name || "").toLowerCase());

    if (complete("experienceFramework")) {
      const ef = elements.experienceFramework.data as Record<string, unknown>;
      const routing = (ef.audienceRouting as Array<Record<string, unknown>>) || [];
      const routedPersonas = routing.map((r) => ((r.persona as string) || "").toLowerCase());

      const missingAudiences = audienceNames.filter(
        (name) => !routedPersonas.some((persona) => persona.includes(name) || name.includes(persona))
      );

      if (missingAudiences.length > 0) {
        results.push({
          severity: "warning",
          category: "Audience Coverage",
          elementA: "experienceFramework",
          message: `Experience Framework doesn't route ${missingAudiences.length} audience(s) from the brief: ${missingAudiences.join(", ")}`,
          suggestion: "Regenerate Experience Framework to include audience routing for all personas",
        });
      }
    }
  }

  // 5. Materials consistency between spatial and interactive
  if (complete("spatialStrategy") && complete("interactiveMechanics")) {
    const spatial = elements.spatialStrategy.data as Record<string, unknown>;
    const im = elements.interactiveMechanics.data as Record<string, unknown>;
    const materialsAndMood = (spatial.materialsAndMood as Array<Record<string, unknown>>) || [];
    const heroMaterials =
      ((im.hero as Record<string, unknown>)?.physicalForm as Record<string, unknown>)?.materials;

    if (materialsAndMood.length > 0 && Array.isArray(heroMaterials) && heroMaterials.length > 0) {
      // Simple check: see if any hero material keywords appear in spatial materials
      const spatialMaterialNames = materialsAndMood
        .map((m) => ((m.material as string) || "").toLowerCase())
        .join(" ");
      const orphanedHeroMaterials = heroMaterials.filter(
        (hm: string) => !spatialMaterialNames.includes(hm.toLowerCase().split(" ")[0])
      );

      if (orphanedHeroMaterials.length > 0) {
        results.push({
          severity: "info",
          category: "Material Consistency",
          elementA: "interactiveMechanics",
          elementB: "spatialStrategy",
          message: `Hero installation uses materials not in the spatial palette: ${(orphanedHeroMaterials as string[]).join(", ")}`,
          suggestion:
            "Consider adding hero materials to the spatial materials palette for consistency, or regenerate spatial strategy",
        });
      }
    }
  }

  // 6. Brand color usage
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  if (brandColors.length > 0 && complete("spatialStrategy")) {
    const spatial = elements.spatialStrategy.data as Record<string, unknown>;
    const zones =
      ((spatial.configs as Array<Record<string, unknown>>)?.[0]?.zones as Array<Record<string, unknown>>) || [];
    const zoneColors = zones.map((z) => ((z.colorCode as string) || "").toLowerCase());

    const brandColorsLower = brandColors.map((c: string) => c.toLowerCase());
    const usesBrandColors = brandColorsLower.some((bc: string) => zoneColors.includes(bc));

    if (!usesBrandColors && zoneColors.length > 0) {
      results.push({
        severity: "info",
        category: "Brand Consistency",
        elementA: "spatialStrategy",
        message: `Zone color codes don't include any brand colors (${brandColors.join(", ")})`,
        suggestion:
          "Consider updating zone color codes to incorporate brand identity colors",
      });
    }
  }

  return results;
}

/**
 * Get a quick completion status summary
 */
export function getElementCompletionSummary(
  elements: Record<ElementType, ElementState>
): { complete: number; total: number; incomplete: ElementType[] } {
  const allTypes: ElementType[] = [
    "bigIdea",
    "experienceFramework",
    "interactiveMechanics",
    "digitalStorytelling",
    "humanConnection",
    "adjacentActivations",
    "spatialStrategy",
    "budgetLogic",
  ];

  const incomplete = allTypes.filter(
    (type) => elements[type]?.status !== "complete" || !elements[type]?.data
  );

  return {
    complete: allTypes.length - incomplete.length,
    total: allTypes.length,
    incomplete,
  };
}
