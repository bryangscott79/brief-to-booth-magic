import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARSE_SYSTEM_PROMPT = `You are an expert trade show brief analyst. Given raw brief text, extract structured data into the exact schema provided via the tool call.

Rules:
- Extract ONLY what is explicitly stated or clearly implied in the brief text.
- Do NOT invent, fabricate, or assume data that isn't in the document.
- If a field cannot be determined from the brief, use reasonable defaults clearly marked (e.g. empty arrays, generic descriptions).
- For budget: extract actual numbers mentioned. If no budget is mentioned, omit or use null.
- For audiences: infer from the brief's target market, meeting requirements, and engagement descriptions.
- For events/shows: extract the exact show name, location, and dates mentioned.
- For brand: use the actual company name and industry from the document.
- Be precise with spatial dimensions — extract exact booth sizes mentioned.
- For creative direction: derive from the brief's theme, design language, and stated preferences.

You MUST call the provided function tool to return your response.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { briefText } = await req.json();

    if (!briefText || typeof briefText !== "string" || briefText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Brief text is too short or missing." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const toolSchema = {
      type: "function",
      function: {
        name: "parse_brief",
        description: "Parse a trade show brief into structured data",
        parameters: {
          type: "object",
          properties: {
            brand: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string" },
                pov: { type: "string", description: "Brand point of view or tagline" },
                personality: { type: "array", items: { type: "string" } },
                competitors: { type: "array", items: { type: "string" } },
                visualIdentity: {
                  type: "object",
                  properties: {
                    colors: { type: "array", items: { type: "string" } },
                    avoidColors: { type: "array", items: { type: "string" } },
                    avoidImagery: { type: "array", items: { type: "string" } },
                  },
                  required: ["colors", "avoidColors", "avoidImagery"],
                },
              },
              required: ["name", "category", "pov", "personality", "competitors", "visualIdentity"],
            },
            objectives: {
              type: "object",
              properties: {
                primary: { type: "string" },
                secondary: { type: "array", items: { type: "string" } },
                competitiveContext: { type: "string" },
                differentiationGoals: { type: "array", items: { type: "string" } },
              },
              required: ["primary", "secondary", "competitiveContext", "differentiationGoals"],
            },
            events: {
              type: "object",
              properties: {
                shows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      location: { type: "string" },
                      dates: { type: "string" },
                    },
                    required: ["name", "location"],
                  },
                },
                primaryShow: { type: "string" },
              },
              required: ["shows"],
            },
            spatial: {
              type: "object",
              properties: {
                footprints: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      size: { type: "string" },
                      sqft: { type: "number" },
                      priority: { type: "string", enum: ["primary", "secondary", "tertiary"] },
                    },
                    required: ["size", "sqft", "priority"],
                  },
                },
                modular: { type: "boolean" },
                reuseRequirement: { type: "string" },
                trafficRequirements: { type: "string" },
              },
              required: ["footprints", "modular", "reuseRequirement", "trafficRequirements"],
            },
            audiences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "number" },
                  characteristics: { type: "array", items: { type: "string" } },
                  engagementNeeds: { type: "string" },
                },
                required: ["name", "description", "priority", "characteristics", "engagementNeeds"],
              },
            },
            creative: {
              type: "object",
              properties: {
                avoid: { type: "array", items: { type: "string" } },
                embrace: { type: "array", items: { type: "string" } },
                coreStrategy: { type: "string" },
                thinkingFramework: { type: "array", items: { type: "string" } },
                designPhilosophy: { type: "string" },
              },
              required: ["avoid", "embrace", "coreStrategy", "thinkingFramework", "designPhilosophy"],
            },
            experience: {
              type: "object",
              properties: {
                hero: {
                  type: "object",
                  properties: {
                    required: { type: "boolean" },
                    description: { type: "string" },
                    attributes: { type: "array", items: { type: "string" } },
                  },
                  required: ["required", "description", "attributes"],
                },
                storytelling: {
                  type: "object",
                  properties: {
                    required: { type: "boolean" },
                    description: { type: "string" },
                    audienceAdaptation: { type: "boolean" },
                  },
                  required: ["required", "description", "audienceAdaptation"],
                },
                humanConnection: {
                  type: "object",
                  properties: {
                    required: { type: "boolean" },
                    capacity: { type: "string" },
                    integrationRequirement: { type: "string" },
                  },
                  required: ["required", "capacity", "integrationRequirement"],
                },
                adjacentActivations: {
                  type: "object",
                  properties: {
                    required: { type: "boolean" },
                    count: { type: "string" },
                    criteria: { type: "array", items: { type: "string" } },
                  },
                  required: ["required", "count", "criteria"],
                },
              },
              required: ["hero", "storytelling", "humanConnection", "adjacentActivations"],
            },
            budget: {
              type: "object",
              properties: {
                perShow: { type: "number" },
                range: {
                  type: "object",
                  properties: {
                    min: { type: "number" },
                    max: { type: "number" },
                  },
                },
                inclusions: { type: "array", items: { type: "string" } },
                exclusions: { type: "array", items: { type: "string" } },
                efficiencyNotes: { type: "string" },
              },
              required: ["inclusions", "exclusions", "efficiencyNotes"],
            },
            requiredDeliverables: { type: "array", items: { type: "string" } },
            winningCriteria: { type: "array", items: { type: "string" } },
          },
          required: [
            "brand", "objectives", "events", "spatial", "audiences",
            "creative", "experience", "budget", "requiredDeliverables", "winningCriteria",
          ],
        },
      },
    };

    console.log("Parsing brief, text length:", briefText.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PARSE_SYSTEM_PROMPT },
          { role: "user", content: `Parse the following brief document into structured data. Extract ONLY information present in the document.\n\n--- BRIEF TEXT ---\n${briefText}\n--- END BRIEF TEXT ---` },
        ],
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: "parse_brief" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ data: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to extract JSON from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
      try {
        const parsed = JSON.parse(jsonStr);
        return new Response(JSON.stringify({ data: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("Failed to parse AI content as JSON:", content.substring(0, 200));
      }
    }

    return new Response(
      JSON.stringify({ error: "AI returned empty response. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-brief error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
