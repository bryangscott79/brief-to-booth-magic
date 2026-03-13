/**
 * Presentation Templates — Defines multiple on-brand proposal templates
 *
 * Each template specifies which sections to include, their order,
 * and layout preferences. Users can select a template before export,
 * then customize individual slides.
 */

// ============================================
// TYPES
// ============================================

export type SectionType = "cover" | "text" | "image" | "mixed" | "table" | "grid";

export interface SlideConfig {
  /** Unique section ID matching proposalGenerator sections */
  sectionId: string;
  /** Display title for the slide */
  title: string;
  /** Section type for rendering */
  type: SectionType;
  /** Whether this slide is included by default */
  included: boolean;
  /** Whether this slide is required (cannot be toggled off) */
  required: boolean;
  /** Optional override for the section subtitle */
  subtitle?: string;
  /** Layout variant */
  layout?: "full" | "split" | "centered" | "grid-2" | "grid-3" | "grid-4" | "grid-6";
}

export interface PresentationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Target slide count range */
  slideRange: { min: number; max: number };
  /** Ordered list of slide configurations */
  slides: SlideConfig[];
  /** Template-level style options */
  style: {
    colorScheme: "dark" | "light" | "mixed";
    imageEmphasis: "high" | "medium" | "low";
    textDensity: "minimal" | "moderate" | "detailed";
  };
}

// ============================================
// SECTION IDS (match proposalGenerator)
// ============================================

const SECTION_IDS = {
  COVER: "cover",
  EXECUTIVE_SUMMARY: "executive-summary",
  HERO_RENDER: "hero-render",
  STRATEGIC_CONCEPT: "strategic-concept",
  EXPERIENCE_FRAMEWORK: "experience-framework",
  SPATIAL_DESIGN: "spatial-design",
  INTERACTIVE_MECHANICS: "interactive-mechanics",
  DIGITAL_STORYTELLING: "digital-storytelling",
  MULTI_VIEW_RENDERS: "multi-view-renders",
  ZONE_INTERIORS: "zone-interiors",
  HUMAN_CONNECTION: "human-connection",
  ADJACENT_ACTIVATIONS: "adjacent-activations",
  INVESTMENT_SUMMARY: "investment-summary",
  NEXT_STEPS: "next-steps",
  // New sections for enhanced templates
  VIDEO_SHOWCASE: "video-showcase",
  MATERIALS_SPEC: "materials-spec",
  TIMELINE: "timeline",
  ROI_PROJECTIONS: "roi-projections",
  // Phase 3: Rhino + Intelligence sections
  RHINO_COMPARISON: "rhino-comparison",
  BRAND_INTELLIGENCE: "brand-intelligence",
  TEAM_CREDITS: "team-credits",
} as const;

// ============================================
// TEMPLATES
// ============================================

/** Executive Summary — 8-10 slides, high-level strategy + hero renders */
const executiveSummary: PresentationTemplate = {
  id: "executive-summary",
  name: "Executive Summary",
  description: "Concise 8-10 slide deck for executive stakeholders. Strategy-first with hero visuals.",
  icon: "📊",
  slideRange: { min: 8, max: 10 },
  slides: [
    { sectionId: SECTION_IDS.COVER, title: "Cover", type: "cover", included: true, required: true },
    { sectionId: SECTION_IDS.EXECUTIVE_SUMMARY, title: "The Big Idea", type: "text", included: true, required: true },
    { sectionId: SECTION_IDS.HERO_RENDER, title: "Design Vision", type: "image", included: true, required: true },
    { sectionId: SECTION_IDS.EXPERIENCE_FRAMEWORK, title: "Experience Strategy", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.SPATIAL_DESIGN, title: "Spatial Layout", type: "image", included: true, required: false },
    { sectionId: SECTION_IDS.MULTI_VIEW_RENDERS, title: "Booth Views", type: "grid", included: true, required: false, layout: "grid-4" },
    { sectionId: SECTION_IDS.INTERACTIVE_MECHANICS, title: "Hero Installation", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.INVESTMENT_SUMMARY, title: "Investment Overview", type: "table", included: true, required: true },
    { sectionId: SECTION_IDS.NEXT_STEPS, title: "Next Steps", type: "text", included: true, required: true },
  ],
  style: {
    colorScheme: "dark",
    imageEmphasis: "high",
    textDensity: "minimal",
  },
};

/** Full Proposal — 18-25 slides, comprehensive with all elements */
const fullProposal: PresentationTemplate = {
  id: "full-proposal",
  name: "Full Proposal",
  description: "Comprehensive 18-25 slide deck covering all strategic and design elements.",
  icon: "📑",
  slideRange: { min: 18, max: 25 },
  slides: [
    { sectionId: SECTION_IDS.COVER, title: "Cover", type: "cover", included: true, required: true },
    { sectionId: SECTION_IDS.EXECUTIVE_SUMMARY, title: "Strategic Vision", type: "text", included: true, required: true },
    { sectionId: SECTION_IDS.HERO_RENDER, title: "Design Hero", type: "image", included: true, required: true },
    { sectionId: SECTION_IDS.STRATEGIC_CONCEPT, title: "Strategic Concept", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.EXPERIENCE_FRAMEWORK, title: "Experience Framework", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.SPATIAL_DESIGN, title: "Spatial Design", type: "image", included: true, required: false },
    { sectionId: SECTION_IDS.INTERACTIVE_MECHANICS, title: "Interactive Mechanics", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.DIGITAL_STORYTELLING, title: "Digital Storytelling", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.MULTI_VIEW_RENDERS, title: "Exterior Views", type: "grid", included: true, required: false, layout: "grid-3" },
    { sectionId: SECTION_IDS.ZONE_INTERIORS, title: "Zone Interiors", type: "grid", included: true, required: false, layout: "grid-4" },
    { sectionId: SECTION_IDS.HUMAN_CONNECTION, title: "Human Connection", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.ADJACENT_ACTIVATIONS, title: "Adjacent Activations", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.MATERIALS_SPEC, title: "Materials & Finishes", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.VIDEO_SHOWCASE, title: "Video Walkthrough", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.RHINO_COMPARISON, title: "3D Design Process", type: "grid", included: true, required: false, layout: "grid-2" },
    { sectionId: SECTION_IDS.BRAND_INTELLIGENCE, title: "Brand Intelligence Summary", type: "mixed", included: false, required: false },
    { sectionId: SECTION_IDS.INVESTMENT_SUMMARY, title: "Investment Summary", type: "table", included: true, required: true },
    { sectionId: SECTION_IDS.ROI_PROJECTIONS, title: "ROI Projections", type: "table", included: true, required: false },
    { sectionId: SECTION_IDS.TIMELINE, title: "Project Timeline", type: "table", included: true, required: false },
    { sectionId: SECTION_IDS.TEAM_CREDITS, title: "Design Team", type: "text", included: false, required: false },
    { sectionId: SECTION_IDS.NEXT_STEPS, title: "Next Steps & Contact", type: "text", included: true, required: true },
  ],
  style: {
    colorScheme: "mixed",
    imageEmphasis: "medium",
    textDensity: "detailed",
  },
};

/** Design Showcase — 10-12 slides, render-heavy with minimal text */
const designShowcase: PresentationTemplate = {
  id: "design-showcase",
  name: "Design Showcase",
  description: "Visual-first 10-12 slide deck. Renders take center stage with minimal text.",
  icon: "🎨",
  slideRange: { min: 10, max: 12 },
  slides: [
    { sectionId: SECTION_IDS.COVER, title: "Cover", type: "cover", included: true, required: true },
    { sectionId: SECTION_IDS.EXECUTIVE_SUMMARY, title: "Design Direction", type: "text", included: true, required: false, subtitle: "One sentence" },
    { sectionId: SECTION_IDS.HERO_RENDER, title: "Hero View", type: "image", included: true, required: true, layout: "full" },
    { sectionId: SECTION_IDS.MULTI_VIEW_RENDERS, title: "Exterior Perspectives", type: "grid", included: true, required: true, layout: "grid-2" },
    { sectionId: SECTION_IDS.SPATIAL_DESIGN, title: "Floor Plan", type: "image", included: true, required: false, layout: "full" },
    { sectionId: SECTION_IDS.ZONE_INTERIORS, title: "Interior Views", type: "grid", included: true, required: false, layout: "grid-2" },
    { sectionId: SECTION_IDS.INTERACTIVE_MECHANICS, title: "Hero Installation Detail", type: "image", included: true, required: false },
    { sectionId: SECTION_IDS.MATERIALS_SPEC, title: "Materials & Mood", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.VIDEO_SHOWCASE, title: "Video Walkthrough", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.INVESTMENT_SUMMARY, title: "Investment", type: "table", included: false, required: false },
    { sectionId: SECTION_IDS.NEXT_STEPS, title: "Next Steps", type: "text", included: true, required: true },
  ],
  style: {
    colorScheme: "dark",
    imageEmphasis: "high",
    textDensity: "minimal",
  },
};

/** Budget Review — 8-10 slides, cost-focused with ROI projections */
const budgetReview: PresentationTemplate = {
  id: "budget-review",
  name: "Budget Review",
  description: "Cost-focused 8-10 slide deck with detailed investment breakdown and ROI projections.",
  icon: "💰",
  slideRange: { min: 8, max: 10 },
  slides: [
    { sectionId: SECTION_IDS.COVER, title: "Cover", type: "cover", included: true, required: true },
    { sectionId: SECTION_IDS.EXECUTIVE_SUMMARY, title: "Program Overview", type: "text", included: true, required: true },
    { sectionId: SECTION_IDS.HERO_RENDER, title: "Design Reference", type: "image", included: true, required: false },
    { sectionId: SECTION_IDS.SPATIAL_DESIGN, title: "Space Allocation", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.INVESTMENT_SUMMARY, title: "Investment Breakdown", type: "table", included: true, required: true },
    { sectionId: SECTION_IDS.ROI_PROJECTIONS, title: "ROI Projections", type: "table", included: true, required: true },
    { sectionId: SECTION_IDS.MATERIALS_SPEC, title: "Materials Cost Detail", type: "table", included: true, required: false },
    { sectionId: SECTION_IDS.TIMELINE, title: "Project Timeline & Milestones", type: "table", included: true, required: false },
    { sectionId: SECTION_IDS.NEXT_STEPS, title: "Approval & Next Steps", type: "text", included: true, required: true },
  ],
  style: {
    colorScheme: "light",
    imageEmphasis: "low",
    textDensity: "detailed",
  },
};

/** Design + 3D Showcase — 12-16 slides, Rhino renders featured with before/after comparisons */
const design3DShowcase: PresentationTemplate = {
  id: "design-3d-showcase",
  name: "Design + 3D Showcase",
  description: "Visual-heavy 12-16 slide deck featuring Rhino 3D renders with before/after comparisons.",
  icon: "🏗️",
  slideRange: { min: 12, max: 16 },
  slides: [
    { sectionId: SECTION_IDS.COVER, title: "Cover", type: "cover", included: true, required: true },
    { sectionId: SECTION_IDS.EXECUTIVE_SUMMARY, title: "Design Direction", type: "text", included: true, required: false, subtitle: "Brief overview" },
    { sectionId: SECTION_IDS.BRAND_INTELLIGENCE, title: "Brand Identity", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.HERO_RENDER, title: "Hero View", type: "image", included: true, required: true, layout: "full" },
    { sectionId: SECTION_IDS.RHINO_COMPARISON, title: "3D Design Process", type: "grid", included: true, required: true, layout: "grid-2" },
    { sectionId: SECTION_IDS.SPATIAL_DESIGN, title: "Floor Plan", type: "image", included: true, required: false, layout: "full" },
    { sectionId: SECTION_IDS.MULTI_VIEW_RENDERS, title: "Exterior Perspectives", type: "grid", included: true, required: false, layout: "grid-3" },
    { sectionId: SECTION_IDS.ZONE_INTERIORS, title: "Interior Views", type: "grid", included: true, required: false, layout: "grid-2" },
    { sectionId: SECTION_IDS.INTERACTIVE_MECHANICS, title: "Hero Installation Detail", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.MATERIALS_SPEC, title: "Materials & Finishes", type: "mixed", included: true, required: false },
    { sectionId: SECTION_IDS.INVESTMENT_SUMMARY, title: "Investment", type: "table", included: true, required: false },
    { sectionId: SECTION_IDS.TEAM_CREDITS, title: "Design Team", type: "text", included: true, required: false },
    { sectionId: SECTION_IDS.NEXT_STEPS, title: "Next Steps", type: "text", included: true, required: true },
  ],
  style: {
    colorScheme: "dark",
    imageEmphasis: "high",
    textDensity: "minimal",
  },
};

// ============================================
// EXPORTS
// ============================================

export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  executiveSummary,
  fullProposal,
  designShowcase,
  design3DShowcase,
  budgetReview,
];

/** Get a template by ID, with deep clone so modifications don't affect the original */
export function getTemplate(id: string): PresentationTemplate | null {
  const template = PRESENTATION_TEMPLATES.find((t) => t.id === id);
  if (!template) return null;
  return JSON.parse(JSON.stringify(template));
}

/** Get the default template */
export function getDefaultTemplate(): PresentationTemplate {
  return JSON.parse(JSON.stringify(fullProposal));
}

/** Create a customized template by modifying slide order, inclusion, and titles */
export function customizeTemplate(
  template: PresentationTemplate,
  modifications: {
    slideOrder?: string[]; // Array of sectionIds in desired order
    toggleSlides?: Record<string, boolean>; // sectionId → included
    titleOverrides?: Record<string, string>; // sectionId → new title
  }
): PresentationTemplate {
  const customized = JSON.parse(JSON.stringify(template)) as PresentationTemplate;

  // Apply title overrides
  if (modifications.titleOverrides) {
    for (const slide of customized.slides) {
      const override = modifications.titleOverrides[slide.sectionId];
      if (override !== undefined) {
        slide.title = override;
      }
    }
  }

  // Apply toggle overrides (respecting required slides)
  if (modifications.toggleSlides) {
    for (const slide of customized.slides) {
      const toggle = modifications.toggleSlides[slide.sectionId];
      if (toggle !== undefined && !slide.required) {
        slide.included = toggle;
      }
    }
  }

  // Apply reordering
  if (modifications.slideOrder) {
    const orderMap = new Map(modifications.slideOrder.map((id, idx) => [id, idx]));
    customized.slides.sort((a, b) => {
      const aIdx = orderMap.get(a.sectionId) ?? 999;
      const bIdx = orderMap.get(b.sectionId) ?? 999;
      return aIdx - bIdx;
    });
  }

  return customized;
}

/** Get the active (included) slides from a template */
export function getActiveSlides(template: PresentationTemplate): SlideConfig[] {
  return template.slides.filter((s) => s.included);
}

/** Count the active slides in a template */
export function countActiveSlides(template: PresentationTemplate): number {
  return template.slides.filter((s) => s.included).length;
}
