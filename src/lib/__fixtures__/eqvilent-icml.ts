// src/lib/__fixtures__/eqvilent-icml.ts
//
// Realistic fixture matching how parsedBrief / geometry / elements
// would look for Eqvilent's ICML 2025 booth project. Used by the
// normalizer + validator + composer test suites. Values mirror what
// parse-brief would actually emit for the Eqvilent brief PDF.

import type { ParsedBrief } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

export const eqvilentParsedBrief: ParsedBrief = {
  brand: {
    name: "Eqvilent",
    category: "Quantitative trading",
    pov: "We find order in chaos, opportunity in complexity.",
    personality: ["intelligent", "precise", "confident"],
    competitors: ["HRT", "Citadel", "Jane Street", "Susquehanna"],
    visualIdentity: {
      colors: ["orange", "black"],
      avoidColors: [],
      avoidImagery: ["stock photography"],
    },
    tagline: "Quantitative trading",
  },
  objectives: {
    primary: "Recruit ML researchers and engineers at ICML 2025",
    secondary: ["Showcase technical brand", "Drive 1:1 conversations"],
    competitiveContext: "Adjacent to HRT, Citadel, Jane Street booths",
    differentiationGoals: ["Premium architectural feel", "Sculptural visual identity"],
  },
  events: {
    shows: [
      {
        name: "ICML 2025",
        location: "COEX Convention & Exhibition Center, Seoul",
        dates: "2025-07-06 to 2025-07-11",
        audienceProfile: "AI researchers, engineers, PhD students",
      },
    ],
    primaryShow: "ICML 2025",
  },
  spatial: {
    footprints: [
      { size: "6m x 6m", sqft: 388, priority: "primary" },
    ],
    modular: false,
    reuseRequirement: "single show",
    trafficRequirements: "highly visible from any point in the exhibition hall",
    boothType: "island",
    openSides: 4,
  },
  audiences: [
    {
      name: "AI Researchers",
      description: "Top AI/ML researchers and scientists",
      priority: 1,
      characteristics: ["technical", "intellectually rigorous"],
      engagementNeeds: "Deep conversations, technical depth",
    },
  ],
  creative: {
    avoid: [
      "Bar stools and high cocktail tables",
      "Branding applied as stickers",
      "temporary booth feel",
      "open access to shelves with merchandise",
    ],
    embrace: [
      "WOW",
      "non-standard",
      "premium booth",
      "light, waves, and lines as structural and architectural components",
      "lighting solutions",
      "Premium materials and finishes",
    ],
    coreStrategy: "Express data flow as architecture",
    thinkingFramework: ["sculptural", "data-as-form"],
    designPhilosophy: "The Apex of Alpha",
    visualLanguage: ["light", "waves", "lines", "round element"],
    referenceLabels: ["Emphasis on lines", "A round element"],
  },
  experience: {
    hero: {
      required: true,
      description: "Central sculptural installation expressing data flow",
      attributes: ["WOW moment", "sculptural", "branded"],
    },
    storytelling: { required: true, description: "", audienceAdaptation: true },
    humanConnection: {
      required: true,
      capacity: "lounge for 4-6 people",
      integrationRequirement: "comfortable, full-size seating",
    },
    adjacentActivations: { required: false, count: "0", criteria: [] },
  },
  budget: {
    perShow: 150000,
    inclusions: ["build", "installation", "removal"],
    exclusions: ["travel", "staff"],
    efficiencyNotes: "single-show build",
  },
  requiredDeliverables: ["wordmark visible from all four sides", "Quantitative trading descriptor"],
  winningCriteria: ["WOW factor", "premium feel", "brand alignment"],
};

export const eqvilentGeometry: BoothGeometry = {
  width: 6,
  depth: 6,
  ceilingHeightFt: 13,
  measurementSystem: "metric",
  zones: [
    {
      id: "welcome",
      name: "Welcome Point",
      x: 0.5,
      y: 0.5,
      width: 2.5,
      depth: 2.0,
      heightFt: 4,
      colorHex: "#E6E6E6",
      structuralForm: "open",
      featureDescription: "Sculptural podium with Eqvilent wordmark + descriptor",
      intent: "Greet visitors, route to lounge or hero",
    },
    {
      id: "hero",
      name: "Central Architectural Hub",
      x: 1.75,
      y: 2.5,
      width: 2.5,
      depth: 2.5,
      heightFt: 13,
      colorHex: "#FF6B1A",
      structuralForm: "canopy",
      featureDescription: "Sculptural infinity-ribbon expressing data flow",
      intent: "Hero focal area — primary WOW moment",
      materialIds: ["matte-black-aluminum", "edge-lit-orange-acrylic"],
    },
    {
      id: "narrative",
      name: "Brand Narrative Wall",
      x: 1.5,
      y: 0.5,
      width: 3.0,
      depth: 1.5,
      heightFt: 10,
      colorHex: "#1A1A1A",
      structuralForm: "enclosed",
      featureDescription: "Architectural feature wall, back-lit lines",
      intent: "Tell the brand story",
    },
    {
      id: "lounge",
      name: "Relaxed Consultation Area",
      x: 3.5,
      y: 3.0,
      width: 2.5,
      depth: 3.0,
      heightFt: 8,
      colorHex: "#2E2E2E",
      structuralForm: "alcove",
      featureDescription: "Lounge with full-size armchairs",
      intent: "Deep 1:1 conversations",
      materialIds: ["charcoal-felt"],
    },
    {
      id: "merch",
      name: "Secure Merch & Storage",
      x: 0.0,
      y: 4.5,
      width: 1.5,
      depth: 1.5,
      heightFt: 8,
      colorHex: "#0D0D0D",
      structuralForm: "enclosed",
      featureDescription: "Glass-fronted merchandise display + concealed storage",
      intent: "Merchandise behind physical barrier",
    },
  ],
  materialsCatalog: [
    { id: "matte-black-aluminum", name: "Matte Black Anodized Aluminum", description: "Technical, precise, premium" },
    { id: "edge-lit-orange-acrylic", name: "Edge-lit Orange Acrylic", description: "Vibrant, energetic, brand color" },
    { id: "polished-concrete", name: "Polished Concrete", description: "Architectural, solid, clean base" },
    { id: "charcoal-felt", name: "Charcoal Grey Felt / Kvadrat", description: "Comfortable, sophisticated, acoustic" },
  ],
};

export const eqvilentInteractiveMechanicsHero = {
  name: "The Apex of Alpha",
  concept: "A sculptural infinity ribbon expressing high-frequency data flow as form.",
  physicalForm: {
    structure: "Suspended mobius ribbon in matte-black aluminum frame with edge-lit orange acrylic inlays",
    dimensions: "4.5m diameter × 1.5m vertical depth, suspended 2.8m from floor",
    materials: ["Lightweight carbon fiber", "Bead-blasted aluminum", "Diffused matte-finish acrylic"],
    visualLanguage: "fluid, sculptural, data-flow",
  },
};

export const eqvilentProjectMeta = {
  id: "test-eqvilent",
  name: "Eqvilent — ICML 2025",
  projectType: "exhibition_booth" as const,
};
