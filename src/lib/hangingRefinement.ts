// hangingRefinement — helpers for the hanging-element creative-control
// flow on the Prompts step.
//
// The owner-described flow: review the hanging element on the HERO
// first, refine it in isolation (edit-style call that keeps the booth /
// environment / camera locked and changes ONLY the suspended element),
// and only then fan out to the other views. These helpers are pure so
// they can be unit-tested without React or Supabase.

import type { NormalizedHangingElement } from "@/lib/normalizedBrief";

/**
 * Approval-state key for the hanging check gate. Approval is scoped to
 * "this hero image within this booth-size config" — a refined or
 * regenerated hero produces a new image URL, so approval automatically
 * resets to unapproved for the new hero, and switching size chips never
 * bleeds approval across configs.
 */
export function hangingApprovalKey(
  configKey: string | null | undefined,
  heroImageUrl: string | null | undefined,
): string {
  return `${configKey || "__default__"}::${heroImageUrl || "__no-hero__"}`;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Human-readable spec lines for one hanging element — shown in the
 * check panel next to the hero render AND embedded in the refine edit
 * instruction so the model sees the canonical spec, not just the
 * user's delta.
 */
export function formatHangingSpecLines(
  el: NormalizedHangingElement,
  units: "imperial" | "metric" = "imperial",
): string[] {
  const u = units === "metric" ? "m" : "ft";
  const lines: string[] = [];
  if (el.physicalForm?.trim()) lines.push(`Form: ${el.physicalForm.trim()}`);
  lines.push(
    `Geometry: ${formatNum(el.dimensions.width)} × ${formatNum(el.dimensions.depth)} ${u} × ${formatNum(el.dimensions.thicknessFt)} ft thick, ${el.shape} outline, suspended ${formatNum(el.suspensionDropFt)} ft below the venue ceiling`,
  );
  if (el.materials.length > 0) lines.push(`Materials: ${el.materials.join(", ")}`);
  if (el.surfaces.length > 0) lines.push(`Surfaces: ${el.surfaces.join("; ")}`);
  if (el.lighting.length > 0) lines.push(`Lighting: ${el.lighting.join(", ")}`);
  if (el.printed.length > 0) lines.push(`Printed: ${el.printed.join("; ")}`);
  if (el.creativeDirection?.trim()) {
    lines.push(`Creative direction (EXACT): ${el.creativeDirection.trim()}`);
  }
  return lines;
}

/**
 * Build the edit-style instruction sent to generate-hero's EDIT MODE
 * (previousImageUrl + feedback, no composedPrompt). The instruction
 * constrains the change: booth, environment, lighting, and camera stay
 * IDENTICAL; only the suspended hanging element changes, per the user's
 * feedback interpreted against the canonical spec.
 *
 * generate-hero wraps this in its own "IMAGE EDIT TASK — NOT A
 * REGENERATION" template, so this text is the EDIT INSTRUCTION body.
 */
export function buildHangingEditInstruction(
  elements: NormalizedHangingElement[],
  feedback: string,
  units: "imperial" | "metric" = "imperial",
): string {
  const specBlocks = elements.map((el) => {
    const lines = formatHangingSpecLines(el, units).map((l) => `  ${l}`);
    return [`- ${el.name}`, ...lines].join("\n");
  });

  return [
    "Modify ONLY the suspended hanging element(s) above the booth. Keep the booth structure, floor, furnishings, people, environment, lighting, and camera angle IDENTICAL to the reference image — do not redesign, move, or restyle anything except the hanging element(s).",
    "",
    "CANONICAL HANGING ELEMENT SPEC (the element must still satisfy this after the change):",
    specBlocks.join("\n"),
    "",
    "REFINEMENT REQUEST (apply to the hanging element only):",
    feedback.trim(),
    "",
    "The hanging element(s) remain truly SUSPENDED from the venue rigging — clearly above and visually detached from the booth structure, with open air between them. Where the spec includes Creative direction, treat it as the author's EXACT specification, not inspiration.",
  ].join("\n");
}
