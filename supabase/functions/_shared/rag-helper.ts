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
 *   });
 *   // Then append ragContext.formatted to the system prompt.
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
  /** Score after applying the per-scope weight (used for cross-scope ranking). */
  weighted_score?: number;
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
  const empty: RagContext = {
    chunks: [],
    byScope: { agency: [], activation_type: [], client: [], project: [] },
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

    // 3. Retrieve chunks per scope in parallel
    const topK = opts.topK ?? 6;
    const perScopeCount = Math.max(2, Math.ceil(topK / scopeCalls.length));
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
      if (r.data) allChunks.push(...(r.data as any));
    }

    // 4. Apply scope-weighting (project > client > activation_type > agency).
    const weights = { ...DEFAULT_SCOPE_WEIGHTS, ...(opts.scopeWeights || {}) };
    for (const c of allChunks) {
      const w = weights[c.scope] ?? 1;
      c.weighted_score = c.hybrid_score * w;
    }

    // 5. Re-rank across scopes by weighted_score (FRD §6.3).
    allChunks.sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0));
    const top = allChunks.slice(0, topK);

    // 5. Group by scope
    const byScope: RagContext["byScope"] = {
      agency: [],
      activation_type: [],
      client: [],
      project: [],
    };
    for (const c of top) byScope[c.scope].push(c);

    // 6. Format for prompt injection
    const formatted = formatChunksForPrompt(top);

    return { chunks: top, byScope, formatted };
  } catch (e) {
    console.warn("[rag-helper] retrieval failed:", e);
    return empty;
  }
}

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

  // Desired order: agency → activation_type → client → project
  const order = ["agency", "activation_type", "client", "project"];
  const sections: string[] = [];
  for (const scope of order) {
    const items = grouped[scope];
    if (!items || items.length === 0) continue;
    const body = items
      .map((c, i) => `[${scope}:${i + 1}] ${c.content.trim()}`)
      .join("\n\n");
    sections.push(`${scopeLabels[scope]}:\n${body}`);
  }

  return [
    "─── RETRIEVED KNOWLEDGE BASE CONTEXT ───",
    "Use the following context when relevant. Each item is a ranked snippet from the agency's knowledge base.",
    "",
    sections.join("\n\n"),
    "─── END RETRIEVED CONTEXT ───",
  ].join("\n");
}
