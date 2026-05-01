import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildRagContext } from "../_shared/rag-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { parsedBrief, elements, projectName, imageUrls, agency_id, client_id, activation_type_id, project_id } = await req.json();

    if (!parsedBrief || typeof parsedBrief !== "object") {
      return new Response(JSON.stringify({ error: "parsedBrief is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!elements || typeof elements !== "object") {
      return new Response(JSON.stringify({ error: "elements is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    const systemPrompt = `You are a senior presentation strategist for trade show, exhibit, and experiential proposals. Your decks win business — they're persuasive, on-brand, and immediately presentable without cleanup.

OUTPUT: Use the create_presentation tool. Produce 12–16 slides total.

PER-SLIDE FIELDS:
- title: 4–9 words. Strategic, not generic. Avoid "Overview", "Introduction", "Conclusion" as a single word.
- subtitle: One supporting line, ≤ 12 words. No restating the title.
- bodyPoints: 3–5 bullets. EACH bullet ≤ 14 words. Concrete and specific — name actual zones, mechanics, numbers, brand attributes from the project data, not generic platitudes.
- speakerNotes: 2–3 sentences. What the presenter says out loud — narrative, not a bullet recap.
- slideType: One of "title", "section", "content", "twoColumn", "imageFeature", "data", "closing"
- imageAngle: When slideType is "imageFeature" set this to a real angle id from AVAILABLE RENDER IMAGES (e.g. "hero_34", "front", "left"). Omit if no matching render exists.

VOICE:
- Match the brand's tone (read BRAND POV + BRAND PERSONALITY in the data).
- Active voice. Short clauses. No filler ("really", "very", "various", "innovative" — earn the word or cut it).
- No marketing clichés ("game-changer", "world-class", "best-in-class", "leverage", "unlock", "redefine"). Be specific instead.
- No placeholder text ever ("[client]", "TBD", "Lorem ipsum"). If a value is missing in the data, work around it.

VISUAL DENSITY:
- Image-feature slides: keep text minimal (title + subtitle + ≤ 2 bullets).
- Content/data slides: bullets only — no paragraphs.
- Always leave headroom; don't force 5 bullets when 3 are sharper.

STRUCTURE (recommended order — adapt to what's actually in the data):
1. Title (project name, brand, show)
2. The opportunity / brief in one slide
3. Big Idea (the headline insight)
4. Experience framework — design principles or visitor journey
5. Hero installation — what it is, why it matters
6. Spatial strategy with zone breakdown
7. Interactive mechanics + secondary engagements
8. Digital storytelling / content approach (only if data has it)
9. Adjacent activations (only if data has it)
10. Image-feature slides — 2 or 3 — featuring different render angles
11. Human connection / staffing model (only if data has it)
12. Investment + budget logic
13. Closing — clear next steps with ownership

QUALITY BAR:
- A senior creative director should be able to present this deck cold without rewriting.
- A new hire should learn what the project IS by reading just the slide titles.
- No two slides should have the same headline pattern — vary structure ("How we'll…", "Why this works…", a noun phrase, a question).`;

    // ── RAG: Retrieve knowledge base context ──
    let ragContext: { formatted: string; chunks: any[]; byScope?: any } = { formatted: "", chunks: [] };
    if (agency_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const ragQuery = [
        `Pitch deck for ${projectName || brand.name || "project"}`,
        brand.name,
        brand.category,
        objectives.primary,
        elements.bigIdea?.data?.headline,
        elements.bigIdea?.data?.subheadline,
      ].filter(Boolean).join(" — ").slice(0, 4000);
      ragContext = await buildRagContext(supabase, {
        query: ragQuery,
        agencyId: agency_id,
        clientId: client_id,
        activationTypeId: activation_type_id,
        projectId: project_id,
      });
      if (ragContext.chunks.length > 0) {
        console.log(`[generate-presentation] RAG: ${ragContext.chunks.length} chunks from scopes: ${Object.entries(ragContext.byScope || {}).filter(([, v]: any) => (v as any[]).length).map(([k, v]: any) => `${k}(${(v as any[]).length})`).join(", ")}`);
      }
    }

    const finalSystemPrompt = ragContext.formatted
      ? `${systemPrompt}\n\n${ragContext.formatted}`
      : systemPrompt;

    const aiResult = await callAnthropic({
      system: finalSystemPrompt,
      messages: [
        { role: "user", content: `Create a presentation deck for this project:\n\n${dataSummary}` },
      ],
      tools: [
        {
          name: "create_presentation",
          description: "Create a structured presentation deck",
          input_schema: {
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
                },
              },
            },
            required: ["slides"],
          },
        },
      ],
      toolChoice: { type: "tool", name: "create_presentation" },
      maxTokens: 8192,
    });

    const presentation = aiResult.toolCalls?.[0]?.arguments ?? null;
    const slides = presentation?.slides;

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      console.error("Failed to extract slides from Anthropic response. Text:", aiResult.text?.substring(0, 500));
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
