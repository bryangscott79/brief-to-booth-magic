import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mammoth from "https://esm.sh/mammoth@1.6.0";
import { extractText as unpdfExtractText } from "https://esm.sh/unpdf@0.12.1";

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TEXT EXTRACTION ──────────────────────────────────────────────────────────

async function extractText(
  bytes: Uint8Array,
  filename: string,
  mimeType: string | null,
): Promise<string> {
  const lowerName = filename.toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  // PDF
  if (mt.includes("pdf") || lowerName.endsWith(".pdf")) {
    try {
      const { text } = await unpdfExtractText(bytes, { mergePages: true });
      return Array.isArray(text) ? text.join("\n\n") : (text ?? "");
    } catch (e) {
      console.error("PDF extraction failed:", e);
      throw new Error(`Failed to extract PDF text: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // DOCX
  if (
    mt.includes("officedocument.wordprocessingml") ||
    lowerName.endsWith(".docx")
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      return result.value || "";
    } catch (e) {
      console.error("DOCX extraction failed:", e);
      throw new Error(`Failed to extract DOCX text: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // TXT / MD / CSV / unknown — decode as UTF-8
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch (e) {
    throw new Error(`Failed to decode file as UTF-8: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── CHUNKING ─────────────────────────────────────────────────────────────────

const TARGET_CHUNK_SIZE = 1000;
const MAX_CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 100;

/**
 * Split text into ~1000-char chunks with ~100-char overlap, preferring paragraph
 * boundaries. Skips empty chunks.
 */
/**
 * Strip characters Postgres text/jsonb cannot store:
 * - NUL bytes (\u0000) — Postgres rejects these in text columns
 * - Other C0 control chars except \t \n \r
 * - Lone UTF-16 surrogates that produce "unsupported Unicode escape sequence"
 */
function sanitizeForPg(text: string): string {
  return text
    .replace(/\u0000/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

function chunkText(text: string): string[] {
  const cleaned = sanitizeForPg(text).replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Split into paragraphs first
  const paragraphs = cleaned
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    // Paragraph fits in current chunk
    if (current.length + para.length + 2 <= TARGET_CHUNK_SIZE) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }

    // Flush current chunk if non-empty
    if (current) {
      chunks.push(current);
      // Start next chunk with overlap from end of previous
      const overlap = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
      current = overlap;
    }

    // If the paragraph itself is larger than MAX_CHUNK_SIZE, split it
    if (para.length > MAX_CHUNK_SIZE) {
      // Split on sentences first, then hard-split if still too big
      const sentences = para.split(/(?<=[.!?])\s+/);
      let buffer = current;
      for (const sent of sentences) {
        if (buffer.length + sent.length + 1 > TARGET_CHUNK_SIZE && buffer.length > 0) {
          chunks.push(buffer);
          const overlap = buffer.slice(Math.max(0, buffer.length - CHUNK_OVERLAP));
          buffer = overlap;
        }
        if (sent.length > MAX_CHUNK_SIZE) {
          // Hard-split oversized sentence
          let start = 0;
          while (start < sent.length) {
            const end = Math.min(start + TARGET_CHUNK_SIZE, sent.length);
            const slice = sent.slice(start, end);
            if (buffer.length + slice.length + 1 > MAX_CHUNK_SIZE && buffer.length > 0) {
              chunks.push(buffer);
              buffer = buffer.slice(Math.max(0, buffer.length - CHUNK_OVERLAP));
            }
            buffer = buffer ? `${buffer} ${slice}` : slice;
            start = end;
          }
        } else {
          buffer = buffer ? `${buffer} ${sent}` : sent;
        }
      }
      current = buffer;
    } else {
      // Paragraph is reasonable, but starting fresh in new chunk
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  // Filter empty/whitespace-only chunks
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

// ─── GEMINI EMBEDDINGS ────────────────────────────────────────────────────────

async function embedChunk(
  text: string,
  apiKey: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const body = {
    content: { parts: [{ text }] },
    outputDimensionality: 768,
    taskType,
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Gemini embeddings API error (${res.status}): ${txt.substring(0, 300)}`);
      }
      const data = await res.json();
      const values = data?.embedding?.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`Gemini embeddings returned no values: ${JSON.stringify(data).substring(0, 300)}`);
      }
      return values as number[];
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ success: false, chunk_count: 0, error: "Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!GOOGLE_AI_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, chunk_count: 0, error: "GOOGLE_AI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parse request
  let body: { document_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, chunk_count: 0, error: "Invalid JSON in request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const documentId = body.document_id;
  if (!documentId || typeof documentId !== "string") {
    return new Response(
      JSON.stringify({ success: false, chunk_count: 0, error: "document_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log(`[embed-document] Processing document_id=${documentId}`);

  try {
    // 1. Fetch document row
    const { data: doc, error: docErr } = await supabase
      .from("knowledge_documents")
      .select("id, scope, scope_id, agency_id, filename, storage_path, mime_type, storage_bucket")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr) throw new Error(`Failed to fetch document: ${docErr.message}`);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    // 2. Mark as processing
    await supabase
      .from("knowledge_documents")
      .update({ status: "processing", processing_error: null, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    // 3. Download file from storage
    const bucket = doc.storage_bucket || "knowledge-documents";
    const { data: fileData, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(doc.storage_path);

    if (dlErr || !fileData) {
      throw new Error(`Failed to download file from storage: ${dlErr?.message || "unknown"}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // 4. Extract text
    const fullText = await extractText(bytes, doc.filename, doc.mime_type);
    if (!fullText || fullText.trim().length < 10) {
      throw new Error("Extracted text is empty or too short");
    }

    console.log(`[embed-document] Extracted ${fullText.length} chars from ${doc.filename}`);

    // 5. Chunk
    const chunks = chunkText(fullText);
    if (chunks.length === 0) {
      throw new Error("Chunking produced zero chunks");
    }

    console.log(`[embed-document] Produced ${chunks.length} chunks`);

    // 6. Delete existing chunks for idempotency
    const { error: delErr } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId);
    if (delErr) {
      console.warn(`[embed-document] Failed to delete prior chunks: ${delErr.message}`);
    }

    // 7. Embed + insert each chunk sequentially with small delay
    let insertedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedChunk(chunk, GOOGLE_AI_API_KEY, "RETRIEVAL_DOCUMENT");
      const embeddingLiteral = `[${embedding.join(",")}]`;

      const { error: insErr } = await supabase.from("knowledge_chunks").insert({
        document_id: documentId,
        chunk_index: i,
        content: chunk,
        embedding: embeddingLiteral,
        scope: doc.scope,
        scope_id: doc.scope_id,
        agency_id: doc.agency_id,
        token_count: chunk.length,
      });

      if (insErr) {
        throw new Error(`Failed to insert chunk ${i}: ${insErr.message}`);
      }

      insertedCount++;

      // Small delay to avoid rate limits (skip on last chunk)
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // 8. Mark document as embedded
    const truncatedText = fullText.substring(0, 50000);
    const { error: updErr } = await supabase
      .from("knowledge_documents")
      .update({
        status: "embedded",
        chunk_count: insertedCount,
        extracted_text: truncatedText,
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updErr) {
      console.warn(`[embed-document] Failed to update document row: ${updErr.message}`);
    }

    console.log(`[embed-document] Success: ${insertedCount} chunks embedded`);

    return new Response(
      JSON.stringify({ success: true, chunk_count: insertedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[embed-document] Error:`, errMsg);

    // Mark document as failed (best-effort)
    try {
      await supabase
        .from("knowledge_documents")
        .update({
          status: "failed",
          processing_error: errMsg.substring(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
    } catch (updErr) {
      console.error(`[embed-document] Also failed to mark document as failed:`, updErr);
    }

    return new Response(
      JSON.stringify({ success: false, chunk_count: 0, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
