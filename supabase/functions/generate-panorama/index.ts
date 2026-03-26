import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    const panoramaPrompt = `Generate a photorealistic EQUIRECTANGULAR 360° PANORAMIC image of the interior of a ${typeLabel} space called "${spaceName}".

IMAGE FORMAT REQUIREMENTS (CRITICAL):
- The image MUST be in equirectangular projection format (2:1 aspect ratio)
- The image should wrap seamlessly — the left edge connects to the right edge
- The camera is positioned at the CENTER of the space at eye level (5.5 feet / 1.7 meters)
- Show the FULL 360° view: front, left, back, right, ceiling, and floor are ALL visible
- The horizontal field of view spans the full 360 degrees
- The vertical field of view spans approximately 180 degrees (floor to ceiling)

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

OUTPUT: A single photorealistic equirectangular 360° panoramic image (2:1 aspect ratio) showing the complete interior environment of "${spaceName}".`;

    console.log("Generating panorama for:", spaceName, {
      hasReference: !!referenceImageUrl,
      boothSize,
      projectType,
    });

    const messages = referenceImageUrl
      ? [
          {
            role: "user" as const,
            content: [
              { type: "text" as const, text: panoramaPrompt },
              {
                type: "image_url" as const,
                image_url: { url: referenceImageUrl },
              },
            ],
          },
        ]
      : [{ role: "user" as const, content: panoramaPrompt }];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again in a moment.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Usage limit reached. Please add credits to continue.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedImageUrl =
      data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const responseText = data.choices?.[0]?.message?.content || "";

    if (!generatedImageUrl) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No panorama generated");
    }

    console.log("Successfully generated panorama for:", spaceName);

    return new Response(
      JSON.stringify({
        success: true,
        spaceName,
        imageUrl: generatedImageUrl,
        message: responseText,
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
