// auto-tag-document — Phase E Claude skill
//
// Given a knowledge_documents.id, classify the doc type and extract auto_tags
// using Claude Haiku (cheap classification). Updates knowledge_documents in place.
//
// Typically called automatically by the app after embed-document completes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TAGGING_MODEL = "google/gemini-2.5-flash-lite";

interface AutoTagResult {
  doc_type: "brief" | "rate_card" | "research" | "past_work" | "brand_guide" | "spec_sheet" | "contract" | "other";
  tags: string[];
  confidence: number;
  summary: string;
}

// OpenAI-format tool used by callGemini (which converts to Gemini functionDeclarations)
const TAG_TOOL = {
  type: "function",
  function: {
    name: "classify_document",
    description: "Classify a trade-show/experiential-marketing agency document and extract keyword tags.",
    parameters: {
      type: "object",
      properties: {
        doc_type: {
          type: "string",
          enum: ["brief", "rate_card", "research", "past_work", "brand_guide", "spec_sheet", "contract", "other"],
          description: "The primary document type.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "3-8 short, lowercase tags describing the content (e.g. 'pricing', 'floorplan', 'brand-voice', 'aerospace', 'trade-show').",
        },
        confidence: {
          type: "number",
          description: "0-1 confidence in the doc_type classification.",
        },
        summary: {
          type: "string",
          description: "One-sentence summary of the document content (under 30 words).",
        },
      },
      required: ["doc_type", "tags", "confidence", "summary"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id } = await req.json();
    if (!document_id) throw new Error("document_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the document
    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("id, filename, title, extracted_text, mime_type")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) throw new Error(`Document not found: ${docErr?.message || "no row"}`);

    const text = (doc.extracted_text || "").slice(0, 12000); // Haiku is cheap but still cap
    if (text.length < 20) {
      return new Response(
        JSON.stringify({ success: false, error: "Not enough extracted text to classify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await callGemini({
      model: TAGGING_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a document classifier for a trade show / experiential marketing agency. Categorize documents and extract descriptive keyword tags.",
        },
        {
          role: "user",
          content: `Filename: ${doc.filename}\nContent:\n\n${text}\n\nClassify this document.`,
        },
      ],
      tools: [TAG_TOOL],
      toolChoice: { type: "function", function: { name: "classify_document" } },
      maxTokens: 1024,
      temperature: 0,
    });

    const parsed = result.toolCalls?.[0]?.arguments as AutoTagResult | undefined;
    if (!parsed) throw new Error("Gemini returned no tool call");

    // Update the document
    const { error: updErr } = await supabase
      .from("knowledge_documents")
      .update({
        doc_type: parsed.doc_type,
        auto_tags: parsed.tags,
        title: doc.title || parsed.summary,
        summary: parsed.summary,
        metadata: { classification_confidence: parsed.confidence },
      })
      .eq("id", document_id);

    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ success: true, ...parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[auto-tag-document]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
