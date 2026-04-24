import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ScopeName = "agency" | "client" | "activation_type" | "project";

interface RetrieveRequest {
  query?: string;
  agency_id?: string;
  client_id?: string;
  activation_type_id?: string;
  project_id?: string;
  include_agency_scope?: boolean;
  top_k?: number;
  vector_weight?: number;
  rerank?: boolean;
  source?: string;
}

interface RawMatch {
  chunk_id: string;
  document_id: string;
  content: string;
  scope: string;
  scope_id: string;
  similarity: number;
  bm25_score: number;
  hybrid_score: number;
  priority_weight?: number;
  is_pinned?: boolean;
  weighted_score?: number;
  rerank_score?: number;
  metadata?: Record<string, unknown>;
}

interface EnrichedResult extends RawMatch {
  filename: string;
  title: string | null;
  doc_type: string | null;
}

/**
 * Volta RAG FRD § 6.3 — scope weighting.
 * Project-specific knowledge outranks generic agency context.
 */
const SCOPE_WEIGHTS: Record<ScopeName, number> = {
  project: 1.0,
  client: 0.85,
  activation_type: 0.75,
  agency: 0.6,
};

// ─── EMBEDDINGS ───────────────────────────────────────────────────────────────

async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  const body = {
    content: { parts: [{ text }] },
    outputDimensionality: 768,
    taskType: "RETRIEVAL_QUERY",
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
        throw new Error("Gemini embeddings returned no values");
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

// ─── LLM RERANKER ─────────────────────────────────────────────────────────────

async function llmRerank(
  query: string,
  chunks: RawMatch[],
  apiKey: string,
): Promise<number[] | null> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  const numbered = chunks
    .map((c, i) => `[${i + 1}] (${c.scope}) ${c.content.slice(0, 600).trim()}`)
    .join("\n\n");

  const prompt = `You are a relevance scorer. Score how relevant each numbered passage is to the user's query.

QUERY:
${query.slice(0, 800)}

PASSAGES:
${numbered}

Return ONLY a JSON array of ${chunks.length} numbers between 0 and 1, in order. No prose, no markdown.
Example: [0.92, 0.31, 0.76]`;

  let raw: string | null = null;
  try {
    if (lovableKey) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        raw = data?.choices?.[0]?.message?.content ?? null;
      }
    }
    if (!raw) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0 },
          }),
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
  } catch (e) {
    console.warn("[rag-retrieve] reranker call failed:", e);
    return null;
  }
  if (!raw) return null;
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    return arr.slice(0, chunks.length).map((n) => {
      const v = typeof n === "number" ? n : Number(n);
      if (!Number.isFinite(v)) return 0;
      return Math.max(0, Math.min(1, v));
    });
  } catch {
    return null;
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!GOOGLE_AI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_AI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: RetrieveRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const query = (body.query || "").trim();
  const agencyId = body.agency_id;
  const clientId = body.client_id;
  const activationTypeId = body.activation_type_id;
  const projectId = body.project_id;
  const includeAgencyScope = body.include_agency_scope !== false; // default true
  const topK = typeof body.top_k === "number" && body.top_k > 0 ? Math.min(body.top_k, 50) : 8;
  const vectorWeight =
    typeof body.vector_weight === "number" && body.vector_weight >= 0 && body.vector_weight <= 1
      ? body.vector_weight
      : 0.7;
  const rerank = body.rerank === true;
  const source = typeof body.source === "string" ? body.source.slice(0, 80) : "rag-retrieve";

  if (!query || query.length < 2) {
    return new Response(
      JSON.stringify({ error: "query is required and must be at least 2 chars" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!agencyId || typeof agencyId !== "string") {
    return new Response(
      JSON.stringify({ error: "agency_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve user_id from JWT for analytics (best-effort)
  let userId: string | null = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { data } = await supabase.auth.getUser(authHeader.slice(7));
      userId = data?.user?.id ?? null;
    } catch {
      // ignore
    }
  }

  try {
    const scopeCalls: Array<{ scope: ScopeName; scopeId: string }> = [];
    if (includeAgencyScope) scopeCalls.push({ scope: "agency", scopeId: agencyId });
    if (clientId) scopeCalls.push({ scope: "client", scopeId: clientId });
    if (activationTypeId) scopeCalls.push({ scope: "activation_type", scopeId: activationTypeId });
    if (projectId) scopeCalls.push({ scope: "project", scopeId: projectId });

    if (scopeCalls.length === 0) {
      return new Response(
        JSON.stringify({
          results: [],
          by_scope: { agency: [], client: [], activation_type: [], project: [] },
          pinned_doc_ids: [],
          reranked: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[rag-retrieve] query="${query.substring(0, 80)}" agency=${agencyId} scopes=${scopeCalls.map((s) => s.scope).join(",")} top_k=${topK} rerank=${rerank}`,
    );

    // 1. Embed query once
    const queryEmbedding = await embedQuery(query, GOOGLE_AI_API_KEY);
    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    // 2. Pull a wider candidate pool per scope so we have material to re-rank
    const candidatePool = Math.max(topK * 3, 12);
    const perScopeCount = Math.max(4, Math.ceil(candidatePool / scopeCalls.length));

    const rpcResults = await Promise.all(
      scopeCalls.map(async ({ scope, scopeId }) => {
        const { data, error } = await supabase.rpc("match_knowledge_chunks", {
          _agency_id: agencyId,
          _query_embedding: embeddingLiteral,
          _query_text: query,
          _scopes: [scope],
          _scope_ids: [scopeId],
          _match_count: perScopeCount,
          _vector_weight: vectorWeight,
        });
        if (error) {
          console.error(`[rag-retrieve] RPC error for scope ${scope}:`, error.message);
          return [] as RawMatch[];
        }
        return (data || []) as RawMatch[];
      }),
    );

    // 3. Apply scope weighting
    const allMatches: RawMatch[] = [];
    for (const list of rpcResults) {
      for (const row of list) {
        const w = SCOPE_WEIGHTS[row.scope as ScopeName] ?? 1;
        row.weighted_score = (row.hybrid_score ?? 0) * w;
        allMatches.push(row);
      }
    }

    // 4. De-dupe by chunk_id
    const merged = new Map<string, RawMatch>();
    for (const row of allMatches) {
      const existing = merged.get(row.chunk_id);
      if (!existing || (row.weighted_score ?? 0) > (existing.weighted_score ?? 0)) {
        merged.set(row.chunk_id, row);
      }
    }
    const candidates = Array.from(merged.values()).sort(
      (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
    );

    // 5. Optional LLM reranker
    let reranked = false;
    let working = candidates;
    if (rerank && candidates.length > 1) {
      const rerankN = Math.min(20, candidates.length);
      const subset = candidates.slice(0, rerankN);
      const scores = await llmRerank(query, subset, GOOGLE_AI_API_KEY);
      if (scores) {
        for (let i = 0; i < subset.length; i++) {
          subset[i].rerank_score = scores[i] ?? 0;
        }
        subset.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
        working = [...subset, ...candidates.slice(rerankN)];
        reranked = true;
      }
    }

    // 6. Force-include pinned docs (one chunk each)
    const top: RawMatch[] = [];
    const seenChunks = new Set<string>();
    const pinnedDocIds = new Set<string>();
    const pinnedByDoc = new Map<string, RawMatch>();
    for (const c of working) {
      if (c.is_pinned && !pinnedByDoc.has(c.document_id)) {
        pinnedByDoc.set(c.document_id, c);
      }
    }
    for (const [docId, chunk] of pinnedByDoc) {
      top.push(chunk);
      seenChunks.add(chunk.chunk_id);
      pinnedDocIds.add(docId);
    }
    for (const c of working) {
      if (top.length >= topK) break;
      if (seenChunks.has(c.chunk_id)) continue;
      top.push(c);
      seenChunks.add(c.chunk_id);
    }

    // 7. Enrich with document metadata
    const docIds = Array.from(new Set(top.map((r) => r.document_id)));
    let docMap = new Map<string, { filename: string; title: string | null; doc_type: string | null }>();

    if (docIds.length > 0) {
      const { data: docs, error: docsErr } = await supabase
        .from("knowledge_documents")
        .select("id, filename, title, doc_type")
        .in("id", docIds);

      if (docsErr) {
        console.warn(`[rag-retrieve] Failed to fetch document metadata: ${docsErr.message}`);
      } else if (docs) {
        docMap = new Map(
          docs.map((d: { id: string; filename: string; title: string | null; doc_type: string | null }) => [
            d.id,
            { filename: d.filename, title: d.title, doc_type: d.doc_type },
          ]),
        );
      }
    }

    const enriched: EnrichedResult[] = top.map((r) => {
      const meta = docMap.get(r.document_id);
      return {
        ...r,
        filename: meta?.filename ?? "",
        title: meta?.title ?? null,
        doc_type: meta?.doc_type ?? null,
      };
    });

    // 8. Group by scope
    const byScope: Record<ScopeName, EnrichedResult[]> = {
      agency: [],
      client: [],
      activation_type: [],
      project: [],
    };
    for (const r of enriched) {
      if (r.scope === "agency" || r.scope === "client" || r.scope === "activation_type" || r.scope === "project") {
        byScope[r.scope as ScopeName].push(r);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[rag-retrieve] Returning ${enriched.length} results in ${durationMs}ms (pinned=${pinnedDocIds.size}, reranked=${reranked})`,
    );

    // 9. Fire-and-forget analytics log
    void supabase
      .from("rag_query_log")
      .insert({
        agency_id: agencyId,
        user_id: userId,
        source,
        query: query.slice(0, 4000),
        scopes: scopeCalls.map((s) => s.scope),
        scope_ids: scopeCalls.map((s) => s.scopeId),
        top_k: topK,
        result_chunk_ids: enriched.map((r) => r.chunk_id),
        result_doc_ids: docIds,
        reranked,
        pinned_doc_ids: Array.from(pinnedDocIds),
        duration_ms: durationMs,
      })
      .then(({ error }) => {
        if (error) console.warn(`[rag-retrieve] log insert failed: ${error.message}`);
      });

    return new Response(
      JSON.stringify({
        results: enriched,
        by_scope: byScope,
        pinned_doc_ids: Array.from(pinnedDocIds),
        reranked,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[rag-retrieve] Error:`, errMsg);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
