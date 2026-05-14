// generate-panorama — DEPLOY TOKEN: 2026-05-12-gpt-image-2-only
//
// Note on output aspect: gpt-image-2 only supports 1024×1024, 1536×1024,
// and 1024×1536. A true equirectangular panorama needs 2:1 (e.g.
// 2048×1024) which the model cannot natively produce. We use 1536×1024
// (3:2 landscape — the widest available) and keep the prompt asking
// for a wide panoramic-feel composition. Downstream VR viewers that
// expect strict 2:1 equirectangular will need to letterbox or be
// updated; the function itself returns a valid wide-format render.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIImage } from "../_shared/ai-gateway.ts";

import { buildUsageContext } from "../_shared/usage-context.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GeneratePanoramaRequest {
  /** Human-readable space name, e.g. "Main Booth Interior" */
  spaceName: string;
  /** Free-form design prompt for the panorama */
  prompt: string;
  /** Reference image URL (hero or best exterior) for visual consistency */
  referenceImageUrl?: string;
  /** Booth / space physical size, e.g. "30x30" */
  boothSize?: string;
  projectType?: string;
  /** Brand RAG context string */
  brandContext?: string;
  /** Suite context string */
  suiteContext?: string;
  /** Consistency tokens from render store */
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
}

function buildScaleBlock(sizeStr?: string): string {
  if (!sizeStr) return "";
  const m = sizeStr.match(/(\d+)\s*[x×X]\s*(\d+)/);
  if (!m) return "";
  const w = parseInt(m[1], 10),
    d = parseInt(m[2], 10),
    sqft = w * d;
  const ht = sqft > 1200 ? "16-20" : sqft > 600 ? "12-16" : "8-12";
  return `\nPHYSICAL SCALE:\n- Footprint: ${w}' × ${d}' (${sqft} sq ft)\n- Ceiling height: ${ht} feet\n- Human reference: average person is 5'8"\n`;
}

function buildConsistencyBlock(
  tokens?: GeneratePanoramaRequest["consistencyTokens"]
): string {
  if (!tokens) return "";
  const parts: string[] = ["\n── CONSISTENCY TOKENS ──"];
  if (tokens.brandColors?.length)
    parts.push(`Brand colors: ${tokens.brandColors.join(", ")}`);
  if (tokens.materialKeywords?.length)
    parts.push(`Materials: ${tokens.materialKeywords.join(", ")}`);
  if (tokens.lightingKeywords?.length)
    parts.push(`Lighting: ${tokens.lightingKeywords.join(", ")}`);
  if (tokens.styleKeywords?.length)
    parts.push(`Style: ${tokens.styleKeywords.join(", ")}`);
  if (tokens.qualityTier) parts.push(`Quality tier: ${tokens.qualityTier}`);
  if (tokens.heroInstallationName)
    parts.push(`Hero installation: "${tokens.heroInstallationName}"`);
  if (tokens.visibleZones?.length)
    parts.push(`Zones: ${tokens.visibleZones.join(", ")}`);
  if (tokens.avoidKeywords?.length)
    parts.push(`Avoid: ${tokens.avoidKeywords.join(", ")}`);
  parts.push("── END TOKENS ──\n");
  return parts.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      spaceName,
      prompt,
      referenceImageUrl,
      boothSize,
      projectType,
      brandContext = "",
      suiteContext = "",
      consistencyTokens,
    }: GeneratePanoramaRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "prompt is required (min 5 chars)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    if (!spaceName || typeof spaceName !== "string") {
      return new Response(
        JSON.stringify({ error: "spaceName is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const scaleBlock = buildScaleBlock(boothSize);
    const consistencyBlock = buildConsistencyBlock(consistencyTokens);

    const typeLabel =
      projectType === "live_brand_activation"
        ? "brand activation"
        : projectType === "film_premiere"
          ? "premiere event"
          : projectType === "game_release_activation"
            ? "game launch activation"
            : "trade show booth";

    // Prompt tuned for gpt-image-2's 1536×1024 (3:2) output. We can't
    // ask for a true equirectangular 2:1 panorama, but we can ask for
    // an ultra-wide architectural interior that captures as much of
    // the room as a 3:2 frame allows. The result is a wide-angle
    // interior, not a VR-grade panorama — if the UI needs strict 2:1,
    // it should letterbox the output or skip the panorama feature.
    const panoramaPrompt = `Generate an ultra-wide photorealistic interior view of a ${typeLabel} space called "${spaceName}".

FRAMING:
- Wide-angle architectural interior photograph (wider than a normal lens — think 24mm equivalent or wider)
- Camera positioned at the center of the space at eye level (5.5 feet / 1.7 meters)
- Capture as much of the surrounding interior as possible in a single frame: front-facing walls/features prominent, side walls visible at the edges of the frame, floor and ceiling treatments both legible
- The viewer should feel immersed in the space — they can see the breadth of the room without rotating their head

SPACE DESCRIPTION:
${prompt}
${scaleBlock}

VISUAL QUALITY:
- Photorealistic architectural interior photography quality
- Natural ambient lighting with accent lighting on key features
- Show realistic materials, textures, and surface reflections
- Include 4-6 visitors naturally occupying the space for scale reference
- Environmental details: ceiling treatment, floor material, wall finishes, branded graphics
${consistencyBlock}
${brandContext ? `\n## BRAND CONTEXT\n${brandContext}` : ""}
${suiteContext ? `\n## SUITE CONTEXT\n${suiteContext}` : ""}

OUTPUT: A single photorealistic ultra-wide interior photograph showing the immersive environment of "${spaceName}".`;

    console.log("[generate-panorama] Using OpenAI gpt-image-2 for:", spaceName, {
      hasReference: !!referenceImageUrl,
      boothSize,
      projectType,
    });

    let generatedImageUrl: string;
    try {
      const out = await callOpenAIImage({
        usage: await buildUsageContext(req, "generate-panorama").catch(() => undefined),
        prompt: panoramaPrompt,
        referenceImageUrls: referenceImageUrl ? [referenceImageUrl] : [],
        size: "1536x1024", // 3:2 — widest gpt-image-2 supports
        quality: "high",
      });
      const img = out[0];
      if (!img) {
        throw new Error(
          "gpt-image-2 returned no panorama. The prompt may have been filtered or the model is overloaded.",
        );
      }
      generatedImageUrl = `data:${img.mimeType};base64,${img.base64Data}`;
    } catch (e) {
      console.error(`[generate-panorama] gpt-image-2 failed for ${spaceName}:`, e);
      const message = e instanceof Error ? e.message : "Unknown error";
      throw new Error(
        `Panorama generation failed via gpt-image-2: ${message}. ` +
        `No fallback is configured.`,
      );
    }

    console.log("Successfully generated panorama for:", spaceName);

    return new Response(
      JSON.stringify({
        success: true,
        spaceName,
        imageUrl: generatedImageUrl,
        message: "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating panorama:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to generate panorama",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
