import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { parsedBrief, elements, projectName, imageUrls } = await req.json();

    if (!parsedBrief || typeof parsedBrief !== "object") {
      return new Response(JSON.stringify({ error: "parsedBrief is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!elements || typeof elements !== "object") {
      return new Response(JSON.stringify({ error: "elements is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const brand = parsedBrief?.brand || {};
    const objectives = parsedBrief?.objectives || {};
    const spatial = parsedBrief?.spatial || {};
    const budget = parsedBrief?.budget || {};
    const audiences = parsedBrief?.audiences || [];

    // Build a comprehensive data summary for the AI
    const dataSummary = `
PROJECT: ${projectName || brand.name || "Untitled Project"}
BRAND: ${brand.name} — ${brand.category}
BRAND POV: ${brand.pov}
BRAND PERSONALITY: ${(brand.personality || []).join(", ")}
COLORS: ${(brand.visualIdentity?.colors || []).join(", ")}

PRIMARY OBJECTIVE: ${objectives.primary}
SECONDARY OBJECTIVES: ${(objectives.secondary || []).join("; ")}
DIFFERENTIATION: ${(objectives.differentiationGoals || []).join("; ")}

EVENTS: ${(parsedBrief?.events?.shows || []).map((s: any) => `${s.name} (${s.location})`).join(", ")}
BOOTH SIZE: ${spatial.footprints?.[0]?.size || "TBD"} (${spatial.footprints?.[0]?.sqft || "TBD"} sqft)

TARGET AUDIENCES:
${audiences.map((a: any) => `- ${a.name}: ${a.description} (Priority: ${a.priority})`).join("\n")}

BUDGET: ${budget.perShow ? `$${budget.perShow.toLocaleString()} per show` : budget.range ? `$${budget.range.min.toLocaleString()} - $${budget.range.max.toLocaleString()}` : "TBD"}

--- STRATEGIC ELEMENTS ---

BIG IDEA: ${elements.bigIdea?.data ? `${elements.bigIdea.data.headline} — ${elements.bigIdea.data.subheadline}\n${elements.bigIdea.data.narrative}\nStrategic Position: ${elements.bigIdea.data.strategicPosition}\nDifferentiation: ${elements.bigIdea.data.differentiation}` : "Not generated"}

EXPERIENCE FRAMEWORK: ${elements.experienceFramework?.data ? `${elements.experienceFramework.data.conceptDescription}\nDesign Principles: ${(elements.experienceFramework.data.designPrinciples || []).map((p: any) => `${p.name}: ${p.description}`).join("; ")}\nVisitor Journey: ${(elements.experienceFramework.data.visitorJourney || []).map((s: any) => `${s.stage}: ${s.description}`).join(" → ")}` : "Not generated"}

INTERACTIVE MECHANICS: ${elements.interactiveMechanics?.data ? `Hero: ${elements.interactiveMechanics.data.hero?.name} — ${elements.interactiveMechanics.data.hero?.concept}\nPhysical Form: ${elements.interactiveMechanics.data.hero?.physicalForm?.structure}\nSecondary: ${(elements.interactiveMechanics.data.secondary || []).map((s: any) => s.name).join(", ")}` : "Not generated"}

DIGITAL STORYTELLING: ${elements.digitalStorytelling?.data ? `Philosophy: ${elements.digitalStorytelling.data.philosophy}\nTracks: ${(elements.digitalStorytelling.data.audienceTracks || []).map((t: any) => `${t.trackName} (${t.targetAudience})`).join(", ")}` : "Not generated"}

HUMAN CONNECTION: ${elements.humanConnection?.data ? `Zones: ${(elements.humanConnection.data.configs?.[0]?.zones || []).map((z: any) => `${z.name} (${z.capacity}): ${z.description}`).join("; ")}` : "Not generated"}

ADJACENT ACTIVATIONS: ${elements.adjacentActivations?.data ? `${(elements.adjacentActivations.data.activations || []).map((a: any) => `${a.name} (${a.type}): ${a.format}`).join("; ")}` : "Not generated"}

SPATIAL STRATEGY: ${elements.spatialStrategy?.data ? `Zones: ${(elements.spatialStrategy.data.configs?.[0]?.zones || []).map((z: any) => `${z.name}: ${z.sqft}sqft (${z.percentage}%)`).join(", ")}\nMaterials: ${(elements.spatialStrategy.data.materialsAndMood || []).map((m: any) => `${m.material}: ${m.use}`).join("; ")}` : "Not generated"}

BUDGET LOGIC: ${elements.budgetLogic?.data ? `Total: $${elements.budgetLogic.data.totalPerShow?.toLocaleString()}\nAllocation: ${(elements.budgetLogic.data.allocation || []).map((a: any) => `${a.category}: ${a.percentage}% ($${a.amount?.toLocaleString()})`).join(", ")}\nRisk Factors: ${(elements.budgetLogic.data.riskFactors || []).map((r: any) => `${r.factor} (${r.level})`).join(", ")}` : "Not generated"}

AVAILABLE RENDER IMAGES: ${(imageUrls || []).map((i: any) => i.angle).join(", ")}
`;

    const systemPrompt = `You are a presentation strategist for trade show booth proposals. Given project data, create a compelling slide deck structure.

Return a JSON object using the tool provided. Create 12-18 slides that tell a compelling story. Each slide should have:
- title: Bold, strategic headline
- subtitle: Supporting context line
- bodyPoints: 3-5 bullet points (concise, impactful)
- speakerNotes: What the presenter should say (2-3 sentences)
- slideType: One of "title", "section", "content", "twoColumn", "imageFeature", "data", "closing"
- imageAngle: (optional) which render image to feature on this slide (e.g. "hero_34", "front", "left", etc.)

Structure the presentation as:
1. Title slide with project name and brand
2. Brief overview / challenge
3. Big Idea reveal
4. Experience Framework (1-2 slides)
5. Hero Installation / Interactive Mechanics
6. Digital Storytelling approach
7. Human Connection zones
8. Adjacent Activations
9. Spatial Strategy with floor plan context
10. Budget overview
11. Render showcase (2-3 slides featuring different angles)
12. Summary / next steps

Make it persuasive and strategic — this is a pitch deck for creative services.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a presentation deck for this project:\n\n${dataSummary}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_presentation",
              description: "Create a structured presentation deck",
              parameters: {
                type: "object",
                properties: {
                  slides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        subtitle: { type: "string" },
                        bodyPoints: { type: "array", items: { type: "string" } },
                        speakerNotes: { type: "string" },
                        slideType: { type: "string", enum: ["title", "section", "content", "twoColumn", "imageFeature", "data", "closing"] },
                        imageAngle: { type: "string" },
                      },
                      required: ["title", "subtitle", "bodyPoints", "speakerNotes", "slideType"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["slides"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_presentation" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted — please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI generation failed");
    }

    const aiData = await response.json();
    console.log("AI response structure:", JSON.stringify({
      hasChoices: !!aiData.choices,
      hasToolCalls: !!aiData.choices?.[0]?.message?.tool_calls,
      contentPreview: (aiData.choices?.[0]?.message?.content || "").substring(0, 200),
      finishReason: aiData.choices?.[0]?.finish_reason,
    }));

    let slides;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = typeof toolCall.function.arguments === "string"
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function.arguments);
      const parsed = JSON.parse(args);
      slides = parsed.slides;
    }

    if (!slides) {
      // Fallback: try parsing content as JSON
      const content = aiData.choices?.[0]?.message?.content || "";
      // Try direct JSON parse first
      try {
        const parsed = JSON.parse(content);
        slides = parsed.slides || (Array.isArray(parsed) ? parsed : null);
      } catch {
        // Try extracting from markdown code block
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1]);
          slides = parsed.slides || (Array.isArray(parsed) ? parsed : null);
        }
        // Try finding a JSON array directly
        if (!slides) {
          const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (arrayMatch) {
            slides = JSON.parse(arrayMatch[0]);
          }
        }
      }
    }

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      console.error("Failed to extract slides. Raw content:", aiData.choices?.[0]?.message?.content?.substring(0, 500));
      throw new Error("Could not parse AI response into slides");
    }

    return new Response(JSON.stringify({ slides }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-presentation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
