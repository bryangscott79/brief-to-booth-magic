// Writes a single row to public.ai_usage_events. Uses service role so RLS
// (insert-deny-all to clients) is bypassed; this function is the only way
// rows enter that table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { UsageContext } from "./usage-context.ts";
import { estimateCostUsd, getProvider } from "./pricing.ts";

export interface UsageEvent {
  context: UsageContext;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  durationMs?: number;
  status?: "success" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

let cachedClient: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  return cachedClient;
}

/**
 * Fire-and-forget: never throws, never blocks the AI response.
 * Errors are logged but never bubble up — telemetry must not break product.
 */
export function logUsageEvent(event: UsageEvent): void {
  try {
    const inT = event.inputTokens ?? 0;
    const outT = event.outputTokens ?? 0;
    const imgs = event.imageCount ?? 0;
    const cost = estimateCostUsd(event.model, inT, outT, imgs);
    const total = inT + outT;

    const row = {
      feature: event.context.feature,
      model: event.model,
      provider: getProvider(event.model),
      user_id: event.context.user_id ?? null,
      agency_id: event.context.agency_id ?? null,
      project_id: event.context.project_id ?? null,
      input_tokens: inT,
      output_tokens: outT,
      total_tokens: total,
      cost_usd: cost,
      duration_ms: event.durationMs ?? null,
      status: event.status ?? "success",
      error_message: event.errorMessage ?? null,
      metadata: {
        ...(event.metadata ?? {}),
        ...(imgs > 0 ? { image_count: imgs } : {}),
        ...(event.context.client_id ? { client_id: event.context.client_id } : {}),
      },
    };

    // Don't await — let it fly so we don't add latency to the response.
    getServiceClient()
      .from("ai_usage_events")
      .insert(row)
      .then(({ error }) => {
        if (error) console.warn("[usage-logger] insert failed:", error.message);
      });
  } catch (e) {
    console.warn("[usage-logger] threw:", e);
  }
}
