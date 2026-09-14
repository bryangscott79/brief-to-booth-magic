/**
 * Writes what the team actually decided back into the knowledge base.
 *
 * Until now the corpus only grew when somebody remembered to upload a file,
 * so Canopy could run a hundred projects and know nothing more at the end
 * than at the start. Retrieval without capture is a filing cabinet, not
 * memory.
 *
 * Two rules shape everything here:
 *
 * 1. CAPTURE IS CLIENT-SCOPED, NOT PROJECT-SCOPED. A document about this
 *    project's approved direction, filed against this project, is worthless
 *    — the project already has that context in front of it. The value is
 *    the NEXT job for the same client knowing what they approved and what
 *    they rejected. Client scope when the project has a client, agency
 *    scope otherwise.
 *
 * 2. CAPTURE IS IDEMPOTENT. The storage path is derived from the kind and
 *    the project, so re-approving a direction REPLACES that project's
 *    contribution instead of appending another near-duplicate. A project
 *    can therefore contribute at most one document per kind no matter how
 *    many times the user toggles, which is what keeps an automatic writer
 *    from poisoning the corpus it is meant to improve.
 *
 * Capture is a side effect of the user's real action. It never throws and
 * never blocks: a failed capture must not cost someone their render.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveKnowledgeScope } from "@/lib/knowledgeScope";

export type CaptureKind = "approved_direction" | "client_feedback";

/** Marks every auto-written document, so they can be found and removed. */
export const AUTO_CAPTURE_TAG = "auto-captured";

const KIND_LABEL: Record<CaptureKind, string> = {
  approved_direction: "Approved direction",
  client_feedback: "Client feedback",
};

export interface CaptureRequest {
  kind: CaptureKind;
  /** Provenance and dedupe key — never the scope. */
  projectId: string;
  projectName?: string | null;
  /** Document title as it will appear in the sources popover. */
  title: string;
  /** Markdown body. Empty or whitespace-only is a no-op. */
  body: string;
}

export type CaptureResult =
  | { status: "written"; documentId: string; scope: "client" | "agency" }
  | { status: "skipped"; reason: string };

/**
 * Files one captured document and queues it for embedding.
 *
 * Returns rather than throws — callers fire this alongside the real work
 * and should not branch on it beyond logging.
 */
export async function captureToKnowledgeBase(req: CaptureRequest): Promise<CaptureResult> {
  try {
    const body = req.body.trim();
    if (!body) return { status: "skipped", reason: "empty body" };

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return { status: "skipped", reason: "no authenticated user" };

    const scopeKeys = await resolveKnowledgeScope(req.projectId);
    const agencyId = scopeKeys.agency_id;
    if (!agencyId) return { status: "skipped", reason: "no agency" };

    // Client when we have one — that is the whole point. Agency otherwise,
    // which still beats filing it where only this project can see it.
    const scope: "client" | "agency" = scopeKeys.client_id ? "client" : "agency";
    const scopeId = scopeKeys.client_id ?? agencyId;

    // Stable path = idempotent capture. Re-approving replaces.
    const storagePath = `${agencyId}/${scope}/${scopeId}/auto/${req.kind}__${req.projectId}.md`;
    const filename = `${KIND_LABEL[req.kind]} — ${req.projectName || "project"}.md`;

    const markdown = renderDocument(req);

    const { error: uploadErr } = await supabase.storage
      .from("knowledge-documents")
      .upload(storagePath, new Blob([markdown], { type: "text/markdown" }), {
        contentType: "text/markdown",
        upsert: true,
      });
    if (uploadErr) return { status: "skipped", reason: uploadErr.message };

    // Replace this project's existing contribution of this kind rather than
    // adding a second one.
    const { data: existing } = await supabase
      .from("knowledge_documents")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();

    const row = {
      scope,
      scope_id: scopeId,
      agency_id: agencyId,
      filename,
      storage_bucket: "knowledge-documents",
      storage_path: storagePath,
      mime_type: "text/markdown",
      file_size_bytes: markdown.length,
      title: req.title,
      user_tags: [AUTO_CAPTURE_TAG, req.kind],
      status: "pending",
      uploaded_by: userId,
      metadata: {
        auto_captured: true,
        kind: req.kind,
        project_id: req.projectId,
        project_name: req.projectName ?? null,
        captured_at: new Date().toISOString(),
      },
    };

    let documentId: string;
    if (existing?.id) {
      const { error } = await supabase
        .from("knowledge_documents")
        .update(row)
        .eq("id", existing.id);
      if (error) return { status: "skipped", reason: error.message };
      documentId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .insert(row)
        .select("id")
        .single();
      if (error || !data) {
        return { status: "skipped", reason: error?.message ?? "insert returned nothing" };
      }
      documentId = data.id;
    }

    // embed-document deletes this document's existing chunks before
    // re-inserting, so re-embedding a replaced capture is safe.
    const { error: embedErr } = await supabase.functions.invoke("embed-document", {
      body: { document_id: documentId },
    });
    if (embedErr) {
      // The row exists and shows as pending/failed in the KB UI; the user
      // can retry there. Nothing to surface at the call site.
      console.warn("[knowledgeCapture] embed-document failed:", embedErr);
    }

    return { status: "written", documentId, scope };
  } catch (e) {
    console.warn("[knowledgeCapture] capture failed:", e);
    return { status: "skipped", reason: e instanceof Error ? e.message : "unknown error" };
  }
}

// ─── document bodies ─────────────────────────────────────────────────────────

function renderDocument(req: CaptureRequest): string {
  const heading = `# ${req.title}`;
  const provenance = [
    `Captured automatically by Canopy from project "${req.projectName || req.projectId}".`,
    `Kind: ${KIND_LABEL[req.kind]}.`,
  ].join(" ");
  return `${heading}\n\n_${provenance}_\n\n${req.body.trim()}\n`;
}

/**
 * The prose an approved direction contributes.
 *
 * Deliberately records the REJECTED labels too. Which directions a client
 * turned down is the scarcer signal — a hundred approvals tell you less
 * about a client's taste than the things they said no to.
 */
export function approvedDirectionBody(input: {
  label: string;
  rationale?: string | null;
  prompt: string;
  notes?: string | null;
  rejectedLabels?: string[];
}): string {
  const parts: string[] = [`## Direction taken forward: ${input.label}`];
  if (input.rationale?.trim()) parts.push(`**Why it was chosen.** ${input.rationale.trim()}`);
  if (input.notes?.trim()) parts.push(`**Team notes.** ${input.notes.trim()}`);
  parts.push(`## The prompt that produced it\n\n\`\`\`\n${input.prompt.trim()}\n\`\`\``);
  if (input.rejectedLabels?.length) {
    parts.push(
      `## Directions considered and dropped\n\n` +
        input.rejectedLabels.map((l) => `- ${l}`).join("\n") +
        `\n\nDo not re-propose these for this client without a reason.`,
    );
  }
  return parts.join("\n\n");
}

/** The prose a round of client feedback contributes. */
export function clientFeedbackBody(input: {
  summary?: string | null;
  rawFeedback: string;
  items: Array<{ instruction: string; status?: string }>;
}): string {
  const parts: string[] = [];
  if (input.summary?.trim()) parts.push(`## Summary\n\n${input.summary.trim()}`);
  parts.push(`## What the client said\n\n${input.rawFeedback.trim()}`);

  const applied = input.items.filter((i) => i.status === "applied" && i.instruction.trim());
  if (applied.length) {
    parts.push(
      `## Changes they asked for, and we made\n\n` +
        applied.map((i) => `- ${i.instruction.trim()}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}
