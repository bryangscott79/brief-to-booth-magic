import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { parsedBrief, spatialStrategy, budgetLogic, boothSize } = await req.json();

    if (!parsedBrief || typeof parsedBrief !== "object") {
      return new Response(JSON.stringify({ error: "parsedBrief is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!spatialStrategy || typeof spatialStrategy !== "object") {
      return new Response(JSON.stringify({ error: "spatialStrategy is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

Be realistic with trade show industry pricing.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a trade show booth construction cost estimator. Return structured JSON only." },
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
        tool_choice: { type: "function", function: { name: "materials_list" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const materials = toolCall ? JSON.parse(toolCall.function.arguments) : null;

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
