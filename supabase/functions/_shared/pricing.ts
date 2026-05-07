// Per-model pricing in USD per 1M tokens (input / output).
// Image models priced per image (flat).
// Source: published Lovable AI gateway / vendor list rates as of 2026-05.
// Conservative estimates — refine as actual invoices land.

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMtok?: number;
  /** USD per 1M output tokens */
  outputPerMtok?: number;
  /** USD per generated image (overrides token pricing when present) */
  perImage?: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Gemini
  "google/gemini-2.5-pro": { inputPerMtok: 1.25, outputPerMtok: 10.0 },
  "google/gemini-3.1-pro-preview": { inputPerMtok: 1.25, outputPerMtok: 10.0 },
  "google/gemini-2.5-flash": { inputPerMtok: 0.075, outputPerMtok: 0.30 },
  "google/gemini-3-flash-preview": { inputPerMtok: 0.10, outputPerMtok: 0.40 },
  "google/gemini-2.5-flash-lite": { inputPerMtok: 0.04, outputPerMtok: 0.15 },
  // Image gen
  "google/gemini-3-pro-image-preview": { perImage: 0.039 },
  "google/gemini-3.1-flash-image-preview": { perImage: 0.020 },
  "google/gemini-2.5-flash-image": { perImage: 0.015 },
  // OpenAI
  "openai/gpt-5": { inputPerMtok: 2.50, outputPerMtok: 10.0 },
  "openai/gpt-5-mini": { inputPerMtok: 0.30, outputPerMtok: 1.20 },
  "openai/gpt-5-nano": { inputPerMtok: 0.05, outputPerMtok: 0.20 },
  "openai/gpt-5.2": { inputPerMtok: 3.0, outputPerMtok: 12.0 },
  "openai/gpt-image-2": { perImage: 0.19 },
  // Anthropic
  "anthropic/claude-sonnet-4": { inputPerMtok: 3.0, outputPerMtok: 15.0 },
  "claude-sonnet-4-20250514": { inputPerMtok: 3.0, outputPerMtok: 15.0 },
  "claude-haiku-4": { inputPerMtok: 0.25, outputPerMtok: 1.25 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  imageCount = 0,
): number {
  const p = PRICING[model] ?? PRICING[model.replace(/^google\//, "")] ?? {};
  if (p.perImage && imageCount > 0) {
    return Number((p.perImage * imageCount).toFixed(6));
  }
  const inCost = ((p.inputPerMtok ?? 0) * inputTokens) / 1_000_000;
  const outCost = ((p.outputPerMtok ?? 0) * outputTokens) / 1_000_000;
  return Number((inCost + outCost).toFixed(6));
}

export function getProvider(model: string): string {
  if (model.startsWith("google/") || model.startsWith("gemini")) return "google";
  if (model.startsWith("openai/") || model.startsWith("gpt")) return "openai";
  if (model.startsWith("anthropic/") || model.startsWith("claude")) return "anthropic";
  return "unknown";
}
