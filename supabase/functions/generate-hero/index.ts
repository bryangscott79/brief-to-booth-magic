import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  projectType?: string;
  brandIntelligence?: BrandIntelEntry[];
  brandContext?: string;
  suiteContext?: string;
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

function buildScaleBlock(sizeStr?: string): string {
  if (!sizeStr) return "";
  const m = sizeStr.match(/(\d+)\s*[x×X]\s*(\d+)/);
  if (!m) return "";
  const w = parseInt(m[1], 10), d = parseInt(m[2], 10), sqft = w * d;
  const ht = sqft > 1200 ? "16-20" : sqft > 600 ? "12-16" : "8-12";
  const scale = sqft > 1200 ? "large island" : sqft > 600 ? "mid-size peninsula" : "small inline";
  return `\n\nPHYSICAL SCALE (CRITICAL):\n- Booth footprint: ${w}' wide × ${d}' deep (${sqft} sq ft) — ${scale} booth\n- Ceiling/fascia height: ${ht} feet\n- An average person is 5'8". The booth is ${w}' wide — roughly ${Math.round(w / 2)} people shoulder-to-shoulder\n- Standard 10' convention aisles on open sides\n- Do NOT make the booth look like a mega-exhibit. It is ${w}'×${d}' — keep it proportional.`;
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
    const { prompt, feedback, previousImageUrl, boothSize, projectType, designContext, brandIntelligence, brandContext = "", suiteContext = "" }: GenerateHeroRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      return new Response(JSON.stringify({ error: "prompt is required and must be at least 10 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    const scaleBlock = buildScaleBlock(boothSize);
    const designBlock = buildDesignContextBlock(designContext);
    const brandBlock = buildBrandIntelBlock(brandIntelligence);
    console.log("Generating hero image", { hasFeedback: !!feedback, hasPreviousImage: !!previousImageUrl, boothSize, hasDesignContext: !!designContext, projectType, brandIntelEntries: brandIntelligence?.length ?? 0 });

    let messages;

    if (previousImageUrl && feedback) {
      const refinedPrompt = `${feedbackPrefix}

FEEDBACK TO APPLY:
${feedback}

ORIGINAL DESIGN REQUIREMENTS:
${prompt}
${scaleBlock}
${designBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}

Generate a photorealistic 16:9 image that incorporates the feedback while maintaining the overall concept and brand identity.`;

      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: refinedPrompt },
            { type: "image_url", image_url: { url: previousImageUrl } },
          ],
        },
      ];
    } else {
      messages = [
        {
          role: "user",
          content: `${prompt}
${scaleBlock}
${designBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}

${genSuffix}`,
        },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const responseText = data.choices?.[0]?.message?.content || "";

    if (!generatedImageUrl) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No image generated");
    }

    console.log("Successfully generated hero image");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: generatedImageUrl,
        message: responseText,
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
