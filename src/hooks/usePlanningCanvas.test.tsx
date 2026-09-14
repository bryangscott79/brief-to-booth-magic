// Regression coverage for the planning canvas save path.
//
// The bug this pins: the save mutation reduced the cache in an optimistic
// React Query hook AND again inside mutationFn. React Query runs the
// optimistic hook first, so mutationFn re-read an already-reduced cache and
// applied the same change a second time — every chat turn appeared twice and
// every pin/star/note click DOUBLED the entire board.
//
// The invariant: one call through the save path applies the reducer exactly
// once, no matter how many times the same action is fired.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const upsert = vi.fn(async (..._args: unknown[]) => ({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import { useSavePlanningCanvas } from "./usePlanningCanvas";
import { addCards, appendMessage, makeCard, makeMessage } from "@/lib/planningCanvas";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("planning canvas save path", () => {
  beforeEach(() => upsert.mockClear());

  it("applies the reducer exactly once per action", async () => {
    const { result } = renderHook(() => useSavePlanningCanvas("project-1"), { wrapper });

    const cards = [makeCard({ label: "A", prompt: "# SCENE a" })];
    await act(async () => {
      result.current.mutate((s) => addCards(s, cards));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // One action → one card. The bug produced two.
    expect(result.current.data?.cards).toHaveLength(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const written = upsert.mock.calls[0][0] as { cards: unknown[] };
    expect(written.cards).toHaveLength(1);
  });

  it("does not double the board when the same action fires repeatedly", async () => {
    const { result } = renderHook(() => useSavePlanningCanvas("project-1"), { wrapper });

    // Simulates clicking pin three times: each is a separate reduce, and the
    // board must grow by the reducer's own semantics only — never double.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        result.current.mutate((s) => appendMessage(s, makeMessage("user", `turn ${i}`)));
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    }

    expect(result.current.data?.messages).toHaveLength(3);
    expect(result.current.data?.cards).toHaveLength(0);
  });

  it("keeps both changes when two actions fire back to back", async () => {
    // The exact failure: a chat turn appended the assistant message and then
    // added its cards without awaiting. Reducing asynchronously made both
    // read the same pre-change snapshot, so the later write dropped the
    // cards and the board came up empty while the message showed.
    const { result } = renderHook(() => useSavePlanningCanvas("project-1"), { wrapper });

    const cards = [
      makeCard({ label: "A", prompt: "# SCENE a" }),
      makeCard({ label: "B", prompt: "# SCENE b" }),
      makeCard({ label: "C", prompt: "# SCENE c" }),
    ];

    await act(async () => {
      result.current.mutate((s) => appendMessage(s, makeMessage("assistant", "3 concepts on the board")));
      result.current.mutate((s) => addCards(s, cards));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const written = upsert.mock.calls[upsert.mock.calls.length - 1][0] as {
      messages: unknown[];
      cards: unknown[];
    };
    expect(written.messages).toHaveLength(1);
    expect(written.cards).toHaveLength(3);
  });
});
