// designContextBuilder — assembles the rich structured payload that the
// hero/view edge functions need to produce a brief-driven, designer-quality
// render.
//
// Why this exists: before this builder, the `designContext` field on the
// render store was never populated. The structured markdown prompt in the
// edge function reads ALL of its sections off `designContext` —
// heroInstallation, zoneLayout, brandColors, materialsAndMood, qualityTier,
// creativeEmbrace/Avoid, plus the new visualLanguage / referenceLabels /
// heroPhysicalForm / zoneStructuralForms fields. With `designContext` null,
// every brief-specific section was being skipped and the model fell back to
// generic "trade-show typical" defaults. This builder is the bridge that
// gets the brief's authored design data to the model in a form that
// dominates the prompt instead of getting buried at the bottom.

import type { BoothGeometry } from "@/lib/geometryModel";

/**
 * Quality tier — used by the LIGHTING section in the edge function prompt
 * builder. Inferred from budget / sqft. Replicated here from promptBuilder.ts
 * so we don't have to export the internal helper (we may diverge later).
 */
function inferQualityTier(
  brief: any,
  totalSqft: number,
): "standard" | "premium" | "ultra" {
  if (!brief) return "premium";
  const perShow = brief.budget?.perShow;
  const budget = perShow || (brief.budget?.range?.max ?? 0);
  if (budget <= 0) return "premium";
  const costPerSqft = budget / Math.max(totalSqft, 1);
  if (costPerSqft >= 400) return "ultra";
  if (costPerSqft >= 250) return "premium";
  return "standard";
}

/**
 * Map a poetic / branded zone name to a generic functional descriptor.
 *
 * Why: when zone names like "The Sanctuary" / "The Hearth" / "The Retreat"
 * are dropped into the image prompt's ZONE LAYOUT section, gpt-image-2 reads
 * them as room labels and renders them as overhead wayfinding signs on the
 * booth fascia. Replacing the poetic name with a function description
 * ("primary lounge area") removes the proper noun the model would otherwise
 * try to render as text, while preserving the zone's role so the model
 * knows what to put there.
 *
 * Matching is keyword-based on both id and name so it works regardless of
 * how the AI labelled the zone. Falls back to "supporting area" when no
 * keyword matches.
 */
export function zoneNameToFunction(zone: { id?: string; name?: string }): string {
  const blob = `${zone.id ?? ""} ${zone.name ?? ""}`.toLowerCase();
  if (/hero|experience|apex|digital|core|central|architectural|sculptural/.test(blob))
    return "hero installation focal area";
  if (/lounge|hub|casual|connection|retreat|hearth|sanctuary|sofa/.test(blob))
    return "lounge / informal seating area";
  if (/suite|meeting|bd\b|consultation|private|study/.test(blob))
    return "private meeting / consultation area";
  if (/reception|welcome|entry/.test(blob))
    return "welcome / entry point";
  if (/demo|product|workshop|hands.?on/.test(blob))
    return "product demo / hands-on station";
  if (/merch|storefront|retail|store/.test(blob))
    return "merchandise display area";
  if (/brand.?narrative|storytelling|future|vision|wall|story/.test(blob))
    return "brand narrative / media wall";
  if (/command|storage|service|back.?of.?house|utility/.test(blob))
    return "back-of-house / service area";
  if (/screen|media|theater|theatre/.test(blob))
    return "large-screen media area";
  return "supporting area";
}

export interface DesignContext {
  brandColors?: string[];
  /**
   * Each zone surfaced to the model with a FUNCTIONAL descriptor (not its
   * proper name). The model uses these to know what to put where without
   * being tempted to render branded zone names as fascia signs.
   */
  zoneLayout?: Array<{
    /** Functional descriptor — replaces the zone's poetic name in the prompt. */
    name: string;
    percentage: number;
    position: string;
    /** Optional structural form authored on the canvas (open / canopy / etc.). */
    structuralForm?: string;
  }>;
  materialsAndMood?: Array<{ material: string; feel: string }>;
  heroInstallation?: {
    name: string;
    dimensions?: string;
    materials?: string[];
    /**
     * Authored structural language from interactiveMechanics.hero.physicalForm.structure.
     * This is the most important single field for non-rectangular booth
     * designs — it's the designer's intent for the booth's structural form,
     * not just the focal element. Gets used by the STRUCTURAL APPROACH
     * section to anchor the booth's architecture.
     */
    physicalForm?: string;
  };
  qualityTier?: "standard" | "premium" | "ultra";
  creativeAvoid?: string[];
  creativeEmbrace?: string[];
  /**
   * Brief.creative.visualLanguage — keywords like ["waves", "lines",
   * "curves", "round element"]. The STRUCTURAL APPROACH section reads these
   * and tells the model they must be expressed AS the booth's architecture,
   * not as surface decoration.
   */
  visualLanguage?: string[];
  /**
   * Brief.creative.referenceLabels — themed reference categories like
   * "Emphasis on lines" or "A round element". Adds another voice to the
   * STRUCTURAL APPROACH section.
   */
  referenceLabels?: string[];
  /**
   * Aggregated structural-form vocabulary from the spatial canvas zones —
   * "open / canopy / tower / alcove / enclosed / platform". The STRUCTURAL
   * APPROACH section uses these to bias the architecture away from flat
   * rectangular defaults.
   */
  zoneStructuralForms?: string[];
}

export interface BuildDesignContextArgs {
  brief: any;
  elements: any;
  spatialData: any;
  geometry: BoothGeometry | null;
  totalSqft: number;
}

/**
 * Build the rich structured design context the edge function consumes.
 *
 * Pulls from:
 *   - brief.creative.visualLanguage / .referenceLabels / .avoid / .embrace
 *   - brief.brand.visualIdentity.colors
 *   - elements.interactiveMechanics.hero (name + physicalForm)
 *   - spatialData.materialsAndMood
 *   - geometry.zones (functional descriptors via zoneNameToFunction,
 *     plus per-zone structuralForm)
 *
 * Returns a typed `DesignContext` ready to be passed verbatim to the edge
 * function via `body.designContext`.
 */
export function buildDesignContext({
  brief,
  elements,
  spatialData,
  geometry,
  totalSqft,
}: BuildDesignContextArgs): DesignContext {
  const ctx: DesignContext = {};

  // ── Brand colors ──
  const brandColors: string[] = [];
  const briefColors = brief?.brand?.visualIdentity?.colors;
  if (Array.isArray(briefColors)) {
    for (const c of briefColors) {
      if (typeof c === "string" && c.trim()) brandColors.push(c.trim());
    }
  }
  if (brandColors.length > 0) ctx.brandColors = brandColors;

  // ── Zone layout (functions, not proper names) ──
  const zones = geometry?.zones ?? [];
  if (zones.length > 0) {
    ctx.zoneLayout = zones.map((z: any) => ({
      name: zoneNameToFunction({ id: z.id, name: z.name }),
      percentage: Math.round((z.percentage ?? 0)),
      position: positionLabel(z),
      structuralForm: z.structuralForm ?? undefined,
    }));
  }

  // ── Materials & mood ──
  const materials = spatialData?.materialsAndMood;
  if (Array.isArray(materials) && materials.length > 0) {
    ctx.materialsAndMood = materials
      .map((m: any) => ({
        material: m.material ?? m.name ?? "",
        feel: m.feel ?? m.description ?? "",
      }))
      .filter((m: { material: string }) => m.material.length > 0);
  }

  // ── Hero installation (with structural physical form) ──
  const hero = elements?.interactiveMechanics?.data?.hero;
  if (hero?.name) {
    ctx.heroInstallation = {
      name: hero.name,
      dimensions: hero.physicalForm?.dimensions ?? undefined,
      materials: Array.isArray(hero.physicalForm?.materials)
        ? hero.physicalForm.materials
        : undefined,
      physicalForm: hero.physicalForm?.structure ?? undefined,
    };
  }

  // ── Quality tier ──
  ctx.qualityTier = inferQualityTier(brief, totalSqft);

  // ── Creative direction (avoid / embrace) ──
  const avoid = brief?.creative?.avoid;
  const embrace = brief?.creative?.embrace;
  if (Array.isArray(avoid) && avoid.length > 0) ctx.creativeAvoid = avoid;
  if (Array.isArray(embrace) && embrace.length > 0) ctx.creativeEmbrace = embrace;

  // ── Visual language + reference labels (the structural keywords) ──
  const visualLanguage = brief?.creative?.visualLanguage;
  if (Array.isArray(visualLanguage) && visualLanguage.length > 0) {
    ctx.visualLanguage = visualLanguage.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
  }
  const referenceLabels = brief?.creative?.referenceLabels;
  if (Array.isArray(referenceLabels) && referenceLabels.length > 0) {
    ctx.referenceLabels = referenceLabels.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
  }

  // ── Zone structural-form vocabulary ──
  // Dedupe + emit only the user-authored forms so the STRUCTURAL APPROACH
  // section can list them as biases for the model.
  if (zones.length > 0) {
    const forms = new Set<string>();
    for (const z of zones as any[]) {
      if (typeof z.structuralForm === "string" && z.structuralForm.length > 0) {
        forms.add(z.structuralForm);
      }
    }
    if (forms.size > 0) ctx.zoneStructuralForms = Array.from(forms);
  }

  return ctx;
}

/** Convert a normalized zone's x/y into a human-readable position label. */
function positionLabel(z: { position?: { x: number; y: number; width: number; height: number } }): string {
  const p = z.position;
  if (!p) return "unknown";
  const centerX = p.x + p.width / 2;
  const centerY = p.y + p.height / 2;
  const xLabel = centerX < 33 ? "left" : centerX > 66 ? "right" : "center";
  // y=0 is FRONT (aisle), y=100 is BACK
  const yLabel = centerY < 33 ? "front" : centerY > 66 ? "back" : "middle";
  return `${xLabel}-${yLabel}`;
}
