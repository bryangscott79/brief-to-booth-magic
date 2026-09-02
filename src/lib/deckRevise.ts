// deckRevise — client for the deck-revise edge function.
//
// Sends the compact deck summary + the user's feedback (+ the selected slide
// and the last few turns) and returns the ordered DeckOps the function
// emitted plus its one-line reply. The ops are NOT applied here — the
// caller runs them through applyDeckOps (deckOps.ts), which validates every
// one against the current deck.
//
// The session bearer is attached explicitly and the function's real error
// message is dug out of the response body (supabase-js hides it behind
// error.context) — same pattern as useAdminRole.invokeInviteFunction.

import { supabase } from "@/integrations/supabase/client";

export interface DeckReviseTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DeckReviseRequest {
  summary: string;
  feedback: string;
  /** 0-based index of the slide the feedback targets, if any. */
  selectedSlide?: number | null;
  /** Prior turns for context (the function keeps the last 8). */
  history?: DeckReviseTurn[];
}

export interface DeckReviseResult {
  /** Raw ops from the model — validate with applyDeckOps before trusting. */
  ops: unknown[];
  reply: string;
}

interface ReviseResponseBody {
  ops?: unknown;
  reply?: unknown;
  error?: unknown;
  fn_version?: unknown;
}

export async function requestDeckRevision(req: DeckReviseRequest): Promise<DeckReviseResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to revise the deck.");

  const res = await supabase.functions.invoke("deck-revise", {
    body: {
      summary: req.summary,
      feedback: req.feedback,
      ...(typeof req.selectedSlide === "number" ? { selectedSlide: req.selectedSlide } : {}),
      history: (req.history ?? []).slice(-8),
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (res.error) {
    let detail: ReviseResponseBody | null = null;
    const ctx = (res.error as { context?: Response }).context;
    if (ctx && typeof ctx.clone === "function") {
      try {
        detail = (await ctx.clone().json()) as ReviseResponseBody;
      } catch {
        /* non-JSON body — fall back to the generic message */
      }
    }
    if (detail?.error) throw new Error(String(detail.error));
    throw new Error(res.error.message);
  }

  const data = (res.data ?? null) as ReviseResponseBody | null;
  if (data?.error) throw new Error(String(data.error));
  return {
    ops: Array.isArray(data?.ops) ? (data.ops as unknown[]) : [],
    reply: typeof data?.reply === "string" && data.reply.trim() ? data.reply : "Applied your feedback.",
  };
}
