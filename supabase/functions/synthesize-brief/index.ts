import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Reuses the same ParsedBrief tool schema as parse-brief so the downstream
// confirm/review/generation pipeline works identically.
const toolSchema = {
  type: "function",
  function: {
    name: "synthesize_brief",
    description:
      "Synthesize a complete experiential design brief from a Q&A wizard. Fill ALL fields with strategic, specific content — invent reasonable, on-strategy detail where the user did not provide it, but never contradict what they said.",
    parameters: {
      type: "object",
      properties: {
        brand: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            pov: { type: "string" },
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
                  audienceProfile: { type: "string" },
                },
                required: ["name", "location"],
              },
            },
            primaryShow: { type: "string" },
          },
          required: ["shows", "primaryShow"],
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
              properties: { min: { type: "number" }, max: { type: "number" } },
            },
            inclusions: { type: "array", items: { type: "string" } },
            exclusions: { type: "array", items: { type: "string" } },
            efficiencyNotes: { type: "string" },
          },
          required: ["inclusions", "exclusions", "efficiencyNotes"],
        },
        requiredDeliverables: { type: "array", items: { type: "string" } },
        winningCriteria: { type: "array", items: { type: "string" } },
        briefText: {
          type: "string",
          description:
            "A polished, well-written narrative brief (markdown, ~600-1200 words) covering brand, objectives, audience, venue/show, spatial requirements, creative direction, experience pillars, and budget. This is what the team and AI will read as the source-of-truth brief document.",
        },
      },
      required: [
        "brand",
        "objectives",
        "events",
        "spatial",
        "audiences",
        "creative",
        "experience",
        "budget",
        "requiredDeliverables",
        "winningCriteria",
        "briefText",
      ],
    },
  },
};

const SYSTEM_PROMPT = `You are an expert experiential design strategist helping a user craft a complete creative brief from a guided Q&A.

The user answered a set of questions about their project. Your job:
1. Synthesize a fully structured brief in the exact tool-call schema.
2. Write a polished narrative briefText (markdown, 600-1200 words) that reads like a real client brief.
3. Where the user gave only short answers, expand them into strategic, specific, professional language.
4. Where the user skipped a section, infer reasonable defaults from the project type, brand category, venue, and creative direction.
5. NEVER contradict explicit user answers. NEVER invent fake competitor names, fake show names, or fake budget numbers — leave those empty/zero if not provided.
6. The briefText should sound like a strategist wrote it, not a template — confident, specific, action-oriented.

You MUST call the synthesize_brief tool. Return ALL required fields populated.`;

interface WizardAnswers {
  projectName?: string;
  projectType?: string;
  brandName?: string;
  brandCategory?: string;
  brandPersonality?: string;
  brandColors?: string;
  competitors?: string;
  showName?: string;
  venue?: string;
  city?: string;
  dates?: string;
  footprintSize?: string;
  primaryObjective?: string;
  secondaryObjectives?: string;
  audiences?: string;
  creativeDirection?: string;
  moodKeywords?: string;
  avoid?: string;
  heroMoment?: string;
  mustHaves?: string;
  budget?: string;
  timeline?: string;
  successCriteria?: string;
  additionalNotes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const answers: WizardAnswers = body.answers ?? {};

    // Build a structured Q&A prompt
    const lines: string[] = [];
    const push = (label: string, value?: string) => {
      if (value && value.trim()) lines.push(`**${label}:** ${value.trim()}`);
    };

    push("Project name", answers.projectName);
    push("Project type", answers.projectType);
    push("Brand / company", answers.brandName);
    push("Brand category / industry", answers.brandCategory);
    push("Brand personality", answers.brandPersonality);
    push("Brand colors", answers.brandColors);
    push("Competitors", answers.competitors);
    push("Show / event name", answers.showName);
    push("Venue", answers.venue);
    push("City", answers.city);
    push("Dates", answers.dates);
    push("Footprint / size", answers.footprintSize);
    push("Primary objective", answers.primaryObjective);
    push("Secondary objectives", answers.secondaryObjectives);
    push("Target audiences", answers.audiences);
    push("Creative direction", answers.creativeDirection);
    push("Mood / style keywords", answers.moodKeywords);
    push("Avoid", answers.avoid);
    push("Hero moment / signature experience", answers.heroMoment);
    push("Must-have elements", answers.mustHaves);
    push("Budget", answers.budget);
    push("Timeline", answers.timeline);
    push("Success criteria / KPIs", answers.successCriteria);
    push("Additional notes", answers.additionalNotes);

    const userMessage = `Synthesize a complete experiential design brief from these wizard answers:

${lines.join("\n\n")}

Produce the structured brief AND a polished narrative briefText.`;

    const result = await callGemini({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      tools: [toolSchema],
      toolChoice: { type: "function", function: { name: "synthesize_brief" } },
      maxTokens: 8192,
      temperature: 0.7,
    });

    const args = result.toolCalls?.[0]?.arguments;
    if (!args) {
      throw new Error("AI did not return a structured brief");
    }

    const { briefText, ...parsed } = args as Record<string, unknown> & { briefText: string };

    return new Response(
      JSON.stringify({ success: true, data: { parsed, briefText } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("synthesize-brief error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
