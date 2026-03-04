/**
 * Render Validator — Post-generation validation for hero and view images
 *
 * Checks whether generated prompts and the overall render pipeline
 * are aligned with the brief, spatial design, budget, and brand identity.
 * Surfaces quality scores and actionable feedback before the user proceeds.
 */

import type { ParsedBrief, ElementType, ElementState } from "@/types/brief";
import type { NormalizedZone, BoothDimensions } from "@/lib/spatialUtils";

// ============================================
// TYPES
// ============================================

export type ValidationSeverity = "error" | "warning" | "info";
export type ValidationCategory =
  | "brand"
  | "scale"
  | "spatial"
  | "materials"
  | "budget"
  | "creative"
  | "consistency";

export interface RenderValidationResult {
  severity: ValidationSeverity;
  category: ValidationCategory;
  message: string;
  suggestion?: string;
  angleId?: string;
}

export interface RenderQualityScore {
  overall: number; // 0-100
  breakdown: {
    brandAlignment: number;
    scaleAccuracy: number;
    spatialAccuracy: number;
    materialConsistency: number;
    budgetAlignment: number;
    creativeDirection: number;
  };
  issues: RenderValidationResult[];
  passesMinimumQuality: boolean;
}

export interface DesignContextForHero {
  brandColors: string[];
  materialsAndMood: Array<{ material: string; feel: string }>;
  heroInstallation: { name: string; dimensions?: string; materials?: string[] } | null;
  qualityTier: "standard" | "premium" | "ultra";
  zoneLayout: Array<{ name: string; percentage: number; position: string }>;
  creativeAvoid: string[];
  creativeEmbrace: string[];
}

export interface ConsistencyTokens {
  brandColors: string[];
  materialKeywords: string[];
  lightingKeywords: string[];
  styleKeywords: string[];
  qualityTier: "standard" | "premium" | "ultra";
  heroInstallationName: string;
  visibleZones: string[];
  avoidKeywords: string[];
}

// ============================================
// EXTRACT DESIGN CONTEXT FROM PROJECT DATA
// ============================================

/** Build the designContext object to send to generate-hero */
export function extractDesignContext(
  brief: ParsedBrief | null,
  elements: Record<ElementType, ElementState>,
  spatialData: {
    zones?: NormalizedZone[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
  } | null,
  boothDimensions?: BoothDimensions | null
): DesignContextForHero | null {
  if (!brief) return null;

  // Brand colors
  const brandColors = brief.brand?.visualIdentity?.colors || [];

  // Materials and mood from spatial data
  const materialsAndMood = spatialData?.materialsAndMood || [];

  // Hero installation from interactiveMechanics
  const imData = elements?.interactiveMechanics?.data;
  const hero = imData?.hero;
  const heroInstallation = hero
    ? {
        name: hero.name || "Hero Installation",
        dimensions: hero.physicalForm?.dimensions,
        materials: hero.physicalForm?.materials,
      }
    : null;

  // Quality tier from budget
  const budgetData = elements?.budgetLogic?.data;
  const qualityTier = inferQualityTier(brief, budgetData, boothDimensions);

  // Zone layout
  const zoneLayout = (spatialData?.zones || []).map((z) => ({
    name: z.name,
    percentage: z.percentage,
    position: describeZonePosition(z),
  }));

  // Creative constraints
  const creativeAvoid = [
    ...(brief.creative?.avoid || []),
    ...(brief.brand?.visualIdentity?.avoidImagery || []),
  ];
  const creativeEmbrace = brief.creative?.embrace || [];

  return {
    brandColors,
    materialsAndMood,
    heroInstallation,
    qualityTier,
    zoneLayout,
    creativeAvoid,
    creativeEmbrace,
  };
}

/** Build consistency tokens to send to generate-view */
export function extractConsistencyTokens(
  brief: ParsedBrief | null,
  elements: Record<ElementType, ElementState>,
  spatialData: {
    zones?: NormalizedZone[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
  } | null,
  angleId: string,
  boothDimensions?: BoothDimensions | null
): ConsistencyTokens | null {
  if (!brief) return null;

  const brandColors = brief.brand?.visualIdentity?.colors || [];
  const materialsAndMood = spatialData?.materialsAndMood || [];

  // Material keywords
  const materialKeywords = materialsAndMood.map((m) => m.material);

  // Lighting keywords from materials mood
  const lightingKeywords = materialsAndMood
    .filter((m) => m.feel.toLowerCase().includes("light") || m.feel.toLowerCase().includes("glow") || m.feel.toLowerCase().includes("warm"))
    .map((m) => m.feel);
  if (lightingKeywords.length === 0) {
    lightingKeywords.push("professional exhibition lighting", "clean white ambient");
  }

  // Style keywords
  const styleKeywords = brief.creative?.embrace || ["modern", "innovative"];

  // Quality tier
  const budgetData = elements?.budgetLogic?.data;
  const qualityTier = inferQualityTier(brief, budgetData, boothDimensions);

  // Hero installation name
  const imData = elements?.interactiveMechanics?.data;
  const heroInstallationName = imData?.hero?.name || "Hero Installation";

  // Visible zones based on camera angle
  const visibleZones = getVisibleZonesForAngle(angleId, spatialData?.zones || []);

  // Avoid keywords
  const avoidKeywords = [
    ...(brief.creative?.avoid || []),
    ...(brief.brand?.visualIdentity?.avoidImagery || []),
    "inconsistent materials",
    "different color scheme",
    "mismatched design language",
  ];

  return {
    brandColors,
    materialKeywords,
    lightingKeywords,
    styleKeywords,
    qualityTier,
    heroInstallationName,
    visibleZones,
    avoidKeywords,
  };
}

// ============================================
// PROMPT VALIDATION (pre-generation checks)
// ============================================

/** Validate a hero prompt against brief requirements before sending to generation */
export function validateHeroPrompt(
  prompt: string,
  brief: ParsedBrief | null,
  boothDimensions?: BoothDimensions | null
): RenderValidationResult[] {
  const issues: RenderValidationResult[] = [];
  if (!brief || !prompt) return issues;

  const promptLower = prompt.toLowerCase();

  // Check brand name mentioned
  if (brief.brand?.name && !promptLower.includes(brief.brand.name.toLowerCase())) {
    issues.push({
      severity: "warning",
      category: "brand",
      message: `Brand name "${brief.brand.name}" not found in hero prompt.`,
      suggestion: "Ensure brand name appears in the prompt for accurate signage rendering.",
    });
  }

  // Check brand colors mentioned
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  if (brandColors.length > 0) {
    const colorsMentioned = brandColors.some((c) => promptLower.includes(c.toLowerCase()));
    if (!colorsMentioned) {
      issues.push({
        severity: "warning",
        category: "brand",
        message: "Brand colors not explicitly referenced in hero prompt.",
        suggestion: `Add brand colors (${brandColors.join(", ")}) to ensure accurate color rendering.`,
      });
    }
  }

  // Check dimensions mentioned
  if (boothDimensions) {
    const hasDimensionRef = promptLower.includes(`${boothDimensions.width}`) || promptLower.includes("scale") || promptLower.includes("footprint");
    if (!hasDimensionRef) {
      issues.push({
        severity: "info",
        category: "scale",
        message: "Booth dimensions not found in prompt text (scale block will be appended automatically).",
      });
    }
  }

  // Check creative avoid terms aren't in prompt positively
  const avoidTerms = brief.creative?.avoid || [];
  for (const term of avoidTerms) {
    // Only flag if it seems to be used positively (not in a "do not" context)
    const termLower = term.toLowerCase();
    if (promptLower.includes(termLower) && !promptLower.includes(`avoid ${termLower}`) && !promptLower.includes(`no ${termLower}`)) {
      issues.push({
        severity: "warning",
        category: "creative",
        message: `Creative avoid term "${term}" appears in the prompt without negation.`,
        suggestion: `Ensure "${term}" is being avoided, not embraced.`,
      });
    }
  }

  return issues;
}

/** Validate prompts for all views as a set */
export function validateViewPrompts(
  prompts: Record<string, string>,
  brief: ParsedBrief | null,
  _elements: Record<ElementType, ElementState>
): RenderValidationResult[] {
  const issues: RenderValidationResult[] = [];
  if (!brief) return issues;

  // Check we have essential angles
  const essentialAngles = ["hero_34", "front", "top"];
  for (const angleId of essentialAngles) {
    if (!prompts[angleId]) {
      issues.push({
        severity: "warning",
        category: "spatial",
        message: `Essential angle "${angleId}" has no prompt generated.`,
        suggestion: "This angle is important for a complete booth visualization.",
        angleId,
      });
    }
  }

  // Check total number of views
  const viewCount = Object.keys(prompts).length;
  if (viewCount < 4) {
    issues.push({
      severity: "info",
      category: "spatial",
      message: `Only ${viewCount} views configured. Consider adding more for a complete presentation.`,
      suggestion: "8+ views including zone interiors provide the best client experience.",
    });
  }

  return issues;
}

// ============================================
// POST-GENERATION QUALITY SCORING
// ============================================

/** Generate a quality score for the complete render set */
export function scoreRenderSet(
  brief: ParsedBrief | null,
  elements: Record<ElementType, ElementState>,
  generatedImages: Record<string, { url: string; status: string }>,
  prompts: Record<string, string>,
  spatialData: {
    zones?: NormalizedZone[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
  } | null,
  boothDimensions?: BoothDimensions | null
): RenderQualityScore {
  const issues: RenderValidationResult[] = [];
  const scores = {
    brandAlignment: 100,
    scaleAccuracy: 100,
    spatialAccuracy: 100,
    materialConsistency: 100,
    budgetAlignment: 100,
    creativeDirection: 100,
  };

  if (!brief) {
    return {
      overall: 0,
      breakdown: scores,
      issues: [{ severity: "error", category: "brand", message: "No brief data available for validation." }],
      passesMinimumQuality: false,
    };
  }

  // 1. Brand alignment
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  const heroPrompt = prompts["hero_34"] || "";
  if (brandColors.length > 0) {
    const colorsInPrompt = brandColors.filter((c) => heroPrompt.toLowerCase().includes(c.toLowerCase()));
    if (colorsInPrompt.length === 0) {
      scores.brandAlignment -= 30;
      issues.push({
        severity: "warning",
        category: "brand",
        message: "Brand colors not referenced in hero prompt.",
        suggestion: "Consider regenerating the hero with explicit color references.",
      });
    }
  }

  // 2. Scale accuracy
  if (!boothDimensions) {
    scores.scaleAccuracy -= 40;
    issues.push({
      severity: "warning",
      category: "scale",
      message: "Booth dimensions unknown — scale accuracy cannot be verified.",
      suggestion: "Set booth dimensions in the spatial planner for accurate renders.",
    });
  }

  // 3. Spatial accuracy — check zone interior coverage
  const zones = spatialData?.zones || [];
  if (zones.length > 0) {
    const interiorAngles = Object.keys(prompts).filter((k) => k.startsWith("zone_interior_"));
    const coverageRatio = interiorAngles.length / zones.length;
    if (coverageRatio < 0.5) {
      scores.spatialAccuracy -= 20;
      issues.push({
        severity: "info",
        category: "spatial",
        message: `Only ${interiorAngles.length} of ${zones.length} zones have interior views.`,
        suggestion: "Generate interior views for all key zones for complete spatial coverage.",
      });
    }
  }

  // 4. Material consistency
  const materialsAndMood = spatialData?.materialsAndMood || [];
  if (materialsAndMood.length === 0) {
    scores.materialConsistency -= 20;
    issues.push({
      severity: "info",
      category: "materials",
      message: "No materials/mood data in spatial design.",
      suggestion: "Define materials and mood in the spatial planner for more accurate renders.",
    });
  }

  // 5. Budget alignment
  const budgetData = elements?.budgetLogic?.data;
  const qualityTier = inferQualityTier(brief, budgetData, boothDimensions);
  if (qualityTier === "standard" && heroPrompt.toLowerCase().includes("dramatic")) {
    scores.budgetAlignment -= 15;
    issues.push({
      severity: "warning",
      category: "budget",
      message: "Prompt uses dramatic/premium language but budget suggests standard tier.",
      suggestion: "Adjust design complexity to match budget constraints.",
    });
  }

  // 6. Creative direction
  const avoidTerms = brief.creative?.avoid || [];
  for (const term of avoidTerms) {
    const termLower = term.toLowerCase();
    for (const [angleId, prompt] of Object.entries(prompts)) {
      if (prompt.toLowerCase().includes(termLower) && !prompt.toLowerCase().includes(`avoid ${termLower}`)) {
        scores.creativeDirection -= 10;
        issues.push({
          severity: "warning",
          category: "creative",
          message: `Avoid term "${term}" appears positively in ${angleId} prompt.`,
          angleId,
        });
      }
    }
  }

  // 7. Generation success rate
  const completed = Object.values(generatedImages).filter((i) => i.status === "complete").length;
  const total = Object.keys(generatedImages).length;
  if (total > 0 && completed < total) {
    const failRate = ((total - completed) / total) * 100;
    if (failRate > 30) {
      scores.spatialAccuracy -= 20;
      issues.push({
        severity: "error",
        category: "consistency",
        message: `${total - completed} of ${total} views failed to generate.`,
        suggestion: "Retry failed views or simplify prompts.",
      });
    }
  }

  // Calculate overall
  const scoreValues = Object.values(scores);
  const overall = Math.round(scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length);
  const clampedOverall = Math.max(0, Math.min(100, overall));

  return {
    overall: clampedOverall,
    breakdown: scores,
    issues,
    passesMinimumQuality: clampedOverall >= 60 && !issues.some((i) => i.severity === "error"),
  };
}

// ============================================
// HELPERS
// ============================================

/** Infer quality tier from brief budget and booth size */
function inferQualityTier(
  brief: ParsedBrief | null,
  _budgetData: any,
  boothDimensions?: BoothDimensions | null
): "standard" | "premium" | "ultra" {
  if (!brief) return "standard";

  // Use structured budget range from brief
  const budgetRange = brief.budget?.range;
  const perShow = brief.budget?.perShow;
  const budget = perShow || (budgetRange ? budgetRange.max : 0);
  const sqft = boothDimensions?.totalSqft || 400;

  if (budget <= 0) return "premium"; // default if unknown

  const costPerSqft = budget / sqft;

  if (costPerSqft >= 400) return "ultra";
  if (costPerSqft >= 250) return "premium";
  return "standard";
}

/** Describe zone position in human terms */
function describeZonePosition(zone: NormalizedZone): string {
  const x = zone.position.x;
  const y = zone.position.y;

  const horizontal = x < 33 ? "left" : x > 66 ? "right" : "center";
  const depth = y < 33 ? "front" : y > 66 ? "back" : "middle";

  return `${depth}-${horizontal}`;
}

/** Determine which zones are visible from a given camera angle */
function getVisibleZonesForAngle(angleId: string, zones: NormalizedZone[]): string[] {
  if (zones.length === 0) return [];

  // For top-down, all zones visible
  if (angleId === "top") return zones.map((z) => z.name);

  // For front/hero, front and center zones
  if (angleId === "front" || angleId === "hero_34") {
    return zones.filter((z) => z.position.y < 60).map((z) => z.name);
  }

  // For back, back zones
  if (angleId === "back") {
    return zones.filter((z) => z.position.y > 40).map((z) => z.name);
  }

  // For left, left-side zones
  if (angleId === "left") {
    return zones.filter((z) => z.position.x < 60).map((z) => z.name);
  }

  // For right, right-side zones
  if (angleId === "right") {
    return zones.filter((z) => z.position.x > 40).map((z) => z.name);
  }

  // Detail shots — hero and nearby zones
  if (angleId === "detail_hero") {
    return zones.filter((z) => z.position.y < 50 && z.position.x > 20 && z.position.x < 80).map((z) => z.name);
  }

  // Zone interiors — just that zone
  if (angleId.startsWith("zone_interior_")) {
    const zoneId = angleId.replace("zone_interior_", "");
    const zone = zones.find((z) => z.id === zoneId);
    return zone ? [zone.name] : [];
  }

  return zones.map((z) => z.name);
}
