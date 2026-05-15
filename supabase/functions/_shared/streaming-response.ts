// streamingJsonResponse — wrap a long-running edge function in a
// keep-alive stream so Supabase's 150s idle-timeout doesn't kill the
// connection before the work finishes.
//
// Image generation routinely takes 150-180s at high quality on
// gpt-image-2. A standard `return new Response(...)` would queue the
// body until the work completes — Supabase sees no bytes for 150s and
// hard-aborts the function with "Request idle timeout limit (150s)
// reached". Streaming a single space char every 20s resets the idle
// timer without producing garbage data in the response: JSON.parse
// tolerates leading whitespace, so callers using
// `supabase.functions.invoke` (which JSON-parses the response body)
// keep working unchanged.
//
// Originally inlined in generate-hero by an upstream commit; promoted
// here once generate-view needed the same treatment for its (also
// long) view renders. Single source of truth so future tweaks land
// in one place.

const KEEPALIVE_INTERVAL_MS = 20_000;

export interface StreamingJsonResponseProducer<T = unknown> {
  (): Promise<T>;
}

/**
 * Run `produce()` while streaming a single-space keep-alive every
 * 20s. When `produce()` resolves, the result is JSON-stringified and
 * flushed as the final chunk. When it rejects, the error message is
 * surfaced under the `error` key in a JSON body and the stream closes.
 *
 * The response always returns HTTP 200 — supabase-js doesn't surface
 * an HTTP error status on streamed responses anyway, and using the
 * `error` body field is the same pattern the rest of the codebase
 * uses for downstream error reporting.
 */
export function streamingJsonResponse(
  produce: StreamingJsonResponseProducer,
  corsHeaders: Record<string, string>,
  keepAliveMs: number = KEEPALIVE_INTERVAL_MS,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let done = false;
      const ping = setInterval(() => {
        if (done) return;
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          /* stream was closed by the consumer */
        }
      }, keepAliveMs);
      try {
        const body = await produce();
        done = true;
        clearInterval(ping);
        controller.enqueue(encoder.encode(JSON.stringify(body)));
        controller.close();
      } catch (e) {
        done = true;
        clearInterval(ping);
        const msg = e instanceof Error ? e.message : "Failed";
        controller.enqueue(encoder.encode(JSON.stringify({ error: msg })));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
