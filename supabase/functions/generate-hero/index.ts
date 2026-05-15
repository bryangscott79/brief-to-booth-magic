// generate-hero — DEPLOY TOKEN: 2026-05-14-composer-driven
//
// Prompt structure: We assemble a compact markdown prompt with sections
// in priority order (SCENE → SCALE → HERO → ZONES → BRAND → MATERIALS
// → LIGHTING → STYLE → RESTRICTIONS). gpt-image-2's quality drops
// sharply past ~1500 tokens — it falls back to "generic booth" as the
// training mean. The old prompt was 3-5k tokens of layered constraint
// blocks (geometry warnings, scale, design, brand intel, brand context,
// suite context, RAG, reference labels, closing reinforcement, negative
// prompt, compliance block) which diluted the signal across pages of
// rules. Direct gpt-image-2 prompts that produce editorial-quality
// renders are typically 500-1000 tokens of focused prose.
//
// Reference images: We send ONLY the brand logo (and any user-attached
// extra references). We deliberately do NOT send the spatial canvas's
// floor plan / isometric PNGs — those captures contain rendered text
// labels (zone names "Z1", "Z2/Z4", "Z5"; dimension callouts; etc.)
// that gpt-image-2 reproduces on the rendered booth walls. Text-only
// scale instructions handle the dimensions without the bleed risk.
// (Lovable's pipeline keys deployment off file content hash — bump this
//  comment to force a redeploy when the function code changes need to
//  propagate. The ai-gateway changes that matter for this version:
//   - callOpenAIImage uses model "gpt-image-2"
//   - callAnthropic falls back across LOVABLE_API_KEY / ANTHROPIC_KEY
//   - response carries modelUsed for client-side observability)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateImageWithFallback } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";
import { buildRagContext } from "../_shared/rag-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BrandIntelEntry {
  category: string;
  title: string;
  content: string;
  tags?: string[] | null;
}

interface GenerateHeroRequest {
  /**
   * NEW (Phase 3 of prompt-engine refactor): pre-composed renderer
   * prompt + artifacts from the client's composePrompt(). When
   * present, the edge function uses the renderer text verbatim and
   * skips its internal structured-prompt builder. The artifacts JSON
   * gets persisted to project_images.prompt_artifacts so auxiliary
   * views can read the heroSnapshot when composing.
   *
   * Legacy fields (prompt, designContext, etc.) remain accepted for
   * backward compatibility with clients that haven't migrated yet.
   */
  composedPrompt?: {
    renderer: string;
    negative: string;
    artifacts: {
      briefJson: unknown;
      geometrySummary: string;
      renderer: string;
      negative: string;
      compliance: unknown[];
    };
  };

  prompt: string;
  feedback?: string;
  previousImageUrl?: string;
  boothSize?: string;
  /**
   * Structured booth dimensions — preferred over `boothSize` (the legacy
   * label string). When present, the scale block is built from these
   * exact values instead of regex-parsing the label. Old clients may
   * still send only `boothSize` and the function falls back gracefully.
   */
  boothDimensions?: {
    width: number;
    depth: number;
    sqft: number;
    system: "imperial" | "metric";
    ceilingHeightFt?: number;
  };
  /**
   * Geometry reference image URLs from the SpatialCanvas. The image
   * model treats these as visual ground truth — the rendered booth
   * MUST match the proportions, footprint aspect ratio, and zone
   * layout shown. Stronger than any text constraint.
   *
   *   floorplan — top-down: booth outline at correct aspect, zones
   *     as labeled rectangles, 1' or 0.5m grid, scale bar.
   *   isometric — 3D wireframe: same booth as extruded volume with
   *     5'8" silhouette for human-scale calibration.
   */
  geometryReferences?: {
    floorplan?: string;
    isometric?: string;
  };
  projectType?: string;
  brandIntelligence?: BrandIntelEntry[];
  brandContext?: string;
  suiteContext?: string;
  agency_id?: string;
  client_id?: string;
  activation_type_id?: string;
  project_id?: string;
  /**
   * Public URL of the brand logo. When provided, it's added to the model's
   * input as a reference image so signage and fascia render with the
   * actual mark instead of a hallucinated approximation.
   */
  brandLogoUrl?: string;
  /**
   * Additional public URLs (typically temporary user uploads attached at
   * regeneration time) to include as reference images alongside the logo.
   */
  extraReferenceUrls?: string[];
  /**
   * Image model. Defaults to "gemini" (gemini-3-pro-image-preview). Set to
   * "openai" to use gpt-image-1, which is better at logo fidelity and
   * organic / non-geometric structures but requires OPENAI_API_KEY.
   */
  imageModel?: "gemini" | "openai";
  /**
   * Rich structured design context — populated by the client's
   * buildDesignContext() helper. Every section of the structured
   * markdown prompt reads off this object. When unset, the structured
   * sections are skipped and the prompt falls back to the client's
   * narrative prose (which lives at the BOTTOM of the prompt where
   * image-model attention is lowest). Populating it pushes brief-driven
   * design data to the TOP of the prompt where it has weight.
   */
  designContext?: {
    brandColors?: string[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
    /**
     * Hero installation with authored structural form. The
     * `physicalForm` field is the designer's intent for the booth's
     * sculptural architecture (e.g. "suspended mobius ribbon", "tower
     * column with branching canopy", "curved laminar fascia") and is
     * the single highest-signal field for non-rectangular designs.
     */
    heroInstallation?: {
      name: string;
      dimensions?: string;
      materials?: string[];
      physicalForm?: string;
    };
    qualityTier?: "standard" | "premium" | "ultra";
    /**
     * Zones surfaced with FUNCTIONAL descriptors ("lounge area",
     * "hero focal area") rather than the AI-authored proper names
     * ("The Sanctuary", "The Retreat"). Poetic zone names caused the
     * image model to render overhead wayfinding signs on the booth
     * fascia — the model treated proper nouns as labels to render.
     * Functional names remove the proper noun while preserving role.
     */
    zoneLayout?: Array<{
      name: string;
      percentage: number;
      position: string;
      structuralForm?: string;
    }>;
    creativeAvoid?: string[];
    creativeEmbrace?: string[];
    /**
     * Brief.creative.visualLanguage — keywords like ["waves", "lines",
     * "curves"]. Read by the STRUCTURAL APPROACH section and told to
     * the model as ARCHITECTURE, not decoration.
     */
    visualLanguage?: string[];
    /** Brief.creative.referenceLabels — themed reference categories. */
    referenceLabels?: string[];
    /**
     * Aggregated structural-form vocabulary from the canvas zones
     * (open / canopy / tower / alcove / enclosed / platform). Biases
     * the model away from flat rectangular defaults.
     */
    zoneStructuralForms?: string[];
  };
}

/** Build brand intelligence block for image generation prompts */
function buildBrandIntelBlock(entries?: BrandIntelEntry[]): string {
  if (!entries || entries.length === 0) return "";
  // Focus on visual_identity and vendor_material for image gen
  const relevant = entries.filter(e =>
    e.category === "visual_identity" || e.category === "vendor_material" || e.category === "strategic_voice"
  );
  if (relevant.length === 0) return "";

  const parts: string[] = [
    "\n── BRAND INTELLIGENCE ──",
    "Apply these approved brand constraints to the visualization:\n",
  ];
  for (const entry of relevant) {
    parts.push(`• ${entry.title}: ${entry.content}`);
  }
  parts.push("── END BRAND INTELLIGENCE ──\n");
  return parts.join("\n");
}

/**
 * Build a structured-dimensions scale block. Prefers `boothDimensions`
 * (structured) when present; falls back to parsing the legacy
 * `boothSize` label for backward compatibility.
 *
 * Why this matters: the previous regex-based parser silently failed on
 * formatted labels like "30' × 30'" or "6m × 6m" — the prime mark + the
 * "m" unit blocked the match, so the scale block was empty for every
 * project. Structured input eliminates the parsing layer entirely.
 */
function buildScaleBlock(req: GenerateHeroRequest): string {
  const dims = req.boothDimensions;
  let w: number, d: number, sqft: number, system: "imperial" | "metric", ceilingFt: number;

  if (dims) {
    w = dims.width;
    d = dims.depth;
    sqft = dims.sqft;
    system = dims.system;
    ceilingFt = dims.ceilingHeightFt ?? (sqft > 1200 ? 18 : sqft > 600 ? 14 : 10);
  } else if (req.boothSize) {
    // Legacy path: parse a label that may include unit markers.
    // Allow "30x30", "30' × 30'", "6m × 6m", "20 ft x 30 ft", etc.
    const m = req.boothSize.match(
      /(\d+(?:\.\d+)?)\s*(?:m|ft|')?\s*[x×X]\s*(\d+(?:\.\d+)?)\s*(?:m|ft|')?/i,
    );
    if (!m) return "";
    w = parseFloat(m[1]);
    d = parseFloat(m[2]);
    system = /m\b/i.test(req.boothSize) && !/ft|'/.test(req.boothSize) ? "metric" : "imperial";
    sqft = system === "metric" ? Math.round(w * d * 10.7639) : Math.round(w * d);
    ceilingFt = sqft > 1200 ? 18 : sqft > 600 ? 14 : 10;
  } else {
    return "";
  }

  const widthLabel = system === "metric" ? `${w}m` : `${w} ft`;
  const depthLabel = system === "metric" ? `${d}m` : `${d} ft`;
  const sqftLabel = `${sqft} sq ft`;
  const peopleAcross = system === "metric" ? Math.round(w / 0.6) : Math.round(w / 2);
  const scale = sqft > 1200 ? "large island" : sqft > 600 ? "mid-size peninsula" : "small inline";

  return `\n\nPHYSICAL SCALE (CRITICAL — exact dimensions, do not exceed):
- Footprint: ${widthLabel} wide × ${depthLabel} deep (${sqftLabel}) — ${scale} booth
- Maximum structure / fascia height: ${ceilingFt} ft
- Human scale: average visitor is 5'8" (1.7m). The booth is ${widthLabel} wide — about ${peopleAcross} adults shoulder-to-shoulder
- Standard 10 ft convention aisles on open sides
- Render the booth at this exact proportion. Do NOT inflate to mega-exhibit scale.`;
}

/**
 * Build a "GEOMETRY REFERENCE" instruction block that tells the model
 * the attached floor plan + iso PNGs are visual ground truth, not
 * suggestions. Only included when at least one reference is present.
 */
function buildGeometryReferenceBlock(req: GenerateHeroRequest): string {
  const refs = req.geometryReferences;
  if (!refs || (!refs.floorplan && !refs.isometric)) return "";

  const has = (kind: "floorplan" | "isometric") => !!refs[kind];
  const parts: string[] = ["\n\n╔══════════════════════════════════════════════════╗"];
  parts.push("║   GEOMETRY REFERENCE — STRICT SCALE CONSTRAINT   ║");
  parts.push("╚══════════════════════════════════════════════════╝");
  parts.push("");
  parts.push("You have been provided geometry reference images that define the");
  parts.push("EXACT space the rendered structure must occupy:");
  parts.push("");
  if (has("floorplan")) {
    parts.push("  • FLOOR PLAN (top-down): booth outline at the correct aspect ratio,");
    parts.push("    zones as labeled rectangles, dimension labels, grid for scale.");
  }
  if (has("isometric")) {
    parts.push("  • ISOMETRIC VOLUME (3D): same booth as an extruded wireframe with");
    parts.push("    each zone at its actual height, plus a 5'8\" silhouette for");
    parts.push("    human-scale calibration.");
  }
  parts.push("");
  parts.push("THE FINAL IMAGE MUST:");
  parts.push("  • Match the booth's footprint aspect ratio shown in the floor plan");
  parts.push("  • Match the volumetric proportions shown in the isometric view");
  parts.push("  • Place each zone at the position and size shown in the floor plan");
  parts.push("  • Respect the maximum structure height shown — do not exceed");
  parts.push("  • Keep the rendered booth at the correct fraction of the frame");
  parts.push("");
  parts.push("These references are GROUND TRUTH. Do not invent different proportions,");
  parts.push("zone positions, or volumetric scale. The text below describes design");
  parts.push("intent (materials, mood, brand). The geometry IS the geometry shown.");
  parts.push("");
  parts.push("⚠️ CRITICAL — TEXT POLICY:");
  parts.push("  The reference images contain LABELS (zone names, dimensions like");
  parts.push("  \"5'×12'\", percentages, structural-form tags, materials lists, ft-tall");
  parts.push("  callouts). These labels exist ONLY so YOU, the image model, can read");
  parts.push("  spatial intent. They are NOT part of the final image.");
  parts.push("");
  parts.push("  Do NOT transcribe, copy, recreate, mimic, or include ANY text from");
  parts.push("  the reference images in the rendered output. The final render must");
  parts.push("  contain ZERO overlaid text — no zone names, no dimension callouts,");
  parts.push("  no percentage labels, no leader lines, no annotations, no captions,");
  parts.push("  no architectural diagram styling. Only brand signage that would");
  parts.push("  naturally appear ON the physical booth (logos on facade, screen");
  parts.push("  content) is allowed.");
  parts.push("");
  parts.push("  The rendered booth must look like a photograph of a real exhibit —");
  parts.push("  not an annotated diagram, not a labeled rendering, not a design");
  parts.push("  presentation. Clean, photoreal, zero overlaid copy.");

  return parts.join("\n");
}

/**
 * Closing reinforcement — image models heavily weight the LAST tokens
 * of a prompt (in addition to the first). Re-stating the geometry
 * constraint right before the "generate" verb keeps it dominant over
 * the stylistic descriptions that fill the middle of the prompt.
 */
function buildGeometryClosingReinforcement(req: GenerateHeroRequest): string {
  const refs = req.geometryReferences;
  const dims = req.boothDimensions;
  if (!refs || (!refs.floorplan && !refs.isometric)) {
    // Even without ref images, restate dimensions if structured.
    if (!dims) return "";
    const w = dims.system === "metric" ? `${dims.width}m` : `${dims.width} ft`;
    const d = dims.system === "metric" ? `${dims.depth}m` : `${dims.depth} ft`;
    return `\n\nFINAL CONSTRAINT: render this structure at exactly ${w} wide × ${d} deep (${dims.sqft} sq ft). Do not exceed these dimensions.`;
  }
  return [
    "",
    "─────────────────────────────────────────────────",
    "FINAL CONSTRAINT (re-emphasized — last instruction):",
    "─────────────────────────────────────────────────",
    "The geometry reference images at the start of this prompt are",
    "NON-NEGOTIABLE. The booth in the rendered image MUST occupy exactly",
    "the volume shown — same footprint proportions, same zone positions,",
    "same maximum height. If anything in the descriptive text above",
    "appears to disagree with the references, the REFERENCES WIN. Render",
    "what the floor plan and isometric show, dressed with the materials,",
    "lighting, and brand identity described in the body of this prompt.",
    "",
    "NO OVERLAID TEXT. The reference images contain zone-name labels,",
    "dimensions, percentages, and material callouts for YOUR consumption",
    "only. The output image must contain ZERO of those labels — no zone",
    "names floating in the air, no dimension callouts, no percentage tags,",
    "no leader lines, no annotation captions, no architectural-rendering",
    "overlay style. Render as a clean photograph of the physical booth.",
    "Brand signage that would naturally appear ON the booth surfaces",
    "(logos on facades, screen content) is fine; everything else is not.",
  ].join("\n");
}

/** Phase 4: Build a design context block from structured brief/element data */
function buildDesignContextBlock(ctx: GenerateHeroRequest["designContext"]): string {
  if (!ctx) return "";
  const parts: string[] = [];

  parts.push("\n\n═══════════════════════════════════════");
  parts.push("DESIGN CONTEXT (from brief and generated elements)");
  parts.push("═══════════════════════════════════════\n");

  // Brand colors
  if (ctx.brandColors?.length) {
    parts.push(`BRAND COLORS (MUST be prominently visible):`);
    ctx.brandColors.forEach((c, i) => parts.push(`  ${i === 0 ? "Primary" : i === 1 ? "Secondary" : `Accent ${i}`}: ${c}`));
    parts.push("");
  }

  // Quality tier → design complexity guidance
  if (ctx.qualityTier) {
    const tierGuide: Record<string, string> = {
      standard: "Clean, professional design. Simple geometric forms. Modest signage. Cost-effective materials (laminate, fabric, vinyl graphics). Functional lighting.",
      premium: "Refined, polished design. Custom millwork and formed surfaces. Backlit graphics, integrated AV. Quality materials (wood veneer, metal trim, acrylic). Designed lighting scheme.",
      ultra: "Dramatic, show-stopping design. Sculptural architecture. Complex rigging, kinetic elements, immersive technology. Premium materials (natural stone, metal mesh, LED-integrated panels, living walls). Theatrical lighting design.",
    };
    parts.push(`QUALITY TIER: ${ctx.qualityTier.toUpperCase()}`);
    parts.push(tierGuide[ctx.qualityTier] || "");
    parts.push("");
  }

  // Hero installation
  if (ctx.heroInstallation) {
    const h = ctx.heroInstallation;
    parts.push(`HERO INSTALLATION (MUST be the focal centerpiece):`);
    parts.push(`  Name: "${h.name}"`);
    if (h.dimensions) parts.push(`  Physical size: ${h.dimensions}`);
    if (h.materials?.length) parts.push(`  Key materials: ${h.materials.join(", ")}`);
    parts.push("  This installation should be the MOST prominent element — visible from the primary aisle.");
    parts.push("");
  }

  // Materials and mood
  if (ctx.materialsAndMood?.length) {
    parts.push("MATERIALS AND MOOD:");
    ctx.materialsAndMood.forEach(m => parts.push(`  - ${m.material}: ${m.feel}`));
    parts.push("");
  }

  // Zone layout
  if (ctx.zoneLayout?.length) {
    parts.push("SPATIAL ZONES (show these areas in the booth):");
    ctx.zoneLayout.forEach(z => parts.push(`  - ${z.name}: ${z.percentage}% of floor (${z.position})`));
    parts.push("");
  }

  // Creative constraints
  if (ctx.creativeEmbrace?.length) {
    parts.push(`CREATIVE DIRECTION — EMBRACE: ${ctx.creativeEmbrace.join(", ")}`);
  }
  if (ctx.creativeAvoid?.length) {
    parts.push(`CREATIVE DIRECTION — AVOID: ${ctx.creativeAvoid.join(", ")}`);
  }

  parts.push("\n═══════════════════════════════════════");
  return parts.join("\n");
}

/**
 * Build the # STRUCTURAL APPROACH section — the brief's visual language
 * translated into directives for the booth's actual architecture. This
 * is the single most important section for non-rectangular designs.
 *
 * Pulls from:
 *   - dctx.visualLanguage — brief keywords (waves, lines, curves, etc.)
 *   - dctx.referenceLabels — themed reference categories
 *   - dctx.heroInstallation.physicalForm — designer's authored shape
 *   - dctx.zoneStructuralForms — canvas-authored per-zone forms
 *   - dctx.creativeEmbrace — brief direction to embrace
 *
 * Returns "" when there's no structural intent to express — in that
 * case the prompt skips the section rather than emit empty
 * scaffolding. The model still gets the rest of the structured
 * sections; it just won't have the brief-driven architectural bias.
 */
function buildStructuralApproachSection(
  dctx: GenerateHeroRequest["designContext"],
): string {
  if (!dctx) return "";

  const visualLanguage = dctx.visualLanguage ?? [];
  const referenceLabels = dctx.referenceLabels ?? [];
  const heroForm = dctx.heroInstallation?.physicalForm ?? "";
  const zoneForms = dctx.zoneStructuralForms ?? [];
  const embrace = dctx.creativeEmbrace ?? [];

  const haveAny =
    visualLanguage.length > 0 ||
    referenceLabels.length > 0 ||
    heroForm.length > 0 ||
    zoneForms.length > 0 ||
    embrace.length > 0;
  if (!haveAny) return "";

  const lines: string[] = ["# STRUCTURAL APPROACH"];
  lines.push(
    `This section defines the BOOTH'S ARCHITECTURE — its actual physical form. The brand's visual language must be expressed AS the booth's structure (canopy shape, fascia geometry, column form, surface curvature), NOT as surface decoration (LED stripes glued onto a rectangular pavilion, vinyl wave graphics on flat walls). The booth IS a sculptural form; brand graphics are secondary to the architecture.`,
  );

  if (visualLanguage.length > 0) {
    lines.push(
      `Brand visual language to express AS architecture: ${visualLanguage.join(", ")}. The booth's primary structural moves should embody these — if the language is "waves and lines," the canopy should undulate or the fascia should sweep in a curve; if it is "round element," the booth should incorporate a major circular form; if it is "geometric precision," the structure should read as crisply faceted volumes.`,
    );
  }

  if (referenceLabels.length > 0) {
    lines.push(`Reference themes to anchor the design: ${referenceLabels.join(" · ")}.`);
  }

  if (heroForm.length > 0) {
    lines.push(
      `Authored hero physical form (from the design brief): ${heroForm}. This is the dominant architectural element; build the rest of the booth in response to it, not separately.`,
    );
  }

  if (zoneForms.length > 0) {
    // Translate each structural form into a brief shape directive.
    const formGuide: Record<string, string> = {
      open: "open footprints with no walls (floor pattern + sculptural props define the space)",
      enclosed: "enclosed chambers (four walls + ceiling, fully contained rooms)",
      canopy: "covered-but-airy canopies (overhead structures with open sides)",
      alcove: "alcove forms (three walls open to the aisle, kiosk-like recesses)",
      platform: "raised platforms (no walls, stage-like)",
      tower: "vertical towers (footprint << height, tall brand markers)",
    };
    const described = zoneForms
      .map((f) => formGuide[f] ?? f)
      .join("; ");
    lines.push(`Per-zone structural vocabulary in this booth: ${described}.`);
  }

  if (embrace.length > 0) {
    lines.push(`Embrace (from brief): ${embrace.join(", ")}.`);
  }

  lines.push(
    `What this section is NOT asking for: a rectangular pavilion with flat horizontal fascia, repeated identical bay modules, or a standard trade-show truss top with the brand wordmark slapped on. If your default reach is "rectangular booth with corner-mounted screens," reach further.`,
  );

  return lines.join("\n");
}

/**
 * Build a compact, markdown-structured prompt for gpt-image-2.
 *
 * Sections appear in priority order. Each is emitted only when there's
 * data — empty sections are skipped so the prompt stays tight.
 *
 *   # SCENE                — what the camera sees, scale + booth type
 *   # STRUCTURAL APPROACH  — designer's brief-driven architecture intent
 *   # SIZE & SCALE         — exact dimensions, human reference
 *   # THE HERO INSTALLATION — focal centerpiece (+ physical form)
 *   # ZONE LAYOUT          — functional descriptors (NOT proper names)
 *   # BRAND IDENTITY       — wordmark, colors, logo treatment
 *   # MATERIALS & MOOD     — surfaces, finishes, atmosphere
 *   # LIGHTING             — fixtures, color temperature, drama
 *   # STYLE                — photography reference, render quality
 *   # RESTRICTIONS         — what NOT to do (kept short)
 *   # ADDITIONAL CONTEXT   — brand RAG / suite RAG / brand intelligence
 *
 * STRUCTURAL APPROACH appears SECOND on purpose — image models attend
 * most strongly to opening tokens, and we want the brief's visual
 * language to be the dominant architectural signal, not generic
 * "trade-show booth" defaults that the model would otherwise produce.
 */
function buildStructuredHeroPrompt(
  req: GenerateHeroRequest,
  opts: { ragBlock: string },
): string {
  const sections: string[] = [];
  const dims = req.boothDimensions;
  const dctx = req.designContext;
  const brand = req.brandContext ?? "";

  // ── # SCENE ──
  const projectTypeLabel = (() => {
    switch (req.projectType) {
      case "live_brand_activation": return "outdoor brand activation";
      case "permanent_installation": return "permanent branded installation";
      case "film_premiere": return "film premiere event build";
      case "game_release_activation": return "game launch activation";
      case "architectural_brief": return "architectural space";
      default: return "trade show booth";
    }
  })();
  const sceneLines: string[] = [];
  sceneLines.push("# SCENE");
  sceneLines.push(
    `A 16:9 photorealistic 3/4 perspective render of a ${projectTypeLabel}, photographed at eye level (1.7m / 5'8") from the front-left at 45°. The structure occupies roughly 70% of the frame width with depth-of-field falling off behind it. Editorial architectural photography quality — confident, premium, photoreal.`,
  );
  sections.push(sceneLines.join("\n"));

  // ── # STRUCTURAL APPROACH ──
  // The brief-driven architectural intent. This is where we tell the
  // model that the brand's visual language is SCULPTURAL — not
  // surface decoration — and ground it in the hero's authored
  // physical form. Without this section the model defaults to a flat
  // rectangular pavilion (its "trade-show booth" training mean) no
  // matter what the rest of the prompt says.
  const structuralApproach = buildStructuralApproachSection(dctx);
  if (structuralApproach) sections.push(structuralApproach);

  // ── # SIZE & SCALE ──
  if (dims) {
    const w = dims.system === "metric" ? `${dims.width}m` : `${dims.width} ft`;
    const d = dims.system === "metric" ? `${dims.depth}m` : `${dims.depth} ft`;
    const area = dims.system === "metric"
      ? `${Math.round((dims.sqft / 10.7639) * 10) / 10} sqm`
      : `${dims.sqft} sq ft`;
    const ceilLabel = dims.ceilingHeightFt ? `${dims.ceilingHeightFt} ft` : "natural";
    const peopleAcross = dims.system === "metric"
      ? Math.round(dims.width / 0.6)
      : Math.round(dims.width / 2);
    const scaleClass = dims.sqft > 1200 ? "large island"
      : dims.sqft > 600 ? "mid-size peninsula"
      : "small inline";
    sections.push(
      [
        "# SIZE & SCALE",
        `- Footprint: ${w} wide × ${d} deep (${area}) — ${scaleClass}`,
        `- Maximum structure height: ${ceilLabel}`,
        `- Across the front face: about ${peopleAcross} adults shoulder-to-shoulder`,
        `- Render at correct fraction of the frame — NOT mega-exhibit scale`,
      ].join("\n"),
    );
  }

  // ── # THE HERO INSTALLATION ──
  // Surface the hero's authored physical form prominently — it's the
  // designer's intent for how the booth itself is shaped, not just
  // what's in the middle. The STRUCTURAL APPROACH section above
  // already pulled this; we restate the specifics here for the
  // model's attention on the focal element.
  const hero = dctx?.heroInstallation;
  if (hero?.name) {
    const heroLines: string[] = ["# THE HERO INSTALLATION"];
    heroLines.push(`"${hero.name}" — the focal centerpiece, most prominent element visible from the primary aisle.`);
    if (hero.physicalForm) {
      heroLines.push(`- Structural form: ${hero.physicalForm}`);
    }
    if (hero.dimensions) heroLines.push(`- Dimensions: ${hero.dimensions}`);
    if (hero.materials?.length) heroLines.push(`- Materials: ${hero.materials.join(", ")}`);
    sections.push(heroLines.join("\n"));
  }

  // ── # ZONE LAYOUT ──
  // Zones surface here with FUNCTIONAL descriptors only ("lounge
  // area", "hero focal area") — never proper names like "The
  // Sanctuary". Poetic names made the image model render overhead
  // wayfinding signs on the booth fascia, treating zone names as
  // labels to display. The client's buildDesignContext() does the
  // name → function mapping before sending; this section just
  // surfaces the result.
  if (dctx?.zoneLayout?.length) {
    const lines = ["# ZONE LAYOUT (functional placement, NOT signage)"];
    lines.push("These describe what each part of the booth is FOR — do NOT render zone names as overhead signs or labels.");
    for (const z of dctx.zoneLayout) {
      const formNote = z.structuralForm ? `, ${z.structuralForm}` : "";
      lines.push(`- ${z.name} (${z.percentage}%, ${z.position}${formNote})`);
    }
    sections.push(lines.join("\n"));
  }

  // ── # BRAND IDENTITY ──
  const brandLines: string[] = ["# BRAND IDENTITY"];
  if (dctx?.brandColors?.length) {
    brandLines.push(
      `Brand colors — apply these as the dominant palette on signage, accent lighting, surface graphics, and LED inlays:`,
    );
    dctx.brandColors.forEach((c, i) => {
      const role = i === 0 ? "Primary" : i === 1 ? "Secondary" : `Accent ${i}`;
      brandLines.push(`- ${role}: ${c}`);
    });
  }
  brandLines.push(
    `The brand wordmark and logo (provided as a reference image) are the ONLY text or marks that should appear on the booth surfaces. Render them where signage would naturally live — fascia, header band, counter face, primary wall. Do NOT add zone names, room labels, or wayfinding text anywhere on the booth.`,
  );
  sections.push(brandLines.join("\n"));

  // ── # MATERIALS & MOOD ──
  if (dctx?.materialsAndMood?.length) {
    const lines = ["# MATERIALS & MOOD"];
    for (const m of dctx.materialsAndMood) {
      lines.push(`- ${m.material} — ${m.feel}`);
    }
    sections.push(lines.join("\n"));
  }

  // ── # LIGHTING ──
  // Derived from quality tier + creative direction. Brief and clear.
  const tier = dctx?.qualityTier;
  if (tier) {
    const lightingByTier: Record<string, string> = {
      standard: "Clean, even functional lighting. Accent spots on hero. Warm color temperature.",
      premium: "Designed lighting scheme. Theatrical accent spots on hero installation. Warm LED line lighting tracing structural edges. Designed contrast — bright focal points against deeper ambient.",
      ultra: "Cinematic theatrical lighting. Hero installation glows from within. Dramatic high-contrast — deep shadow zones, bright accent moments. RGB or programmable accents if the brand calls for it. Editorial-photography mood.",
    };
    sections.push(`# LIGHTING\n${lightingByTier[tier] ?? lightingByTier.premium}`);
  }

  // ── # STYLE ──
  const styleLines: string[] = ["# STYLE"];
  styleLines.push(
    `Architectural visualization in the lineage of Snøhetta / Foster + Partners exhibit photography. Editorial, cinematic, premium. Photoreal materials with believable surface microdetail. Realistic visitors (3-6 people) at natural human scale, naturally engaged with the space — NOT posed mannequins.`,
  );
  if (dctx?.creativeEmbrace?.length) {
    styleLines.push(`Embrace: ${dctx.creativeEmbrace.join(", ")}.`);
  }
  sections.push(styleLines.join("\n"));

  // ── # RESTRICTIONS ──
  const restrictions: string[] = ["# RESTRICTIONS"];
  restrictions.push(
    `Booth surfaces should carry ONLY the brand wordmark and logo. Do NOT render: zone names ("The Study", "Lounge", "Hero", etc.), room labels, wayfinding signs, "Z1/Z2/Z3" or similar tags, dimension callouts, percentage labels, leader lines, architectural-diagram styling, or any text the user might have authored to describe the layout. If you find yourself rendering text on the fascia header band that isn't the brand wordmark, replace it with empty space or brand graphics.`,
  );
  restrictions.push(
    `Architectural defaults to AVOID: flat horizontal rectangular fascia/canopy, repeated identical bay modules, generic trade-show truss ceiling, symmetric grid of identical zones, plain rectangular pavilion shape. The booth's form should reflect its brand — uniformity reads as default and uninspired.`,
  );
  restrictions.push(
    `No cartoon, no over-saturation, no fisheye distortion, no obvious AI artifacts, no random floating geometry, no duplicated wordmarks on top of each other.`,
  );
  if (dctx?.creativeAvoid?.length) {
    restrictions.push(`Brief-specified avoid: ${dctx.creativeAvoid.join(", ")}.`);
  }
  sections.push(restrictions.join("\n"));

  // ── # ADDITIONAL CONTEXT ──
  // Brand RAG / brand intelligence / suite context. Placed at the end
  // because gpt-image-2 weights opening tokens most strongly — we want
  // the SCENE + SCALE blocks to dominate, with the brand details as
  // refining context rather than the leading instruction.
  const contextParts: string[] = [];
  const brandIntel = req.brandIntelligence ?? [];
  if (brandIntel.length > 0) {
    const visual = brandIntel.filter(
      (e) => e.category === "visual_identity" || e.category === "vendor_material" || e.category === "strategic_voice",
    );
    if (visual.length > 0) {
      contextParts.push(
        `Brand intelligence (approved constraints):\n${visual.map((e) => `- ${e.title}: ${e.content}`).join("\n")}`,
      );
    }
  }
  if (brand) contextParts.push(`Brand context: ${brand.slice(0, 600)}`);
  if (req.suiteContext) contextParts.push(`Project type context: ${req.suiteContext.slice(0, 400)}`);
  if (opts.ragBlock) contextParts.push(opts.ragBlock.slice(0, 600));
  if (contextParts.length > 0) {
    sections.push(`# ADDITIONAL CONTEXT\n${contextParts.join("\n\n")}`);
  }

  return sections.join("\n\n");
}

/**
 * Wrap an async producer in a streamed Response that emits a single
 * whitespace byte every `keepAliveMs` to defeat the platform's 150s
 * idle-timeout. The final payload (JSON) is written at the end.
 *
 * JSON.parse tolerates leading whitespace, so callers using
 * `supabase.functions.invoke` (which JSON-parses the body) keep
 * working without any client change. gpt-image-2 routinely takes
 * 150-180s for high-quality 1536x1024 renders — without keep-alive
 * the connection dies before the image lands.
 */
function streamingJsonResponse(
  produce: () => Promise<{ status: number; body: unknown }>,
  keepAliveMs = 20_000,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let done = false;
      const ping = setInterval(() => {
        if (done) return;
        try { controller.enqueue(encoder.encode(" ")); } catch { /* closed */ }
      }, keepAliveMs);
      try {
        const { body } = await produce();
        done = true;
        clearInterval(ping);
        controller.enqueue(encoder.encode(JSON.stringify(body)));
        controller.close();
      } catch (e) {
        done = true;
        clearInterval(ping);
        const msg = e instanceof Error ? e.message : "Failed to generate image";
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg })));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body before opening the stream so a malformed payload still
  // returns a clean 400 instead of a 200-with-error-body.
  let body: GenerateHeroRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!body?.prompt || typeof body.prompt !== "string" || body.prompt.trim().length < 10) {
    return new Response(JSON.stringify({ error: "prompt is required and must be at least 10 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return streamingJsonResponse(async () => {
    try {
      const { prompt, feedback, previousImageUrl, boothSize, boothDimensions, geometryReferences, projectType, designContext, brandIntelligence, brandContext = "", suiteContext = "", agency_id, client_id, activation_type_id, project_id, brandLogoUrl, extraReferenceUrls, imageModel = "gemini" } = body;
});
