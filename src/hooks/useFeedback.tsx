// Feedback / bug & feature tracker.
//
// Any signed-in user submits feedback (bug / feature / improvement); it is
// stamped with their agency so agency admins (owner/admin) can review their
// agency's queue, while super admins review everything (RLS enforces both).
// Reviewers triage with status, priority, and internal notes.
//
// Resilience: until the feedback migration is applied to the hosted DB
// (supabase/migrations/20260824000000_feedback_tracker.sql), queries resolve
// to a "schema not ready" state instead of erroring, and the page shows a
// setup notice with the SQL.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { resolveImageUrl } from "@/lib/signedImageUrl";

export type FeedbackType = "bug" | "feature" | "improvement";
export type FeedbackStatus =
  | "new"
  | "under_review"
  | "planned"
  | "in_progress"
  | "shipped"
  | "declined";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackAttachment {
  /** Public URL in the feedback-attachments bucket */
  url: string;
  /** Storage path (for later cleanup) */
  path: string;
  name: string;
}

export interface FeedbackItem {
  id: string;
  user_id: string;
  submitter_email: string | null;
  agency_id: string | null;
  project_id: string | null;
  type: FeedbackType;
  title: string;
  description: string | null;
  page_path: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  attachments: FeedbackAttachment[];
  created_at: string;
  updated_at: string;
}

/** attachments is jsonb — normalize defensively (pre-migration rows lack it). */
const normalizeItem = (row: Record<string, unknown>): FeedbackItem => ({
  ...(row as unknown as FeedbackItem),
  attachments: Array.isArray(row.attachments) ? (row.attachments as FeedbackAttachment[]) : [],
});

const isMissingTable = (message: string) =>
  /does not exist|could not find the table|schema cache/i.test(message);

/** True when the current user can triage feedback: agency owner/admin or super admin. */
export function useCanReviewFeedback() {
  const { role } = useAgency();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  return Boolean(isSuperAdmin || role === "owner" || role === "admin");
}

/**
 * All feedback rows RLS lets the current user see, newest first.
 * For members that is their own submissions; for agency admins their agency's
 * queue (plus their own); for super admins the whole platform.
 */
export function useFeedback() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["feedback", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<{ items: FeedbackItem[]; schemaReady: boolean }> => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingTable(error.message)) return { items: [], schemaReady: false };
        throw error;
      }
      // feedback-attachments bucket is private — sign each attachment URL.
      const items = await Promise.all(
        (data ?? []).map(async (r) => {
          const item = normalizeItem(r as Record<string, unknown>);
          const attachments = await Promise.all(
            item.attachments.map(async (a) => ({
              ...a,
              url: (await resolveImageUrl(a.path ? `feedback-attachments/${a.path}` : a.url)) ?? a.url,
            })),
          );
          return { ...item, attachments };
        }),
      );
      return { items, schemaReady: true };
    },
  });
}

export interface SubmitFeedbackInput {
  type: FeedbackType;
  title: string;
  description?: string;
  pagePath?: string | null;
  projectId?: string | null;
  /** Screenshot files — uploaded to the feedback-attachments bucket first. */
  files?: File[];
}

const ATTACHMENT_BUCKET = "feedback-attachments";

export function useSubmitFeedback() {
  const { user } = useAuth();
  const { agency } = useAgency();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      if (!user) throw new Error("Not signed in");

      // Upload screenshots before the insert so the row carries final URLs.
      const attachments: FeedbackAttachment[] = [];
      for (const file of input.files ?? []) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        const path = `${user.id}/${Date.now()}_${attachments.length}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: file.type || "image/png" });
        if (uploadError) {
          throw new Error(`Screenshot upload failed (${file.name}): ${uploadError.message}`);
        }
        const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
        attachments.push({ url: pub.publicUrl, path, name: file.name });
      }

      const { data, error } = await supabase
        .from("feedback")
        .insert({
          user_id: user.id,
          submitter_email: user.email ?? null,
          agency_id: agency?.id ?? null,
          project_id: input.projectId ?? null,
          type: input.type,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          page_path: input.pagePath ?? null,
          attachments: attachments as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      return normalizeItem(data as Record<string, unknown>);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback"] }),
  });
}

export interface TriageFeedbackInput {
  id: string;
  status?: FeedbackStatus;
  priority?: FeedbackPriority | null;
  adminNotes?: string | null;
}

/** Reviewer-only triage; RLS rejects non-admins. */
export function useTriageFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TriageFeedbackInput) => {
      const patch: Record<string, unknown> = {
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      };
      if (input.status !== undefined) patch.status = input.status;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.adminNotes !== undefined) patch.admin_notes = input.adminNotes;

      const { data, error } = await supabase
        .from("feedback")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return normalizeItem(data as Record<string, unknown>);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["feedback"] }),
  });
}
