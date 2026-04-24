/**
 * RAG helper for generation edge functions.
 *
 * Usage inside an edge function:
 *   const ragContext = await buildRagContext(supabase, {
 *     query,
 *     agencyId,
 *     clientId,
 *     activationTypeId,
 *     projectId,
 *     source: "generate-element",
 *   });
 *   // Then append ragContext.formatted to the system prompt.
 *
 * Features:
 *   - Hybrid pgvector + BM25 retrieval (per-scope)
 *   - Scope weighting (FRD §6.3): project > client > activation_type > agency
 *   - Per-document priority weighting (already applied inside SQL hybrid_score)
 *   - Pinned-document force-injection (always include ≥1 chunk per pinned doc)
 *   - Optional LLM reranker pass over top candidates
 *   - Retrieval analytics logging to rag_query_log
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface RagContextOptions {
  query: string;
  agencyId: string;
  clientId?: string | null;
  activationTypeId?: string | null;
  projectId?: string | null;
  /** Include agency-scoped chunks (default true). */
  includeAgencyScope?: boolean;
  /** Top-K chunks across all scopes combined (default 6). */
  topK?: number;
  /** Hybrid search vector weight 0-1 (default 0.7). */
  vectorWeight?: number;
  /**
   * Per-scope multiplier applied to the hybrid_score AFTER retrieval, before
   * cross-scope re-ranking. Lets project-specific knowledge outrank generic
   * agency context when both are relevant. Defaults follow the Volta FRD.
   */
  scopeWeights?: Partial<Record<"agency" | "activation_type" | "client" | "project", number>>;
  /** Run an LLM reranker pass over top candidates (default false). Adds ~600ms. */
  rerank?: boolean;
  /** Calling edge function name, used for analytics (default "unknown"). */
  source?: string;
  /** Authenticated user id, used for analytics if available. */
  userId?: string | null;
  /** Disable analytics logging entirely (default false — log everything). */
  disableLogging?: boolean;
}

/**
 * Default scope weights per Volta RAG FRD § 6.3 (Scope Weighting).
 * Project-specific knowledge is most relevant; broad agency knowledge least.
 */
export const DEFAULT_SCOPE_WEIGHTS: Record<"agency" | "activation_type" | "client" | "project", number> = {
  project: 1.0,
  client: 0.85,
  activation_type: 0.75,
  agency: 0.6,
};

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  scope: "agency" | "activation_type" | "client" | "project";
  scope_id: string;
  hybrid_score: number;
  similarity: number;
  bm25_score: number;
  /** Per-document weight returned by SQL (>1 boosts, <1 demotes). */
  priority_weight?: number;
  /** True when the document is flagged is_pinned. */
  is_pinned?: boolean;
  /** Score after applying the per-scope weight (used for cross-scope ranking). */
  weighted_score?: number;
  /** Optional LLM rerank score 0-1. */
  rerank_score?: number;
}

export interface RagContext {
  /** Ranked chunks (most relevant first). */
  chunks: RetrievedChunk[];
  /** Chunks grouped by scope for easy inspection. */
  byScope: {
    agency: RetrievedChunk[];
    activation_type: RetrievedChunk[];
    client: RetrievedChunk[];
    project: RetrievedChunk[];
  };
  /** Document IDs that were force-included via pinning. */
  pinnedDocIds: string[];
  /** True when the LLM reranker was used. */
  reranked: boolean;
  /** Human-readable block suitable for injection into a system prompt. Empty string if no chunks. */
  formatted: string;
}

/**
 * Fetches RAG context for a given query + scopes.
 * Returns the ranked chunks + a pre-formatted system-prompt block.
 * Silently returns an empty context on errors (never blocks generation).
 */
export async function buildRagContext(
  supabase: SupabaseClient,
  opts: RagContextOptions,
): Promise<RagContext> {
  const startedAt = Date.now();
  const empty: RagContext = {
    chunks: [],
    byScope: { agency: [], activation_type: [], client: [], project: [] },
    pinnedDocIds: [],
    reranked: false,
    formatted: "",
  };

  try {
    if (!opts.query?.trim() || !opts.agencyId) return empty;

    // 1. Embed the query
    const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      console.warn("[rag-helper] GOOGLE_AI_API_KEY not set — skipping retrieval");
      return empty;
    }

    const embedResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: opts.query.slice(0, 8000) }] },
          outputDimensionality: 768,
          taskType: "RETRIEVAL_QUERY",
        }),
      },
    );
    if (!embedResponse.ok) {
      console.warn("[rag-helper] embedding failed:", embedResponse.status, await embedResponse.text());
      return empty;
    }
    const embedData = await embedResponse.json();
    const embedding = embedData.embedding?.values as number[] | undefined;
    if (!embedding) return empty;
    const embeddingLiteral = `[${embedding.join(",")}]`;

    // 2. Build active scopes + their IDs
    const scopeCalls: Array<{ scope: string; scopeId: string }> = [];
    if (opts.includeAgencyScope !== false) scopeCalls.push({ scope: "agency", scopeId: opts.agencyId });
    if (opts.clientId) scopeCalls.push({ scope: "client", scopeId: opts.clientId });
    if (opts.activationTypeId) scopeCalls.push({ scope: "activation_type", scopeId: opts.activationTypeId });
    if (opts.projectId) scopeCalls.push({ scope: "project", scopeId: opts.projectId });

    if (scopeCalls.length === 0) return empty;

    // 3. Retrieve chunks per scope in parallel. Pull a wider candidate pool so
    //    we have something to rerank / prune.
    const topK = opts.topK ?? 6;
    const candidatePool = Math.max(topK * 3, 12);
    const perScopeCount = Math.max(4, Math.ceil(candidatePool / scopeCalls.length));
    const vectorWeight = opts.vectorWeight ?? 0.7;

    const responses = await Promise.all(
      scopeCalls.map(({ scope, scopeId }) =>
        supabase.rpc("match_knowledge_chunks", {
          _agency_id: opts.agencyId,
          _query_embedding: embeddingLiteral,
          _query_text: opts.query,
          _scopes: [scope],
          _scope_ids: [scopeId],
          _match_count: perScopeCount,
          _vector_weight: vectorWeight,
        }),
      ),
    );

    const allChunks: RetrievedChunk[] = [];
    for (const r of responses) {
      if (r.error) {
        console.warn("[rag-helper] match_knowledge_chunks error:", r.error.message);
        continue;
      }
      if (r.data) allChunks.push(...(r.data as RetrievedChunk[]));
    }

    if (allChunks.length === 0) {
      void logRetrieval(supabase, opts, [], [], false, Date.now() - startedAt, scopeCalls);
      return empty;
    }

    // 4. Apply scope-weighting (project > client > activation_type > agency).
    const weights = { ...DEFAULT_SCOPE_WEIGHTS, ...(opts.scopeWeights || {}) };
    for (const c of allChunks) {
      const w = weights[c.scope] ?? 1;
      c.weighted_score = (c.hybrid_score ?? 0) * w;
    }

    // 5. De-dupe by chunk_id (keep highest weighted_score)
    const merged = new Map<string, RetrievedChunk>();
    for (const c of allChunks) {
      const existing = merged.get(c.chunk_id);
      if (!existing || (c.weighted_score ?? 0) > (existing.weighted_score ?? 0)) {
        merged.set(c.chunk_id, c);
      }
    }
    const candidates = Array.from(merged.values()).sort(
      (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
    );

    // 6. Optional LLM reranker pass
    let reranked = false;
    let working = candidates;
    if (opts.rerank && candidates.length > 1) {
      try {
        const rerankN = Math.min(20, candidates.length);
        const subset = candidates.slice(0, rerankN);
        const scores = await llmRerank(opts.query, subset, apiKey);
        if (scores) {
          for (let i = 0; i < subset.length; i++) {
            subset[i].rerank_score = scores[i] ?? 0;
          }
          subset.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
          working = [...subset, ...candidates.slice(rerankN)];
          reranked = true;
        }
      } catch (e) {
        console.warn("[rag-helper] rerank failed, using weighted ranking:", e);
      }
    }

    // 7. Force-include at least one chunk from each pinned document.
    //    Pinned chunks come from the candidate pool; if a pinned doc has no
    //    candidate it simply isn't relevant enough to include.
    const top: RetrievedChunk[] = [];
    const pinnedDocIds = new Set<string>();
    const seenChunks = new Set<string>();
    const pinnedByDoc = new Map<string, RetrievedChunk>();
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

    // 8. Fill remaining slots from working order
    for (const c of working) {
      if (top.length >= topK) break;
      if (seenChunks.has(c.chunk_id)) continue;
      top.push(c);
      seenChunks.add(c.chunk_id);
    }

    // 9. Group by scope
    const byScope: RagContext["byScope"] = {
      agency: [],
      activation_type: [],
      client: [],
      project: [],
    };
    for (const c of top) byScope[c.scope].push(c);

    // 10. Format for prompt injection
    const formatted = formatChunksForPrompt(top);

    // 11. Fire-and-forget analytics
    void logRetrieval(
      supabase,
      opts,
      top,
      Array.from(pinnedDocIds),
      reranked,
      Date.now() - startedAt,
      scopeCalls,
    );

    return {
      chunks: top,
      byScope,
      pinnedDocIds: Array.from(pinnedDocIds),
      reranked,
      formatted,
    };
  } catch (e) {
    console.warn("[rag-helper] retrieval failed:", e);
    return empty;
  }
}

// ─── LLM RERANKER ─────────────────────────────────────────────────────────────

/**
 * Re-rank candidate chunks via a fast LLM. Returns a parallel array of
 * scores (0-1) or null on failure.
 */
async function llmRerank(
  query: string,
  chunks: RetrievedChunk[],
  apiKey: string,
): Promise<number[] | null> {
  // Use Gemini Flash (fast + cheap) via Lovable AI Gateway when available,
  // fall back to direct Gemini API.
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
    console.warn("[rag-helper] reranker call failed:", e);
    return null;
  }

  if (!raw) return null;

  // Extract JSON array even if wrapped in markdown
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

// ─── ANALYTICS LOGGING ────────────────────────────────────────────────────────

async function logRetrieval(
  supabase: SupabaseClient,
  opts: RagContextOptions,
  chunks: RetrievedChunk[],
  pinnedDocIds: string[],
  reranked: boolean,
  durationMs: number,
  scopeCalls: Array<{ scope: string; scopeId: string }>,
): Promise<void> {
  if (opts.disableLogging) return;
  try {
    const docIds = Array.from(new Set(chunks.map((c) => c.document_id)));
    const chunkIds = chunks.map((c) => c.chunk_id);
    await supabase.from("rag_query_log").insert({
      agency_id: opts.agencyId,
      user_id: opts.userId ?? null,
      source: opts.source ?? "unknown",
      query: opts.query.slice(0, 4000),
      scopes: scopeCalls.map((s) => s.scope),
      scope_ids: scopeCalls.map((s) => s.scopeId),
      top_k: opts.topK ?? 6,
      result_chunk_ids: chunkIds,
      result_doc_ids: docIds,
      reranked,
      pinned_doc_ids: pinnedDocIds,
      duration_ms: durationMs,
    });
  } catch (e) {
    // Never throw from analytics
    console.warn("[rag-helper] analytics log failed:", e);
  }
}

// ─── PROMPT FORMATTING ────────────────────────────────────────────────────────

function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const scopeLabels: Record<string, string> = {
    agency: "AGENCY CONTEXT",
    activation_type: "ACTIVATION-TYPE CONTEXT",
    client: "CLIENT CONTEXT",
    project: "PROJECT CONTEXT",
  };

  const grouped: Record<string, RetrievedChunk[]> = {};
  for (const c of chunks) {
    if (!grouped[c.scope]) grouped[c.scope] = [];
    grouped[c.scope]!.push(c);
  }

  const order = ["agency", "activation_type", "client", "project"];
  const sections: string[] = [];
  for (const scope of order) {
    const items = grouped[scope];
    if (!items || items.length === 0) continue;
    const body = items
      .map((c, i) => {
        const tag = c.is_pinned ? "★ PINNED" : `${scope}:${i + 1}`;
        return `[${tag}] ${c.content.trim()}`;
      })
      .join("\n\n");
    sections.push(`${scopeLabels[scope]}:\n${body}`);
  }

  return [
    "─── RETRIEVED KNOWLEDGE BASE CONTEXT ───",
    "Use the following context when relevant. Each item is a ranked snippet from the agency's knowledge base. Items marked ★ PINNED have been flagged as authoritative — defer to them when there is conflict.",
    "",
    sections.join("\n\n"),
    "─── END RETRIEVED CONTEXT ───",
  ].join("\n");
}
