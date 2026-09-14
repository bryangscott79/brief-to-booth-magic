// useClientFeedback — persistence for post-export client feedback rounds.
//
// One row per round in client_feedback_rounds (raw_feedback = what the
// client actually sent, verbatim; attachments = marked-up screenshots and
// docs; items = the parsed revision plan plus its live per-item status).
// The table ships in
// supabase/migrations/20260914000000_planning_blender_feedback.sql; until
// that migration is applied every hook here transparently falls back to
// localStorage (`canopy:client-feedback:{projectId}`) so the flow keeps
// working — schemaReady=false lets the UI nudge about the migration, the
// same contract useProjectDeck uses.
//
// Attachments live in the PUBLIC project-images bucket under
// `{projectId}/feedback/…`. The leading path segment MUST be the project
// id — that's what the bucket's RLS policy keys on.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveKnowledgeScope } from "@/lib/knowledgeScope";
import { useAuth } from "@/hooks/useAuth";
import { unwrapInvokeError } from "@/lib/supabaseInvokeError";
import type {
  FeedbackRevisionItem,
  RevisionScope,
  FeedbackRoundStatus,
} from "@/lib/feedbackRevision";

// ─── SHAPES ──────────────────────────────────────────────────────────────────

export interface FeedbackRoundAttachment {
  /** Public URL in the project-images bucket. */
  url: string;
  /** Storage path — `{projectId}/feedback/{ts}_{n}_{name}`. */
  path: string;
  name: string;
  /** "image" renders as a thumbnail; "document" as a file chip. */
  kind: "image" | "document";
  /** Bytes, for the file chip. */
  size?: number;
}

export interface ClientFeedbackRound {
  id: string;
  project_id: string;
  label: string | null;
  raw_feedback: string | null;
  attachments: FeedbackRoundAttachment[];
  items: FeedbackRevisionItem[];
  /** Non-actionable notes + overall read from parse-client-feedback. */
  summary: string | null;
  status: FeedbackRoundStatus;
  created_at: string;
  updated_at: string;
}

export interface ClientFeedbackState {
  rounds: ClientFeedbackRound[];
  /** false → the table isn't in the schema yet (localStorage fallback active). */
  schemaReady: boolean;
}

// ─── FALLBACK PLUMBING ───────────────────────────────────────────────────────

const isMissingTable = (message: string) =>
  /does not exist|could not find the table|schema cache/i.test(message);

const lsKey = (projectId: string) => `canopy:client-feedback:${projectId}`;

const ATTACHMENT_BUCKET = "project-images";

function readLocalRounds(projectId: string): ClientFeedbackRound[] {
  try {
    const raw = localStorage.getItem(lsKey(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientFeedbackRound[]) : [];
  } catch {
    return [];
  }
}

function writeLocalRounds(projectId: string, rounds: ClientFeedbackRound[]) {
  try {
    localStorage.setItem(lsKey(projectId), JSON.stringify(rounds));
  } catch {
    /* quota / private mode — nothing else to do */
  }
}

/**
 * The `items` jsonb holds either a bare item array (the shape the
 * migration documents) or `{ summary, items }` — this writer uses the
 * object form so the parse summary survives, and the reader accepts
 * both so rows written either way load cleanly.
 */
function decodeItems(raw: unknown): { items: FeedbackRevisionItem[]; summary: string | null } {
  if (Array.isArray(raw)) return { items: raw as FeedbackRevisionItem[], summary: null };
  if (raw && typeof raw === "object") {
    const obj = raw as { items?: unknown; summary?: unknown };
    return {
      items: Array.isArray(obj.items) ? (obj.items as FeedbackRevisionItem[]) : [],
      summary: typeof obj.summary === "string" ? obj.summary : null,
    };
  }
  return { items: [], summary: null };
}

function encodeItems(items: FeedbackRevisionItem[], summary: string | null) {
  return { summary: summary ?? "", items };
}

interface RoundRow {
  id: string;
  project_id: string;
  label: string | null;
  raw_feedback: string | null;
  attachments: unknown;
  items: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

function decodeRow(row: RoundRow): ClientFeedbackRound {
  const { items, summary } = decodeItems(row.items);
  return {
    id: row.id,
    project_id: row.project_id,
    label: row.label,
    raw_feedback: row.raw_feedback,
    attachments: Array.isArray(row.attachments)
      ? (row.attachments as FeedbackRoundAttachment[])
      : [],
    items,
    summary,
    status: (["new", "parsed", "applying", "applied"] as const).includes(
      row.status as FeedbackRoundStatus,
    )
      ? (row.status as FeedbackRoundStatus)
      : "new",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const queryKey = (projectId: string | null | undefined) => ["client-feedback", projectId];

// ─── QUERY ───────────────────────────────────────────────────────────────────

export function useClientFeedbackRounds(projectId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKey(projectId),
    enabled: !!user && !!projectId,
    queryFn: async (): Promise<ClientFeedbackState> => {
      const { data, error } = await supabase
        .from("client_feedback_rounds")
        .select("id, project_id, label, raw_feedback, attachments, items, status, created_at, updated_at")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingTable(error.message)) {
          return { rounds: readLocalRounds(projectId!), schemaReady: false };
        }
        throw error;
      }

      return {
        rounds: (data ?? []).map((row) => decodeRow(row as unknown as RoundRow)),
        schemaReady: true,
      };
    },
  });
}

// ─── ATTACHMENT UPLOAD ───────────────────────────────────────────────────────

const IMAGE_TYPES = /^image\//;

/** Uploads dropped files to project-images under `{projectId}/feedback/…`. */
export function useUploadFeedbackAttachments(projectId: string | null | undefined) {
  return useMutation({
    mutationFn: async (files: File[]): Promise<FeedbackRoundAttachment[]> => {
      if (!projectId) throw new Error("No project selected");
      const uploaded: FeedbackRoundAttachment[] = [];

      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        // projectId MUST be the first path segment — the bucket policy keys on it.
        const path = `${projectId}/feedback/${Date.now()}_${uploaded.length}_${safeName}`;
        const { error } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (error) throw new Error(`Upload failed (${file.name}): ${error.message}`);

        const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
        uploaded.push({
          url: pub.publicUrl,
          path,
          name: file.name,
          kind: IMAGE_TYPES.test(file.type) ? "image" : "document",
          size: file.size,
        });
      }

      return uploaded;
    },
  });
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export interface CreateFeedbackRoundInput {
  label?: string | null;
  rawFeedback: string;
  attachments?: FeedbackRoundAttachment[];
  items?: FeedbackRevisionItem[];
  summary?: string | null;
  status?: FeedbackRoundStatus;
}

function localRound(
  projectId: string,
  input: CreateFeedbackRoundInput,
): ClientFeedbackRound {
  const now = new Date().toISOString();
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    project_id: projectId,
    label: input.label ?? null,
    raw_feedback: input.rawFeedback,
    attachments: input.attachments ?? [],
    items: input.items ?? [],
    summary: input.summary ?? null,
    status: input.status ?? "new",
    created_at: now,
    updated_at: now,
  };
}

export function useCreateFeedbackRound(projectId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFeedbackRoundInput): Promise<ClientFeedbackRound> => {
      if (!projectId) throw new Error("No project selected");
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("client_feedback_rounds")
        .insert({
          project_id: projectId,
          created_by: user.id,
          label: input.label ?? null,
          raw_feedback: input.rawFeedback,
          attachments: (input.attachments ?? []) as never,
          items: encodeItems(input.items ?? [], input.summary ?? null) as never,
          status: input.status ?? "new",
        })
        .select("id, project_id, label, raw_feedback, attachments, items, status, created_at, updated_at")
        .single();

      if (error) {
        if (isMissingTable(error.message)) {
          const round = localRound(projectId, input);
          writeLocalRounds(projectId, [round, ...readLocalRounds(projectId)]);
          return round;
        }
        throw error;
      }

      return decodeRow(data as unknown as RoundRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectId) });
    },
  });
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export interface UpdateFeedbackRoundInput {
  id: string;
  label?: string | null;
  /** Parsed items — pass the whole list; per-item status rides inside. */
  items?: FeedbackRevisionItem[];
  summary?: string | null;
  status?: FeedbackRoundStatus;
  attachments?: FeedbackRoundAttachment[];
}

/**
 * Patch one round. `items` and `summary` share the single `items` jsonb
 * column, so passing either re-encodes both — the caller hands us the
 * current summary alongside the items it is changing.
 */
export function useUpdateFeedbackRound(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateFeedbackRoundInput): Promise<void> => {
      if (!projectId) throw new Error("No project selected");

      const patch: Record<string, unknown> = {};
      if (input.label !== undefined) patch.label = input.label;
      if (input.status !== undefined) patch.status = input.status;
      if (input.attachments !== undefined) patch.attachments = input.attachments;
      if (input.items !== undefined || input.summary !== undefined) {
        patch.items = encodeItems(input.items ?? [], input.summary ?? null);
      }
      if (Object.keys(patch).length === 0) return;

      const { error } = await supabase
        .from("client_feedback_rounds")
        .update(patch as never)
        .eq("id", input.id);

      if (error) {
        if (isMissingTable(error.message)) {
          const rounds = readLocalRounds(projectId).map((r) =>
            r.id === input.id
              ? {
                  ...r,
                  ...(input.label !== undefined ? { label: input.label } : {}),
                  ...(input.status !== undefined ? { status: input.status } : {}),
                  ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
                  ...(input.items !== undefined ? { items: input.items } : {}),
                  ...(input.summary !== undefined ? { summary: input.summary } : {}),
                  updated_at: new Date().toISOString(),
                }
              : r,
          );
          writeLocalRounds(projectId, rounds);
          return;
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(projectId) });
    },
  });
}

// ─── PARSE ───────────────────────────────────────────────────────────────────

export interface ParseClientFeedbackInput {
  feedback: string;
  images: Array<{ angleId: string; angleName: string; caption?: string }>;
  boothSizeLabel?: string | null;
  brief?: string | null;
  /** Scopes retrieval to the agency's knowledge base. */
  projectId?: string;
}

export interface ParseClientFeedbackResult {
  summary: string;
  items: FeedbackRevisionItem[];
}

/** Stable-enough id for a parsed item (the edge function doesn't mint one). */
function itemId(index: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item_${Date.now()}_${index}`;
}

/**
 * Calls parse-client-feedback and normalizes the plan into review-table
 * items — everything included by default, everything pending. The edge
 * function already drops items naming a render we didn't send; this adds
 * the client-side fields (id / include / status) it has no business knowing
 * about.
 */
export function useParseClientFeedback() {
  return useMutation({
    mutationFn: async (input: ParseClientFeedbackInput): Promise<ParseClientFeedbackResult> => {
      const { data, error } = await supabase.functions.invoke("parse-client-feedback", {
        body: {
          feedback: input.feedback,
          images: input.images,
          boothSizeLabel: input.boothSizeLabel || undefined,
          brief: input.brief || undefined,
          ...(await resolveKnowledgeScope(input.projectId)),
        },
      });
      if (error) throw new Error(await unwrapInvokeError(error));
      if (data?.error) throw new Error(String(data.error));

      const rawItems: unknown[] = Array.isArray(data?.items) ? data.items : [];
      const items: FeedbackRevisionItem[] = rawItems
        .map((raw, index) => {
          const obj = raw as Record<string, unknown>;
          const instruction = typeof obj.instruction === "string" ? obj.instruction.trim() : "";
          const angleId = typeof obj.angleId === "string" ? obj.angleId : "all";
          const scope: RevisionScope =
            obj.scope === "global" || angleId === "all" ? "global" : "single";
          const confidence = typeof obj.confidence === "number" ? obj.confidence : 0.5;
          return {
            id: itemId(index),
            angleId,
            instruction,
            scope,
            confidence: Math.max(0, Math.min(1, confidence)),
            include: true,
            status: "pending" as const,
          };
        })
        .filter((item) => item.instruction.length > 0);

      return { summary: typeof data?.summary === "string" ? data.summary : "", items };
    },
  });
}
