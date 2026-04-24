// ============================================
// CREATIVE BRIEF RESPONSE ENGINE - TYPE DEFINITIONS
// ============================================

export interface ParsedBrief {
  brand: {
    name: string;
    category: string;
    pov: string;
    personality: string[];
    competitors: string[];
    visualIdentity: {
      colors: string[];
      avoidColors: string[];
      avoidImagery: string[];
    };
  };

  objectives: {
    primary: string;
    secondary: string[];
    competitiveContext: string;
    differentiationGoals: string[];
  };

  events: {
    shows: Array<{
      name: string;
      location: string;
      dates?: string;
      audienceProfile?: string;
    }>;
    primaryShow?: string;
  };

  spatial: {
    footprints: Array<{
      size: string;
      sqft: number;
      priority: "primary" | "secondary" | "tertiary";
    }>;
    modular: boolean;
    reuseRequirement: string;
    trafficRequirements: string;
  };

  audiences: Array<{
    name: string;
    description: string;
    priority: number;
    characteristics: string[];
    engagementNeeds: string;
  }>;

  creative: {
    avoid: string[];
    embrace: string[];
    coreStrategy: string;
    thinkingFramework: string[];
    designPhilosophy: string;
  };

  experience: {
    hero: {
      required: boolean;
      description: string;
      attributes: string[];
    };
    storytelling: {
      required: boolean;
      description: string;
      audienceAdaptation: boolean;
    };
    humanConnection: {
      required: boolean;
      capacity: string;
      integrationRequirement: string;
    };
    adjacentActivations: {
      required: boolean;
      count: string;
      criteria: string[];
    };
  };

  budget: {
    perShow?: number;
    range?: { min: number; max: number };
    inclusions: string[];
    exclusions: string[];
    efficiencyNotes: string;
  };

  requiredDeliverables: string[];
  winningCriteria: string[];
}

export interface BigIdea {
  headline: string;
  subheadline: string;
  narrative: string;
  strategicPosition: string;
  differentiation: string;
  coreTension: string;
  briefAlignment: string[];
}

export interface ExperienceFramework {
  conceptDescription: string;
  designPrinciples: Array<{
    name: string;
    description: string;
    briefReference: string;
  }>;
  visitorJourney: Array<{
    stage: string;
    description: string;
    touchpoints: string[];
    colorCode: string;
  }>;
  audienceRouting: Array<{
    persona: string;
    pathway: string[];
    timing: string;
    keyTouchpoints: string[];
  }>;
}

export interface InteractiveMechanics {
  hero: {
    name: string;
    concept: string;
    physicalForm: {
      structure: string;
      dimensions: string;
      materials: string[];
      visualLanguage: string;
    };
    interactionModel: Array<{
      step: number;
      name: string;
      description: string;
      userAction: string;
      systemResponse: string;
    }>;
    technicalSpecs: {
      displayTechnology: string;
      contentEngine: string;
      inputMethod: string;
      simultaneousUsers: string;
      cycleDuration: string;
      idleState: string;
    };
    audienceValue: {
      forExecutives: string;
      forTechnical: string;
      forPartners: string;
    };
  };
  secondary: Array<{
    name: string;
    type: string;
    description: string;
    location: string;
    purpose: string;
  }>;
}

export interface DigitalStorytelling {
  philosophy: string;
  audienceTracks: Array<{
    trackName: string;
    targetAudience: string;
    format: string;
    contentFocus: string;
    tone: string;
    deliveryMethod: string;
  }>;
  contentModules: Array<{
    title: string;
    description: string;
    duration: string;
    reusability: string;
  }>;
  productionNotes: {
    modularity: string;
    refreshCycle: string;
    guidedVsSelfDirected: string;
  };
}

export interface HumanConnectionZones {
  configs: Array<{
    footprintSize: string;
    zones: Array<{
      name: string;
      capacity: string;
      description: string;
      designFeatures: string[];
      purpose: string;
    }>;
  }>;
  operational: {
    booking: string;
    contentSupport: string;
    transitionDesign: string;
  };
  scalingNotes: string;
}

export interface AdjacentActivations {
  activations: Array<{
    name: string;
    type: "primary" | "secondary";
    format: string;
    capacity: string;
    venueType: string;
    venueRecommendations: Array<{
      show: string;
      venues: string[];
    }>;
    programFormat: string;
    atmosphere: string;
    takeaway: string;
    briefAlignment: string[];
  }>;
  competitivePositioning: string;
}

export interface SpatialZone {
  id: string;
  name: string;
  percentage: number;
  sqft: number;
  colorCode: string;
  position: { x: number; y: number; width: number; height: number };
  requirements: string[];
  adjacencies: string[];
  notes: string;
}

export interface SpatialStrategy {
  configs: Array<{
    footprintSize: string;
    totalSqft: number;
    zones: SpatialZone[];
  }>;
  scalingStrategy: {
    whatScalesDown: string[];
    whatEliminates: string[];
    whatStaysProportional: string[];
    conceptIntegrity: string;
  };
  materialsAndMood: Array<{
    material: string;
    use: string;
    feel: string;
  }>;
  trafficFlow: Array<{
    from: string;
    to: string;
    label: string;
  }>;
}

export interface BudgetLogic {
  totalPerShow: number;
  allocation: Array<{
    category: string;
    percentage: number;
    amount: number;
    description: string;
  }>;
  amortization: Array<{
    showNumber: number;
    estimatedCost: number;
    savings: string;
  }>;
  riskFactors: Array<{
    factor: string;
    impact: string;
    level: "high" | "medium" | "low";
  }>;
}

export interface RenderPromptSet {
  projectName: string;
  footprintSize: string;
  prompts: Array<{
    angleId: string;
    angleName: string;
    cameraDescription: string;
    promptText: string;
    aspectRatio: string;
    priority: number;
  }>;
  consistencyTokens: {
    colorPalette: string[];
    materialKeywords: string[];
    lightingKeywords: string[];
    styleKeywords: string[];
    avoidKeywords: string[];
  };
}

export type ElementType = 
  | "bigIdea"
  | "experienceFramework"
  | "interactiveMechanics"
  | "digitalStorytelling"
  | "humanConnection"
  | "adjacentActivations"
  | "spatialStrategy"
  | "budgetLogic";

export type ElementStatus = "pending" | "generating" | "complete" | "error";

export interface ElementState {
  type: ElementType;
  status: ElementStatus;
  data: any;
  error?: string;
}

// ─── Hierarchy & Suite Types ─────────────────────────────────────────────────

export type ScaleClassification =
  | "tabletop"
  | "inline"
  | "peninsula"
  | "island"
  | "large_island"
  | "mega"
  | "custom";

export interface ProjectHierarchy {
  parentId: string | null;
  activationType: string | null;
  sortOrder: number;
  inheritsBrief: boolean;
  inheritsBrand: boolean;
  scaleClassification: ScaleClassification | null;
  footprintSqft: number | null;
  suiteNotes: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  projectType: string;
  activationType: string | null;
  status: string;
  scaleClassification: string | null;
  footprintSqft: number | null;
}

export interface SuiteContext {
  parent: ProjectSummary | null;
  children: ProjectSummary[];
  siblings: ProjectSummary[];
}

// ─── Activation Types ────────────────────────────────────────────────────────

export type ActivationCategory =
  | "engagement"
  | "hospitality"
  | "support"
  | "outdoor"
  | "digital"
  | "experience"
  | "product"
  | "anchor"
  | "operations";

export type ElementEmphasis = "required" | "inherit" | "skip" | "normal";

export interface ActivationType {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  category: ActivationCategory;
  parentTypeAffinity: string[];
  defaultScale: string | null;
  defaultSqft: number | null;
  elementEmphasis: Record<string, ElementEmphasis> | null;
  renderContextOverride: string | null;
  isBuiltin: boolean;
}

// ─── Brand Knowledge Types ───────────────────────────────────────────────────

export interface BrandGuidelines {
  id: string;
  clientId: string;
  colorSystem: {
    primary: Array<{ hex: string; name: string; usage: string }>;
    secondary: Array<{ hex: string; name: string; usage: string }>;
    accent: Array<{ hex: string; name: string; usage: string }>;
    forbidden: Array<{ hex: string; name: string }>;
  } | null;
  typography: {
    primaryTypeface: string;
    secondaryTypeface: string;
    sizeScale: string;
    usageRules: string;
  } | null;
  logoRules: {
    clearSpace: string;
    minSize: string;
    forbiddenTreatments: string[];
    usageNotes: string;
  } | null;
  photographyStyle: {
    style: string;
    dos: string[];
    donts: string[];
  } | null;
  toneOfVoice: {
    description: string;
    messagingPillars: string[];
    taglines: string[];
  } | null;
  materialsFinishes: {
    preferred: string[];
    forbidden: string[];
    finishNotes: string;
  } | null;
  guidelinesVersion: string | null;
}

export interface BrandAsset {
  id: string;
  clientId: string;
  assetType: "logo" | "font" | "approved_image" | "brand_guide_pdf" | "icon_set" | "texture" | "pattern";
  label: string;
  publicUrl: string;
  fileType: string | null;
  metadata: Record<string, unknown> | null;
}

export interface VenueIntelligence {
  id: string;
  showName: string;
  venue: string | null;
  city: string | null;
  industry: string | null;
  designTips: string[];
  trafficPatterns: string | null;
  audienceNotes: string | null;
  logisticsNotes: string | null;
  boothPlacementTips: string | null;
  typicalBoothSizes: string[];
  unionLaborRequired: boolean | null;
  source: string;
  sourceProjectId: string | null;
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  projectType: string;
  clientId: string | null;
  hierarchy: ProjectHierarchy;
  createdAt: Date;
  updatedAt: Date;
  rawBrief: string;
  parsedBrief: ParsedBrief | null;
  elements: Record<ElementType, ElementState>;
  renderPrompts: RenderPromptSet | null;
}
