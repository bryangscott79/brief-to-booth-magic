// Pull the real error message out of a Supabase FunctionsHttpError.
//
// supabase.functions.invoke wraps any non-2xx response with the generic
// message "Edge Function returned a non-2xx status code" — opaque to the
// user. The actual JSON body lives on `err.context` (a Response object).
// This helper unwraps it and returns the underlying error string when
// present, so toasts and logs show e.g. "OpenAI API error (400): model
// not found" instead of the wrapper.
//
// Originally lived inline in useDesignedDeck.tsx; promoted here once
// renderStore needed the same treatment for hero/view generation.

export async function unwrapInvokeError(err: unknown): Promise<string> {
  if (!err) return "Unknown error";
  const fallback = err instanceof Error ? err.message : String(err);
  const ctx = (err as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      const text = await (ctx as Response).clone().text();
      if (!text) return fallback;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.error === "string") return parsed.error;
        if (parsed && typeof parsed.message === "string") return parsed.message;
      } catch {
        // Not JSON — return the text body directly (often plain error msg).
      }
      return text.length > 400 ? text.slice(0, 400) + "…" : text;
    } catch {
      /* fall through to fallback */
    }
  }
  return fallback;
}
