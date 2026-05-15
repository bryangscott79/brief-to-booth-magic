// Field enums shared by builtinIndustries.ts + BriefReview render logic.
// Living here (not inline in builtinIndustries) so the Brief Review page
// can import the BriefSectionId type without pulling in the full
// industries constant.

export const BRIEF_SECTION_IDS = [
  "brand",
  "audience",
  "objectives",
  "spatial-zones",
  "existing-space",
  "creative",
  "hero-installation",
  "signage",
  "hanging-elements",
  "finish-schedule",
  "furniture-inventory",
  "lighting-plan",
  "palette",
  "budget",
] as const;
export type BriefSectionId = typeof BRIEF_SECTION_IDS[number];

export const RENDER_ANGLE_IDS = [
  "hero_34",
  "front",
  "back",
  "left",
  "right",
  "top",
  "iso",
  "wide_shot",
  "focal_detail",
  "alternate_light",
  "before_after",
] as const;
export type RenderAngleId = typeof RENDER_ANGLE_IDS[number];

export const INPUT_MODES = [
  "spatial-canvas",
  "existing-space-photo",
  "hybrid",
] as const;
export type IndustryInputMode = typeof INPUT_MODES[number];
