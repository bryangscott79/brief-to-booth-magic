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
  weighted_score?: number;
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

  try {
    // Build list of (scope, scope_id) pairs to query
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[rag-retrieve] query="${query.substring(0, 80)}" agency=${agencyId} scopes=${scopeCalls.map((s) => s.scope).join(",")} top_k=${topK}`,
    );

    // 1. Embed the query once
    const queryEmbedding = await embedQuery(query, GOOGLE_AI_API_KEY);
    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    // 2. Call match_knowledge_chunks once per active scope, in parallel
    const rpcResults = await Promise.all(
      scopeCalls.map(async ({ scope, scopeId }) => {
        const { data, error } = await supabase.rpc("match_knowledge_chunks", {
          _agency_id: agencyId,
          _query_embedding: embeddingLiteral,
          _query_text: query,
          _scopes: [scope],
          _scope_ids: [scopeId],
          _match_count: topK,
          _vector_weight: vectorWeight,
        });
        if (error) {
          console.error(`[rag-retrieve] RPC error for scope ${scope}:`, error.message);
          return [] as RawMatch[];
        }
        return (data || []) as RawMatch[];
      }),
    );

    // 3. Apply scope-weighting (FRD §6.3) so project knowledge outranks agency knowledge.
    const allMatches: RawMatch[] = [];
    for (const list of rpcResults) {
      for (const row of list) {
        const w = SCOPE_WEIGHTS[row.scope as ScopeName] ?? 1;
        row.weighted_score = (row.hybrid_score ?? 0) * w;
        allMatches.push(row);
      }
    }

    // 4. De-dupe by chunk_id (keep highest weighted_score in case of overlap)
    const merged = new Map<string, RawMatch>();
    for (const row of allMatches) {
      const existing = merged.get(row.chunk_id);
      if (!existing || (row.weighted_score ?? 0) > (existing.weighted_score ?? 0)) {
        merged.set(row.chunk_id, row);
      }
    }

    // 5. Sort by weighted_score desc, take top_k
    const sorted = Array.from(merged.values()).sort(
      (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
    );
    const top = sorted.slice(0, topK);

    // 5. Enrich with document metadata
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
        chunk_id: r.chunk_id,
        document_id: r.document_id,
        content: r.content,
        scope: r.scope,
        scope_id: r.scope_id,
        similarity: r.similarity,
        bm25_score: r.bm25_score,
        hybrid_score: r.hybrid_score,
        weighted_score: r.weighted_score,
        filename: meta?.filename ?? "",
        title: meta?.title ?? null,
        doc_type: meta?.doc_type ?? null,
      };
    });

    // 6. Group by scope
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

    console.log(
      `[rag-retrieve] Returning ${enriched.length} results (agency=${byScope.agency.length}, client=${byScope.client.length}, activation_type=${byScope.activation_type.length}, project=${byScope.project.length})`,
    );

    return new Response(
      JSON.stringify({ results: enriched, by_scope: byScope }),
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
