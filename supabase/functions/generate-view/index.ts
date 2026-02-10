import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateViewRequest {
  referenceImageUrl: string;
  viewPrompt: string;
  viewName: string;
  aspectRatio: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { referenceImageUrl, viewPrompt, viewName, aspectRatio }: GenerateViewRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Generating ${viewName} view with aspect ratio ${aspectRatio}`);

    // Camera direction mapping for strong angle differentiation
    const cameraDirections: Record<string, string> = {
      "3/4 Hero View": "Camera positioned at 45 degrees front-left of the booth, at eye level (5.5 feet), looking toward the booth's center. This is a diagonal perspective showing both the front face and the left side of the booth.",
      "Top-Down View": "Camera positioned directly above the booth looking straight down (bird's eye / plan view). Show the full floor plan layout with all zones visible from overhead. No perspective distortion — orthographic top-down.",
      "Front Elevation": "Camera positioned directly in front of the booth, centered on the main entrance/aisle, at eye level (5.5 feet). The camera faces the booth head-on. Only the front face of the booth is visible — no side walls.",
      "Left Side": "Camera positioned to the LEFT side of the booth, at eye level (5.5 feet), facing the booth's left wall at exactly 90 degrees. The viewer is standing in the left aisle. The front of the booth is to the viewer's right. Only the left side face is prominent.",
      "Right Side": "Camera positioned to the RIGHT side of the booth, at eye level (5.5 feet), facing the booth's right wall at exactly 90 degrees. The viewer is standing in the right aisle. The front of the booth is to the viewer's left. Only the right side face is prominent. This is the OPPOSITE side from the left view.",
      "Back View": "Camera is BEHIND the booth, rotated 180 degrees from the front. The viewer is standing in the BACK aisle looking at the REAR of the booth. The front signage and header with the brand name should NOT be visible — it faces AWAY from the camera. Show the back panels, structural supports, storage areas, electrical access, and service corridors. The back of the booth is typically utilitarian — exposed framework, cable management, staff entry points. DO NOT show the front fascia or main branding header.",
      "Hero Detail": "Camera positioned close to the hero/centerpiece installation, at eye level, showing a medium close-up shot of the main interactive element with surrounding context.",
      "Lounge Detail": "Camera positioned inside or near the lounge/meeting area, at eye level, showing a medium shot of the seating, conversation space, and hospitality zone.",
    };

    // For zone interiors, check if viewName ends with "Interior"
    const isInterior = viewName.endsWith("Interior");
    const cameraDir = cameraDirections[viewName] || (isInterior 
      ? `Camera is INSIDE the booth, positioned at eye level (5.5 feet) within the "${viewName.replace(' Interior', '')}" zone. The camera looks outward from inside this specific zone, showing the zone's interior details, furnishings, screens, and visitors. The hero installation or other zones may be partially visible in the background. This is a CLOSE-UP INTERIOR shot — NOT the same wide exterior angle as the reference image.`
      : `Camera showing the ${viewName} perspective of the booth.`);

    // Build the prompt for image editing/transformation
    const editPrompt = isInterior
      ? `Using this reference image of a trade show booth, generate a NEW image showing an INTERIOR CLOSE-UP perspective from INSIDE the "${viewName.replace(' Interior', '')}" zone.

CAMERA POSITION (CRITICAL — follow exactly):
${cameraDir}

ZONE-SPECIFIC DETAILS:
${viewPrompt}

CRITICAL CONSISTENCY RULES:
- Look at the reference image carefully. Find the "${viewName.replace(' Interior', '')}" zone within it.
- The interior view MUST match exactly how this zone appears in the reference: same wall colors, same screen content style, same furniture, same lighting fixtures.
- Maintain the exact same design language, materials, textures, and brand elements.
- The zone's proportions, layout, and features must match the reference — just shown from an interior close-up camera angle.
- Show 2-4 visitors naturally engaging with the zone's features.

OUTPUT: A photorealistic ${aspectRatio} interior perspective. This must look like a zoomed-in, inside-the-zone view of what's visible in the reference image — NOT a reimagined space.`
      : `Using this reference image of a trade show booth, generate a NEW image showing the SAME booth from a completely DIFFERENT camera angle.

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

OUTPUT: A photorealistic ${aspectRatio} image. The camera angle MUST be distinctly different from the reference image.`;

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
              {
                type: "image_url",
                image_url: {
                  url: referenceImageUrl,
                },
              },
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
