// Prompt style presets — biases the renderer toward different objectives.
//
// Each preset injects a STYLE EMPHASIS block into the prompt body and adjusts
// camera framing, atmosphere, and subject hierarchy to match. The same brief,
// the same booth dimensions, the same zones — different visual direction.
//
// Add new presets here; PromptGenerator's chip row picks them up automatically.

export type PromptStylePresetId =
  | "balanced"
  | "traffic-optimized"
  | "hero-centric"
  | "engagement"
  | "custom";

export interface PromptStylePreset {
  id: PromptStylePresetId;
  label: string;
  shortLabel: string;
  description: string;
  /** Inserted verbatim into the prompt under "STYLE EMPHASIS:" */
  emphasisBlock: string;
  /** Optional camera-framing override appended after the standard camera block. */
  cameraOverride?: string;
  /** Suggested negative-prompt additions, comma-separated. */
  negativeAdditions?: string;
  /** Tags shown on the chip + version label. */
  tags: string[];
}

export const PROMPT_STYLE_PRESETS: PromptStylePreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    shortLabel: "Balanced",
    description:
      "Default treatment — equal weight to hero, traffic flow, and engagement zones. Use when the brief is open or you want a strong all-rounder.",
    emphasisBlock: [
      "Even visual weight across hero installation, brand presence, and engagement zones.",
      "Crowd density: realistic mid-show — visible but not overwhelming.",
      "Lighting: balanced — hero is brighter than surroundings but supporting zones still read clearly.",
      "Composition: 50/50 split between architecture and human moments.",
    ].join(" "),
    tags: ["all-rounder", "default"],
  },
  {
    id: "traffic-optimized",
    label: "Traffic-Optimized",
    shortLabel: "Traffic",
    description:
      "Maximize legibility from far away and across all approach paths. Multiple entry points visible. Strong sightlines for crowd flow.",
    emphasisBlock: [
      "Optimized for booth traffic capture: emphasize legibility from a distance, multiple visible entry points, and clear sightlines through the booth.",
      "Brand identity must be readable from across the show floor — large, high-contrast signage rather than subtle branding.",
      "Foreground attractors near every approach edge; no dead corners.",
      "Crowd density: peak — show people in motion approaching from multiple directions.",
      "Lighting: high overall brightness, no deep shadows that hide attractors. Bright halo effect from above the booth.",
      "Composition: wide angle, prioritize horizontal spread over depth, attractors and demos visible from all sides.",
    ].join(" "),
    cameraOverride:
      "Pull back slightly for a wider field of view that shows multiple approach paths and the full booth perimeter.",
    negativeAdditions: "obscured signage, hidden entries, dim crowd zones, single-approach booth",
    tags: ["high traffic", "shows", "broad audience"],
  },
  {
    id: "hero-centric",
    label: "Hero-Centric",
    shortLabel: "Hero",
    description:
      "Single dominant feature drives the image. Cinematic lighting, dramatic negative space, supporting zones recede. Use when the hero installation is the showstopper.",
    emphasisBlock: [
      "The hero installation is the unmistakable focal point. Center it, light it, and let everything else recede.",
      "Negative space around the hero: deliberate and generous. Supporting zones should be quiet — present but not competing.",
      "Lighting: cinematic — hero is dramatically lit (key light from a flattering angle, soft fill, controlled rim light). Surroundings dim by 30–40%.",
      "Crowd density: low to moderate — a few engaged onlookers near the hero, reverent rather than chaotic.",
      "Composition: rule-of-thirds with hero at the strongest intersection. Camera angle frames hero against a clean background.",
      "Material treatment: prioritize finish quality on the hero (reflectivity, surface detail, edge precision) over breadth.",
    ].join(" "),
    cameraOverride:
      "Tighter framing on the hero installation — fill more of the frame and let supporting zones blur or fall into shadow.",
    negativeAdditions: "cluttered foreground, distracting secondary features, equal-weight zones, busy background",
    tags: ["showstopper", "PR shot", "press-ready"],
  },
  {
    id: "engagement",
    label: "Engagement",
    shortLabel: "Engagement",
    description:
      "People-first. Multiple interactive moments visible at once. Demo stations active, attendees engaged, social proof embedded in the scene.",
    emphasisBlock: [
      "Engagement is the subject. Show people actively participating — touching, watching, demoing, talking.",
      "Multiple interactive moments visible simultaneously: demo stations occupied, brand ambassadors mid-conversation, attendees handling product or wearing branded gear.",
      "Social proof: small clusters around each engagement point, not lone figures.",
      "Lighting: warm, inviting. Avoid clinical white floods. Practical lights at interaction points create natural focal areas.",
      "Crowd density: high engagement, ~70% of zones occupied. Faces visible but not centered (peripheral, naturalistic).",
      "Composition: wider depth of field so multiple interactions read at once. Eye-level camera.",
    ].join(" "),
    cameraOverride:
      "Eye-level perspective at attendee height, slightly forward of center, capturing multiple engagement points in one frame.",
    negativeAdditions: "empty booth, lone figures, posed mannequins, clinical lighting, sterile demo stations",
    tags: ["activations", "demos", "people-first"],
  },
  {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    description:
      "Write your own emphasis block. Useful when the brief calls for something specific — quiet luxury, futuristic, sustainability, after-hours, etc.",
    emphasisBlock: "", // user fills this in
    tags: ["bespoke"],
  },
];

export function getPresetById(id: PromptStylePresetId | undefined | null): PromptStylePreset {
  return (
    PROMPT_STYLE_PRESETS.find((p) => p.id === id) ??
    PROMPT_STYLE_PRESETS[0]! /* balanced is always present */
  );
}

/**
 * Wraps a generated prompt with a style preset. The block goes near the top
 * of the prompt body so the model treats it as primary direction. We also
 * append the preset's negative additions to the existing NEGATIVE PROMPT
 * line if one exists, otherwise leave the prompt alone.
 */
export function applyStylePresetToPrompt(
  basePrompt: string,
  preset: PromptStylePreset,
  customEmphasis?: string,
): string {
  const emphasis = preset.id === "custom" ? (customEmphasis ?? "").trim() : preset.emphasisBlock;
  if (!emphasis) return basePrompt; // empty custom — no-op

  const styleBlock = `STYLE EMPHASIS — ${preset.label.toUpperCase()}:\n${emphasis}`;

  // Try to drop the block right after DESIGN DIRECTION so it sits above the
  // mechanical zone/material/branding sections. Otherwise prepend.
  const designDirectionMarker = "DESIGN DIRECTION:";
  const idx = basePrompt.indexOf(designDirectionMarker);
  let next = basePrompt;
  if (idx >= 0) {
    const blockEnd = basePrompt.indexOf("\n\n", idx);
    if (blockEnd > 0) {
      next = `${basePrompt.slice(0, blockEnd)}\n\n${styleBlock}${basePrompt.slice(blockEnd)}`;
    } else {
      next = `${basePrompt}\n\n${styleBlock}`;
    }
  } else {
    next = `${styleBlock}\n\n${basePrompt}`;
  }

  // Camera override — append after the existing CAMERA FRAMING block if found.
  if (preset.cameraOverride) {
    next = next.replace(
      /(CAMERA FRAMING:[\s\S]*?)(\n\nSTYLE:|\nSTYLE:|$)/,
      (_full, group1, group2) =>
        `${group1}\nPRESET CAMERA OVERRIDE: ${preset.cameraOverride}${group2 ?? ""}`,
    );
  }

  // Negative additions — fold into the existing NEGATIVE PROMPT line.
  if (preset.negativeAdditions) {
    next = next.replace(
      /(NEGATIVE PROMPT:\s*\n?)([^\n]*)/,
      (_full, prefix, rest) => `${prefix}${rest}, ${preset.negativeAdditions}`,
    );
  }

  return next;
}

/** Generate a short, file-safe id segment for a new version. */
export function newVersionId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
