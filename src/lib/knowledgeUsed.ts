/**
 * What the agency's knowledge base contributed to one generation.
 *
 * The retrieval layer used to report itself only to the edge function's
 * console, so from the outside a working knowledge base and a dead one were
 * indistinguishable — which is exactly how this one stayed dead for four
 * months without anyone noticing. Every retrieving edge function now returns
 * this, and the UI shows it, so "did the house knowledge get used" is a
 * question the screen answers rather than one you have to trust.
 */

export type KnowledgeScopeName = "agency" | "activation_type" | "client" | "project";

export interface KnowledgeSource {
  document_id: string;
  title: string;
  scope: KnowledgeScopeName;
  pinned: boolean;
  /** How many passages of this document were used. */
  chunks: number;
}

export interface KnowledgeUsed {
  chunks: number;
  reranked: boolean;
  sources: KnowledgeSource[];
}

const SCOPES: KnowledgeScopeName[] = ["agency", "activation_type", "client", "project"];

/** Human label for a scope, in the UI's voice rather than the schema's. */
export const SCOPE_LABEL: Record<KnowledgeScopeName, string> = {
  agency: "House",
  activation_type: "Activation",
  client: "Client",
  project: "Project",
};

/**
 * Reads the `knowledge` field off an edge-function response.
 *
 * Tolerant by design: an older deployment of any function simply omits the
 * field, and this must read as "nothing to show" rather than as an error.
 * Returns null when there is nothing worth displaying.
 */
export function parseKnowledgeUsed(payload: unknown): KnowledgeUsed | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { knowledge?: unknown }).knowledge;
  if (!raw || typeof raw !== "object") return null;

  const k = raw as { chunks?: unknown; reranked?: unknown; sources?: unknown };
  const chunks = typeof k.chunks === "number" && k.chunks > 0 ? k.chunks : 0;
  if (chunks === 0) return null;

  const sources: KnowledgeSource[] = Array.isArray(k.sources)
    ? k.sources.flatMap((s) => {
        if (!s || typeof s !== "object") return [];
        const row = s as Record<string, unknown>;
        const title = typeof row.title === "string" ? row.title.trim() : "";
        const scope = SCOPES.find((x) => x === row.scope);
        if (!title || !scope) return [];
        return [{
          document_id: String(row.document_id ?? ""),
          title,
          scope,
          pinned: row.pinned === true,
          chunks: typeof row.chunks === "number" ? row.chunks : 1,
        }];
      })
    : [];

  // Pinned documents are authoritative, so they read first.
  sources.sort((a, b) =>
    a.pinned === b.pinned ? b.chunks - a.chunks : a.pinned ? -1 : 1,
  );

  return { chunks, reranked: k.reranked === true, sources };
}

/** "3 sources" / "1 source" — the count of documents, not passages. */
export function knowledgeLabel(k: KnowledgeUsed): string {
  const n = k.sources.length || k.chunks;
  const noun = k.sources.length ? "source" : "passage";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
