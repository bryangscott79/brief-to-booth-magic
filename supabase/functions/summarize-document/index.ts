// summarize-document — Phase E Claude skill
//
// Produces a rich summary + extracts brand_intelligence-style bits from a
// knowledge document. Uses Claude Sonnet.
//
// When scope='client' and client_id is provided, optionally writes extracted
// bits to brand_intelligence table with confidence scores.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUMMARIZE_TOOL = {
  name: "summarize_and_extract",
  description: "Produce a structured summary of an agency/marketing document and extract key intelligence bits.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A 2-5 sentence summary of the document's purpose and most important content.",
      },
      key_facts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["brand", "pricing", "audience", "activation", "logistics", "creative", "technical", "other"],
            },
            key: { type: "string", description: "Short label (e.g. 'primary brand color', 'preferred tone')." },
            value: { type: "string", description: "The actual fact/value." },
            confidence: { type: "number", description: "0-1 confidence in this extraction." },
          },
          required: ["category", "key", "value", "confidence"],
        },
        description: "5-20 structured facts extracted from the document.",
      },
    },
    required: ["summary", "key_facts"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id, persist_to_brand_intelligence = false } = await req.json();
    if (!document_id) throw new Error("document_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("id, scope, scope_id, filename, extracted_text, uploaded_by")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) throw new Error(`Document not found: ${docErr?.message || "no row"}`);

    const text = (doc.extracted_text || "").slice(0, 50000); // Sonnet handles ~150k tokens
    if (text.length < 50) throw new Error("Not enough extracted text to summarize");

    const result = await callAnthropic({
      system: "You extract structured intelligence from trade-show / experiential marketing documents. Be precise. Only assert facts the document clearly supports.",
      messages: [
        {
          role: "user",
          content: `Document: ${doc.filename}\nScope: ${doc.scope}\n\nContent:\n\n${text}\n\nSummarize and extract key facts.`,
        },
      ],
      tools: [SUMMARIZE_TOOL],
      toolChoice: { type: "tool", name: "summarize_and_extract" },
      maxTokens: 4096,
      temperature: 0.2,
    });

    const parsed = result.toolCalls?.[0]?.arguments as
      | { summary: string; key_facts: Array<{ category: string; key: string; value: string; confidence: number }> }
      | undefined;
    if (!parsed) throw new Error("Claude returned no tool call");

    // Persist summary to the document row
    const { error: updErr } = await supabase
      .from("knowledge_documents")
      .update({
        summary: parsed.summary,
        metadata: { key_facts: parsed.key_facts, summarized_at: new Date().toISOString() },
      })
      .eq("id", document_id);

    if (updErr) throw updErr;

    // Optionally persist to brand_intelligence for client-scoped docs
    if (persist_to_brand_intelligence && doc.scope === "client" && parsed.key_facts.length > 0) {
      const rows = parsed.key_facts.map((fact) => ({
        user_id: doc.uploaded_by,
        category: fact.category,
        key: fact.key,
        value: fact.value,
        source: `kb_document:${document_id}`,
        relevance_weight: fact.confidence,
        metadata: { source_document_id: document_id, source_filename: doc.filename },
      }));
      // Best-effort insert; don't fail the whole request if this fails
      const { error: biErr } = await supabase.from("brand_intelligence").insert(rows);
      if (biErr) console.warn("[summarize-document] brand_intelligence insert failed:", biErr);
    }

    return new Response(
      JSON.stringify({ success: true, summary: parsed.summary, key_facts: parsed.key_facts }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[summarize-document]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
