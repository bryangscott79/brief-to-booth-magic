import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ElementSummary {
  type: string;
  title?: string;
  feedbackHistory?: string[];
  dataSummary?: string;
}

interface ExtractLearningsRequest {
  clientName: string;
  projectName: string;
  projectType: string;
  boothSize?: string;
  briefSummary: string;
  elements: ElementSummary[];
  feedbackLog: Array<{ elementType: string; feedback: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ExtractLearningsRequest = await req.json();

    if (!body.clientName || !body.briefSummary || !body.elements) {
      return new Response(
        JSON.stringify({ error: "clientName, briefSummary, and elements are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const elementBlock = body.elements
      .map((e) => {
        let s = `- ${e.type}`;
        if (e.title) s += `: "${e.title}"`;
        if (e.dataSummary) s += `\n  Summary: ${e.dataSummary}`;
        return s;
      })
      .join("\n");

    const feedbackBlock =
      body.feedbackLog.length > 0
        ? body.feedbackLog.map((f) => `- [${f.elementType}] ${f.feedback}`).join("\n")
        : "No feedback was given during this project.";

    const systemPrompt = `You are a brand strategy analyst for experiential marketing and exhibit design. Your job is to extract reusable brand intelligence from a completed project.

Analyze the project data and extract 3-8 concise intelligence entries. Each entry must be categorized:

CATEGORIES:
- visual_identity: Colors, logos, typography, graphic style patterns that worked
- strategic_voice: Messaging themes, tone, storytelling approaches that resonated
- vendor_material: Materials, finishes, hardware, fabrication methods that performed well
- process_procedure: Workflow insights, timeline learnings, coordination notes
- cost_benchmark: Budget insights, cost-per-sqft data, material cost comparisons
- past_learning: General design lessons, what to repeat, what to avoid

Return a JSON array of objects with these fields:
- category: one of the above
- title: short descriptive title (3-8 words)
- content: the actionable insight (1-3 sentences)
- tags: array of 1-3 relevant tags

Focus on ACTIONABLE intelligence that will improve future projects for this client. Avoid generic advice.`;

    const userPrompt = `CLIENT: ${body.clientName}
PROJECT: ${body.projectName || "Untitled Project"}
TYPE: ${body.projectType || "trade_show_booth"}
${body.boothSize ? `SIZE: ${body.boothSize}` : ""}

BRIEF SUMMARY:
${body.briefSummary}

GENERATED ELEMENTS:
${elementBlock}

USER FEEDBACK DURING GENERATION:
${feedbackBlock}

Extract reusable brand intelligence entries from this completed project. Return ONLY a JSON array — no markdown fences, no commentary.`;

    console.log("Extracting learnings", {
      client: body.clientName,
      elementCount: body.elements.length,
      feedbackCount: body.feedbackLog.length,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    let entries: Array<{
      category: string;
      title: string;
      content: string;
      tags?: string[];
    }>;

    try {
      entries = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse learnings JSON:", raw);
      throw new Error("AI returned invalid JSON for learnings extraction");
    }

    if (!Array.isArray(entries)) {
      throw new Error("Expected JSON array of learning entries");
    }

    // Validate and sanitize
    const validCategories = new Set([
      "visual_identity",
      "strategic_voice",
      "vendor_material",
      "process_procedure",
      "cost_benchmark",
      "past_learning",
    ]);

    const sanitized = entries
      .filter(
        (e) =>
          typeof e.category === "string" &&
          typeof e.title === "string" &&
          typeof e.content === "string" &&
          validCategories.has(e.category)
      )
      .map((e) => ({
        category: e.category,
        title: e.title.slice(0, 200),
        content: e.content.slice(0, 2000),
        tags: Array.isArray(e.tags) ? e.tags.slice(0, 5) : [],
      }));

    console.log(`Extracted ${sanitized.length} learning entries`);

    return new Response(
      JSON.stringify({ success: true, entries: sanitized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error extracting learnings:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to extract learnings",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
