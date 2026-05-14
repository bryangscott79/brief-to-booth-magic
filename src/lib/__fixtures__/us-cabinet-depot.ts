// src/lib/__fixtures__/us-cabinet-depot.ts
//
// Fixture for a cabinet-maker booth — five thematic room sets
// ("The Study / Sanctuary / Hearth / Retreat / Workshop"). The poetic
// zone names are what's already in spatialData; the normalizer must
// map these to functional descriptors before they reach the prompt.

import type { ParsedBrief } from "@/types/brief";
import type { BoothGeometry } from "@/lib/geometryModel";

export const usCabinetDepotParsedBrief: ParsedBrief = {
  brand: {
    name: "US Cabinet Depot",
    category: "Cabinetry & millwork",
    pov: "Premium American-made cabinetry for designers and builders.",
    personality: ["warm", "premium", "considered"],
    competitors: ["KraftMaid", "Wellborn", "Wolf"],
    visualIdentity: {
      colors: ["walnut", "off-white", "matte-black"],
      avoidColors: [],
      avoidImagery: ["builder-grade construction"],
    },
    tagline: undefined,
  },
  objectives: {
    primary: "Showcase 5 cabinet collections in immersive room sets",
    secondary: ["Generate trade leads", "Highlight craftsmanship"],
    competitiveContext: "KBIS show floor",
    differentiationGoals: ["Curated room experiences", "Premium positioning"],
  },
  events: {
    shows: [{ name: "KBIS 2025", location: "Las Vegas Convention Center" }],
    primaryShow: "KBIS 2025",
  },
  spatial: {
    footprints: [{ size: "40 ft x 30 ft", sqft: 1200, priority: "primary" }],
    modular: true,
    reuseRequirement: "multi-show",
    trafficRequirements: "five distinct room walkthroughs",
    boothType: "island",
    openSides: 4,
  },
  audiences: [
    { name: "Designers", description: "Interior designers, kitchen designers", priority: 1, characteristics: ["taste-driven"], engagementNeeds: "see, touch, evaluate finishes" },
    { name: "Builders", description: "Custom and production builders", priority: 2, characteristics: ["practical"], engagementNeeds: "spec sheets, pricing" },
  ],
  creative: {
    avoid: ["builder-grade displays", "fluorescent lighting"],
    embrace: ["warm wood tones", "room-set immersion", "natural light"],
    coreStrategy: "Five room sets the visitor walks through",
    thinkingFramework: ["domestic", "immersive"],
    designPhilosophy: "The House Tour",
    visualLanguage: ["wood grain", "millwork", "shaker", "natural"],
    referenceLabels: ["Domestic warmth", "Walnut prominence"],
  },
  experience: {
    hero: {
      required: true,
      description: "Central kitchen island with surrounding room sets",
      attributes: ["functional", "premium"],
    },
    storytelling: { required: true, description: "", audienceAdaptation: false },
    humanConnection: { required: true, capacity: "consultation seating", integrationRequirement: "" },
    adjacentActivations: { required: false, count: "0", criteria: [] },
  },
  budget: { perShow: 280000, inclusions: [], exclusions: [], efficiencyNotes: "" },
  requiredDeliverables: ["five room sets", "central kitchen hero"],
  winningCriteria: ["lead quality", "designer engagement"],
};

export const usCabinetDepotGeometry: BoothGeometry = {
  width: 40,
  depth: 30,
  ceilingHeightFt: 16,
  measurementSystem: "imperial",
  zones: [
    {
      id: "study",
      name: "The Study",
      x: 2,
      y: 2,
      width: 7,
      depth: 7,
      heightFt: 10,
      colorHex: "#5C4A35",
      structuralForm: "enclosed",
      featureDescription: "Home office cabinetry set — built-in desk, library wall",
      intent: "Showcase office millwork collection",
    },
    {
      id: "sanctuary",
      name: "The Sanctuary",
      x: 11,
      y: 2,
      width: 7,
      depth: 7,
      heightFt: 10,
      colorHex: "#8B7355",
      structuralForm: "enclosed",
      featureDescription: "Bath & dressing room cabinetry",
      intent: "Showcase bath cabinetry collection",
    },
    {
      id: "hearth",
      name: "The Hearth",
      x: 16,
      y: 11,
      width: 10,
      depth: 9,
      heightFt: 12,
      colorHex: "#A66E33",
      structuralForm: "open",
      featureDescription: "Central kitchen island with surrounding cabinetry — the hero",
      intent: "Hero focal area; primary kitchen showcase",
      materialIds: ["walnut", "matte-stone"],
    },
    {
      id: "retreat",
      name: "The Retreat",
      x: 28,
      y: 2,
      width: 8,
      depth: 8,
      heightFt: 10,
      colorHex: "#6B5B45",
      structuralForm: "alcove",
      featureDescription: "Lounge / living room media wall with built-ins",
      intent: "Casual seating, consultation area",
    },
    {
      id: "workshop",
      name: "The Workshop",
      x: 28,
      y: 18,
      width: 10,
      depth: 10,
      heightFt: 10,
      colorHex: "#3D2F1F",
      structuralForm: "open",
      featureDescription: "Garage / workshop millwork — tool cabinets, mudroom",
      intent: "Showcase mudroom/garage collection",
    },
  ],
  materialsCatalog: [
    { id: "walnut", name: "American Walnut", description: "Warm, premium, signature" },
    { id: "matte-stone", name: "Honed Quartzite", description: "Quiet, premium counter surface" },
    { id: "shaker-paint", name: "Shaker Painted Door", description: "Traditional, off-white" },
  ],
};

export const usCabinetDepotInteractiveMechanicsHero = {
  name: "The Central Kitchen Island",
  concept: "A working kitchen vignette with the full Hearth collection on display.",
  physicalForm: {
    structure: "Functional kitchen island with overhead pot rack, surrounding cabinetry on all four sides",
    dimensions: "12 ft × 6 ft island; 10 ft ceiling fascia",
    materials: ["American Walnut", "Honed Quartzite", "Brushed brass hardware"],
    visualLanguage: "domestic, warm, considered",
  },
};

export const usCabinetDepotProjectMeta = {
  id: "test-uscd",
  name: "US Cabinet Depot — KBIS 2025",
  projectType: "exhibition_booth" as const,
};
