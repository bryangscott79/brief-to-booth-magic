import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CameraMotion =
  | "walkthrough"
  | "flythrough"
  | "rotate"
  | "pan"
  | "zoom"
  | "dolly"
  | "detail_orbit";

interface GenerateVideoRequest {
  sourceImageUrl: string;
  cameraMotion: CameraMotion;
  duration: number; // 4-10 seconds
  sourceAngleName?: string;
  boothSize?: string;
}

/** Map camera motion types to generation prompts */
function getMotionPrompt(motion: CameraMotion, angleName?: string, boothSize?: string): string {
  const sizeContext = boothSize ? ` of a ${boothSize} booth` : "";

  const motionPrompts: Record<CameraMotion, string> = {
    walkthrough: `Slow forward dolly through the booth entrance${sizeContext}. Camera at eye level (5.5 feet), moving steadily forward along the main aisle. Show visitors naturally moving through the space. Smooth, professional camera movement like a Steadicam walkthrough. The camera progresses from the entrance into the interior, revealing zones as it moves deeper into the booth.`,

    flythrough: `Elevated camera sweeping over the booth${sizeContext} from one corner to the opposite corner. Camera starts at approximately 45-degree angle, 15 feet high, slowly sweeping in an arc to reveal the full layout from above. Smooth drone-style movement. Show the complete booth footprint and all zones.`,

    rotate: `Camera orbits around the booth${sizeContext} at 45-degree elevation. Full 360-degree rotation showing all sides. Smooth, steady orbital movement. Camera maintains consistent distance from the booth center. Reveal all four sides of the booth in sequence.`,

    pan: `Horizontal pan across the front face of the booth${sizeContext}. Camera at eye level (5.5 feet), positioned in the aisle, panning smoothly from left to right. Show the full width of the booth frontage. Slow, steady movement revealing signage, displays, and entry points.`,

    zoom: `Slow push-in from a wide establishing shot to a medium close-up of the hero installation${sizeContext}. Camera at eye level, moving forward along the central axis. Start showing the full booth context, end focused on the main centerpiece. Smooth dolly zoom effect.`,

    dolly: `Lateral dolly along the front aisle of the booth${sizeContext}. Camera at eye level (5.5 feet), tracking sideways to reveal depth and dimension. Show parallax between foreground elements and booth interior. Professional studio-quality smooth tracking shot.`,

    detail_orbit: `Tight camera orbit around the hero installation/centerpiece${angleName ? ` (${angleName})` : ""}. Camera at eye level, orbiting in a half-circle around the main feature. Show fine details, materials, and visitor interaction from multiple angles. Slow, intimate movement.`,
  };

  return motionPrompts[motion] || motionPrompts.walkthrough;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceImageUrl, cameraMotion, duration, sourceAngleName, boothSize }: GenerateVideoRequest = await req.json();

    // Input validation
    if (!sourceImageUrl || typeof sourceImageUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "sourceImageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validMotions: CameraMotion[] = ["walkthrough", "flythrough", "rotate", "pan", "zoom", "dolly", "detail_orbit"];
    if (!cameraMotion || !validMotions.includes(cameraMotion)) {
      return new Response(
        JSON.stringify({ error: `Invalid cameraMotion. Must be one of: ${validMotions.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clampedDuration = Math.min(10, Math.max(4, duration || 6));

    // Check for video API key (for direct Runway/Kling/Veo integration)
    const VIDEO_API_KEY = Deno.env.get("VIDEO_API_KEY");
    const VIDEO_API_PROVIDER = Deno.env.get("VIDEO_API_PROVIDER") || "runway"; // runway | kling | veo

    const motionPrompt = getMotionPrompt(cameraMotion, sourceAngleName, boothSize);

    console.log("Generating video", {
      cameraMotion,
      duration: clampedDuration,
      sourceAngleName,
      provider: VIDEO_API_PROVIDER,
      hasDirectApi: !!VIDEO_API_KEY,
    });

    // Strategy: Try direct video API first, fall back to Lovable gateway
    if (VIDEO_API_KEY && VIDEO_API_PROVIDER === "runway") {
      // Direct Runway ML Gen-3 Alpha integration
      const runwayResponse = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VIDEO_API_KEY}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify({
          model: "gen4_turbo",
          promptImage: sourceImageUrl,
          promptText: motionPrompt,
          duration: clampedDuration,
          ratio: "16:9",
        }),
      });

      if (!runwayResponse.ok) {
        const errorText = await runwayResponse.text();
        console.error("Runway API error:", runwayResponse.status, errorText);

        if (runwayResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Video generation rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        throw new Error(`Runway API error: ${runwayResponse.status}`);
      }

      const runwayData = await runwayResponse.json();

      // Runway returns a task ID — we need to poll for completion
      const taskId = runwayData.id;

      if (!taskId) {
        throw new Error("No task ID returned from Runway");
      }

      // Return the task ID for the client to poll
      return new Response(
        JSON.stringify({
          success: true,
          status: "processing",
          taskId,
          provider: "runway",
          message: `Video generation started. Camera motion: ${cameraMotion}, duration: ${clampedDuration}s.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (VIDEO_API_KEY && VIDEO_API_PROVIDER === "kling") {
      // Kling AI integration
      const klingResponse = await fetch("https://api.klingai.com/v1/videos/image2video", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VIDEO_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_name: "kling-v2",
          image: sourceImageUrl,
          prompt: motionPrompt,
          duration: String(clampedDuration),
          aspect_ratio: "16:9",
          mode: "pro",
        }),
      });

      if (!klingResponse.ok) {
        const errorText = await klingResponse.text();
        console.error("Kling API error:", klingResponse.status, errorText);
        throw new Error(`Kling API error: ${klingResponse.status}`);
      }

      const klingData = await klingResponse.json();
      const taskId = klingData.data?.task_id;

      return new Response(
        JSON.stringify({
          success: true,
          status: "processing",
          taskId,
          provider: "kling",
          message: `Video generation started. Camera motion: ${cameraMotion}, duration: ${clampedDuration}s.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: Use Gemini / Veo via ai-gateway
    const result = await callGemini({
      model: "google/veo-2",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Generate a ${clampedDuration}-second video from this trade show booth image.\n\nCAMERA MOTION:\n${motionPrompt}\n\nIMPORTANT:\n- Maintain photorealistic quality throughout\n- Keep booth signage, branding, and materials consistent\n- Include natural visitor movement\n- Professional, cinematic camera work\n- 16:9 aspect ratio\n- Smooth, steady motion — no jitter or sudden movements`,
            },
            {
              type: "image_url",
              image_url: { url: sourceImageUrl },
            },
          ],
        },
      ],
      modalities: ["video"],
    });

    // The response may contain a video URL in text, or video data directly
    const videoUrl = result.text;

    if (!videoUrl || typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
      console.error("No video URL in response:", JSON.stringify(result));
      throw new Error("No video generated — the video API may not be available via this model");
    }

    console.log("Successfully generated video");

    return new Response(
      JSON.stringify({
        success: true,
        status: "complete",
        videoUrl,
        provider: "gemini",
        cameraMotion,
        duration: clampedDuration,
        message: `Video generated successfully. Camera motion: ${cameraMotion}, duration: ${clampedDuration}s.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating video:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate video",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
