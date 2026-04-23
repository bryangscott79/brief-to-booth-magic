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
      budgetLogic,
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

    // ─── RAG: pull cost benchmarks, vendor pricing, materials specs ────────
    let ragBlock = "";
    if (agency_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const query = [
          "trade show booth materials list, vendor pricing, cost benchmarks, fabrication estimate",
          parsedBrief?.brand?.name,
          boothSize,
          parsedBrief?.show?.name,
        ].filter(Boolean).join(" — ");

        const ragContext = await buildRagContext(supabase, {
          query,
          agencyId: agency_id,
          clientId: client_id,
          activationTypeId: activation_type_id,
          projectId: project_id,
          topK: 8,
        });
        if (ragContext.chunks.length > 0) {
          console.log(`[generate-materials] RAG: ${ragContext.chunks.length} chunks`);
          ragBlock = `\n\n${ragContext.formatted}`;
        }
      } catch (e) {
        console.warn("[generate-materials] RAG retrieval failed:", e);
      }
    }

    const prompt = `You are a trade show booth construction estimator. Based on the following project data, generate a comprehensive materials list with estimated costs.

PROJECT BRIEF:
${JSON.stringify(parsedBrief, null, 2)}

SPATIAL STRATEGY:
${JSON.stringify(spatialStrategy, null, 2)}

BUDGET DATA:
${JSON.stringify(budgetLogic, null, 2)}

BOOTH SIZE: ${boothSize || "30x30"}

Generate a detailed materials list organized by category. For each item include: name, description, quantity, unit, estimated unit cost (USD), and estimated total cost.

Categories should include:
- Structure & Framework (aluminum extrusion, rigging, flooring)
- Walls & Surfaces (panels, graphics, laminates)
- Lighting (LED strips, spots, programmable fixtures)
- Technology (screens, interactive hardware, AV equipment)
- Furniture (counters, seating, meeting tables)
- Graphics & Signage (printed graphics, dimensional logos, wayfinding)
- Electrical & Infrastructure (power distribution, data, HVAC)
- Finishing & Accessories (carpet, plants, accessories)

Be realistic with trade show industry pricing. When the prompt includes RETRIEVED KNOWLEDGE BASE CONTEXT with vendor quotes, historical bids, or cost benchmarks, prefer those numbers over generic estimates.${ragBlock}`;

    const result = await callGemini({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a trade show booth construction cost estimator. Return structured JSON only. Ground unit costs in any retrieved vendor / historical pricing context when available." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "materials_list",
            description: "Return a structured materials list with costs",
            parameters: {
              type: "object",
              properties: {
                categories: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                            quantity: { type: "number" },
                            unit: { type: "string" },
                            unitCost: { type: "number" },
                            totalCost: { type: "number" },
                          },
                          required: ["name", "description", "quantity", "unit", "unitCost", "totalCost"],
                          additionalProperties: false,
                        },
                      },
                      subtotal: { type: "number" },
                    },
                    required: ["name", "items", "subtotal"],
                    additionalProperties: false,
                  },
                },
                grandTotal: { type: "number" },
                notes: { type: "string" },
              },
              required: ["categories", "grandTotal", "notes"],
              additionalProperties: false,
            },
          },
        },
      ],
      toolChoice: { type: "function", function: { name: "materials_list" } },
    });
    const materials = result.toolCalls?.[0]?.arguments ?? null;

    return new Response(JSON.stringify({ materials }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-materials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
