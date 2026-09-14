// Guards the wiring, not the logic.
//
// The knowledge layer was fully built and completely dead for months, and
// the reason was not a bug in retrieval — it was that nobody passed it a
// scope. That failure is invisible: generation still succeeds, the output
// is merely poorer, and no error is ever logged. Nothing but a test will
// notice it coming back.
//
// So: every call site that generates with the model must route through
// resolveKnowledgeScope, and every edge function that retrieves must do it
// as the USER rather than the service role (the RPC's membership guard
// reads auth.uid(), which is NULL under a service key — and agency_id
// arrives from the browser, so only the caller's own JWT can prove they
// are entitled to that corpus).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

/** Edge functions whose prompts are improved by agency knowledge. */
const GENERATION_FUNCTIONS = [
  "parse-brief",
  "plan-concepts",
  "generate-element",
  "generate-hero",
  "generate-view",
  "generate-materials",
  "generate-3d-brief",
  "generate-presentation",
  "parse-client-feedback",
  "synthesize-brief",
  "enrich-spatial",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SRC_FILES = walk(join(ROOT, "src")).map((f) => ({ path: f, text: readFileSync(f, "utf8") }));

describe("knowledge scope reaches every generation call", () => {
  it.each(GENERATION_FUNCTIONS)("%s is always invoked with a resolved scope", (fn) => {
    const callers = SRC_FILES.filter(
      (f) => f.text.includes(`invoke("${fn}"`) || f.text.includes(`/functions/v1/${fn}`),
    );

    // A function nothing calls yet is fine; one called without a scope is not.
    for (const caller of callers) {
      expect(
        caller.text.includes("resolveKnowledgeScope"),
        `${caller.path.replace(ROOT + "/", "")} invokes ${fn} without resolveKnowledgeScope — ` +
          "that call will generate with no agency knowledge behind it.",
      ).toBe(true);
    }
  });

  it("no generation call site hand-rolls the scope keys", () => {
    // Hand-assembled keys are how activation_type_id ended up permanently
    // null in the Export step: the field it read has never existed.
    const offenders = SRC_FILES.filter(
      (f) =>
        /activation_type_id\s*:/.test(f.text) &&
        !f.path.endsWith("knowledgeScope.ts") &&
        GENERATION_FUNCTIONS.some((fn) => f.text.includes(`invoke("${fn}"`)),
    ).map((f) => f.path.replace(ROOT + "/", ""));

    expect(offenders).toEqual([]);
  });
});

describe("retrieval runs as the user, never as the service role", () => {
  const FN_DIR = join(ROOT, "supabase/functions");

  const retrievers = readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .map((d) => ({ name: d.name, path: join(FN_DIR, d.name, "index.ts") }))
    .filter((f) => {
      try {
        return readFileSync(f.path, "utf8").includes("buildRagContext(");
      } catch {
        return false;
      }
    });

  it("finds the functions that retrieve", () => {
    expect(retrievers.length).toBeGreaterThan(0);
  });

  it.each(retrievers.map((r) => r.name))("%s passes a user-scoped client", (name) => {
    const text = readFileSync(join(FN_DIR, name, "index.ts"), "utf8");
    const calls = text.match(/buildRagContext\(\s*([A-Za-z0-9_]+(?:\([^)]*\))?)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        /createRagClient\(|userClient/.test(call),
        `${name}: ${call.trim()} — retrieval must use createRagClient(req) or the ` +
          "user client. match_knowledge_chunks reads auth.uid(), which is NULL " +
          "under a service key, so this call would retrieve nothing.",
      ).toBe(true);
    }
    expect(text).not.toMatch(/buildRagContext\(\s*(service|admin)/i);
  });
});
