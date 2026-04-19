// extract-pricing — Phase E Claude skill
//
// Given a rate-card-style document, extract structured pricing line items.
// Writes to knowledge_documents.metadata.pricing and returns the structured data.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICING_TOOL = {
  name: "extract_pricing",
  description: "Extract pricing line items and cost structures from a rate card, quote, or cost document for a trade show or experiential marketing agency.",
  input_schema: {
    type: "object",
    properties: {
      is_pricing_document: {
        type: "boolean",
        description: "False if this document does not contain pricing information.",
      },
      vendor: { type: "string", description: "Vendor or source of the rates (optional)." },
      currency: { type: "string", description: "Currency code (e.g. USD)." },
      effective_date: { type: "string", description: "When these rates are effective (YYYY-MM-DD if stated)." },
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["booth", "drayage", "labor", "electrical", "internet", "rigging", "av", "graphics", "furniture", "transport", "lead_retrieval", "badge_scan", "other"],
            },
            description: { type: "string" },
            unit: { type: "string", description: "Unit of measure (sqft, hour, day, each)." },
            rate: { type: "number", description: "Numeric rate in the stated currency." },
            notes: { type: "string" },
          },
          required: ["category", "description", "rate"],
        },
      },
    },
    required: ["is_pricing_document", "line_items"],
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

    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("id, filename, extracted_text, metadata")
      .eq("id", document_id)
      .single();

    if (docErr || !doc) throw new Error(`Document not found: ${docErr?.message || "no row"}`);

    const text = (doc.extracted_text || "").slice(0, 60000);
    if (text.length < 50) throw new Error("Not enough extracted text");

    const result = await callAnthropic({
      system: "You extract pricing line items from agency/trade-show documents. Return all rates with their unit and category. Ignore narrative text.",
      messages: [
        {
          role: "user",
          content: `Document: ${doc.filename}\n\nContent:\n\n${text}\n\nExtract all pricing line items.`,
        },
      ],
      tools: [PRICING_TOOL],
      toolChoice: { type: "tool", name: "extract_pricing" },
      maxTokens: 4096,
      temperature: 0,
    });

    const parsed = result.toolCalls?.[0]?.arguments as
      | {
          is_pricing_document: boolean;
          vendor?: string;
          currency?: string;
          effective_date?: string;
          line_items: Array<{ category: string; description: string; unit?: string; rate: number; notes?: string }>;
        }
      | undefined;
    if (!parsed) throw new Error("Claude returned no tool call");

    const mergedMetadata = {
      ...((doc.metadata as Record<string, any>) || {}),
      pricing: parsed.is_pricing_document ? parsed : null,
      pricing_extracted_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabase
      .from("knowledge_documents")
      .update({ metadata: mergedMetadata })
      .eq("id", document_id);

    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ success: true, pricing: parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[extract-pricing]", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
