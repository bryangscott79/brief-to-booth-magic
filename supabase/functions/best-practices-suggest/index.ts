// best-practices-suggest — Phase E Claude skill
//
// When a new brief is parsed or a new project is created, pull past projects
// from the same agency matching the activation type and/or client, and ask
// Claude to synthesize applicable best practices + gotchas from prior work.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUGGEST_TOOL = {
  name: "synthesize_best_practices",
  description: "Synthesize best practices, common pitfalls, and actionable suggestions from past projects for a new activation.",
  input_schema: {
    type: "object",
    properties: {
      best_practices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string", description: "Why this matters and how to apply it." },
            cited_projects: { type: "array", items: { type: "string" } },
          },
          required: ["title", "detail"],
        },
      },
      pitfalls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            cited_projects: { type: "array", items: { type: "string" } },
          },
          required: ["title", "detail"],
        },
      },
      suggested_specs: {
        type: "object",
        properties: {
          typical_sqft: { type: "string" },
          typical_budget_range: { type: "string" },
          must_haves: { type: "array", items: { type: "string" } },
        },
      },
    },
    required: ["best_practices", "pitfalls"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agency_id, activation_type, client_id, brief_text } = await req.json();
    if (!agency_id) throw new Error("agency_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch up to 20 past projects matching filters
    let query = supabase
      .from("projects")
      .select("id, project_title, client_name, activation_type, show_name, venue, booth_size, booth_style, description, footprint_sqft, status")
      .eq("agency_id", agency_id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (activation_type) query = query.eq("activation_type", activation_type);
    if (client_id) query = query.eq("client_id", client_id);

    const { data: pastProjects, error: projErr } = await query;
    if (projErr) throw projErr;

    if (!pastProjects || pastProjects.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          best_practices: [],
          pitfalls: [],
          note: "No past projects matched — no best practices to synthesize.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const projectSummaries = pastProjects
      .map(
        (p) =>
          `- [${p.project_title}] Client: ${p.client_name}, Activation: ${p.activation_type || "n/a"}, Show: ${p.show_name}, Venue: ${p.venue}, Booth: ${p.booth_size} ${p.booth_style}, Sqft: ${p.footprint_sqft || "n/a"}, Status: ${p.status}\n  ${(p.description || "").slice(0, 300)}`,
      )
      .join("\n\n");

    const briefContext = brief_text
      ? `\n\nNEW BRIEF CONTEXT:\n${brief_text.slice(0, 6000)}`
      : "";

    const result = await callAnthropic({
      system: "You are a senior experiential marketing strategist. Synthesize actionable best practices and pitfalls from past agency work. Be specific. Cite which past projects support each point.",
      messages: [
        {
          role: "user",
          content: `PAST PROJECTS (from this agency):\n\n${projectSummaries}${briefContext}\n\n${activation_type ? `Focus on best practices for activation type: ${activation_type}.` : "Focus on cross-cutting best practices."} Synthesize what has worked and what to avoid.`,
        },
      ],
      tools: [SUGGEST_TOOL],
      toolChoice: { type: "tool", name: "synthesize_best_practices" },
      maxTokens: 4096,
      temperature: 0.3,
    });

    const parsed = result.toolCalls?.[0]?.arguments;
    if (!parsed) throw new Error("Claude returned no tool call");

    return new Response(
      JSON.stringify({ success: true, ...parsed, past_project_count: pastProjects.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[best-practices-suggest]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
