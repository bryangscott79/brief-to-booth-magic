import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── PROJECT TYPE ENVIRONMENTS ──────────────────────────────────────────────────
const PROJECT_TYPE_ENVIRONMENTS: Record<string, { environment: string; style: string }> = {
  trade_show_booth: {
    environment: "Professional trade show / convention center floor with carpet, overhead lighting, neighboring booths visible, aisle crowds.",
    style: "Architectural visualization quality (Gensler level). Photorealistic materials. Clean editorial lighting.",
  },
  live_brand_activation: {
    environment: "Open-air event — festival grounds, urban plaza, or outdoor venue. Natural sky visible. Surrounding festival structures.",
    style: "Architectural visualization meets editorial event photography. Photorealistic with dramatic atmospheric lighting.",
  },
  permanent_installation: {
    environment: "Permanent architectural space — flagship retail, museum gallery, visitor center. High-quality permanent construction.",
    style: "Architectural photography quality (Snohetta level). Photorealistic materials. Natural and designed lighting.",
  },
  film_premiere: {
    environment: "Film premiere / entertainment event. Theatrical venue or iconic outdoor location. Red carpet, dramatic lighting.",
    style: "Getty Images premiere photography meets architectural event visualization. Theatrical and glamorous.",
  },
  game_release_activation: {
    environment: "Epic game launch — convention floor, arena, or outdoor festival. RGB LED environment, massive screens, world-build scenic.",
    style: "Architectural event visualization meets gaming culture. Epic scale. RGB dramatic lighting. Immersive.",
  },
  architectural_brief: {
    environment: "Permanent architectural space — commercial interior, hospitality, civic building. Full architectural construction.",
    style: "Architectural photography quality (Iwan Baan level). Photorealistic. Natural and artificial light. Material texture.",
  },
};

// ─── STYLE PRESETS ──────────────────────────────────────────────────────────────
const STYLE_PRESETS: Record<string, string> = {
  photorealistic:
    "Enhance into a photorealistic architectural visualization. Ultra-realistic materials, lighting, reflections, and environmental context.",
  sketch:
    "Enhance into a polished architectural sketch rendering. Keep the hand-drawn quality but add clean linework, subtle color washes, and professional annotation style.",
  watercolor:
    "Enhance into a watercolor architectural illustration. Soft, artistic washes of color. Loose, evocative style. Light and airy feel with careful architectural proportions preserved.",
};

interface BrandIntelEntry {
  category: string;
  title: string;
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const {
      rhinoImageUrl,
      projectType,
      brandIntelligence,
      designContext,
      polishInstructions,
      stylePreset,
    } = body as {
      rhinoImageUrl: string;
      projectType?: string;
      brandIntelligence?: BrandIntelEntry[];
      designContext?: string;
      polishInstructions?: string;
      stylePreset?: string;
    };

    if (!rhinoImageUrl) {
      return new Response(
        JSON.stringify({ error: "rhinoImageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build environment context from project type
    const typeKey = projectType || "trade_show_booth";
    const env = PROJECT_TYPE_ENVIRONMENTS[typeKey] || PROJECT_TYPE_ENVIRONMENTS.trade_show_booth;
    const styleBlock = STYLE_PRESETS[stylePreset || "photorealistic"] || STYLE_PRESETS.photorealistic;

    // Build brand intelligence block
    let brandBlock = "";
    if (brandIntelligence && Array.isArray(brandIntelligence) && brandIntelligence.length > 0) {
      const visual = brandIntelligence.filter(
        (e) => e.category === "visual_identity" || e.category === "vendor_material"
      );
      if (visual.length > 0) {
        brandBlock = "\n\nBRAND VISUAL IDENTITY:\n" +
          visual.map((e) => `- ${e.title}: ${e.content}`).join("\n");
      }
    }

    // Build the prompt
    const systemPrompt = `You are an architectural visualization specialist. You receive 3D model screenshots (from Rhino, SketchUp, or similar CAD software) and enhance them into professional presentation-quality renderings.

CRITICAL RULES:
1. PRESERVE the exact geometry, spatial layout, proportions, and architectural design from the original 3D model
2. Do NOT change the building/structure form, shape, or layout
3. ADD: realistic materials, textures, lighting, environmental context, and human figures
4. Match the target environment and style quality described below

${styleBlock}

ENVIRONMENT: ${env.environment}
QUALITY: ${env.style}`;

    let userPrompt = `Enhance this 3D model screenshot into a professional architectural visualization rendering.

PRESERVE all geometry and spatial relationships exactly as shown. Add realistic materials, lighting, 6-10 people in natural poses, and environmental context appropriate for the setting.`;

    if (designContext) {
      userPrompt += `\n\nDESIGN CONTEXT:\n${designContext}`;
    }
    if (brandBlock) {
      userPrompt += brandBlock;
    }
    if (polishInstructions) {
      userPrompt += `\n\nSPECIFIC INSTRUCTIONS:\n${polishInstructions}`;
    }

    console.log("Polishing Rhino render:", {
      projectType: typeKey,
      stylePreset: stylePreset || "photorealistic",
      hasBrandIntel: !!brandBlock,
      hasCustomInstructions: !!polishInstructions,
    });

    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: [
          {
            type: "image_url" as const,
            image_url: { url: rhinoImageUrl },
          },
          {
            type: "text" as const,
            text: userPrompt,
          },
        ],
      },
    ];

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
      throw new Error("No polished image generated");
    }

    console.log("Successfully polished Rhino render");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: generatedImageUrl,
        message: responseText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error polishing Rhino render:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to polish render",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
