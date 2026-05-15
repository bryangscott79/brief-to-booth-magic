// analyze-existing-space — vision-model pass over an uploaded photo
// of an existing space. Returns structured analysis the
// BriefExistingSpace card surfaces (and lets the user edit).
//
// Called once per photo upload from the BriefExistingSpace card.
// Re-runs cleanly on re-upload — the client replaces the analysis
// block wholesale.
//
// Strategy: Gemini 2.5 Pro via the existing ai-gateway, with the
// model instructed to return JSON-only output matching the
// analysis shape. We parse the JSON from result.text. (Future:
// switch to Gemini's responseSchema if/when reliability becomes a
// concern — for now prompting works fine and avoids expanding the
// gateway surface.)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzeRequest {
  photoUrl: string;
}

const SYSTEM_PROMPT = `You are analyzing a photo of an interior space for a redesign brief.

Extract structured information about the EXISTING space (what's already there, not what the user wants).

Be conservative. Only report what you can confidently see in the photo. Use null/empty for fields you can't determine — the user will fill in gaps via the brief.

Pay attention to:
- Approximate dimensions in FEET (estimate from human-scale objects, door heights ~6'8", typical ceiling clearances). Width × depth × ceiling height.
- Architectural features that should be preserved or referenced: windows, fireplaces, exposed beams, built-ins, mouldings.
- Existing materials on floors, walls, ceiling, trim.
- Lighting: natural-light direction, existing fixtures, time of day inferred.
- A one-sentence summary suitable for a designer's brief.

Return ONLY a JSON object matching this exact shape. NO markdown fences, NO prose, NO explanation — just the JSON.

{
  "estimatedDimensions": { "width": number, "depth": number, "ceilingHeightFt": number } | null,
  "features": string[],
  "existingMaterials": {
    "floors": string | null,
    "walls": string | null,
    "ceiling": string | null,
    "trim": string | null
  },
  "lighting": {
    "naturalLightDirection": "north" | "south" | "east" | "west" | "skylight" | "none" | null,
    "existingFixtures": string[],
    "timeOfDayInferred": "morning" | "midday" | "evening" | "night" | "controlled" | null
  },
  "summary": string | null
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: AnalyzeRequest = await req.json();
    if (!body.photoUrl || typeof body.photoUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "photoUrl is required (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await callGemini({
      // deno-lint-ignore no-explicit-any
      model: "google/gemini-2.5-pro" as any,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          // deno-lint-ignore no-explicit-any
          content: [
            { type: "text", text: "Analyze this existing space and return the JSON object per the system prompt's schema." },
            { type: "image_url", image_url: { url: body.photoUrl } },
          ] as any,
        },
      ],
      usage: await buildUsageContext(req, "analyze-existing-space").catch(() => undefined),
    });

    // The model is instructed to return JSON only, but defensively
    // strip markdown fences in case it disobeys.
    let raw = (result.text ?? "").trim();
    if (raw.startsWith("```")) {
      // Strip the ```json ... ``` fence if present.
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(raw);
    } catch (e) {
      console.error("[analyze-existing-space] failed to parse model output:", e, "raw:", raw.slice(0, 500));
      throw new Error("Vision model returned unparseable JSON. Try regenerating.");
    }

    // Coerce nulls back to undefined for the optional fields so the
    // client can spread the response directly into the brief without
    // any nullable handling. Also defensively coerce the required
    // array/object fields to safe defaults if the model returned
    // null or wrong-typed values.
    const a = (analysis ?? {}) as Record<string, unknown>;
    const clean = {
      estimatedDimensions: a.estimatedDimensions ?? undefined,
      features: Array.isArray(a.features) ? a.features.map(String) : [],
      existingMaterials: (a.existingMaterials && typeof a.existingMaterials === "object")
        ? a.existingMaterials
        : {},
      lighting: (a.lighting && typeof a.lighting === "object") ? a.lighting : {},
      summary: typeof a.summary === "string" ? a.summary : undefined,
    };

    return new Response(JSON.stringify({ success: true, analysis: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[analyze-existing-space] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Failed to analyze photo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
