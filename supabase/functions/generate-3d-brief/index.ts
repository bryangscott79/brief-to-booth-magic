import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGemini } from "../_shared/ai-gateway.ts";
import { buildRagContext } from "../_shared/rag-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      parsedBrief,
      spatialStrategy,
      renderPrompts,
      imageUrls,
      boothSize,
      agency_id,
      client_id,
      activation_type_id,
      project_id,
    } = await req.json();

    if (!parsedBrief || typeof parsedBrief !== "object") {
      return new Response(JSON.stringify({ error: "parsedBrief is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!spatialStrategy || typeof spatialStrategy !== "object") {
      return new Response(JSON.stringify({ error: "spatialStrategy is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── RAG: pull materials/fabrication knowledge from KB ─────────────────
    let ragBlock = "";
    if (agency_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const query = [
          "3D modeling brief, fabrication specs, material finishes, layer structure",
          parsedBrief?.brand?.name,
          boothSize,
          spatialStrategy?.zones?.map((z: any) => z.name).join(", "),
        ].filter(Boolean).join(" — ");

        const ragContext = await buildRagContext(supabase, {
          query,
          agencyId: agency_id,
          clientId: client_id,
          activationTypeId: activation_type_id,
          projectId: project_id,
          topK: 6,
        });
        if (ragContext.chunks.length > 0) {
          console.log(`[generate-3d-brief] RAG: ${ragContext.chunks.length} chunks`);
          ragBlock = `\n\n${ragContext.formatted}`;
        }
      } catch (e) {
        console.warn("[generate-3d-brief] RAG retrieval failed:", e);
      }
    }

    const prompt = `You are a 3D modeling consultant specializing in trade show booth design. Based on the following project data, generate two outputs:

1. MESHY.AI-READY PROMPTS: For each rendered view image, create an optimized text prompt for Meshy.ai's image-to-3D pipeline. Include style tokens, material descriptions, and scale references.

2. MODELING BRIEF: A comprehensive document for a 3D artist working in Rhino/SketchUp/3ds Max. Include dimensions, material specifications, layer structure, and construction notes.

PROJECT BRIEF:
${JSON.stringify(parsedBrief, null, 2)}

SPATIAL STRATEGY:
${JSON.stringify(spatialStrategy, null, 2)}

RENDER PROMPTS USED:
${JSON.stringify(renderPrompts, null, 2)}

BOOTH SIZE: ${boothSize || "30x30"}

AVAILABLE VIEW IMAGES: ${JSON.stringify(imageUrls || [])}${ragBlock}`;

    const result = await callGemini({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a 3D modeling and fabrication consultant. Return structured JSON only. When the prompt contains RETRIEVED KNOWLEDGE BASE CONTEXT, give material/finish/layer guidance grounded in those references." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "modeling_brief",
            description: "Return Meshy.ai prompts and a 3D modeling brief",
            parameters: {
              type: "object",
              properties: {
                meshyPrompts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      viewName: { type: "string" },
                      prompt: { type: "string" },
                      styleTokens: { type: "string" },
                      materialHints: { type: "string" },
                    },
                    required: ["viewName", "prompt", "styleTokens", "materialHints"],
                    additionalProperties: false,
                  },
                },
                modelingBrief: {
                  type: "object",
                  properties: {
                    overallDimensions: { type: "string" },
                    layerStructure: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          layerName: { type: "string" },
                          color: { type: "string" },
                          contents: { type: "string" },
                        },
                        required: ["layerName", "color", "contents"],
                        additionalProperties: false,
                      },
                    },
                    materials: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          application: { type: "string" },
                          finish: { type: "string" },
                          rhinoMaterial: { type: "string" },
                        },
                        required: ["name", "application", "finish", "rhinoMaterial"],
                        additionalProperties: false,
                      },
                    },
                    constructionNotes: { type: "string" },
                    scaleReference: { type: "string" },
                  },
                  required: ["overallDimensions", "layerStructure", "materials", "constructionNotes", "scaleReference"],
                  additionalProperties: false,
                },
              },
              required: ["meshyPrompts", "modelingBrief"],
              additionalProperties: false,
            },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "modeling_brief" } },
    });

    const brief = result.toolCalls?.[0]?.arguments ?? null;

    return new Response(JSON.stringify({ brief }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-3d-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
