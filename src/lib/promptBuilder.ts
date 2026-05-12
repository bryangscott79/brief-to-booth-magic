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
import { evaluateBriefReadiness } from "@/lib/briefReadiness";

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

  // Native-unit area string — "42 sqm" for metric projects, "900 sq ft" otherwise.
  const areaLabel =
    boothDimensions.measurementSystem === "metric"
      ? `${boothDimensions.totalAreaNative} sqm`
      : `${boothDimensions.totalSqft} sq ft`;
  parts.push(`Generate a photorealistic INTERIOR perspective from INSIDE the "${zone.name}" zone of a ${boothDimensions.footprintLabel} (${areaLabel}) ${rules.structureNoun} for ${brief.brand.name}.

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
  // Native-unit zone size for the prompt — metric projects get sqm,
  // imperial gets sq ft. Without this the zone-interior renders
  // contradicted the hero render's units.
  const zoneSizeLabel =
    boothDimensions.measurementSystem === "metric"
      ? `${(zone.sqft / 10.76391041671).toFixed(1)} sqm`
      : `${zone.sqft} sq ft`;
  parts.push(`Size: ${zoneSizeLabel} (${zone.percentage}% of booth)`);
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

  // ── Canvas-defined structural metadata. When the user has bound
  //    a structural form, visual brief, intent, or material refs to
  //    THIS zone in the spatial canvas, those fields take precedence
  //    over the keyword-classifier prose above. They're the explicit
  //    user-defined identity for this space.
  const zoneAny = zone as any;
  if (zoneAny.structuralForm) {
    parts.push("");
    parts.push("STRUCTURAL FORM (canvas-defined):");
    const formGuide: Record<string, string> = {
      open: "Open footprint with no walls — floor pattern + props define the space",
      enclosed: "Four walls + ceiling — fully enclosed chamber",
      canopy: "Overhead structure with open sides — covered but airy",
      alcove: "Three walls open to the aisle — kiosk-like recess",
      platform: "Raised floor with no walls — platform / stage",
      tower: "Vertical sculpture, footprint << height — tall brand marker",
    };
    parts.push(
      `- ${zoneAny.structuralForm.toUpperCase()}: ${formGuide[zoneAny.structuralForm] ?? ""}`,
    );
  }
  if (zoneAny.featureDescription) {
    parts.push("");
    parts.push("VISUAL BRIEF (user-authored, canvas-defined):");
    parts.push(zoneAny.featureDescription);
  }
  if (zoneAny.intent) {
    parts.push("");
    parts.push("VISITOR EXPERIENCE (canvas-defined):");
    parts.push(zoneAny.intent);
  }

  parts.push("");
  parts.push("MATERIALS (from hero image):");
  // Per-zone material bindings take precedence — if the canvas zone
  // pinned specific materials from the catalog, use only those. Falls
  // back to the full materialsAndMood list when no binding is set.
  const zoneMaterialIds: string[] = Array.isArray(zoneAny.materialIds)
    ? zoneAny.materialIds
    : [];
  if (zoneMaterialIds.length > 0 && materialsAndMood?.length > 0) {
    const bound = materialsAndMood.filter((m: any) => {
      const id = m.id ?? m.material ?? m.name;
      return zoneMaterialIds.includes(id);
    });
    if (bound.length > 0) {
      bound.forEach((m: any) => {
        const name = m.name ?? m.material ?? "Material";
        const feel = m.description ?? m.feel ?? "";
        parts.push(feel ? `- ${name}: ${feel}` : `- ${name}`);
      });
    } else {
      parts.push("- Materials per project palette");
    }
  } else if (materialsAndMood?.length > 0) {
    materialsAndMood.forEach((m: any) => {
      parts.push(`- ${m.material ?? m.name}: ${m.feel ?? m.description ?? ""}`);
    });
  } else {
    parts.push("- Premium materials matching hero image");
    parts.push("- Consistent lighting color temperature");
    parts.push("- Same flooring throughout");
  }

  // ── Features anchored to this zone — sculptural objects placed
  //    via the canvas. Pulled from spatialData.features (carried on
  //    the brief's optional "spatial features" extension). Each
  //    feature contributes a structural callout the model uses as
  //    explicit geometry (tower / ribbon / archway / etc.) rather
  //    than inventing one. Skip entirely when no features attach.
  const features: any[] = ((zone as any)._features as any[]) ?? [];
  if (features.length > 0) {
    parts.push("");
    parts.push("FEATURES IN THIS ZONE:");
    features.forEach((f) => {
      // Height ranges store as feet on the model, so we convert to
      // meters for metric projects to match the rest of the prompt.
      const baseFt = f.baseHeightFt ?? 0;
      const topFt = f.topHeightFt ?? 0;
      const heightRange =
        boothDimensions.measurementSystem === "metric"
          ? `${(baseFt / 3.28084).toFixed(1)}–${(topFt / 3.28084).toFixed(1)} m`
          : `${baseFt}–${topFt} ft`;
      const desc = f.description ? ` — ${f.description}` : "";
      parts.push(
        `- ${(f.formType ?? "object").toUpperCase()} "${f.name ?? "Unnamed"}" (${heightRange})${desc}`,
      );
    });
  }

  parts.push("");
  parts.push("CAMERA:");
  parts.push(
    boothDimensions.measurementSystem === "metric"
      ? "Eye level (1.7 m), positioned INSIDE this zone looking inward."
      : "Eye level (5.5 feet), positioned INSIDE this zone looking inward.",
  );
  parts.push("Show the space's depth and connection to the larger booth.");
  parts.push("Parts of the hero installation or main booth visible in background/periphery.");

  parts.push("");
  parts.push("STYLE:");
  parts.push(`${rules.styleReference}`);
  parts.push("Same lighting style and color temperature as hero image.");

  parts.push("");
  parts.push("NEGATIVE PROMPT:");
  parts.push(`${brief.brand.visualIdentity?.avoidImagery?.join(", ") || "generic stock photo"}, cartoon style, different color scheme than hero, different lighting than hero, generic conference room, hotel meeting room, different architectural style, inconsistent materials, different floor, different walls, mismatched design, overlaid text on the image, floating zone-name labels, dimension callouts, percentage labels, leader lines, annotation captions, architectural-diagram styling, "5'×12'" or "10ft" or "21%" style measurement annotations, any text not naturally on the physical booth surface`);

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
  /** Optional spatialStrategy data — passed through to the readiness
   *  scorer so the compliance block can include the gap summary. */
  spatialData?: any;
}): string {
  const { brief, boothDimensions, qualityTier, elements, projectType } = params;
  if (!brief) return "";

  const parts: string[] = [];
  parts.push("\n╔═══════════════════════════════════════╗");
  parts.push("║   BRIEF COMPLIANCE CHECK (MANDATORY)  ║");
  parts.push("╚═══════════════════════════════════════╝\n");

  // Project-type-aware size header. Unit-aware so metric projects
  // get "6m × 6m (36 sqm) — ISLAND booth" instead of the broken
  // "6' × 6' (388 sq ft)" we used to emit.
  if (boothDimensions) {
    const { width, depth, totalSqft, measurementSystem } = boothDimensions;
    parts.push(
      buildComplianceHeader(projectType, width, depth, totalSqft, measurementSystem),
    );
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

  // ── Brief readiness summary. The image model sees the same gaps
  //    the user sees, so when a brief is thin the model is told it's
  //    being asked to invent — which tends to make it lean harder on
  //    the references rather than inventing detail. When the brief
  //    is tight the line just confirms "all checks pass." */
  const report = evaluateBriefReadiness({
    brief,
    bigIdea: elements?.bigIdea?.data ?? null,
    elements,
    spatialData: params.spatialData ?? null,
    boothDimensions: boothDimensions ?? null,
  });
  parts.push("");
  parts.push(`BRIEF READINESS: ${report.score}/100`);
  if (report.topGaps.length > 0) {
    parts.push(
      "  Gaps the user did NOT fill in — model: do not invent specifics for these. Lean on references + brand defaults instead:",
    );
    for (const g of report.topGaps) {
      parts.push(`    • ${g.label}: ${g.message}`);
    }
  }

  parts.push("\n╔═══════════════════════════════════════╗");
  parts.push("║         END COMPLIANCE CHECK           ║");
  parts.push("╚═══════════════════════════════════════╝");

  return parts.join("\n");
}

// ============================================
// BRAND INTELLIGENCE BLOCK
// ============================================

function buildBrandIntelBlock(entries?: BrandIntelEntry[]): string {
  if (!entries || entries.length === 0) return "";
  // Focus on visual_identity and vendor_material for render prompts
  const relevant = entries.filter(e =>
    e.category === "visual_identity" || e.category === "vendor_material"
  );
  if (relevant.length === 0) return "";
  const parts: string[] = [
    "\nBRAND INTELLIGENCE (apply these approved constraints):",
  ];
  for (const entry of relevant) {
    parts.push(`• ${entry.title}: ${entry.content}`);
  }
  return parts.join("\n");
}

// ============================================
// MAIN PROMPT GENERATOR
// ============================================

export interface BrandIntelEntry {
  category: string;
  title: string;
  content: string;
  tags?: string[] | null;
}

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
  /** Approved brand intelligence entries to inject into render prompts */
  brandIntelligence?: BrandIntelEntry[];
}

/** Generate prompt with validated spatial data, fully project-type-aware */
export function generatePrompt(angleId: string, params: GeneratePromptParams): string {
  const { brief, bigIdea, elements, spatialData, boothDimensions, normalizedZones, zoneInteriorAngles, projectType, brandIntelligence } = params;

  const rules = getRules(projectType);
  const { width, depth, totalSqft, footprintLabel } = boothDimensions;

  // Build the brief compliance block (appended to all prompts).
  // Pass spatialData through so the readiness scorer can evaluate
  // zones / features / materials and include the gap summary.
  const complianceBlock = buildBriefComplianceBlock({
    brief,
    boothDimensions,
    qualityTier: inferQualityTierFromBrief(brief, elements, boothDimensions),
    elements,
    projectType,
    spatialData,
  });

  // Check for zone interior angles first
  const zoneAngle = zoneInteriorAngles.find((a: ZoneInteriorAngle) => a.id === angleId);
  if (zoneAngle?.isZoneInterior && zoneAngle.zoneData) {
    // Attach the features anchored to this zone so the prompt builder
    // can list each one with its formType + description as explicit
    // structural language. spatialData.features is the canonical
    // store; we filter to the ones whose zoneId matches.
    const allFeatures = Array.isArray((spatialData as any)?.features)
      ? ((spatialData as any).features as any[])
      : [];
    const zoneFeatures = allFeatures.filter(
      (f) => f.zoneId === zoneAngle.zoneData!.id,
    );
    const zoneWithFeatures = {
      ...zoneAngle.zoneData,
      _features: zoneFeatures,
    } as any;
    const zonePrompt = generateZoneInteriorPrompt(
      zoneWithFeatures,
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

  // Thread the project's measurement system through every helper so
  // every dimension, ceiling height, camera distance, and area string
  // renders in native units. Mixed-unit prompts ("6' × 6' (388 sq ft)
  // inline booth" when the brief said "6m × 6m island") were
  // confusing the image model into rendering the wrong size + type.
  const system = boothDimensions.measurementSystem;

  const scaleBlock = buildProjectScaleBlock(projectType, width, depth, totalSqft, system);
  const zoneDescriptions = generateZoneDescriptionsForPrompt(normalizedZones, totalSqft, angleId);
  const cameraInstruction = getProjectCameraInstructions(projectType, angleId, width, depth, system);
  const cameraScaleHint = getProjectCameraScaleHint(projectType, footprintLabel, angleId, system);

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
    brief.brand?.category || "brand",
    system,
  );

  // Single, unambiguous units line at the TOP of the prompt. Earlier
  // versions tried a "metric override — read feet as meters" prelude
  // and that confused the model more than it helped. With every block
  // now emitting native units directly, the prompt is internally
  // consistent and this line just states the convention plainly.
  const sizeLabel = rules.sizeLabel(width, depth, totalSqft, system);
  const unitsAssertion =
    system === "metric"
      ? `UNITS: METRIC. The booth is ${width}m wide × ${depth}m deep (${boothDimensions.totalAreaNative} sqm). Average visitor is 1.7 m tall.`
      : `UNITS: IMPERIAL. The booth is ${width} ft wide × ${depth} ft deep (${totalSqft} sq ft). Average visitor is 5'8" (1.7 m).`;

  return `${promptOpener}

${unitsAssertion}

DIMENSIONS — STATED AS A SINGLE TRUTH:
- Footprint: ${sizeLabel}
- Booth type: ${rules.structureNoun}
- The references attached at the head of the messages array show this exact footprint and zone layout. Match it precisely.

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
${brief.brand?.visualIdentity?.avoidImagery?.join(", ") || "generic"}, cartoon style, oversaturated colors, unrealistic lighting, blurry, low quality, ${rules.negativeAdditions}, overlaid text on the image, floating zone-name labels, dimension callouts, percentage labels, leader lines, annotation captions, architectural-diagram overlay, "5'×12'" or "10ft" or "21%" style measurement annotations, any text not naturally appearing on the physical booth surface
${buildBrandIntelBlock(brandIntelligence)}
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
