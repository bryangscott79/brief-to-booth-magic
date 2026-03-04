// ============================================================
// EXHIBIT INDUSTRY KNOWLEDGE BASE
// Encodes real-world trade show constraints as validation rules
// ============================================================

// --- TYPES ---

export type QualityTier = "standard" | "premium" | "ultra";
export type BoothType = "tabletop" | "inline" | "peninsula" | "island";
export type ZoneFunction =
  | "hero" | "reception" | "meeting" | "lounge" | "demo"
  | "storytelling" | "storage" | "command" | "hospitality"
  | "product" | "experience" | "welcome" | "service" | "general";

export interface ZoneConstraint {
  minSqft: number;
  minPercentage: number;
  maxPercentage: number;
  description: string;
  costMultiplier: number;       // relative to base cost/sqft
  wattsPerSqft: number;         // electrical estimate
  dataDrops: number;            // network drops needed
  typicalFurniture: string[];   // common items
  staffCount: { min: number; max: number };
}

export interface BoothTypeConstraints {
  ceilingHeightRange: { min: number; max: number }; // feet
  wallSpanMax: number;                                // feet before needing support
  maxWallHeight: number;                              // feet
  typicalAisleExposure: number;                       // number of open sides (1-4)
  doubleDeckAllowed: boolean;
  riggingAllowed: boolean;
}

export interface ADARequirement {
  rule: string;
  measurement: string;
  applies: string;
}

export interface CostEstimate {
  baseCostPerSqft: { min: number; max: number };
  graphicsPerSqft: { min: number; max: number };
  techOverlayPerSqft: { min: number; max: number };
  furniturePerZone: { min: number; max: number };
}

export interface ValidationResult {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  suggestion?: string;
}

// --- ZONE CONSTRAINTS ---

export const ZONE_CONSTRAINTS: Record<ZoneFunction, ZoneConstraint> = {
  hero: {
    minSqft: 100,
    minPercentage: 15,
    maxPercentage: 40,
    description: "Primary brand experience and hero installation",
    costMultiplier: 1.5,
    wattsPerSqft: 20,
    dataDrops: 4,
    typicalFurniture: ["hero structure", "interactive display", "AV equipment"],
    staffCount: { min: 1, max: 3 },
  },
  experience: {
    minSqft: 80,
    minPercentage: 10,
    maxPercentage: 35,
    description: "Interactive experience zone",
    costMultiplier: 1.4,
    wattsPerSqft: 18,
    dataDrops: 3,
    typicalFurniture: ["interactive kiosk", "display screen", "seating"],
    staffCount: { min: 1, max: 2 },
  },
  reception: {
    minSqft: 64,
    minPercentage: 5,
    maxPercentage: 12,
    description: "Visitor welcome and badge scanning",
    costMultiplier: 1.0,
    wattsPerSqft: 8,
    dataDrops: 2,
    typicalFurniture: ["reception counter", "digital display", "stool"],
    staffCount: { min: 1, max: 2 },
  },
  welcome: {
    minSqft: 64,
    minPercentage: 5,
    maxPercentage: 12,
    description: "Welcome/greeting area",
    costMultiplier: 1.0,
    wattsPerSqft: 8,
    dataDrops: 1,
    typicalFurniture: ["welcome counter", "signage"],
    staffCount: { min: 1, max: 2 },
  },
  meeting: {
    minSqft: 100,
    minPercentage: 8,
    maxPercentage: 25,
    description: "Private/semi-private meeting space (25 sqft/seat)",
    costMultiplier: 1.2,
    wattsPerSqft: 5,
    dataDrops: 2,
    typicalFurniture: ["conference table", "chairs (6-10)", "display screen", "whiteboard"],
    staffCount: { min: 0, max: 1 },
  },
  lounge: {
    minSqft: 80,
    minPercentage: 8,
    maxPercentage: 20,
    description: "Casual conversation and hospitality (20 sqft/seat)",
    costMultiplier: 1.1,
    wattsPerSqft: 5,
    dataDrops: 1,
    typicalFurniture: ["lounge seating", "coffee table", "side tables", "charging station"],
    staffCount: { min: 0, max: 1 },
  },
  hospitality: {
    minSqft: 60,
    minPercentage: 5,
    maxPercentage: 15,
    description: "F&B service and catering area",
    costMultiplier: 1.1,
    wattsPerSqft: 10,
    dataDrops: 1,
    typicalFurniture: ["bar counter", "refrigerator", "bistro tables"],
    staffCount: { min: 1, max: 2 },
  },
  demo: {
    minSqft: 50,
    minPercentage: 5,
    maxPercentage: 20,
    description: "Product demonstration station",
    costMultiplier: 1.3,
    wattsPerSqft: 15,
    dataDrops: 2,
    typicalFurniture: ["demo counter", "product displays", "monitor"],
    staffCount: { min: 1, max: 2 },
  },
  product: {
    minSqft: 50,
    minPercentage: 5,
    maxPercentage: 20,
    description: "Product showcase and display",
    costMultiplier: 1.2,
    wattsPerSqft: 12,
    dataDrops: 1,
    typicalFurniture: ["display cases", "shelving", "spotlights"],
    staffCount: { min: 0, max: 1 },
  },
  storytelling: {
    minSqft: 60,
    minPercentage: 5,
    maxPercentage: 20,
    description: "Digital content and narrative zone",
    costMultiplier: 1.3,
    wattsPerSqft: 15,
    dataDrops: 3,
    typicalFurniture: ["LED wall/screens", "seating", "audio system"],
    staffCount: { min: 0, max: 1 },
  },
  storage: {
    minSqft: 36,
    minPercentage: 4,
    maxPercentage: 10,
    description: "Back-of-house storage and utilities",
    costMultiplier: 0.7,
    wattsPerSqft: 3,
    dataDrops: 1,
    typicalFurniture: ["shelving", "lockable cabinets", "coat rack"],
    staffCount: { min: 0, max: 0 },
  },
  command: {
    minSqft: 36,
    minPercentage: 3,
    maxPercentage: 8,
    description: "Staff operations and tech control",
    costMultiplier: 0.8,
    wattsPerSqft: 10,
    dataDrops: 3,
    typicalFurniture: ["tech desk", "monitors", "networking rack"],
    staffCount: { min: 1, max: 2 },
  },
  service: {
    minSqft: 36,
    minPercentage: 4,
    maxPercentage: 10,
    description: "Service and maintenance area",
    costMultiplier: 0.7,
    wattsPerSqft: 5,
    dataDrops: 1,
    typicalFurniture: ["work counter", "storage bins", "tool access"],
    staffCount: { min: 0, max: 1 },
  },
  general: {
    minSqft: 40,
    minPercentage: 5,
    maxPercentage: 30,
    description: "General-purpose supporting space",
    costMultiplier: 1.0,
    wattsPerSqft: 8,
    dataDrops: 1,
    typicalFurniture: ["flexible furniture"],
    staffCount: { min: 0, max: 2 },
  },
};

// --- BOOTH TYPE CONSTRAINTS ---

export const BOOTH_TYPE_CONSTRAINTS: Record<BoothType, BoothTypeConstraints> = {
  tabletop: {
    ceilingHeightRange: { min: 4, max: 6 },
    wallSpanMax: 8,
    maxWallHeight: 6,
    typicalAisleExposure: 1,
    doubleDeckAllowed: false,
    riggingAllowed: false,
  },
  inline: {
    ceilingHeightRange: { min: 8, max: 12 },
    wallSpanMax: 8,
    maxWallHeight: 12,
    typicalAisleExposure: 1,
    doubleDeckAllowed: false,
    riggingAllowed: false,
  },
  peninsula: {
    ceilingHeightRange: { min: 12, max: 16 },
    wallSpanMax: 10,
    maxWallHeight: 16,
    typicalAisleExposure: 3,
    doubleDeckAllowed: false,
    riggingAllowed: true,
  },
  island: {
    ceilingHeightRange: { min: 16, max: 24 },
    wallSpanMax: 12,
    maxWallHeight: 20,
    typicalAisleExposure: 4,
    doubleDeckAllowed: true,
    riggingAllowed: true,
  },
};

// --- ADA COMPLIANCE ---

export const ADA_REQUIREMENTS: ADARequirement[] = [
  { rule: "Minimum aisle width within booth", measurement: "36 inches", applies: "All walkways between zones" },
  { rule: "Turning radius at dead ends", measurement: "60 inches", applies: "Any corridor ending in a wall" },
  { rule: "Maximum counter height (accessible)", measurement: "34 inches", applies: "Reception desks, demo stations" },
  { rule: "Knee clearance under counters", measurement: "27 inches minimum", applies: "Accessible service counters" },
  { rule: "Raised floor ramp slope", measurement: "1:12 maximum (1 inch rise per 12 inches run)", applies: "Any raised platform or stage" },
  { rule: "Clear floor space at interactive", measurement: "30 x 48 inches minimum", applies: "Interactive kiosks and displays" },
  { rule: "Reach range (forward)", measurement: "15-48 inches from floor", applies: "Controls, displays, touchscreens" },
  { rule: "Signage height", measurement: "Minimum 80 inches overhead clearance", applies: "Hanging signs and banners" },
];

// --- COST ESTIMATION ---

export const COST_TIERS: Record<QualityTier, CostEstimate> = {
  standard: {
    baseCostPerSqft: { min: 150, max: 200 },
    graphicsPerSqft: { min: 30, max: 50 },
    techOverlayPerSqft: { min: 50, max: 80 },
    furniturePerZone: { min: 2000, max: 5000 },
  },
  premium: {
    baseCostPerSqft: { min: 250, max: 350 },
    graphicsPerSqft: { min: 50, max: 80 },
    techOverlayPerSqft: { min: 80, max: 120 },
    furniturePerZone: { min: 5000, max: 10000 },
  },
  ultra: {
    baseCostPerSqft: { min: 400, max: 600 },
    graphicsPerSqft: { min: 80, max: 120 },
    techOverlayPerSqft: { min: 120, max: 200 },
    furniturePerZone: { min: 10000, max: 25000 },
  },
};

// --- CIRCULATION ---

export const CIRCULATION_REQUIREMENTS = {
  minPercentage: 20, // Minimum 20% of booth for walkways
  maxPercentage: 30, // Maximum 30% (beyond this is wasted space)
  mainAisleWidthFeet: 4, // 4 foot primary aisle
  secondaryAisleWidthFeet: 3, // 3 foot secondary paths
};

// --- HELPER FUNCTIONS ---

/** Classify zone function from zone name string */
export function classifyZoneFunction(zoneName: string): ZoneFunction {
  const name = zoneName.toLowerCase();
  if (name.includes("hero") || name.includes("apex") || name.includes("core")) return "hero";
  if (name.includes("experience") || name.includes("interactive")) return "experience";
  if (name.includes("reception")) return "reception";
  if (name.includes("welcome")) return "welcome";
  if (name.includes("meeting") || name.includes("suite") || name.includes("bd") || name.includes("conference")) return "meeting";
  if (name.includes("lounge") || name.includes("hub") || name.includes("casual")) return "lounge";
  if (name.includes("hospitality") || name.includes("f&b") || name.includes("bar")) return "hospitality";
  if (name.includes("demo")) return "demo";
  if (name.includes("product") || name.includes("showcase")) return "product";
  if (name.includes("storytelling") || name.includes("content") || name.includes("digital") || name.includes("horizon") || name.includes("future") || name.includes("preview")) return "storytelling";
  if (name.includes("storage") || name.includes("back of house") || name.includes("boh")) return "storage";
  if (name.includes("command") || name.includes("tech") || name.includes("av")) return "command";
  if (name.includes("service")) return "service";
  return "general";
}

/** Determine booth type from dimensions */
export function classifyBoothType(width: number, depth: number): BoothType {
  const sqft = width * depth;
  if (sqft < 100) return "tabletop";
  if (sqft <= 400) return "inline";
  if (sqft <= 1200) return "peninsula";
  return "island";
}

/** Validate zone minimum sizes */
export function validateZoneMinimums(
  zones: Array<{ name: string; sqft: number; percentage: number }>,
  totalSqft: number
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const zone of zones) {
    const fn = classifyZoneFunction(zone.name);
    const constraints = ZONE_CONSTRAINTS[fn];

    if (zone.sqft < constraints.minSqft) {
      results.push({
        severity: "error",
        category: "Zone Size",
        message: `"${zone.name}" is ${zone.sqft} sqft — below the ${constraints.minSqft} sqft minimum for ${fn} zones`,
        suggestion: `Increase to at least ${constraints.minSqft} sqft or merge with an adjacent zone`,
      });
    }

    if (zone.percentage < constraints.minPercentage) {
      results.push({
        severity: "warning",
        category: "Zone Allocation",
        message: `"${zone.name}" is only ${zone.percentage}% of the booth — ${fn} zones typically need at least ${constraints.minPercentage}%`,
        suggestion: `Consider expanding to ${constraints.minPercentage}% (${Math.ceil(totalSqft * constraints.minPercentage / 100)} sqft)`,
      });
    }

    if (zone.percentage > constraints.maxPercentage) {
      results.push({
        severity: "warning",
        category: "Zone Allocation",
        message: `"${zone.name}" at ${zone.percentage}% exceeds the typical ${constraints.maxPercentage}% maximum for ${fn} zones`,
        suggestion: `Consider splitting into sub-zones or reducing to ${constraints.maxPercentage}%`,
      });
    }
  }

  return results;
}

/** Validate circulation space */
export function validateCirculationSpace(
  zones: Array<{ percentage: number }>,
  _totalSqft: number
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const totalZonePercentage = zones.reduce((sum, z) => sum + z.percentage, 0);
  const circulationPercentage = 100 - totalZonePercentage;

  if (circulationPercentage < CIRCULATION_REQUIREMENTS.minPercentage) {
    results.push({
      severity: "error",
      category: "Circulation",
      message: `Only ${circulationPercentage.toFixed(0)}% of the booth is left for walkways — minimum is ${CIRCULATION_REQUIREMENTS.minPercentage}%`,
      suggestion: `Reduce zone allocations by ${(CIRCULATION_REQUIREMENTS.minPercentage - circulationPercentage).toFixed(0)}% to ensure visitor movement`,
    });
  }

  if (circulationPercentage > CIRCULATION_REQUIREMENTS.maxPercentage) {
    results.push({
      severity: "info",
      category: "Circulation",
      message: `${circulationPercentage.toFixed(0)}% of booth is unallocated — above the typical ${CIRCULATION_REQUIREMENTS.maxPercentage}% for circulation`,
      suggestion: `Consider adding functional zones to use the extra space effectively`,
    });
  }

  return results;
}

/** Estimate costs for a zone layout */
export function estimateZoneCosts(
  zones: Array<{ name: string; sqft: number }>,
  totalSqft: number,
  tier: QualityTier
): {
  perZone: Array<{ name: string; structure: number; graphics: number; technology: number; furniture: number; total: number }>;
  grandTotal: number;
  costPerSqft: number;
} {
  const costs = COST_TIERS[tier];
  const baseCostAvg = (costs.baseCostPerSqft.min + costs.baseCostPerSqft.max) / 2;
  const graphicsAvg = (costs.graphicsPerSqft.min + costs.graphicsPerSqft.max) / 2;
  const techAvg = (costs.techOverlayPerSqft.min + costs.techOverlayPerSqft.max) / 2;
  const furnitureAvg = (costs.furniturePerZone.min + costs.furniturePerZone.max) / 2;

  const perZone = zones.map(zone => {
    const fn = classifyZoneFunction(zone.name);
    const constraints = ZONE_CONSTRAINTS[fn];

    const structure = Math.round(zone.sqft * baseCostAvg * constraints.costMultiplier);
    const graphics = Math.round(zone.sqft * graphicsAvg * 0.3); // ~30% of wall area
    const needsTech = ["hero", "experience", "storytelling", "demo", "command"].includes(fn);
    const technology = needsTech ? Math.round(zone.sqft * techAvg) : 0;
    const furniture = Math.round(furnitureAvg);

    return {
      name: zone.name,
      structure,
      graphics,
      technology,
      furniture,
      total: structure + graphics + technology + furniture,
    };
  });

  const grandTotal = perZone.reduce((sum, z) => sum + z.total, 0);

  return {
    perZone,
    grandTotal,
    costPerSqft: Math.round(grandTotal / totalSqft),
  };
}

/** Validate budget feasibility */
export function validateBudgetFeasibility(
  zones: Array<{ name: string; sqft: number }>,
  totalSqft: number,
  budgetPerShow: number | undefined,
  tier: QualityTier
): ValidationResult[] {
  const results: ValidationResult[] = [];
  if (!budgetPerShow) return results;

  const estimate = estimateZoneCosts(zones, totalSqft, tier);
  const ratio = estimate.grandTotal / budgetPerShow;

  if (ratio > 1.2) {
    results.push({
      severity: "error",
      category: "Budget",
      message: `Estimated build cost ($${estimate.grandTotal.toLocaleString()}) exceeds budget ($${budgetPerShow.toLocaleString()}) by ${Math.round((ratio - 1) * 100)}%`,
      suggestion: `Consider switching to "${tier === "ultra" ? "premium" : "standard"}" quality tier, or reduce total zone area`,
    });
  } else if (ratio > 1.0) {
    results.push({
      severity: "warning",
      category: "Budget",
      message: `Estimated cost ($${estimate.grandTotal.toLocaleString()}) is slightly over budget ($${budgetPerShow.toLocaleString()})`,
      suggestion: `Fine-tune zone sizes or reduce technology overlay in lower-priority zones`,
    });
  } else if (ratio < 0.6) {
    results.push({
      severity: "info",
      category: "Budget",
      message: `Significant budget headroom — estimated $${estimate.grandTotal.toLocaleString()} vs $${budgetPerShow.toLocaleString()} budget`,
      suggestion: `Consider upgrading to "${tier === "standard" ? "premium" : "ultra"}" tier or adding more interactive elements`,
    });
  }

  return results;
}

/** Calculate utility requirements */
export function calculateUtilityRequirements(
  zones: Array<{ name: string; sqft: number }>
): { totalWatts: number; totalAmps20: number; dataDrops: number; dedicatedCircuits: number } {
  let totalWatts = 0;
  let totalDataDrops = 0;

  for (const zone of zones) {
    const fn = classifyZoneFunction(zone.name);
    const constraints = ZONE_CONSTRAINTS[fn];
    totalWatts += zone.sqft * constraints.wattsPerSqft;
    totalDataDrops += constraints.dataDrops;
  }

  return {
    totalWatts,
    totalAmps20: Math.ceil(totalWatts / (120 * 20)), // 20A circuits at 120V
    dataDrops: totalDataDrops,
    dedicatedCircuits: Math.ceil(totalWatts / 2400), // 20A * 120V = 2400W per circuit
  };
}

/** Validate sightlines - check hero is visible from aisles */
export function validateSightlines(
  zones: Array<{ name: string; position: { x: number; y: number; width: number; height: number } }>,
  _boothWidth: number,
  _boothDepth: number
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Find hero zone
  const heroZone = zones.find(z => classifyZoneFunction(z.name) === "hero" || classifyZoneFunction(z.name) === "experience");
  if (!heroZone) {
    results.push({
      severity: "warning",
      category: "Sightlines",
      message: "No hero/experience zone found — visitors won't have a clear focal point from the aisle",
      suggestion: "Add a hero zone positioned for maximum visibility from the primary aisle",
    });
    return results;
  }

  // Hero should be visible from front (y < 60 means it's in the front 60% of booth)
  const heroCenterY = heroZone.position.y + heroZone.position.height / 2;
  if (heroCenterY > 70) {
    results.push({
      severity: "warning",
      category: "Sightlines",
      message: `Hero zone "${heroZone.name}" is positioned deep in the booth (${Math.round(heroCenterY)}% from front) — may not be visible from the main aisle`,
      suggestion: "Move the hero zone forward (closer to y=30-50%) for better aisle visibility",
    });
  }

  // Check if reception/welcome blocks hero
  const receptionZone = zones.find(z => {
    const fn = classifyZoneFunction(z.name);
    return fn === "reception" || fn === "welcome";
  });
  if (receptionZone && heroZone) {
    const receptionBlocksHero = (
      receptionZone.position.y < heroZone.position.y &&
      receptionZone.position.x < heroZone.position.x + heroZone.position.width &&
      receptionZone.position.x + receptionZone.position.width > heroZone.position.x &&
      receptionZone.position.height > 20
    );
    if (receptionBlocksHero) {
      results.push({
        severity: "warning",
        category: "Sightlines",
        message: `Reception zone may block sightlines to the hero installation from the main aisle`,
        suggestion: "Move reception to the side or reduce its depth to maintain clear sightlines to the hero",
      });
    }
  }

  return results;
}

/** Run all validations at once */
export function validateFullLayout(
  zones: Array<{ name: string; sqft: number; percentage: number; position: { x: number; y: number; width: number; height: number } }>,
  totalSqft: number,
  boothWidth: number,
  boothDepth: number,
  budgetPerShow?: number,
  tier: QualityTier = "premium"
): ValidationResult[] {
  return [
    ...validateZoneMinimums(zones, totalSqft),
    ...validateCirculationSpace(zones, totalSqft),
    ...validateSightlines(zones, boothWidth, boothDepth),
    ...validateBudgetFeasibility(zones, totalSqft, budgetPerShow, tier),
  ];
}
