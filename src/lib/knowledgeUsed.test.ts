// The badge is the only way anyone will ever see whether retrieval works,
// so it has to be honest in both directions: never claim knowledge that
// wasn't used, and never stay silent when it was.

import { describe, it, expect } from "vitest";
import { parseKnowledgeUsed, knowledgeLabel } from "./knowledgeUsed";

const source = (over: Record<string, unknown> = {}) => ({
  document_id: "doc-1",
  title: "Fabrication standards",
  scope: "agency",
  pinned: false,
  chunks: 2,
  ...over,
});

describe("parseKnowledgeUsed", () => {
  it("reads a populated knowledge field", () => {
    const k = parseKnowledgeUsed({ knowledge: { chunks: 5, reranked: true, sources: [source()] } });
    expect(k).toEqual({
      chunks: 5,
      reranked: true,
      sources: [{ document_id: "doc-1", title: "Fabrication standards", scope: "agency", pinned: false, chunks: 2 }],
    });
  });

  it("returns null when nothing was retrieved", () => {
    // The badge must be silent, not show "0 sources" — an empty knowledge
    // base should never look like a working one.
    expect(parseKnowledgeUsed({ knowledge: { chunks: 0, sources: [] } })).toBeNull();
  });

  it("returns null for an edge function that predates the field", () => {
    // Deploys are not atomic; an older function omits `knowledge` entirely.
    expect(parseKnowledgeUsed({ data: { anything: true } })).toBeNull();
    expect(parseKnowledgeUsed(null)).toBeNull();
    expect(parseKnowledgeUsed("nonsense")).toBeNull();
  });

  it("drops malformed sources but keeps the count", () => {
    const k = parseKnowledgeUsed({
      knowledge: { chunks: 3, sources: [source(), { title: "" }, { scope: "bogus", title: "x" }, null] },
    });
    expect(k!.chunks).toBe(3);
    expect(k!.sources).toHaveLength(1);
  });

  it("orders pinned documents first", () => {
    const k = parseKnowledgeUsed({
      knowledge: {
        chunks: 4,
        sources: [
          source({ document_id: "a", title: "Ordinary", chunks: 3 }),
          source({ document_id: "b", title: "Authoritative", pinned: true, chunks: 1 }),
        ],
      },
    });
    expect(k!.sources.map((s) => s.title)).toEqual(["Authoritative", "Ordinary"]);
  });

  it("counts documents, not passages", () => {
    // Six passages from two documents is "2 sources" — a reader cares how
    // many things informed it, not how finely they were chunked.
    const k = parseKnowledgeUsed({
      knowledge: { chunks: 6, sources: [source({ document_id: "a" }), source({ document_id: "b" })] },
    });
    expect(knowledgeLabel(k!)).toBe("2 sources");
  });

  it("falls back to passages when documents could not be named", () => {
    expect(knowledgeLabel(parseKnowledgeUsed({ knowledge: { chunks: 1, sources: [] } })!)).toBe("1 passage");
  });
});
