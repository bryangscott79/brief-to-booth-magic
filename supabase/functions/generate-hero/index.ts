// generate-hero — DEPLOY TOKEN: 2026-05-07-r6-image2-spec
// (Lovable's pipeline keys deployment off file content hash — bump this
//  comment to force a redeploy when the function code changes need to
//  propagate. The ai-gateway changes that matter for this version:
//   - callOpenAIImage uses model "gpt-image-2"
//   - callAnthropic falls back across LOVABLE_API_KEY / ANTHROPIC_KEY
//   - response carries modelUsed for client-side observability)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGemini, callOpenAIImage } from "../_shared/ai-gateway.ts";
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
  designContext?: {
    brandColors?: string[];
    materialsAndMood?: Array<{ material: string; feel: string }>;
    heroInstallation?: { name: string; dimensions?: string; materials?: string[] };
    qualityTier?: "standard" | "premium" | "ultra";
    zoneLayout?: Array<{ name: string; percentage: number; position: string }>;
    creativeAvoid?: string[];
    creativeEmbrace?: string[];
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GenerateHeroRequest = await req.json();
    const { prompt, feedback, previousImageUrl, boothSize, boothDimensions, geometryReferences, projectType, designContext, brandIntelligence, brandContext = "", suiteContext = "", agency_id, client_id, activation_type_id, project_id, brandLogoUrl, extraReferenceUrls, imageModel = "gemini" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return new Response(JSON.stringify({ error: "prompt is required and must be at least 10 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Project-type-aware suffix and feedback prefix
    const TYPE_SUFFIX: Record<string, string> = {
      live_brand_activation: "Generate a photorealistic 16:9 visualization of this brand activation. This is an outdoor experiential build — NOT a trade show booth. Show crowd energy, open sky, and immersive scale.",
      permanent_installation: "Generate a photorealistic 16:9 architectural visualization of this permanent installation. High-quality, permanent branded environment — architectural photography aesthetic.",
      film_premiere: "Generate a photorealistic 16:9 visualization of this premiere event build. Theatrical, glamorous film/event premiere experience — cinematic and dramatic, NOT a trade show booth.",
      game_release_activation: "Generate a photorealistic 16:9 visualization of this game launch activation. Epic, immersive game world activation — NOT a trade show booth. RGB LED environment, massive screens, gaming community energy.",
      architectural_brief: "Generate a photorealistic 16:9 architectural visualization. Permanent architectural brief — award-quality architectural photography aesthetic. NOT a trade show booth.",
      trade_show_booth: "Generate a photorealistic 16:9 architectural visualization of this trade show booth. The booth must appear as the correct physical size — not a mega-exhibit.",
    };
    const TYPE_FEEDBACK_PREFIX: Record<string, string> = {
      live_brand_activation: "Based on this brand activation event image, apply the following feedback and generate an improved version:",
      permanent_installation: "Based on this permanent installation image, apply the following feedback and generate an improved version:",
      film_premiere: "Based on this premiere event visualization, apply the following feedback and generate an improved version:",
      game_release_activation: "Based on this game launch activation image, apply the following feedback and generate an improved version:",
      architectural_brief: "Based on this architectural visualization, apply the following feedback and generate an improved version:",
      trade_show_booth: "Based on this trade show booth image, apply the following feedback and generate an improved version:",
    };

    const genSuffix = TYPE_SUFFIX[projectType || "trade_show_booth"] ?? TYPE_SUFFIX.trade_show_booth;
    const feedbackPrefix = TYPE_FEEDBACK_PREFIX[projectType || "trade_show_booth"] ?? TYPE_FEEDBACK_PREFIX.trade_show_booth;

    const scaleBlock = buildScaleBlock(body);
    const geometryBlock = buildGeometryReferenceBlock(body);
    const geometryClosingReinforcement = buildGeometryClosingReinforcement(body);
    const designBlock = buildDesignContextBlock(designContext);
    const brandBlock = buildBrandIntelBlock(brandIntelligence);

    // ── RAG: Retrieve knowledge base context ──
    let ragContext: { formatted: string; chunks: any[]; byScope?: any } = { formatted: "", chunks: [] };
    if (agency_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const ragQuery = [
        prompt,
        designContext?.heroInstallation?.name,
        designContext?.creativeEmbrace?.join(", "),
        designContext?.brandColors?.join(", "),
      ].filter(Boolean).join(" — ").slice(0, 4000);
      ragContext = await buildRagContext(supabase, {
        query: ragQuery,
        agencyId: agency_id,
        clientId: client_id,
        activationTypeId: activation_type_id,
        projectId: project_id,
      });
      if (ragContext.chunks.length > 0) {
        console.log(`[generate-hero] RAG: ${ragContext.chunks.length} chunks from scopes: ${Object.entries(ragContext.byScope || {}).filter(([, v]: any) => (v as any[]).length).map(([k, v]: any) => `${k}(${(v as any[]).length})`).join(", ")}`);
      }
    }
    const ragBlock = ragContext.formatted ? `\n\n${ragContext.formatted}` : "";

    console.log("Generating hero image", { hasFeedback: !!feedback, hasPreviousImage: !!previousImageUrl, boothSize, hasDesignContext: !!designContext, projectType, brandIntelEntries: brandIntelligence?.length ?? 0, hasBrandLogo: !!brandLogoUrl, extraRefs: extraReferenceUrls?.length ?? 0 });

    // Reference image attachments. ORDER MATTERS — the image model
    // attends most strongly to the FIRST images in the array.
    // Geometry refs (floor plan + iso) come first so the model treats
    // them as ground truth before considering brand or user extras.
    const referenceImages: Array<{ type: "image_url"; image_url: { url: string } }> = [];
    const referenceLabels: string[] = [];
    if (geometryReferences?.floorplan) {
      referenceImages.push({ type: "image_url", image_url: { url: geometryReferences.floorplan } });
      referenceLabels.push("GEOMETRY — FLOOR PLAN (top-down): the exact booth footprint and zone layout. Match these proportions and zone positions precisely.");
    }
    if (geometryReferences?.isometric) {
      referenceImages.push({ type: "image_url", image_url: { url: geometryReferences.isometric } });
      referenceLabels.push("GEOMETRY — ISOMETRIC VOLUME (3D): the exact 3D space the structure must occupy. Match the volumetric proportions and maximum height shown.");
    }
    if (brandLogoUrl) {
      referenceImages.push({ type: "image_url", image_url: { url: brandLogoUrl } });
      referenceLabels.push("BRAND LOGO — use this exact mark on signage, fascia, and any branded surfaces. Do not invent or modify the logo design.");
    }
    if (extraReferenceUrls?.length) {
      for (const url of extraReferenceUrls) {
        referenceImages.push({ type: "image_url", image_url: { url } });
      }
      referenceLabels.push(`USER REFERENCES (${extraReferenceUrls.length}) — additional visual references the user attached. Use them as inspiration for materials, mood, and composition where appropriate.`);
    }
    const referenceLabelBlock = referenceLabels.length
      ? `\n\nVISUAL REFERENCES PROVIDED:\n${referenceLabels.join("\n")}\n`
      : "";

    let messages;

    // Geometry block goes FIRST in the text. Image models heavily weight
    // opening tokens; putting the strict scale constraint at the top
    // (before stylistic/material guidance) makes the geometry constraint
    // dominant rather than a footnote.
    if (previousImageUrl && feedback) {
      const refinedPrompt = `${geometryBlock}
${feedbackPrefix}

FEEDBACK TO APPLY:
${feedback}

ORIGINAL DESIGN REQUIREMENTS:
${prompt}
${scaleBlock}
${designBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}${ragBlock}${referenceLabelBlock}

Generate a photorealistic 16:9 image that incorporates the feedback while maintaining the overall concept and brand identity. The geometry references at the top of this prompt remain ground truth — do not change the booth's proportions or zone layout.
${geometryClosingReinforcement}`;

      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: refinedPrompt },
            { type: "image_url", image_url: { url: previousImageUrl } },
            ...referenceImages,
          ],
        },
      ];
    } else {
      messages = [
        {
          role: "user",
          content: referenceImages.length > 0
            ? [
                {
                  type: "text",
                  text: `${geometryBlock}
${prompt}
${scaleBlock}
${designBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}${ragBlock}${referenceLabelBlock}

${genSuffix}
${geometryClosingReinforcement}`,
                },
                ...referenceImages,
              ]
            : `${geometryBlock}
${prompt}
${scaleBlock}
${designBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}${ragBlock}

${genSuffix}
${geometryClosingReinforcement}`,
        },
      ];
    }

    // Build the final prompt as a flat text string (used by OpenAI which
    // doesn't accept image_url content in chat-completions image gen).
    // For Gemini we pass the structured messages directly; for OpenAI we
    // collapse to one text prompt + reference URLs.
    const flattenedPrompt =
      typeof messages[0]?.content === "string"
        ? messages[0].content as string
        : ((messages[0]?.content as Array<{ type: string; text?: string }>) ?? [])
            .filter((c) => c?.type === "text")
            .map((c) => c?.text ?? "")
            .join("\n");
    // For OpenAI /v1/images/edits, refs go in `image[]` form fields.
    // ORDER MATTERS — geometry refs first so they outweigh logo/extras.
    // OpenAI caps at 4 reference images; we'll include geometry first
    // and trim aggressively if needed.
    const refUrlsForOpenAI = [
      ...(geometryReferences?.floorplan ? [geometryReferences.floorplan] : []),
      ...(geometryReferences?.isometric ? [geometryReferences.isometric] : []),
      ...(previousImageUrl ? [previousImageUrl] : []),
      ...(brandLogoUrl ? [brandLogoUrl] : []),
      ...(extraReferenceUrls ?? []),
    ].slice(0, 4); // gpt-image-2 hard limit

    let generatedImageUrl: string | null = null;
    let responseText = "";
    let modelUsed = "";

    if (imageModel === "openai") {
      // gpt-image-1 path. Better logo fidelity, better adherence on
      // organic / asymmetric structures.
      console.log(`[generate-hero] Using OpenAI gpt-image-1`);
      try {
        const out = await callOpenAIImage({
      usage: await buildUsageContext(req, "generate-hero").catch(() => undefined),
          prompt: flattenedPrompt,
          referenceImageUrls: refUrlsForOpenAI,
          size: "1536x1024", // 16:9 closest
          quality: "high",
        });
        const img = out[0];
        if (!img) throw new Error("OpenAI returned no image");
        generatedImageUrl = `data:${img.mimeType};base64,${img.base64Data}`;
        modelUsed = "openai/gpt-image-2";
      } catch (e) {
        console.error("[generate-hero] OpenAI failed, falling back to Gemini:", e);
        // Fall through to Gemini.
      }
    }

    if (!generatedImageUrl) {
      // Default Gemini path (also the fallback if OpenAI fails).
      let result = await callGemini({
      usage: await buildUsageContext(req, "generate-hero").catch(() => undefined),
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      });

      let image = result.images?.[0];

      // Fallback: Pro Image can return empty {} under load or safety filtering.
      // Retry once with the faster Nano Banana 2 model before failing.
      if (!image) {
        console.warn("[generate-hero] Pro Image returned no image, retrying with gemini-3.1-flash-image-preview");
        try {
          result = await callGemini({
      usage: await buildUsageContext(req, "generate-hero").catch(() => undefined),
            model: "google/gemini-3.1-flash-image-preview",
            messages,
            modalities: ["image", "text"],
          });
          image = result.images?.[0];
        } catch (fallbackErr) {
          console.error("[generate-hero] Fallback model also failed:", fallbackErr);
        }
      }

      if (!image) {
        console.error("No image in response (both models):", JSON.stringify(result).slice(0, 500));
        throw new Error(
          "Image model returned no image. This usually means the prompt was filtered or the model is overloaded. Please try regenerating, or simplify the prompt/booth size.",
        );
      }

      generatedImageUrl = `data:${image.mimeType};base64,${image.base64Data}`;
      responseText = result.text || "";
      modelUsed = "google/gemini-3-pro-image-preview";
    }

    console.log("Successfully generated hero image");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: generatedImageUrl,
        message: responseText,
        modelUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating hero:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate image" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
