import type { BrandGuidelines, BrandAsset, VenueIntelligence, ElementType, SuiteContext } from "@/types/brief";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface BrandIntelEntry {
  category: string;
  title: string;
  content: string;
  relevance_weight?: number;
}

interface KBFile {
  file_name: string;
  extracted_text: string | null;
}

interface BuildRAGParams {
  guidelines: BrandGuidelines | null;
  intelligence: BrandIntelEntry[];
  venueData: VenueIntelligence | null;
  assets: BrandAsset[];
  agencyKB: KBFile[];
  projectKB: KBFile[];
  suiteContext: SuiteContext | null;
  elementType?: ElementType;
  tokenBudget?: number;
}

interface RAGResult {
  brandContext: string;
  suiteContextBlock: string;
  tokenEstimate: number;
}

// ─── ELEMENT-TYPE RELEVANCE MAP ──────────────────────────────────────────────

const ELEMENT_CATEGORY_PRIORITY: Record<string, string[]> = {
  bigIdea: ["strategic_voice", "audience_insight"],
  experienceFramework: ["strategic_voice", "audience_insight"],
  interactiveMechanics: ["vendor_material", "past_learning"],
  digitalStorytelling: ["vendor_material", "past_learning"],
  spatialStrategy: ["vendor_material", "past_learning", "cost_benchmark"],
  budgetLogic: ["cost_benchmark", "past_learning"],
  humanConnection: ["audience_insight", "strategic_voice"],
  adjacentActivations: ["audience_insight", "strategic_voice"],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[...truncated]";
}

// ─── BLOCK BUILDERS ──────────────────────────────────────────────────────────

function buildGuidelinesBlock(g: BrandGuidelines): string {
  const sections: string[] = [];

  if (g.colorSystem) {
    const colors: string[] = [];
    if (g.colorSystem.primary?.length) {
      colors.push("Primary: " + g.colorSystem.primary.map(c => `${c.name} (${c.hex})`).join(", "));
    }
    if (g.colorSystem.secondary?.length) {
      colors.push("Secondary: " + g.colorSystem.secondary.map(c => `${c.name} (${c.hex})`).join(", "));
    }
    if (g.colorSystem.accent?.length) {
      colors.push("Accent: " + g.colorSystem.accent.map(c => `${c.name} (${c.hex})`).join(", "));
    }
    if (g.colorSystem.forbidden?.length) {
      colors.push("Forbidden: " + g.colorSystem.forbidden.map(c => `${c.name} (${c.hex})`).join(", "));
    }
    if (colors.length) sections.push("### Colors\n" + colors.join("\n"));
  }

  if (g.typography) {
    const typo = [
      `Primary typeface: ${g.typography.primaryTypeface}`,
      `Secondary typeface: ${g.typography.secondaryTypeface}`,
    ];
    if (g.typography.usageRules) typo.push(`Usage: ${g.typography.usageRules}`);
    sections.push("### Typography\n" + typo.join("\n"));
  }

  if (g.logoRules) {
    const logo: string[] = [];
    if (g.logoRules.clearSpace) logo.push(`Clear space: ${g.logoRules.clearSpace}`);
    if (g.logoRules.minSize) logo.push(`Min size: ${g.logoRules.minSize}`);
    if (g.logoRules.forbiddenTreatments?.length) {
      logo.push(`Forbidden: ${g.logoRules.forbiddenTreatments.join(", ")}`);
    }
    if (g.logoRules.usageNotes) logo.push(g.logoRules.usageNotes);
    if (logo.length) sections.push("### Logo Rules\n" + logo.join("\n"));
  }

  if (g.photographyStyle) {
    const photo: string[] = [`Style: ${g.photographyStyle.style}`];
    if (g.photographyStyle.dos?.length) photo.push(`Do: ${g.photographyStyle.dos.join(", ")}`);
    if (g.photographyStyle.donts?.length) photo.push(`Don't: ${g.photographyStyle.donts.join(", ")}`);
    sections.push("### Photography\n" + photo.join("\n"));
  }

  if (g.toneOfVoice) {
    const tone: string[] = [g.toneOfVoice.description];
    if (g.toneOfVoice.messagingPillars?.length) {
      tone.push(`Pillars: ${g.toneOfVoice.messagingPillars.join(", ")}`);
    }
    if (g.toneOfVoice.taglines?.length) {
      tone.push(`Taglines: ${g.toneOfVoice.taglines.join(" | ")}`);
    }
    sections.push("### Tone of Voice\n" + tone.join("\n"));
  }

  if (g.materialsFinishes) {
    const mats: string[] = [];
    if (g.materialsFinishes.preferred?.length) {
      mats.push(`Preferred: ${g.materialsFinishes.preferred.join(", ")}`);
    }
    if (g.materialsFinishes.forbidden?.length) {
      mats.push(`Forbidden: ${g.materialsFinishes.forbidden.join(", ")}`);
    }
    if (g.materialsFinishes.finishNotes) mats.push(g.materialsFinishes.finishNotes);
    if (mats.length) sections.push("### Materials & Finishes\n" + mats.join("\n"));
  }

  if (sections.length === 0) return "";
  return "## BRAND GUIDELINES\n\n" + sections.join("\n\n");
}

function buildIntelligenceBlock(
  entries: BrandIntelEntry[],
  elementType?: ElementType,
): string {
  if (entries.length === 0) return "";

  // Sort by relevance weight (higher first), then by element-type priority
  const priorityCats = elementType ? ELEMENT_CATEGORY_PRIORITY[elementType] ?? [] : [];

  const scored = entries.map(e => {
    const baseWeight = e.relevance_weight ?? 0.5;
    const priorityBoost = priorityCats.includes(e.category) ? 0.3 : 0;
    return { ...e, score: baseWeight + priorityBoost };
  });
  scored.sort((a, b) => b.score - a.score);

  // Group by category
  const grouped = new Map<string, BrandIntelEntry[]>();
  for (const entry of scored) {
    const existing = grouped.get(entry.category) ?? [];
    existing.push(entry);
    grouped.set(entry.category, existing);
  }

  const sections: string[] = [];
  for (const [category, items] of grouped) {
    const lines = items.map(i => `- **${i.title}**: ${i.content}`);
    sections.push(`### ${category}\n${lines.join("\n")}`);
  }

  return "## BRAND INTELLIGENCE\n\n" + sections.join("\n\n");
}

function buildVenueBlock(v: VenueIntelligence): string {
  const lines: string[] = [
    `Show: ${v.showName}`,
  ];
  if (v.venue) lines.push(`Venue: ${v.venue}`);
  if (v.city) lines.push(`City: ${v.city}`);
  if (v.industry) lines.push(`Industry: ${v.industry}`);
  if (v.designTips?.length) lines.push(`Design tips: ${v.designTips.join("; ")}`);
  if (v.trafficPatterns) lines.push(`Traffic: ${v.trafficPatterns}`);
  if (v.audienceNotes) lines.push(`Audience: ${v.audienceNotes}`);
  if (v.logisticsNotes) lines.push(`Logistics: ${v.logisticsNotes}`);
  if (v.boothPlacementTips) lines.push(`Placement: ${v.boothPlacementTips}`);
  if (v.typicalBoothSizes?.length) lines.push(`Typical sizes: ${v.typicalBoothSizes.join(", ")}`);
  if (v.unionLaborRequired != null) lines.push(`Union labor: ${v.unionLaborRequired ? "required" : "not required"}`);

  return "## VENUE INTELLIGENCE\n\n" + lines.join("\n");
}

function buildKBBlock(files: KBFile[], header: string): string {
  const withText = files.filter(f => f.extracted_text);
  if (withText.length === 0) return "";

  const sections = withText.map(
    f => `### ${f.file_name}\n${f.extracted_text}`
  );

  return `## ${header}\n\n` + sections.join("\n\n");
}

function buildSuiteContextBlock(ctx: SuiteContext): string {
  if (!ctx.parent && ctx.children.length === 0) return "";

  const lines: string[] = [];

  if (ctx.parent) {
    lines.push(
      `This is a${ctx.parent.activationType ? ` ${ctx.parent.activationType}` : ""} child activation of "${ctx.parent.name}".`
    );
    lines.push(`Parent project type: ${ctx.parent.projectType}.`);
  }

  if (ctx.siblings.length > 0) {
    const sibList = ctx.siblings
      .map(s => `${s.name} (${s.activationType ?? s.projectType})`)
      .join(", ");
    lines.push(`Sibling activations: ${sibList}.`);
  }

  if (ctx.children.length > 0 && !ctx.parent) {
    const childList = ctx.children
      .map(c => `${c.name} (${c.activationType ?? c.projectType})`)
      .join(", ");
    lines.push(`Child activations: ${childList}.`);
  }

  return lines.join(" ");
}

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

export function buildBrandRAGContext(params: BuildRAGParams): RAGResult {
  const {
    guidelines,
    intelligence,
    venueData,
    assets: _assets,
    agencyKB,
    projectKB,
    suiteContext,
    elementType,
    tokenBudget = 2500,
  } = params;

  // Build all blocks
  const guidelinesBlock = guidelines ? buildGuidelinesBlock(guidelines) : "";
  const intelligenceBlock = buildIntelligenceBlock(intelligence, elementType);
  const venueBlock = venueData ? buildVenueBlock(venueData) : "";
  const agencyKBBlock = buildKBBlock(agencyKB, "AGENCY KNOWLEDGE");
  const projectKBBlock = buildKBBlock(projectKB, "PROJECT REFERENCE MATERIALS");
  const suiteBlock = suiteContext ? buildSuiteContextBlock(suiteContext) : "";

  // Priority order for truncation (lowest priority first)
  // Guidelines are never truncated
  const truncatable = [
    { key: "projectKB", text: projectKBBlock },
    { key: "agencyKB", text: agencyKBBlock },
    { key: "venue", text: venueBlock },
    { key: "intelligence", text: intelligenceBlock },
  ];

  // Start with guidelines (always included in full)
  let usedTokens = estimateTokens(guidelinesBlock) + estimateTokens(suiteBlock);
  const remainingBudget = tokenBudget - usedTokens;

  // Fit truncatable blocks within remaining budget
  const finalBlocks: string[] = [];
  let truncatableBudget = remainingBudget;

  // Process from highest priority (last in array) to lowest
  const reversed = [...truncatable].reverse();
  const allocated: Map<string, string> = new Map();

  // First pass: calculate total needed
  let totalNeeded = 0;
  for (const block of reversed) {
    totalNeeded += estimateTokens(block.text);
  }

  if (totalNeeded <= truncatableBudget) {
    // Everything fits
    for (const block of reversed) {
      allocated.set(block.key, block.text);
    }
  } else {
    // Need to truncate, starting from lowest priority
    let budgetLeft = truncatableBudget;
    // Process from highest priority first to allocate budget
    for (const block of reversed) {
      const tokens = estimateTokens(block.text);
      if (tokens <= budgetLeft) {
        allocated.set(block.key, block.text);
        budgetLeft -= tokens;
      } else if (budgetLeft > 50) {
        // Give remaining budget to this block, truncated
        allocated.set(block.key, truncateToTokenBudget(block.text, budgetLeft));
        budgetLeft = 0;
      }
      // Otherwise skip this block entirely
    }
  }

  // Assemble in display order
  if (guidelinesBlock) finalBlocks.push(guidelinesBlock);
  if (allocated.get("intelligence")) finalBlocks.push(allocated.get("intelligence")!);
  if (allocated.get("venue")) finalBlocks.push(allocated.get("venue")!);
  if (allocated.get("agencyKB")) finalBlocks.push(allocated.get("agencyKB")!);
  if (allocated.get("projectKB")) finalBlocks.push(allocated.get("projectKB")!);

  const brandContext = finalBlocks.filter(Boolean).join("\n\n");
  const tokenEstimate = estimateTokens(brandContext) + estimateTokens(suiteBlock);

  return {
    brandContext,
    suiteContextBlock: suiteBlock,
    tokenEstimate,
  };
}
