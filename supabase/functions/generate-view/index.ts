import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  referenceImageUrl: string;
  viewPrompt: string;
  viewName: string;
  aspectRatio: string;
  boothSize?: string;
  brandIntelligence?: BrandIntelEntry[];
  brandContext?: string;
  suiteContext?: string;
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

function buildScaleBlock(sizeStr?: string): string {
  if (!sizeStr) return "";
  const m = sizeStr.match(/(\d+)\s*[x×X]\s*(\d+)/);
  if (!m) return "";
  const w = parseInt(m[1], 10), d = parseInt(m[2], 10), sqft = w * d;
  const ht = sqft > 1200 ? "16-20" : sqft > 600 ? "12-16" : "8-12";
  const scale = sqft > 1200 ? "large island" : sqft > 600 ? "mid-size peninsula" : "small inline";
  return `\nPHYSICAL SCALE (CRITICAL):\n- Booth footprint: ${w}' wide × ${d}' deep (${sqft} sq ft) — ${scale} booth\n- Ceiling/fascia height: ${ht} feet\n- An average person is 5'8". The booth is ${w}' wide — roughly ${Math.round(w / 2)} people shoulder-to-shoulder\n- Do NOT make it look like a mega-exhibit. Keep it ${w}'×${d}' proportional.\n`;
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
    const { referenceImageUrl, viewPrompt, viewName, aspectRatio, boothSize, consistencyTokens, brandIntelligence, brandContext = "", suiteContext = "" }: GenerateViewRequest = await req.json();

    if (!viewPrompt || typeof viewPrompt !== "string") {
      return new Response(JSON.stringify({ error: "viewPrompt is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!viewName || typeof viewName !== "string") {
      return new Response(JSON.stringify({ error: "viewName is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const scaleBlock = buildScaleBlock(boothSize);
    const consistencyBlock = buildConsistencyBlock(consistencyTokens);
    const brandBlock = buildBrandIntelBlock(brandIntelligence);

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

    // Build the prompt for image editing/transformation
    const editPrompt = isInterior
      ? `Generate a photorealistic INTERIOR image showing what it looks like to be STANDING INSIDE the "${zoneName}" zone of this trade show booth.

CRITICAL CAMERA RULES:
${cameraDir}
- The camera is INSIDE the zone, NOT outside looking at the booth
- The booth's outer walls, fascia, header signage, and convention hall should be BEHIND the camera or barely visible
- The viewer should feel ENCLOSED within the space — surrounded by the zone's walls, ceiling panels, and features
- DO NOT show the full booth exterior or the booth from the aisle perspective
- Think of this as an interior architectural photo taken from INSIDE a room

ZONE: "${zoneName}"
${viewPrompt}

VISUAL CONSISTENCY:
- Match the design language, materials, colors, and finishes from the reference image
- The zone's furniture, screens, and fixtures must match what's visible in the reference
- Maintain the same brand aesthetic and lighting mood

COMPOSITION:
- Show 2-4 visitors naturally using the space
- Include environmental details: ceiling treatment, floor material, wall finishes
- Depth of field focusing on the zone's key features

OUTPUT: A photorealistic ${aspectRatio} image that feels like you are STANDING INSIDE this zone, surrounded by its features. NOT an exterior shot.
${scaleBlock}
${consistencyBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}`
      : `Using this reference image of a trade show booth, generate a NEW image showing the SAME booth from a completely DIFFERENT camera angle.
${scaleBlock}

CAMERA POSITION (CRITICAL — follow exactly):
${cameraDir}

ADDITIONAL VIEW DETAILS:
${viewPrompt}

CONSISTENCY RULES (maintain from reference):
- Identical booth design, structure, colors, and branding
- Same materials, textures, and finishes
- Same lighting style and atmosphere
- Same brand signage, logos, and graphics
- Same trade show environment

OUTPUT: A photorealistic ${aspectRatio} image. The camera angle MUST be distinctly different from the reference image.
${consistencyBlock}
${brandBlock}${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: editPrompt,
              },
              ...(referenceImageUrl ? [{
                type: "image_url",
                image_url: {
                  url: referenceImageUrl,
                },
              }] : []),
            ],
          },
        ],
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

    console.log(`Successfully generated ${viewName} view`);

    return new Response(
      JSON.stringify({
        success: true,
        viewName,
        imageUrl: generatedImageUrl,
        message: responseText,
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
