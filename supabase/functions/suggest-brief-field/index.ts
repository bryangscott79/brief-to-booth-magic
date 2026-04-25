import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert experiential design strategist helping a user fill out a brief.
Given the question they're answering and what they've already shared about the project, suggest a concise, specific, on-strategy answer they can edit.

Rules:
- 1-3 short sentences OR a comma-separated list, depending on the field.
- Specific, professional language — never generic filler.
- Build on prior answers — feel coherent.
- Output the suggestion text ONLY, no preamble, no quotes, no markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fieldLabel, fieldHelp, priorAnswers } = await req.json();

    if (!fieldLabel) {
      return new Response(
        JSON.stringify({ success: false, error: "fieldLabel is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const priorLines = Object.entries(priorAnswers ?? {})
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const userMessage = `## What they've shared so far
${priorLines || "(nothing yet)"}

## Field they're answering
**${fieldLabel}**${fieldHelp ? `\n${fieldHelp}` : ""}

Suggest an answer.`;

    const result = await callGemini({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 400,
      temperature: 0.8,
    });

    const suggestion = (result.text ?? "").trim().replace(/^["']|["']$/g, "");

    return new Response(
      JSON.stringify({ success: true, suggestion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("suggest-brief-field error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
