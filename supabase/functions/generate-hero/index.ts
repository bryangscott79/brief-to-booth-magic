import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateHeroRequest {
  prompt: string;
  feedback?: string;
  previousImageUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, feedback, previousImageUrl }: GenerateHeroRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Generating hero image", { hasFeedback: !!feedback, hasPreviousImage: !!previousImageUrl });

    let messages;

    if (previousImageUrl && feedback) {
      // Regenerate with feedback based on previous image
      const refinedPrompt = `Based on this trade show booth image, apply the following feedback and generate an improved version:

FEEDBACK TO APPLY:
${feedback}

ORIGINAL DESIGN REQUIREMENTS:
${prompt}

Generate a photorealistic 16:9 image that incorporates the feedback while maintaining the overall booth concept and brand identity.`;

      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: refinedPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: previousImageUrl,
              },
            },
          ],
        },
      ];
    } else {
      // Initial generation from prompt only
      messages = [
        {
          role: "user",
          content: `${prompt}

Generate a photorealistic 16:9 architectural visualization of this trade show booth.`,
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
