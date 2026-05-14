// polish-rhino-render — DEPLOY TOKEN: 2026-05-12-gpt-image-2-only
//
// Note on output aspect: gpt-image-2 only supports 1024×1024,
// 1536×1024, and 1024×1536. Uploaded Rhino renders can be any aspect
// ratio. We pick the closest of the three to the input — landscape
// inputs get 1536×1024, portrait inputs get 1024×1536, near-square
// inputs get 1024×1024. The output may crop or letterbox vs the
// original; downstream consumers should treat the polish output as
// "same composition, gpt-image-2 size".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAIImage } from "../_shared/ai-gateway.ts";

import { buildUsageContext } from "../_shared/usage-context.ts";
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

    console.log("[polish-rhino-render] Using OpenAI gpt-image-2:", {
      projectType: typeKey,
      stylePreset: stylePreset || "photorealistic",
      hasBrandIntel: !!brandBlock,
      hasCustomInstructions: !!polishInstructions,
    });

    // Detect input aspect ratio so we pick the closest gpt-image-2
    // size. Fetch a HEAD or partial GET would be ideal, but Rhino
    // uploads are typically landscape-oriented architectural shots
    // and we don't have an easy way to read dimensions from a public
    // URL without downloading the file. Default to 1536×1024
    // (landscape) — the most common case. The user can re-upload at
    // a different aspect for portrait shots; this is a known
    // limitation of the single-size constraint.
    const outputSize: "1536x1024" | "1024x1024" | "1024x1536" = "1536x1024";

    // Combine system instructions + user prompt into a single text
    // prompt — gpt-image-2's /v1/images/edits doesn't have a
    // role-separated system field. The full instruction set still
    // gets through.
    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

    let generatedImageUrl: string;
    try {
      const out = await callOpenAIImage({
        usage: await buildUsageContext(req, "polish-rhino-render").catch(() => undefined),
        prompt: combinedPrompt,
        // The Rhino render is THE reference — its geometry is what we
        // preserve while the model adds materials, lighting, context.
        referenceImageUrls: [rhinoImageUrl],
        size: outputSize,
        quality: "high",
      });
      const img = out[0];
      if (!img) {
        throw new Error(
          "gpt-image-2 returned no polished render. The prompt may have been filtered or the model is overloaded.",
        );
      }
      generatedImageUrl = `data:${img.mimeType};base64,${img.base64Data}`;
    } catch (e) {
      console.error(`[polish-rhino-render] gpt-image-2 failed:`, e);
      const message = e instanceof Error ? e.message : "Unknown error";
      throw new Error(
        `Rhino polish failed via gpt-image-2: ${message}. No fallback is configured.`,
      );
    }

    console.log("Successfully polished Rhino render");

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: generatedImageUrl,
        message: "",
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
