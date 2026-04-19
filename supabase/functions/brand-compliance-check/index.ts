// brand-compliance-check — Phase E Claude skill
//
// Takes a proposed design description (or element prompt) and checks it
// against the client's brand_guidelines + activation_type must_have/must_avoid.
// Returns a structured compliance report with pass/warn/fail verdicts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMPLIANCE_TOOL = {
  name: "brand_compliance_report",
  description: "Produce a compliance report that scores a proposed design description against brand guidelines and activation-type requirements.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["pass", "warn", "fail"],
        description: "Overall verdict.",
      },
      score: { type: "number", description: "0-100 compliance score." },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            rule: { type: "string", description: "Rule being checked (e.g. 'primary color usage')." },
            status: { type: "string", enum: ["pass", "warn", "fail"] },
            evidence: { type: "string", description: "Short citation from the proposed design." },
            suggestion: { type: "string", description: "If not passing, what should change." },
          },
          required: ["rule", "status", "evidence"],
        },
      },
      must_have_coverage: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string" },
            present: { type: "boolean" },
          },
          required: ["requirement", "present"],
        },
      },
      must_avoid_violations: {
        type: "array",
        items: { type: "string" },
        description: "Specific must-avoid items that the design violates.",
      },
    },
    required: ["verdict", "score", "checks"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { design_description, client_id, activation_type_id } = await req.json();
    if (!design_description) throw new Error("design_description is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gather brand guidelines (if client)
    let brandContext = "";
    if (client_id) {
      const { data: guide } = await supabase
        .from("brand_guidelines")
        .select("color_system, typography, logo_rules, tone_of_voice, materials_finishes, photography_style")
        .eq("client_id", client_id)
        .maybeSingle();
      if (guide) {
        brandContext = `BRAND GUIDELINES:\n${JSON.stringify(guide, null, 2)}\n\n`;
      }

      const { data: intel } = await supabase
        .from("brand_intelligence")
        .select("category, key, value")
        .eq("client_id", client_id as any) // client_id column may not exist; keep as-is
        .limit(40);
      if (intel && intel.length > 0) {
        brandContext += `BRAND INTELLIGENCE BITS:\n${intel.map((i: any) => `- [${i.category}] ${i.key}: ${i.value}`).join("\n")}\n\n`;
      }
    }

    // Gather activation type template
    let activationContext = "";
    if (activation_type_id) {
      const { data: at } = await supabase
        .from("activation_types")
        .select("label, slug, description, default_scale, default_sqft, element_emphasis")
        .eq("id", activation_type_id)
        .maybeSingle();
      if (at) {
        activationContext = `ACTIVATION TYPE: ${at.label} (${at.slug})\n`;
        if (at.description) activationContext += `Description: ${at.description}\n`;
        if (at.element_emphasis) activationContext += `Requirements/Emphasis:\n${JSON.stringify(at.element_emphasis, null, 2)}\n`;
        activationContext += "\n";
      }
    }

    if (!brandContext && !activationContext) {
      return new Response(
        JSON.stringify({
          success: true,
          verdict: "pass",
          score: 100,
          checks: [],
          note: "No brand guidelines or activation-type requirements provided; skipped compliance check.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await callAnthropic({
      system: "You are a brand compliance auditor for trade show / experiential marketing activations. You review proposed designs against brand guidelines and activation-type requirements. Be strict but fair, and quote specific evidence from the proposed design.",
      messages: [
        {
          role: "user",
          content: `${brandContext}${activationContext}PROPOSED DESIGN:\n${design_description}\n\nAudit this design for brand + activation-type compliance.`,
        },
      ],
      tools: [COMPLIANCE_TOOL],
      toolChoice: { type: "tool", name: "brand_compliance_report" },
      maxTokens: 4096,
      temperature: 0.1,
    });

    const parsed = result.toolCalls?.[0]?.arguments;
    if (!parsed) throw new Error("Claude returned no tool call");

    return new Response(
      JSON.stringify({ success: true, ...parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[brand-compliance-check]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
