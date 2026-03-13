import type { ParsedBrief } from "@/types/brief";
import type { BrandIntelligenceEntry } from "@/hooks/useClients";

type IntelligenceInput = Omit<BrandIntelligenceEntry, "id" | "user_id" | "created_at" | "updated_at">;

/**
 * Extracts brand intelligence entries from a parsed brief.
 * These entries are created as `ai_extracted` / `is_approved: false` so the user
 * can review and approve them in the ClientsManager.
 */
export function extractBrandIntelligence(
  parsedBrief: ParsedBrief,
  clientId: string,
  sourceProjectId: string
): IntelligenceInput[] {
  const entries: IntelligenceInput[] = [];
  const base = {
    client_id: clientId,
    source: "ai_extracted" as const,
    source_project_id: sourceProjectId,
    is_approved: false,
    approved_at: null,
    confidence_score: null,
    tags: null,
  };

  // ─── VISUAL IDENTITY ────────────────────────────────────────────────────
  const { visualIdentity } = parsedBrief.brand;

  if (visualIdentity?.colors?.length) {
    entries.push({
      ...base,
      category: "visual_identity",
      title: "Brand Colors",
      content: `Primary brand colors: ${visualIdentity.colors.join(", ")}`,
      tags: ["colors", "brand"],
    });
  }

  if (visualIdentity?.avoidColors?.length) {
    entries.push({
      ...base,
      category: "visual_identity",
      title: "Colors to Avoid",
      content: `Avoid these colors: ${visualIdentity.avoidColors.join(", ")}`,
      tags: ["colors", "avoid"],
    });
  }

  if (visualIdentity?.avoidImagery?.length) {
    entries.push({
      ...base,
      category: "visual_identity",
      title: "Imagery to Avoid",
      content: `Avoid this imagery: ${visualIdentity.avoidImagery.join(", ")}`,
      tags: ["imagery", "avoid"],
    });
  }

  // ─── STRATEGIC VOICE ────────────────────────────────────────────────────
  if (parsedBrief.brand.personality?.length) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Brand Personality",
      content: `Brand personality traits: ${parsedBrief.brand.personality.join(", ")}`,
      tags: ["personality", "brand"],
    });
  }

  if (parsedBrief.brand.pov) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Brand Point of View",
      content: parsedBrief.brand.pov,
      tags: ["pov", "positioning"],
    });
  }

  if (parsedBrief.brand.competitors?.length) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Competitive Landscape",
      content: `Key competitors: ${parsedBrief.brand.competitors.join(", ")}`,
      tags: ["competitors"],
    });
  }

  if (parsedBrief.objectives?.primary) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Primary Objective",
      content: parsedBrief.objectives.primary,
      tags: ["objectives"],
    });
  }

  if (parsedBrief.objectives?.differentiationGoals?.length) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Differentiation Goals",
      content: parsedBrief.objectives.differentiationGoals.join("; "),
      tags: ["differentiation", "objectives"],
    });
  }

  // ─── COST BENCHMARK ─────────────────────────────────────────────────────
  const budget = parsedBrief.budget;
  if (budget) {
    const budgetParts: string[] = [];
    if (budget.perShow) budgetParts.push(`Per show: $${budget.perShow.toLocaleString()}`);
    if (budget.range) budgetParts.push(`Range: $${budget.range.min.toLocaleString()} - $${budget.range.max.toLocaleString()}`);
    if (budget.inclusions?.length) budgetParts.push(`Includes: ${budget.inclusions.join(", ")}`);
    if (budget.exclusions?.length) budgetParts.push(`Excludes: ${budget.exclusions.join(", ")}`);
    if (budget.efficiencyNotes) budgetParts.push(`Notes: ${budget.efficiencyNotes}`);

    if (budgetParts.length) {
      entries.push({
        ...base,
        category: "cost_benchmark",
        title: "Budget Parameters",
        content: budgetParts.join(". "),
        tags: ["budget"],
      });
    }
  }

  // ─── PROCESS / PROCEDURE ────────────────────────────────────────────────
  if (parsedBrief.creative?.embrace?.length) {
    entries.push({
      ...base,
      category: "process_procedure",
      title: "Creative Direction — Embrace",
      content: `Creative elements to embrace: ${parsedBrief.creative.embrace.join(", ")}`,
      tags: ["creative", "embrace"],
    });
  }

  if (parsedBrief.creative?.avoid?.length) {
    entries.push({
      ...base,
      category: "process_procedure",
      title: "Creative Direction — Avoid",
      content: `Creative elements to avoid: ${parsedBrief.creative.avoid.join(", ")}`,
      tags: ["creative", "avoid"],
    });
  }

  if (parsedBrief.creative?.coreStrategy) {
    entries.push({
      ...base,
      category: "strategic_voice",
      title: "Core Creative Strategy",
      content: parsedBrief.creative.coreStrategy,
      tags: ["strategy", "creative"],
    });
  }

  // ─── VENDOR / MATERIAL ──────────────────────────────────────────────────
  if (parsedBrief.spatial?.reuseRequirement) {
    entries.push({
      ...base,
      category: "vendor_material",
      title: "Reuse Requirements",
      content: parsedBrief.spatial.reuseRequirement,
      tags: ["reuse", "materials"],
    });
  }

  return entries;
}
