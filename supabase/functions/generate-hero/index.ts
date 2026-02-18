import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateHeroRequest {
  prompt: string;
  feedback?: string;
  previousImageUrl?: string;
  boothSize?: string;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, feedback, previousImageUrl, boothSize }: GenerateHeroRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const scaleBlock = buildScaleBlock(boothSize);
    console.log("Generating hero image", { hasFeedback: !!feedback, hasPreviousImage: !!previousImageUrl, boothSize });

    let messages;

    if (previousImageUrl && feedback) {
      const refinedPrompt = `Based on this trade show booth image, apply the following feedback and generate an improved version:

FEEDBACK TO APPLY:
${feedback}

ORIGINAL DESIGN REQUIREMENTS:
${prompt}
${scaleBlock}

Generate a photorealistic 16:9 image that incorporates the feedback while maintaining the overall booth concept and brand identity. The booth must appear as the correct physical size — not larger.`;

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

Generate a photorealistic 16:9 architectural visualization of this trade show booth. The booth must appear as the correct physical size — not a mega-exhibit.`,
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
