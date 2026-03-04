// ============================================================
// ELEMENT DEPENDENCY GRAPH
// Defines generation order and upstream context for cascading
// content generation. Each element receives curated summaries
// of already-generated upstream elements.
// ============================================================

import type { ElementType, ElementState } from "@/types/brief";

export interface DependencyLayer {
  layer: number;
  elements: ElementType[];
  description: string;
}

export interface UpstreamContextSpec {
  /** Which element types feed into this element */
  dependsOn: ElementType[];
  /** Function to extract the relevant context from upstream elements */
  extractContext: (elements: Record<ElementType, ElementState>) => Record<string, unknown>;
}

/**
 * Generation layers — elements in the same layer can be generated in parallel.
 * Each layer depends on all previous layers completing.
 */
export const GENERATION_LAYERS: DependencyLayer[] = [
  {
    layer: 0,
    elements: ["bigIdea", "budgetLogic"],
    description: "Foundation: Big Idea sets creative direction, Budget establishes constraints",
  },
  {
    layer: 1,
    elements: ["experienceFramework", "spatialStrategy"],
    description: "Structure: Experience design and spatial layout informed by Big Idea and budget",
  },
  {
    layer: 2,
    elements: ["interactiveMechanics", "humanConnection", "digitalStorytelling"],
    description: "Detail: Zone-specific strategies informed by experience framework and spatial design",
  },
  {
    layer: 3,
    elements: ["adjacentActivations"],
    description: "Extensions: Off-booth activities that complement and don't duplicate booth content",
  },
];

/**
 * For each element type, defines what upstream context it needs.
 * The extractContext function creates a curated summary (not the full raw data)
 * to keep prompts focused and token-efficient.
 */
export const UPSTREAM_CONTEXT: Record<ElementType, UpstreamContextSpec> = {
  // Layer 0: No upstream dependencies
  bigIdea: {
    dependsOn: [],
    extractContext: () => ({}),
  },
  budgetLogic: {
    dependsOn: [],
    extractContext: () => ({}),
  },

  // Layer 1: Depends on Layer 0
  experienceFramework: {
    dependsOn: ["bigIdea"],
    extractContext: (elements) => {
      const bigIdea = elements.bigIdea?.data as Record<string, unknown> | undefined;
      if (!bigIdea) return {};
      return {
        bigIdea: {
          headline: bigIdea.headline,
          subheadline: bigIdea.subheadline,
          narrative: typeof bigIdea.narrative === "string" ? bigIdea.narrative.substring(0, 600) : "",
          coreTension: bigIdea.coreTension,
          differentiation: bigIdea.differentiation,
        },
      };
    },
  },
  spatialStrategy: {
    dependsOn: ["bigIdea", "budgetLogic"],
    extractContext: (elements) => {
      const bigIdea = elements.bigIdea?.data as Record<string, unknown> | undefined;
      const budget = elements.budgetLogic?.data as Record<string, unknown> | undefined;
      return {
        bigIdea: bigIdea ? {
          headline: bigIdea.headline,
          narrative: typeof bigIdea.narrative === "string" ? bigIdea.narrative.substring(0, 400) : "",
        } : undefined,
        budgetLogic: budget ? {
          totalPerShow: budget.totalPerShow,
          allocation: budget.allocation,
        } : undefined,
      };
    },
  },

  // Layer 2: Depends on Layer 0 + 1
  interactiveMechanics: {
    dependsOn: ["bigIdea", "experienceFramework", "spatialStrategy"],
    extractContext: (elements) => {
      const bigIdea = elements.bigIdea?.data as Record<string, unknown> | undefined;
      const expFw = elements.experienceFramework?.data as Record<string, unknown> | undefined;
      const spatial = elements.spatialStrategy?.data as Record<string, unknown> | undefined;
      return {
        bigIdea: bigIdea ? {
          headline: bigIdea.headline,
          coreTension: bigIdea.coreTension,
        } : undefined,
        experienceFramework: expFw ? {
          conceptDescription: typeof expFw.conceptDescription === "string" ? expFw.conceptDescription.substring(0, 400) : "",
          designPrinciples: expFw.designPrinciples,
          visitorJourney: expFw.visitorJourney,
        } : undefined,
        spatialStrategy: spatial ? {
          heroZone: findZoneByFunction(spatial, "hero"),
          totalSqft: (spatial as { configs?: Array<{ totalSqft?: number }> }).configs?.[0]?.totalSqft,
          materialsAndMood: spatial.materialsAndMood,
        } : undefined,
      };
    },
  },
  humanConnection: {
    dependsOn: ["experienceFramework", "spatialStrategy"],
    extractContext: (elements) => {
      const expFw = elements.experienceFramework?.data as Record<string, unknown> | undefined;
      const spatial = elements.spatialStrategy?.data as Record<string, unknown> | undefined;
      return {
        experienceFramework: expFw ? {
          audienceRouting: expFw.audienceRouting,
          visitorJourney: expFw.visitorJourney,
        } : undefined,
        spatialStrategy: spatial ? {
          meetingZones: findZonesByFunction(spatial, ["meeting", "lounge", "hospitality"]),
          totalSqft: (spatial as { configs?: Array<{ totalSqft?: number }> }).configs?.[0]?.totalSqft,
        } : undefined,
      };
    },
  },
  digitalStorytelling: {
    dependsOn: ["bigIdea", "experienceFramework", "interactiveMechanics"],
    extractContext: (elements) => {
      const bigIdea = elements.bigIdea?.data as Record<string, unknown> | undefined;
      const expFw = elements.experienceFramework?.data as Record<string, unknown> | undefined;
      const im = elements.interactiveMechanics?.data as Record<string, unknown> | undefined;
      return {
        bigIdea: bigIdea ? {
          headline: bigIdea.headline,
          narrative: typeof bigIdea.narrative === "string" ? bigIdea.narrative.substring(0, 300) : "",
        } : undefined,
        experienceFramework: expFw ? {
          visitorJourney: expFw.visitorJourney,
          audienceRouting: expFw.audienceRouting,
        } : undefined,
        interactiveMechanics: im ? {
          heroName: (im.hero as Record<string, unknown> | undefined)?.name,
          heroConcept: (im.hero as Record<string, unknown> | undefined)?.concept,
          contentEngine: ((im.hero as Record<string, unknown> | undefined)?.technicalSpecs as Record<string, unknown> | undefined)?.contentEngine,
        } : undefined,
      };
    },
  },

  // Layer 3: Depends on everything above
  adjacentActivations: {
    dependsOn: ["bigIdea", "experienceFramework", "interactiveMechanics", "humanConnection", "digitalStorytelling"],
    extractContext: (elements) => {
      const bigIdea = elements.bigIdea?.data as Record<string, unknown> | undefined;
      const expFw = elements.experienceFramework?.data as Record<string, unknown> | undefined;
      const im = elements.interactiveMechanics?.data as Record<string, unknown> | undefined;
      const hc = elements.humanConnection?.data as Record<string, unknown> | undefined;
      const ds = elements.digitalStorytelling?.data as Record<string, unknown> | undefined;
      return {
        bigIdea: bigIdea ? { headline: bigIdea.headline } : undefined,
        experienceFramework: expFw ? { conceptDescription: typeof expFw.conceptDescription === "string" ? expFw.conceptDescription.substring(0, 300) : "" } : undefined,
        interactiveMechanics: im ? { heroName: (im.hero as Record<string, unknown> | undefined)?.name } : undefined,
        humanConnection: hc ? { meetingTypes: hc.meetingTypes } : undefined,
        digitalStorytelling: ds ? { philosophy: typeof ds.philosophy === "string" ? ds.philosophy.substring(0, 200) : "" } : undefined,
        instruction: "DO NOT duplicate any experiences already covered in the booth. Focus on complementary off-booth activations that extend the brand presence beyond the exhibit floor.",
      };
    },
  },
};

// --- HELPER FUNCTIONS ---

function findZoneByFunction(spatial: Record<string, unknown>, functionName: string): unknown {
  const configs = spatial.configs as Array<{ zones?: Array<{ name?: string; id?: string; sqft?: number; percentage?: number }> }> | undefined;
  const zones = configs?.[0]?.zones;
  if (!zones) return undefined;
  return zones.find(z => {
    const name = (z.name || z.id || "").toLowerCase();
    return name.includes(functionName);
  });
}

function findZonesByFunction(spatial: Record<string, unknown>, functionNames: string[]): unknown[] {
  const configs = spatial.configs as Array<{ zones?: Array<{ name?: string; id?: string; sqft?: number; percentage?: number }> }> | undefined;
  const zones = configs?.[0]?.zones;
  if (!zones) return [];
  return zones.filter(z => {
    const name = (z.name || z.id || "").toLowerCase();
    return functionNames.some(fn => name.includes(fn));
  });
}

/**
 * Get the generation layer for a given element type
 */
export function getLayerForElement(elementType: ElementType): number {
  const layer = GENERATION_LAYERS.find(l => l.elements.includes(elementType));
  return layer?.layer ?? 0;
}

/**
 * Get all elements that depend on a given element (downstream)
 */
export function getDownstreamElements(elementType: ElementType): ElementType[] {
  const downstream: ElementType[] = [];
  for (const [type, spec] of Object.entries(UPSTREAM_CONTEXT)) {
    if (spec.dependsOn.includes(elementType)) {
      downstream.push(type as ElementType);
    }
  }
  return downstream;
}

/**
 * Check if all upstream dependencies for an element are completed
 */
export function areUpstreamComplete(
  elementType: ElementType,
  elements: Record<ElementType, ElementState>
): boolean {
  const deps = UPSTREAM_CONTEXT[elementType].dependsOn;
  return deps.every(dep => elements[dep]?.status === "complete" && elements[dep]?.data);
}

/**
 * Build the upstream context payload for an element generation request
 */
export function buildUpstreamContext(
  elementType: ElementType,
  elements: Record<ElementType, ElementState>
): Record<string, unknown> {
  return UPSTREAM_CONTEXT[elementType].extractContext(elements);
}

/**
 * Get elements that are ready to generate (all deps met, not already complete)
 */
export function getReadyToGenerate(
  elements: Record<ElementType, ElementState>
): ElementType[] {
  const ready: ElementType[] = [];
  for (const layer of GENERATION_LAYERS) {
    for (const elementType of layer.elements) {
      if (elements[elementType]?.status !== "complete" && areUpstreamComplete(elementType, elements)) {
        ready.push(elementType);
      }
    }
  }
  return ready;
}
