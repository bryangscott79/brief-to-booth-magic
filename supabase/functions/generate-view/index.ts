// generate-view — DEPLOY TOKEN: 2026-05-14-edit-mode-views
//
// Same restructure as generate-hero (see that file for the full
// rationale). Two relevant changes for view rendering:
//
//   1. The prompt is now a compact markdown structure (SCENE → CAMERA
//      → SIZE → CONSISTENCY → ZONE FOCUS (interiors) → RESTRICTIONS),
//      not a wall of layered constraint blocks. gpt-image-2 produces
//      dramatically better results with short structured prompts.
//
//   2. Floor plan / isometric PNGs are NOT sent to gpt-image-2 — they
//      contain rendered text labels (Z1/Z2/Z3 zone tags from the
//      SpatialCanvasIso 3D scene) that get baked into the booth walls.
//      The hero/exterior reference image stays as the visual anchor
//      for materials + camera continuity.
// Bump this comment to force Lovable to redeploy. Changes that need this
// version of the function to be live: gpt-image-2 model id, modelUsed in
// response, multi-secret fallback in shared ai-gateway.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient as createServiceClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callOpenAIImage } from "../_shared/ai-gateway.ts";
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

interface GenerateViewRequest {
  /**
   * NEW (Phase 3 of prompt-engine refactor): pre-composed renderer
   * prompt produced by the client's composeViewPrompt(heroSnapshot,
   * angle). When present, the edge function uses it verbatim and
   * skips its internal builder. Legacy fields remain for backward
   * compat.
   */
  composedPrompt?: {
    renderer: string;
    negative: string;
  };

  referenceImageUrl: string;
  viewPrompt: string;
  viewName: string;
  aspectRatio: string;
  /**
   * The full prompt text that produced the hero image. Threaded through
   * to every view so the model has BOTH the hero pixels (visual anchor)
   * AND the design intent that drove them (text anchor). Without this
   * the model can only extrapolate from the hero image and tends to
   * drift on materials, scale, and zone identity in side/back/interior
   * renders. Trimmed to a sensible length before injecting so it
   * doesn't blow the token budget.
   */
  heroPromptText?: string;
  boothSize?: string;
  /** Structured booth dimensions — preferred over the legacy label string. */
  boothDimensions?: {
    width: number;
    depth: number;
    sqft: number;
    system: "imperial" | "metric";
    ceilingHeightFt?: number;
  };
  /** Geometry reference URLs from the SpatialCanvas (floor plan + iso). */
  geometryReferences?: {
    floorplan?: string;
    isometric?: string;
  };
  brandIntelligence?: BrandIntelEntry[];
  brandContext?: string;
  suiteContext?: string;
  agency_id?: string;
  client_id?: string;
  activation_type_id?: string;
  project_id?: string;
  /** Brand logo URL — sent as an additional reference image. */
  brandLogoUrl?: string;
  /** Optional one-off references attached at regen time. */
  extraReferenceUrls?: string[];
  /** "gemini" (default) or "openai" gpt-image-2. */
  imageModel?: "gemini" | "openai";
  /** Phase 4: Structured consistency data to enforce cross-view coherence */
  consistencyTokens?: {
    brandColors?: string[];
    materialKeywords?: string[];
    lightingKeywords?: string[];
    styleKeywords?: string[];
    qualityTier?: "standard" | "premium" | "ultra";
    heroInstallationName?: string;
    visibleZones?: string[];
    avoidKeywords?: string[];
  };
  /**
   * Rich structured design context — same shape as generate-hero. When
   * present, the view prompt gains a STRUCTURAL APPROACH section that
   * mirrors the hero's brief-driven architectural intent. Without
   * this, view renders had no architectural signal beyond the hero
   * reference image and tended to drift back to "trade-show typical"
   * geometry on side/back/detail angles.
   */
  designContext?: {
    brandColors?: string[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
    heroInstallation?: {
      name: string;
      dimensions?: string;
      materials?: string[];
      physicalForm?: string;
    };
    qualityTier?: "standard" | "premium" | "ultra";
    zoneLayout?: Array<{
      name: string;
      percentage: number;
      position: string;
      structuralForm?: string;
    }>;
    creativeAvoid?: string[];
    creativeEmbrace?: string[];
    visualLanguage?: string[];
    referenceLabels?: string[];
    zoneStructuralForms?: string[];
  };
}

/** Phase 4: Build consistency enforcement block from structured tokens */
function buildConsistencyBlock(tokens?: GenerateViewRequest["consistencyTokens"]): string {
  if (!tokens) return "";
  const parts: string[] = [];

  parts.push("\n═══════════════════════════════════════");
  parts.push("CONSISTENCY ENFORCEMENT TOKENS");
  parts.push("═══════════════════════════════════════\n");
  parts.push("These tokens MUST be applied to ensure visual coherence across all views.\n");

  if (tokens.brandColors?.length) {
    parts.push(`BRAND COLORS (match EXACTLY from reference image):`);
    tokens.brandColors.forEach((c, i) => parts.push(`  ${i === 0 ? "Primary" : i === 1 ? "Secondary" : `Accent ${i}`}: ${c}`));
    parts.push("");
  }

  if (tokens.materialKeywords?.length) {
    parts.push(`MATERIALS (same as reference): ${tokens.materialKeywords.join(", ")}`);
  }

  if (tokens.lightingKeywords?.length) {
    parts.push(`LIGHTING: ${tokens.lightingKeywords.join(", ")}`);
  }

  if (tokens.styleKeywords?.length) {
    parts.push(`STYLE: ${tokens.styleKeywords.join(", ")}`);
  }

  if (tokens.qualityTier) {
    const complexity: Record<string, string> = {
      standard: "Clean and functional — simple forms, standard materials",
      premium: "Refined and polished — custom millwork, integrated AV, quality finishes",
      ultra: "Dramatic and immersive — sculptural architecture, premium materials, theatrical lighting",
    };
    parts.push(`DESIGN COMPLEXITY (${tokens.qualityTier}): ${complexity[tokens.qualityTier] || ""}`);
  }

  if (tokens.heroInstallationName) {
    parts.push(`HERO INSTALLATION: "${tokens.heroInstallationName}" — maintain as focal point if visible from this angle`);
  }

  if (tokens.visibleZones?.length) {
    parts.push(`ZONES VISIBLE FROM THIS ANGLE: ${tokens.visibleZones.join(", ")}`);
  }

  if (tokens.avoidKeywords?.length) {
    parts.push(`\nAVOID: ${tokens.avoidKeywords.join(", ")}`);
  }

  parts.push("\n═══════════════════════════════════════\n");
  return parts.join("\n");
}

/** Build brand intelligence block for view generation */
function buildBrandIntelBlock(entries?: BrandIntelEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const relevant = entries.filter(e =>
    e.category === "visual_identity" || e.category === "vendor_material"
  );
  if (relevant.length === 0) return "";
  const parts: string[] = [
    "\n── BRAND INTELLIGENCE ──",
    "Apply these approved brand constraints for visual consistency:\n",
  ];
  for (const entry of relevant) {
    parts.push(`• ${entry.title}: ${entry.content}`);
  }
  parts.push("── END BRAND INTELLIGENCE ──\n");
  return parts.join("\n");
}

/**
 * Structured-dimensions scale block (same shape as generate-hero).
 * Prefers `boothDimensions`; falls back to a unit-aware regex on the
 * legacy `boothSize` label so the previous silent-fail bug is fixed.
 */
function buildScaleBlock(req: GenerateViewRequest): string {
  const dims = req.boothDimensions;
  let w: number, d: number, sqft: number, system: "imperial" | "metric", ceilingFt: number;

  if (dims) {
    w = dims.width;
    d = dims.depth;
    sqft = dims.sqft;
    system = dims.system;
    ceilingFt = dims.ceilingHeightFt ?? (sqft > 1200 ? 18 : sqft > 600 ? 14 : 10);
  } else if (req.boothSize) {
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
  const peopleAcross = system === "metric" ? Math.round(w / 0.6) : Math.round(w / 2);

  return `\nPHYSICAL SCALE (CRITICAL — exact dimensions):
- Footprint: ${widthLabel} wide × ${depthLabel} deep (${sqft} sq ft)
- Maximum structure / fascia height: ${ceilingFt} ft
- Human scale: 5'8" visitor — about ${peopleAcross} adults shoulder-to-shoulder across the width
- Match these proportions exactly. Do NOT inflate to mega-exhibit scale.\n`;
}

/**
 * Geometry reference instruction block (same wording as generate-hero
 * for consistency across angles). Only emitted when at least one ref
 * is present.
 */
function buildGeometryReferenceBlock(req: GenerateViewRequest): string {
  const refs = req.geometryReferences;
  if (!refs || (!refs.floorplan && !refs.isometric)) return "";
  const has = (k: "floorplan" | "isometric") => !!refs[k];
  const parts: string[] = ["\n╔══════════════════════════════════════════════════╗"];
  parts.push("║   GEOMETRY REFERENCE — STRICT SCALE CONSTRAINT   ║");
  parts.push("╚══════════════════════════════════════════════════╝");
  parts.push("");
  if (has("floorplan")) parts.push("  • FLOOR PLAN: exact booth footprint + zone layout (top-down).");
  if (has("isometric")) parts.push("  • ISOMETRIC: exact 3D volume the structure must occupy.");
  parts.push("");
  parts.push("THIS VIEW must match the same booth shown in the floor plan and");
  parts.push("isometric references — same proportions, same zone positions, same");
  parts.push("maximum height. The hero reference image shows finishes/style; the");
  parts.push("geometry references show physical size and layout. Both apply.");
  parts.push("");
  parts.push("⚠️ NO OVERLAID TEXT. The geometry references contain zone names,");
  parts.push("dimensions, percentages, structural-form tags, material lists, and");
  parts.push("ft-tall callouts for YOUR consumption only. Do NOT transcribe,");
  parts.push("recreate, or include any of those labels in the rendered output.");
  parts.push("The output must look like a photograph — zero overlay annotations,");
  parts.push("no leader lines, no captions, no architectural-diagram styling.\n");
  return parts.join("\n");
}

/**
 * Closing reinforcement so the geometry constraint isn't drowned out by
 * the descriptive middle of the prompt. Image models attend strongly to
 * the LAST tokens; restating the constraint here keeps it dominant.
 */
function buildGeometryClosingReinforcement(req: GenerateViewRequest): string {
  const refs = req.geometryReferences;
  const dims = req.boothDimensions;
  if (!refs || (!refs.floorplan && !refs.isometric)) {
    if (!dims) return "";
    const w = dims.system === "metric" ? `${dims.width}m` : `${dims.width} ft`;
    const d = dims.system === "metric" ? `${dims.depth}m` : `${dims.depth} ft`;
    return `\nFINAL CONSTRAINT: this view shows a structure that is exactly ${w} wide × ${d} deep (${dims.sqft} sq ft). Match the proportions exactly.`;
  }
  return [
    "",
    "─────────────────────────────────────────────────",
    "FINAL CONSTRAINT (re-emphasized):",
    "─────────────────────────────────────────────────",
    "The geometry reference images at the start of this prompt are",
    "NON-NEGOTIABLE. The booth in this view MUST occupy exactly the",
    "volume shown — same proportions, same zone positions, same maximum",
    "height. If the descriptive text appears to disagree with the",
    "references, the REFERENCES WIN. Render what the floor plan and",
    "isometric show, dressed with the materials, lighting, and brand",
    "identity described above.",
    "",
    "NO OVERLAID TEXT. Reference-image labels (zone names, dimensions,",
    "percentages, callouts) are diagnostic — never reproduce them in the",
    "output. Clean photographic render only.",
  ].join("\n");
}

/**
 * Build the # STRUCTURAL APPROACH section — the brief's visual language
 * translated into directives for the booth's actual architecture. Same
 * shape and logic as the hero version (duplicated because edge
 * functions are isolated Deno files and don't easily share helpers).
 *
 * If we change the structural approach copy, update BOTH this and the
 * matching helper in generate-hero/index.ts.
 */
function buildStructuralApproachSection(
  dctx: GenerateViewRequest["designContext"],
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
    `This section defines the BOOTH'S ARCHITECTURE — its actual physical form. The brand's visual language must be expressed AS the booth's structure (canopy shape, fascia geometry, column form, surface curvature), NOT as surface decoration. The booth IS a sculptural form; brand graphics are secondary to the architecture.`,
  );
  if (visualLanguage.length > 0) {
    lines.push(
      `Brand visual language to express AS architecture: ${visualLanguage.join(", ")}.`,
    );
  }
  if (referenceLabels.length > 0) {
    lines.push(`Reference themes to anchor the design: ${referenceLabels.join(" · ")}.`);
  }
  if (heroForm.length > 0) {
    lines.push(
      `Authored hero physical form: ${heroForm}. This is the dominant architectural element.`,
    );
  }
  if (zoneForms.length > 0) {
    const formGuide: Record<string, string> = {
      open: "open footprints with no walls",
      enclosed: "enclosed chambers",
      canopy: "covered-but-airy canopies",
      alcove: "alcove forms with three walls open to the aisle",
      platform: "raised platforms with no walls",
      tower: "vertical towers",
    };
    const described = zoneForms.map((f) => formGuide[f] ?? f).join("; ");
    lines.push(`Per-zone structural vocabulary: ${described}.`);
  }
  if (embrace.length > 0) {
    lines.push(`Embrace (from brief): ${embrace.join(", ")}.`);
  }
  lines.push(
    `What this section is NOT asking for: a rectangular pavilion with flat horizontal fascia, repeated identical bay modules, or a standard trade-show truss top.`,
  );
  return lines.join("\n");
}

/**
 * Build a compact, markdown-structured prompt for gpt-image-2 view
 * generation. Mirrors the hero version's structure but with view-
 * specific sections (camera position, hero consistency, zone focus).
 *
 * Interior:
 *   # SCENE — standing inside zone, room scale
 *   # CAMERA POSITION — explicit framing
 *   # ZONE FOCUS — name, structural form, materials (from viewPrompt)
 *   # CONSISTENCY WITH HERO — palette/material lock to reference image
 *   # RESTRICTIONS — no overlaid text
 *   # ADDITIONAL CONTEXT — hero intent, brand, RAG
 *
 * Exterior:
 *   # SCENE — same booth from a different angle
 *   # CAMERA POSITION — explicit framing
 *   # SIZE & SCALE — exact dimensions
 *   # CONSISTENCY WITH HERO — design/material/brand lock
 *   # RESTRICTIONS — no overlaid text
 *   # ADDITIONAL CONTEXT — hero intent, brand, RAG
 */
function buildStructuredViewPrompt(opts: {
  req: GenerateViewRequest;
  isInterior: boolean;
  zoneName: string;
  cameraDir: string;
  heroPromptText?: string;
  ragBlock: string;
  consistencyTokens?: GenerateViewRequest["consistencyTokens"];
}): string {
  const { req, isInterior, zoneName, cameraDir, heroPromptText, ragBlock, consistencyTokens } = opts;
  const sections: string[] = [];
  const dims = req.boothDimensions;
  const dctx = req.designContext;

  // ── # SCENE ──
  const sceneLines: string[] = ["# SCENE"];
  if (isInterior) {
    sceneLines.push(
      `A ${req.aspectRatio} photorealistic interior render. Camera stands INSIDE the booth zone shown in the reference image, surrounded by that zone's walls, ceiling, and furnishings. The booth's exterior, the convention hall, and the aisles are behind the camera or barely visible at the edges. The viewer feels enclosed within this specific room — not looking at the booth from outside. Render at human scale (one room within the booth), NOT mega-exhibit scale.`,
    );
  } else {
    sceneLines.push(
      `A ${req.aspectRatio} photorealistic render of the SAME booth shown in the reference image, captured from a different camera angle. The booth's overall design, structure, materials, and brand identity must be identical to the reference — only the camera moves.`,
    );
  }
  sections.push(sceneLines.join("\n"));

  // ── # STRUCTURAL APPROACH ──
  // The same brief-driven architectural intent that fueled the hero
  // prompt. Important for views too: without it, side / back / detail
  // angles can quietly revert to "trade-show typical" geometry even
  // though the hero render set a non-rectangular direction. Carried
  // verbatim from designContext.
  const structuralApproach = buildStructuralApproachSection(dctx);
  if (structuralApproach) sections.push(structuralApproach);

  // ── # CAMERA POSITION ──
  sections.push(`# CAMERA POSITION\n${cameraDir}`);

  // ── # SIZE & SCALE (exteriors only) ──
  if (!isInterior && dims) {
    const w = dims.system === "metric" ? `${dims.width}m` : `${dims.width} ft`;
    const d = dims.system === "metric" ? `${dims.depth}m` : `${dims.depth} ft`;
    const ceilLabel = dims.ceilingHeightFt ? `${dims.ceilingHeightFt} ft` : "natural";
    const peopleAcross = dims.system === "metric"
      ? Math.round(dims.width / 0.6)
      : Math.round(dims.width / 2);
    sections.push(
      [
        "# SIZE & SCALE",
        `- Footprint: ${w} wide × ${d} deep`,
        `- Maximum structure height: ${ceilLabel}`,
        `- Approximately ${peopleAcross} adults shoulder-to-shoulder across the front face`,
        `- Render at the correct fraction of the frame — NOT mega-exhibit scale`,
      ].join("\n"),
    );
  }

  // ── # SIZE & SCALE (interiors get a zone-scoped variant) ──
  if (isInterior && dims) {
    const maxCeilLabel = dims.ceilingHeightFt ? `${dims.ceilingHeightFt} ft` : "the booth's max fascia height";
    sections.push(
      [
        "# SIZE & SCALE (zone-scoped)",
        `- The "${zoneName}" zone is one room within the booth — render at human room scale.`,
        `- Typical interior framing: 3-5m of width in frame, ceiling between 2.4m and ${maxCeilLabel}.`,
        `- Do NOT render the zone as a full convention-hall pavilion.`,
      ].join("\n"),
    );
  }

  // ── # ZONE FOCUS (interiors only) — pulls from the client's viewPrompt
  //    which is already built by promptBuilder.ts's generateZoneInteriorPrompt
  //    and contains structural-form, visual-brief, intent, and bound
  //    materials. We pass it through verbatim but capped to keep the
  //    overall prompt tight. ──
  if (isInterior && req.viewPrompt?.trim().length > 0) {
    const trimmed = req.viewPrompt.trim().slice(0, 2000);
    sections.push(`# ZONE FOCUS (authored from spatial canvas)\n${trimmed}`);
  } else if (!isInterior && req.viewPrompt?.trim().length > 0) {
    // For exteriors we include the viewPrompt as additional view detail
    // (smaller cap — the camera direction already carries most of what
    // matters; viewPrompt adds atmosphere + specific elements).
    sections.push(`# ADDITIONAL VIEW DETAILS\n${req.viewPrompt.trim().slice(0, 1200)}`);
  }

  // ── # CONSISTENCY WITH HERO REFERENCE ──
  const consistencyLines: string[] = ["# CONSISTENCY WITH HERO REFERENCE"];
  if (isInterior) {
    consistencyLines.push(
      `The first image attached is the canonical exterior render of THIS SAME booth. Treat it as ground truth for: brand colors, materials, finishes, lighting style + color temperature, signage style. Do not invent a new palette or new materials. If a detail isn't visible in the reference, extrapolate from what IS visible — never introduce something that contradicts it.`,
    );
  } else {
    consistencyLines.push(
      `The reference image shows the same booth from a different angle. Match: booth design + structure, materials + finishes, brand colors + signage, lighting style. The ONLY change is the camera angle.`,
    );
  }
  // Optional consistency tokens (brand colors, materials, etc.)
  if (consistencyTokens?.brandColors?.length) {
    consistencyLines.push(`Brand colors (apply prominently): ${consistencyTokens.brandColors.join(", ")}.`);
  }
  if (consistencyTokens?.materialKeywords?.length) {
    consistencyLines.push(`Materials: ${consistencyTokens.materialKeywords.join(", ")}.`);
  }
  if (consistencyTokens?.heroInstallationName && !isInterior) {
    consistencyLines.push(`Hero installation: "${consistencyTokens.heroInstallationName}" — maintain as the focal point.`);
  }
  sections.push(consistencyLines.join("\n"));

  // ── # RESTRICTIONS ──
  const restrictionLines: string[] = ["# RESTRICTIONS"];
  restrictionLines.push(
    `Booth surfaces should carry ONLY the brand wordmark and logo. Do NOT render: zone names ("The Study", "Lounge", "Hero", etc.), room labels, wayfinding signs, "Z1/Z2/Z3" or similar tags, dimension callouts, percentage labels, leader lines, or architectural-diagram styling. If you find yourself rendering text on the fascia header band that isn't the brand wordmark, replace it with empty space or brand graphics.`,
  );
  if (!isInterior) {
    restrictionLines.push(
      `Architectural defaults to AVOID: flat horizontal rectangular fascia/canopy, repeated identical bay modules, generic trade-show truss ceiling, symmetric grid of identical zones, plain rectangular pavilion shape. Match the booth's actual structural form from the reference image — do NOT redesign it as a default rectangular booth.`,
    );
  }
  if (consistencyTokens?.avoidKeywords?.length) {
    restrictionLines.push(`Avoid: ${consistencyTokens.avoidKeywords.join(", ")}.`);
  }
  if (dctx?.creativeAvoid?.length) {
    restrictionLines.push(`Brief-specified avoid: ${dctx.creativeAvoid.join(", ")}.`);
  }
  sections.push(restrictionLines.join("\n"));

  // ── # ADDITIONAL CONTEXT ──
  // Hero intent + brand RAG + brand intelligence. Trimmed and placed
  // at the end. The hero prompt was already aggressively trimmed
  // (~2500 chars cap) but we cap again here for safety.
  const contextParts: string[] = [];
  if (heroPromptText && heroPromptText.trim().length > 0) {
    contextParts.push(
      `Original hero design intent (the prompt that produced the reference image, for grounding):\n${heroPromptText.slice(0, 1500).trim()}`,
    );
  }
  const brandIntel = req.brandIntelligence ?? [];
  if (brandIntel.length > 0) {
    const visual = brandIntel.filter(
      (e) => e.category === "visual_identity" || e.category === "vendor_material",
    );
    if (visual.length > 0) {
      contextParts.push(
        `Brand intelligence:\n${visual.map((e) => `- ${e.title}: ${e.content}`).join("\n")}`,
      );
    }
  }
  if (req.brandContext) contextParts.push(`Brand context: ${req.brandContext.slice(0, 500)}`);
  if (req.suiteContext) contextParts.push(`Project type context: ${req.suiteContext.slice(0, 300)}`);
  if (ragBlock) contextParts.push(ragBlock.slice(0, 500));
  if (contextParts.length > 0) {
    sections.push(`# ADDITIONAL CONTEXT\n${contextParts.join("\n\n")}`);
  }

  return sections.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body: GenerateViewRequest = await req.json();
    const { referenceImageUrl, viewPrompt, viewName, aspectRatio, heroPromptText, boothSize, boothDimensions, geometryReferences, consistencyTokens, designContext, brandIntelligence, brandContext = "", suiteContext = "", agency_id, client_id, activation_type_id, project_id, brandLogoUrl, extraReferenceUrls, imageModel = "gemini" } = body;

    if (!viewPrompt || typeof viewPrompt !== "string") {
      return new Response(JSON.stringify({ error: "viewPrompt is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!viewName || typeof viewName !== "string") {
      return new Response(JSON.stringify({ error: "viewName is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // The old block builders (scaleBlock, geometryBlock,
    // geometryClosingReinforcement, consistencyBlock, brandBlock) are
    // no longer used — buildStructuredViewPrompt assembles a tighter
    // markdown prompt directly from the inputs. The helpers stay
    // defined for type-checking but the calls are gone.
    void buildScaleBlock;
    void buildGeometryReferenceBlock;
    void buildGeometryClosingReinforcement;
    void buildConsistencyBlock;
    void buildBrandIntelBlock;

    // ── RAG: Retrieve knowledge base context ──
    let ragContext: { formatted: string; chunks: any[]; byScope?: any } = { formatted: "", chunks: [] };
    if (agency_id) {
      const serviceSupabase = createServiceClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const ragQuery = [
        viewName,
        viewPrompt,
        consistencyTokens?.heroInstallationName,
        consistencyTokens?.styleKeywords?.join(", "),
        consistencyTokens?.materialKeywords?.join(", "),
      ].filter(Boolean).join(" — ").slice(0, 4000);
      ragContext = await buildRagContext(serviceSupabase, {
        query: ragQuery,
        agencyId: agency_id,
        clientId: client_id,
        activationTypeId: activation_type_id,
        projectId: project_id,
      });
      if (ragContext.chunks.length > 0) {
        console.log(`[generate-view] RAG: ${ragContext.chunks.length} chunks from scopes: ${Object.entries(ragContext.byScope || {}).filter(([, v]: any) => (v as any[]).length).map(([k, v]: any) => `${k}(${(v as any[]).length})`).join(", ")}`);
      }
    }
    const ragBlock = ragContext.formatted ? `\n\n${ragContext.formatted}` : "";

    console.log(`Generating ${viewName} view with aspect ratio ${aspectRatio}`, { hasConsistencyTokens: !!consistencyTokens, brandIntelEntries: brandIntelligence?.length ?? 0 });

    // Camera direction mapping for strong angle differentiation
    const cameraDirections: Record<string, string> = {
      "3/4 Hero View": "Camera positioned at 45 degrees front-left of the booth, at eye level (5.5 feet), looking toward the booth's center. This is a diagonal perspective showing both the front face and the left side of the booth.",
      "Top-Down View": "Camera positioned directly above the booth looking straight down (bird's eye / plan view). Show the full floor plan layout with all zones visible from overhead. No perspective distortion — orthographic top-down.",
      "Front Elevation": "Camera positioned directly in front of the booth, centered on the main entrance/aisle, at eye level (5.5 feet). The camera faces the booth head-on. Only the front face of the booth is visible — no side walls.",
      "Left Side": "Camera positioned to the LEFT side of the booth, at eye level (5.5 feet), facing the booth's left wall at exactly 90 degrees. The viewer is standing in the left aisle. The front of the booth is to the viewer's right. Only the left side face is prominent.",
      "Right Side": "Camera positioned to the RIGHT side of the booth, at eye level (5.5 feet), facing the booth's right wall at exactly 90 degrees. The viewer is standing in the right aisle. The front of the booth is to the viewer's left. Only the right side face is prominent. This is the OPPOSITE side from the left view.",
      "Back View": "Camera is BEHIND the booth, rotated 180 degrees from the front. The viewer is standing in the BACK aisle looking at the rear face of the booth. The back side is a FULLY FINISHED, polished, visitor-facing entry/exit point — just as inviting and designed as the front. Show branded rear panels with graphics, secondary signage, welcoming entry points, elegant lighting, and the same premium materials and finishes as the front. DO NOT show exposed wiring, structural supports, utility panels, cable management, or any utilitarian/service elements. The back should look like a secondary front entrance that visitors walk through. Include 2-3 visitors entering or exiting from this side.",
      "Hero Detail": "Camera positioned close to the hero/centerpiece installation, at eye level, showing a medium close-up shot of the main interactive element with surrounding context.",
      "Lounge Detail": "Camera positioned inside or near the lounge/meeting area, at eye level, showing a medium shot of the seating, conversation space, and hospitality zone.",
    };

    // For zone interiors, check if viewName ends with "Interior"
    const isInterior = viewName.endsWith("Interior");
    const zoneName = viewName.replace(' Interior', '');
    const cameraDir = cameraDirections[viewName] || (isInterior 
      ? `Camera is DEEP INSIDE the booth, positioned at eye level (5.5 feet) within the "${zoneName}" zone. The camera is surrounded by the zone's walls, ceiling, and furnishings. The booth exterior, convention hall, and outside aisles should NOT be prominently visible. The viewer feels enclosed within this specific zone.`
      : `Camera showing the ${viewName} perspective of the booth.`);

    // ── Build the prompt ──
    // Composer-driven (Phase 3 of refactor): when the client sent a
    // pre-composed renderer prompt, use it verbatim. Otherwise fall
    // back to the legacy edge-side structured builder.
    let editPrompt: string;
    if (body.composedPrompt && body.composedPrompt.renderer) {
      editPrompt = body.composedPrompt.renderer;
      console.log(`[generate-view] Using client-composed renderer for ${viewName} (${editPrompt.length} chars)`);
    } else {
      editPrompt = buildStructuredViewPrompt({
        req: body,
        isInterior,
        zoneName,
        cameraDir,
        heroPromptText,
        ragBlock,
        consistencyTokens,
      });
    }

    // Geometry reference URLs (floor plan / isometric) are DELIBERATELY
    // not forwarded to gpt-image-2. The PNG captures from
    // SpatialCanvasIso.tsx render zone names as 3D <Text> components
    // baked into the pixels, and gpt-image-2 reproduces those labels
    // on the rendered booth walls regardless of "no overlaid text"
    // instructions. The structured SIZE & SCALE section carries the
    // dimensional info without the bleed risk.
    void geometryReferences;

    // Unused: extraLabelBlock was emitted alongside the old
    // multimodal Gemini path. With the structured markdown prompt,
    // reference labels are described inline in the CONSISTENCY
    // section rather than as a separate trailing block.
    const extraLabelBlock = "";
    void extraLabelBlock;

    void imageModel;

    let generatedImageUrl: string | null = null;
    const responseText = "";
    let modelUsed = "";

    console.log(`[generate-view] Using OpenAI gpt-image-2 for ${viewName} (single-model pipeline, no fallback)`);
    try {
      // Reference URLs for the OpenAI /v1/images/edits call.
      //
      // When composedPrompt is present (the new short-instruction
      // edit-mode pipeline) we send ONLY the hero image as the
      // reference. Multiple references confuse gpt-image-2 — instead
      // of editing the hero, it tries to compose a new booth
      // satisfying all the inputs, producing the cross-view drift
      // bug the user reported (5 different booths, only the brand
      // matched). Single-input edit-mode behaves like ChatGPT-image-2
      // does in the UI: "show me top-down view of this" → it edits.
      //
      // When composedPrompt is absent (legacy fallback) we keep the
      // full hero + logo + extras list because the legacy prompt
      // was a generation prompt that needed multiple anchors.
      //
      // Floor plan + isometric PNGs are omitted in both paths — they
      // bake zone-name text labels into the references that the
      // model reproduces on the rendered booth.
      const referenceImageUrls = body.composedPrompt
        ? // Hero-only edit-mode for the new pipeline.
          (referenceImageUrl ? [referenceImageUrl] : [])
        : // Multi-anchor for the legacy fallback path.
          [
            ...(referenceImageUrl ? [referenceImageUrl] : []),
            ...(brandLogoUrl ? [brandLogoUrl] : []),
            ...(extraReferenceUrls ?? []),
          ].slice(0, 4);

      const out = await callOpenAIImage({
        usage: await buildUsageContext(req, "generate-view").catch(() => undefined),
        prompt: editPrompt,
        referenceImageUrls,
        size: "1536x1024",
        quality: "high",
      });
      const img = out[0];
      if (!img) {
        throw new Error(
          "gpt-image-2 returned no image. This usually means the prompt was filtered by content policy or the model is overloaded. Try regenerating or simplifying the prompt.",
        );
      }
      generatedImageUrl = `data:${img.mimeType};base64,${img.base64Data}`;
      modelUsed = "openai/gpt-image-2";
    } catch (e) {
      console.error(`[generate-view] gpt-image-2 failed for ${viewName}:`, e);
      const message = e instanceof Error ? e.message : "Unknown error";
      throw new Error(
        `Image generation failed via gpt-image-2 (${viewName}): ${message}. ` +
        `No fallback is configured — please retry, or contact the operator if this persists.`,
      );
    }

    console.log(`Successfully generated ${viewName} view via ${modelUsed}`);

    return new Response(
      JSON.stringify({
        success: true,
        viewName,
        imageUrl: generatedImageUrl,
        message: responseText,
        modelUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating view:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate image" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
