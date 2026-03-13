/**
 * Prompt Builder — Pure prompt-building logic extracted from PromptGenerator.tsx
 *
 * ALL language is routed through the Project Type Rules Engine so that
 * "trade show booth" language never appears in non-booth prompts.
 */

import {
  normalizeZones,
  calculateBoothDimensions,
  generateZoneDescriptionsForPrompt,
  type NormalizedZone,
  type BoothDimensions,
} from "@/lib/spatialUtils";

import {
  buildPromptOpener,
  buildComplianceHeader,
  getRules,
  buildScaleBlock as buildProjectScaleBlock,
  getCameraInstructions as getProjectCameraInstructions,
  getCameraScaleHint as getProjectCameraScaleHint,
} from "@/lib/projectTypeRules";

// Re-export types that callers may need
export type { NormalizedZone, BoothDimensions };

// Re-export spatial utilities that PromptGenerator still uses directly
export { normalizeZones, calculateBoothDimensions };

// ============================================
// ANGLE CONFIGURATION
// ============================================

export interface AngleConfig {
  id: string;
  name: string;
  priority: number;
  aspectRatio: string;
  description: string;
  isZoneInterior: boolean;
}

export interface ZoneInteriorAngle extends AngleConfig {
  isZoneInterior: true;
  zoneData: NormalizedZone;
}

export const ANGLE_CONFIG: AngleConfig[] = [
  { id: "hero_34", name: "3/4 Hero View", priority: 1, aspectRatio: "16:9", description: "Primary marketing shot — 45° front-left perspective", isZoneInterior: false },
  { id: "top", name: "Top-Down View", priority: 2, aspectRatio: "1:1", description: "Floor plan validation — directly overhead", isZoneInterior: false },
  { id: "front", name: "Front Elevation", priority: 3, aspectRatio: "16:9", description: "Primary aisle view — eye-level, centered on entry", isZoneInterior: false },
  { id: "left", name: "Left Side", priority: 4, aspectRatio: "16:9", description: "Side aisle view — eye-level, 90° left", isZoneInterior: false },
  { id: "right", name: "Right Side", priority: 5, aspectRatio: "16:9", description: "Opposite side view — eye-level, 90° right", isZoneInterior: false },
  { id: "back", name: "Back View", priority: 6, aspectRatio: "16:9", description: "Rear entry/exit — fully finished, visitor-facing", isZoneInterior: false },
  { id: "detail_hero", name: "Hero Detail", priority: 7, aspectRatio: "4:3", description: "Medium shot focused on hero installation", isZoneInterior: false },
  { id: "detail_lounge", name: "Lounge Detail", priority: 8, aspectRatio: "4:3", description: "Medium shot focused on human connection zone", isZoneInterior: false },
];

// ============================================
// ZONE INTERIOR ANGLES
// ============================================

/** Dynamically generate zone interior angle configs from spatial data */
export function getZoneInteriorAngles(normalizedZones: NormalizedZone[]): ZoneInteriorAngle[] {
  return normalizedZones.map((zone, index) => ({
    id: `zone_interior_${zone.id}`,
    name: `${zone.name} Interior`,
    priority: 9 + index,
    aspectRatio: "16:9",
    description: `Interior perspective inside the ${zone.name} zone — showing featured content and visitor experience`,
    isZoneInterior: true as const,
    zoneData: zone,
  }));
}

// ============================================
// ZONE INTERIOR PROMPT
// ============================================

/** Build a zone-specific interior prompt using content strategy data */
export function generateZoneInteriorPrompt(
  zone: NormalizedZone,
  brief: any,
  bigIdea: any,
  boothDimensions: BoothDimensions,
  elements: any,
  materialsAndMood: any[],
  projectType?: string | null
): string {
  const zoneName = (zone.name || "").toLowerCase();
  const rules = getRules(projectType);
  const parts: string[] = [];

  // Get hero installation details for visual consistency
  const heroInstallation = elements?.interactiveMechanics?.data?.hero;
  const heroPhysicalForm = heroInstallation?.physicalForm;

  // Extract brand colors
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  const primaryColor = brandColors[0] || "brand blue";
  const secondaryColor = brandColors[1] || "white";

  // Build visual style description from hero
  const heroVisualStyle = heroInstallation ? `
The booth features a central "${heroInstallation.name}" installation:
- Structure: ${heroPhysicalForm?.structure || heroInstallation.concept}
- Materials: ${heroPhysicalForm?.materials?.join(", ") || "premium materials"}
- Lighting: ${heroPhysicalForm?.lighting || "dramatic accent lighting in brand colors"}
- Scale: ${heroPhysicalForm?.dimensions || "prominent central feature"}` : "";

  parts.push(`Generate a photorealistic INTERIOR perspective from INSIDE the "${zone.name}" zone of a ${boothDimensions.footprintLabel} (${boothDimensions.totalSqft} sq ft) ${rules.structureNoun} for ${brief.brand.name}.

THIS IS CRITICAL: This zone is part of the SAME booth as the hero image reference. You must maintain EXACT visual consistency.`);

  parts.push("");
  parts.push("═══════════════════════════════════════");
  parts.push("VISUAL CONSISTENCY REQUIREMENTS (MANDATORY)");
  parts.push("═══════════════════════════════════════");
  parts.push("");
  parts.push("This zone interior MUST match the hero reference image exactly:");
  parts.push("");
  parts.push(`BRAND: ${brief.brand.name}`);
  parts.push(`PRIMARY COLOR: ${primaryColor}`);
  parts.push(`SECONDARY COLOR: ${secondaryColor}`);
  parts.push("");
  parts.push("ARCHITECTURAL ELEMENTS TO MATCH:");
  parts.push("- Wall panel style (same material, color, finish)");
  parts.push("- Ceiling/fascia design (same structure, lighting style)");
  parts.push("- Floor material and color");
  parts.push("- Lighting fixtures and color temperature");
  parts.push("- Screen bezels and display styles");
  parts.push("- Furniture design language");
  parts.push("");

  if (heroVisualStyle) {
    parts.push("HERO INSTALLATION (visible or referenced in background):");
    parts.push(heroVisualStyle);
    parts.push("");
  }

  parts.push("DESIGN DIRECTION:");
  parts.push(`"${bigIdea.headline}"`);
  if (bigIdea.narrative) {
    parts.push(bigIdea.narrative.substring(0, 400));
  }
  parts.push("");

  parts.push("═══════════════════════════════════════");
  parts.push(`ZONE: ${zone.name}`);
  parts.push("═══════════════════════════════════════");
  parts.push("");
  parts.push(`Size: ${zone.sqft} sq ft (${zone.percentage}% of booth)`);
  parts.push(`Position: ${Math.round(zone.position.x)}% from left, ${Math.round(zone.position.y)}% from front`);
  parts.push("");

  // Zone-specific content details
  if (zoneName.includes("hero") || zoneName.includes("experience") || zoneName.includes("apex") || zoneName.includes("digital") || zoneName.includes("core")) {
    const im = elements.interactiveMechanics?.data;
    if (im?.hero) {
      parts.push("ZONE FOCUS: Hero Installation Close-Up");
      parts.push(`Show the "${im.hero.name}" from an interior perspective.`);
      parts.push(`Concept: ${im.hero.concept}`);
      if (im.hero.physicalForm) {
        parts.push(`Structure: ${im.hero.physicalForm.structure}`);
        parts.push(`Materials: ${im.hero.physicalForm.materials?.join(", ")}`);
        parts.push(`Lighting: ${im.hero.physicalForm.lighting || "accent lighting"}`);
      }
      parts.push("Show 3-4 visitors actively engaging with the installation.");
    }
  } else if (zoneName.includes("lounge") || zoneName.includes("hub") || zoneName.includes("casual")) {
    parts.push("ZONE FOCUS: Casual Lounge Area");
    parts.push("Modern lounge seating in brand style visible from hero image.");
    parts.push("Same furniture design language as the main booth.");
    parts.push("Subtle brand signage. Warm, inviting atmosphere.");
    parts.push("Show 3-4 visitors in relaxed conversation.");

    const hc = elements.humanConnection?.data;
    if (hc?.hospitalityDetails) {
      parts.push(`Hospitality: ${hc.hospitalityDetails}`);
    }
  } else if (zoneName.includes("horizon") || zoneName.includes("future") || zoneName.includes("preview") || zoneName.includes("storytelling")) {
    parts.push("ZONE FOCUS: Future Vision / Storytelling");
    parts.push("Large display screens showing content. Same screen style as main booth.");
    parts.push("Theatrical lighting consistent with hero image.");
    parts.push("Show 2-4 visitors viewing content.");

    const ds = elements.digitalStorytelling?.data;
    if (ds?.audienceTracks?.length) {
      parts.push("Content tracks:");
      ds.audienceTracks.slice(0, 2).forEach((t: any) => {
        parts.push(`- ${t.trackName}: ${t.contentFocus}`);
      });
    }
  } else if (zoneName.includes("suite") || zoneName.includes("meeting") || zoneName.includes("bd")) {
    parts.push("ZONE FOCUS: Private Meeting Suite");
    parts.push("Semi-enclosed meeting space with glass or frosted panels.");
    parts.push("SAME architectural style as main booth - not a generic conference room.");
    parts.push("Brand colors and materials visible. Executive-level finishing.");
    parts.push("Conference table with 6-10 chairs. Display screen on wall.");
    parts.push("Show 4-6 professionals in business meeting.");

    // Extract meeting zone details
    const hc = elements.humanConnection?.data;
    if (hc?.configs?.[0]?.zones) {
      const matchingZone = hc.configs[0].zones.find((mz: any) =>
        zone.name.toLowerCase().includes(mz.name?.toLowerCase()) ||
        mz.name?.toLowerCase().includes("suite") ||
        mz.name?.toLowerCase().includes("meeting")
      );
      if (matchingZone) {
        parts.push(`Capacity: ${matchingZone.capacity}`);
        parts.push(`Style: ${matchingZone.description || "executive meeting space"}`);
      }
    }
  } else if (zoneName.includes("reception") || zoneName.includes("welcome")) {
    parts.push("ZONE FOCUS: Welcome/Reception");
    parts.push("Branded reception desk matching booth style.");
    parts.push("Digital check-in screens. Same design as hero image displays.");
    parts.push("Staff in professional attire. Clean, welcoming atmosphere.");
    parts.push("Show 1-2 staff greeting 2-3 visitors.");
  } else if (zoneName.includes("demo") || zoneName.includes("product")) {
    parts.push("ZONE FOCUS: Product Demo Station");
    parts.push("Interactive displays and product samples.");
    parts.push("Same counter/display style as main booth.");
    parts.push("Show staff demonstrating to 2-3 engaged visitors.");
  } else if (zoneName.includes("command") || zoneName.includes("storage") || zoneName.includes("service")) {
    parts.push("ZONE FOCUS: Command Center / Service Area");
    parts.push("Functional workspace with same finishes as main booth.");
    parts.push("Monitors, storage, and operational equipment.");
    parts.push("Clean and organized. 1-2 staff working.");
  } else {
    // Generic zone
    parts.push("ZONE FOCUS: Supporting Space");
    parts.push("Functional area matching overall booth aesthetic.");
    parts.push("Same materials and design language as hero image.");
  }

  parts.push("");
  parts.push("MATERIALS (from hero image):");
  if (materialsAndMood?.length > 0) {
    materialsAndMood.forEach((m: any) => {
      parts.push(`- ${m.material}: ${m.feel}`);
    });
  } else {
    parts.push("- Premium materials matching hero image");
    parts.push("- Consistent lighting color temperature");
    parts.push("- Same flooring throughout");
  }

  parts.push("");
  parts.push("CAMERA:");
  parts.push("Eye level (5.5 feet), positioned INSIDE this zone looking inward.");
  parts.push("Show the space's depth and connection to the larger booth.");
  parts.push("Parts of the hero installation or main booth visible in background/periphery.");

  parts.push("");
  parts.push("STYLE:");
  parts.push(`${rules.styleReference}`);
  parts.push("Same lighting style and color temperature as hero image.");

  parts.push("");
  parts.push("NEGATIVE PROMPT:");
  parts.push(`${brief.brand.visualIdentity?.avoidImagery?.join(", ") || "generic stock photo"}, cartoon style, different color scheme than hero, different lighting than hero, generic conference room, hotel meeting room, different architectural style, inconsistent materials, different floor, different walls, mismatched design`);

  parts.push("");
  parts.push("Aspect ratio: 16:9");

  return parts.join("\n");
}

// ============================================
// CAMERA INSTRUCTIONS
// ============================================

/** Generate camera instructions for each angle */
export function getCameraInstructions(angleId: string, boothDimensions: BoothDimensions): string {
  const instructions: Record<string, string> = {
    hero_34: `Camera positioned at 45 degrees front-left, eye level (5.5 feet), showing the full ${boothDimensions.width}' × ${boothDimensions.depth}' booth with hero installation as focal point`,
    top: `Camera directly overhead, looking straight down at the ${boothDimensions.width}' × ${boothDimensions.depth}' floor plan. Perfect orthographic bird's-eye view.`,
    front: `Camera at eye level (5.5 feet), centered on the main entry, capturing the full ${boothDimensions.width}-foot front facade`,
    left: `Camera at eye level, positioned at 90 degrees to the left side, showing the full ${boothDimensions.depth}-foot depth`,
    right: `Camera at eye level, positioned at 90 degrees to the right side, showing the full ${boothDimensions.depth}-foot depth`,
    back: `Camera at eye level, positioned behind the booth showing service areas and the back of the ${boothDimensions.width}-foot structure`,
    detail_hero: "Camera at medium distance (15-20 feet), focused on the central hero installation, showing interaction",
    detail_lounge: "Camera at medium distance (10-15 feet), focused on the lounge/meeting area, showing conversation",
  };
  return instructions[angleId] || "Eye-level perspective shot";
}

// ============================================
// BRIEF COMPLIANCE BLOCK (Phase 4D)
// ============================================

/**
 * Generates a structured "Brief Compliance Block" that gets appended to every
 * prompt (hero + all views). This ensures the AI never forgets key constraints
 * from the original brief, regardless of how complex the rest of the prompt gets.
 */
export function buildBriefComplianceBlock(params: {
  brief: any;
  boothDimensions?: BoothDimensions | null;
  qualityTier?: "standard" | "premium" | "ultra";
  elements?: any;
  projectType?: string | null;
}): string {
  const { brief, boothDimensions, qualityTier, elements, projectType } = params;
  if (!brief) return "";

  const parts: string[] = [];
  parts.push("\n╔═══════════════════════════════════════╗");
  parts.push("║   BRIEF COMPLIANCE CHECK (MANDATORY)  ║");
  parts.push("╚═══════════════════════════════════════╝\n");

  // Project-type-aware size header
  if (boothDimensions) {
    const { width, depth, totalSqft } = boothDimensions;
    parts.push(buildComplianceHeader(projectType, width, depth, totalSqft));
  }

  // Budget tier
  if (qualityTier) {
    const tierDesc: Record<string, string> = {
      standard: "Standard — clean, functional, cost-effective. Do NOT show ultra-premium finishes.",
      premium: "Premium — refined, polished, quality materials. Balanced design complexity.",
      ultra: "Ultra — dramatic, show-stopping, premium materials. Maximum design impact.",
    };
    parts.push(`BUDGET TIER: ${tierDesc[qualityTier] || qualityTier}`);
  }

  // Brand colors
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  if (brandColors.length > 0) {
    parts.push(`BRAND COLORS (MUST be visible): ${brandColors.join(", ")}`);
  }

  // Brand name
  if (brief.brand?.name) {
    parts.push(`BRAND: ${brief.brand.name} — signage/logos MUST appear prominently.`);
  }

  // Creative avoid/embrace
  const avoid = [
    ...(brief.creative?.avoid || []),
    ...(brief.brand?.visualIdentity?.avoidImagery || []),
  ].filter(Boolean);
  const embrace = (brief.creative?.embrace || []).filter(Boolean);

  if (avoid.length > 0) {
    parts.push(`AVOID: ${avoid.join(", ")}`);
  }
  if (embrace.length > 0) {
    parts.push(`EMBRACE: ${embrace.join(", ")}`);
  }

  // Required experience elements
  const heroInstallation = elements?.interactiveMechanics?.data?.hero;
  if (heroInstallation) {
    parts.push(`HERO INSTALLATION: "${heroInstallation.name}"${heroInstallation.physicalForm?.dimensions ? ` (${heroInstallation.physicalForm.dimensions})` : ""} — MUST be prominent.`);
    if (heroInstallation.physicalForm?.materials?.length) {
      parts.push(`  Materials: ${heroInstallation.physicalForm.materials.join(", ")}`);
    }
  }

  // Key audiences
  const audiences = brief.audiences?.primary || [];
  if (audiences.length > 0) {
    const audienceNames = audiences.map((a: any) => typeof a === "string" ? a : a.name || a.role).filter(Boolean);
    if (audienceNames.length > 0) {
      parts.push(`TARGET AUDIENCES (show diverse visitors): ${audienceNames.join(", ")}`);
    }
  }

  parts.push("\n╔═══════════════════════════════════════╗");
  parts.push("║         END COMPLIANCE CHECK           ║");
  parts.push("╚═══════════════════════════════════════╝");

  return parts.join("\n");
}

// ============================================
// MAIN PROMPT GENERATOR
// ============================================

export interface GeneratePromptParams {
  brief: any;
  bigIdea: any;
  elements: any;
  spatialData: any;
  boothDimensions: BoothDimensions;
  normalizedZones: NormalizedZone[];
  zoneInteriorAngles: ZoneInteriorAngle[];
  /** Project type ID — drives all language and framing decisions */
  projectType?: string | null;
}

/** Generate prompt with validated spatial data, fully project-type-aware */
export function generatePrompt(angleId: string, params: GeneratePromptParams): string {
  const { brief, bigIdea, elements, spatialData, boothDimensions, normalizedZones, zoneInteriorAngles, projectType } = params;

  const rules = getRules(projectType);
  const { width, depth, totalSqft, footprintLabel } = boothDimensions;

  // Build the brief compliance block (appended to all prompts)
  const complianceBlock = buildBriefComplianceBlock({
    brief,
    boothDimensions,
    qualityTier: inferQualityTierFromBrief(brief, elements, boothDimensions),
    elements,
    projectType,
  });

  // Check for zone interior angles first
  const zoneAngle = zoneInteriorAngles.find((a: ZoneInteriorAngle) => a.id === angleId);
  if (zoneAngle?.isZoneInterior && zoneAngle.zoneData) {
    const zonePrompt = generateZoneInteriorPrompt(
      zoneAngle.zoneData,
      brief,
      bigIdea,
      boothDimensions,
      elements,
      spatialData.materialsAndMood || [],
      projectType
    );
    return zonePrompt + "\n" + complianceBlock;
  }

  const angle = ANGLE_CONFIG.find(a => a.id === angleId);
  if (!angle) return "";

  const scaleBlock = buildProjectScaleBlock(projectType, width, depth, totalSqft);
  const zoneDescriptions = generateZoneDescriptionsForPrompt(normalizedZones, totalSqft, angleId);
  const cameraInstruction = getProjectCameraInstructions(projectType, angleId, width, depth);
  const cameraScaleHint = getProjectCameraScaleHint(projectType, footprintLabel, angleId);

  const heroInstallation = elements?.interactiveMechanics?.data?.hero;
  const heroDescription = heroInstallation
    ? `${heroInstallation.name} — ${heroInstallation.concept}${heroInstallation.physicalForm?.dimensions ? ` (${heroInstallation.physicalForm.dimensions})` : ''}`
    : `Central ${rules.structureNoun} feature installation`;

  const materialsBlock = spatialData.materialsAndMood?.map((m: any) => `- ${m.material}: ${m.feel}`).join("\n") || "Premium materials matching the design vision";

  // Floor plan annotations if any
  const annotationsBlock = spatialData.floorPlanAnnotations?.length > 0
    ? `\nFLOOR PLAN DESIGN NOTES (apply these spatial decisions):\n${spatialData.floorPlanAnnotations.map((a: any, i: number) => `${i + 1}. ${a.comment}`).join("\n")}`
    : "";

  const promptOpener = buildPromptOpener(
    projectType,
    angle.name,
    width, depth, totalSqft,
    brief.brand?.name || "the brand",
    brief.brand?.category || "brand"
  );

  return `${promptOpener}

${cameraInstruction}
${cameraScaleHint}

${scaleBlock}

DESIGN DIRECTION:
${bigIdea.headline}
${bigIdea.narrative?.substring(0, 400) || ""}

CREATIVE CONSTRAINTS:
Avoid: ${brief.creative?.avoid?.join(", ") || "generic looks"}
Embrace: ${brief.creative?.embrace?.join(", ") || "innovative design"}

SPATIAL LAYOUT (validated zone positions):
${zoneDescriptions}

HERO INSTALLATION:
${heroDescription}

MATERIALS AND MOOD:
${materialsBlock}

BRANDING:
${brief.brand?.name} signage visible. Brand colors: ${brief.brand?.visualIdentity?.colors?.join(", ") || "brand colors"}. Sophisticated, intelligent aesthetic.

ATMOSPHERE:
${rules.atmosphereBlock}
${annotationsBlock}

CAMERA FRAMING:
${cameraInstruction}
${cameraScaleHint}

STYLE:
${rules.styleReference}

NEGATIVE PROMPT:
${brief.brand?.visualIdentity?.avoidImagery?.join(", ") || "generic"}, cartoon style, oversaturated colors, unrealistic lighting, blurry, low quality, ${rules.negativeAdditions}

Aspect ratio: ${angle.aspectRatio}
${complianceBlock}`;
}

// ============================================
// QUALITY TIER INFERENCE (used by compliance block)
// ============================================

/** Infer quality tier from brief budget and booth dimensions */
function inferQualityTierFromBrief(
  brief: any,
  _elements: any,
  boothDimensions?: BoothDimensions | null
): "standard" | "premium" | "ultra" {
  if (!brief) return "premium";

  // Use structured budget range from brief
  const budgetRange = brief.budget?.range;
  const perShow = brief.budget?.perShow;
  const budget = perShow || (budgetRange ? budgetRange.max : 0);
  const sqft = boothDimensions?.totalSqft || 400;

  if (budget <= 0) return "premium"; // default when unknown

  const costPerSqft = budget / sqft;

  if (costPerSqft >= 400) return "ultra";
  if (costPerSqft >= 250) return "premium";
  return "standard";
}
