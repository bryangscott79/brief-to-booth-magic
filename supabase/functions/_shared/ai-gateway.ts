/**
 * Shared AI Gateway Utility
 *
 * Replaces the Lovable API gateway with direct calls to:
 *  - Google AI (Gemini) for all generation except presentations
 *  - Anthropic (Claude) for presentations
 *
 * Deno-compatible: uses only fetch and Deno.env, no npm imports.
 */

import { logUsageEvent } from "./usage-logger.ts";
import type { UsageContext } from "./usage-context.ts";

// ─── MODEL MAPPING ──────────────────────────────────────────────────────────

/** Maps Lovable gateway model names to Google AI direct model names. */
const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.5-flash-lite": "gemini-2.5-flash-lite",
  "google/gemini-2.5-pro": "gemini-2.5-pro",
  "google/gemini-3-pro-image-preview": "gemini-2.0-flash-exp",
  "google/gemini-3-flash-preview": "gemini-2.0-flash",
};

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface GeminiOptions {
  /** Model name using the Lovable gateway convention (e.g. "google/gemini-2.5-flash"). Mapped internally. */
  model: string;
  /** Messages in OpenAI format. System messages are extracted into systemInstruction. */
  messages: Array<{ role: string; content: string | Array<any> }>;
  /** Tool definitions in OpenAI format. Converted to Google AI functionDeclarations. */
  tools?: any[];
  /** Tool choice in OpenAI format. Converted to Google AI toolConfig. */
  toolChoice?: any;
  /** Sampling temperature (0-2). */
  temperature?: number;
  /** Maximum output tokens. */
  maxTokens?: number;
  /** Response modalities, e.g. ["image", "text"]. Adds responseModalities to generationConfig. */
  modalities?: string[];
  /** Optional usage logging context. When set, the call is recorded in ai_usage_events. */
  usage?: UsageContext;
}

export interface AnthropicOptions {
  /** Model name. Defaults to Sonnet 4. Pass a Haiku model for cheap classification. */
  model?: string;
  /** System prompt (top-level, not in messages). */
  system?: string;
  /** Messages array. */
  messages: Array<{ role: string; content: string }>;
  /** Tool definitions in Anthropic format. */
  tools?: any[];
  /** Tool choice in Anthropic format. */
  toolChoice?: any;
  /** Maximum output tokens. Defaults to 8192. */
  maxTokens?: number;
  /** Sampling temperature (0-1). */
  temperature?: number;
  /** Optional usage logging context. */
  usage?: UsageContext;
}

export interface AIResponse {
  /** Text content from the response, if any. */
  text?: string;
  /** Tool calls returned by the model. */
  toolCalls?: Array<{ name: string; arguments: any }>;
  /** Images returned by the model (Gemini image generation). */
  images?: Array<{ mimeType: string; base64Data: string }>;
  /** Token usage extracted from the upstream response (best effort). */
  usage?: { inputTokens?: number; outputTokens?: number };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/**
 * Fetches an image from a URL and returns it as base64 inlineData for Google AI.
 * Google AI's fileData.fileUri only works with files uploaded to Google's File API,
 * so external URLs must be fetched and converted to inline base64.
 */
async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
  // Handle data URIs directly
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    throw new Error(`Unsupported data URI format: ${url.substring(0, 50)}...`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Convert to base64 in chunks to avoid stack overflow on large images
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  const data = btoa(binary);

  return { mimeType, data };
}

/**
 * Converts an OpenAI-format content part to a Google AI part.
 * Handles text, image_url (with base64 conversion), and other types.
 */
async function convertContentPartToGemini(
  part: any,
): Promise<any> {
  if (typeof part === "string") {
    return { text: part };
  }

  if (part.type === "text") {
    return { text: part.text };
  }

  if (part.type === "image_url" && part.image_url?.url) {
    const { mimeType, data } = await fetchImageAsBase64(part.image_url.url);
    return { inlineData: { mimeType, data } };
  }

  // Pass through unknown part types as text description
  return { text: `[Unsupported content type: ${part.type}]` };
}

/**
 * Converts OpenAI-format messages to Google AI format.
 * Extracts system messages into a separate systemInstruction.
 * Returns { systemInstruction, contents }.
 */
async function convertMessagesToGemini(
  messages: Array<{ role: string; content: string | Array<any> }>,
): Promise<{
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<any> }>;
}> {
  const systemParts: string[] = [];
  const contents: Array<{ role: string; parts: Array<any> }> = [];

  for (const msg of messages) {
    // System messages become systemInstruction
    if (msg.role === "system") {
      if (typeof msg.content === "string") {
        systemParts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (typeof part === "string") systemParts.push(part);
          else if (part.type === "text") systemParts.push(part.text);
        }
      }
      continue;
    }

    // Map "assistant" role to "model" for Google AI
    const role = msg.role === "assistant" ? "model" : "user";

    // Convert content to parts
    const parts: any[] = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        parts.push(await convertContentPartToGemini(part));
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const result: {
    systemInstruction?: { parts: Array<{ text: string }> };
    contents: Array<{ role: string; parts: Array<any> }>;
  } = { contents };

  if (systemParts.length > 0) {
    result.systemInstruction = {
      parts: [{ text: systemParts.join("\n\n") }],
    };
  }

  return result;
}

/**
 * Converts OpenAI-format tool definitions to Google AI functionDeclarations.
 */
function convertToolsToGemini(
  tools: any[],
): Array<{ functionDeclarations: any[] }> {
  const declarations = tools
    .filter((t: any) => t.type === "function" && t.function)
    .map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

  return [{ functionDeclarations: declarations }];
}

/**
 * Converts OpenAI-format tool_choice to Google AI toolConfig.
 */
function convertToolChoiceToGemini(
  toolChoice: any,
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } {
  // tool_choice: "auto" → mode: AUTO
  if (toolChoice === "auto") {
    return { functionCallingConfig: { mode: "AUTO" } };
  }

  // tool_choice: "none" → mode: NONE
  if (toolChoice === "none") {
    return { functionCallingConfig: { mode: "NONE" } };
  }

  // tool_choice: { type: "function", function: { name: "..." } } → mode: ANY with allowedFunctionNames
  if (toolChoice?.type === "function" && toolChoice.function?.name) {
    return {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [toolChoice.function.name],
      },
    };
  }

  // Default: auto
  return { functionCallingConfig: { mode: "AUTO" } };
}

/**
 * Parses a Google AI response into a normalized AIResponse.
 */
function parseGeminiResponse(data: any): AIResponse {
  const result: AIResponse = {};
  const candidate = data.candidates?.[0];

  if (!candidate?.content?.parts) {
    // Check for safety/error blocks
    const blockReason = candidate?.finishReason;
    if (blockReason === "SAFETY") {
      throw new Error("Gemini blocked the response due to safety filters.");
    }
    throw new Error(
      `Gemini returned no content. Finish reason: ${blockReason || "unknown"}. ` +
      `Prompt feedback: ${JSON.stringify(data.promptFeedback || {})}`,
    );
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ name: string; arguments: any }> = [];
  const images: Array<{ mimeType: string; base64Data: string }> = [];

  for (const part of candidate.content.parts) {
    // Text content
    if (part.text) {
      textParts.push(part.text);
    }

    // Function/tool call
    if (part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        arguments: part.functionCall.args,
      });
    }

    // Inline image data (from image generation)
    if (part.inlineData) {
      images.push({
        mimeType: part.inlineData.mimeType,
        base64Data: part.inlineData.data,
      });
    }
  }

  if (textParts.length > 0) {
    result.text = textParts.join("");
  }

  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  if (images.length > 0) {
    result.images = images;
  }

  if (data.usageMetadata) {
    result.usage = {
      inputTokens: data.usageMetadata.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
    };
  }

  return result;
}

/**
 * Parses an Anthropic Messages API response into a normalized AIResponse.
 */
function parseAnthropicResponse(data: any): AIResponse {
  const result: AIResponse = {};
  const textParts: string[] = [];
  const toolCalls: Array<{ name: string; arguments: any }> = [];

  if (!data.content || !Array.isArray(data.content)) {
    if (data.error) {
      throw new Error(`Anthropic API error: ${data.error.type} — ${data.error.message}`);
    }
    throw new Error(`Anthropic returned no content. Stop reason: ${data.stop_reason || "unknown"}`);
  }

  for (const block of data.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    }

    if (block.type === "tool_use") {
      toolCalls.push({
        name: block.name,
        arguments: block.input,
      });
    }
  }

  if (textParts.length > 0) {
    result.text = textParts.join("");
  }

  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  if (data.usage) {
    result.usage = {
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    };
  }

  return result;
}

/**
 * Thrown when the upstream provider returns HTTP 402 (insufficient credits).
 * Lets callers detect billing failures and trigger a cheaper-model fallback.
 */
export class PaymentRequiredError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

/**
 * Retry wrapper: retries once after a 2-second wait on HTTP 429 (rate limit).
 * Throws on all other errors.
 */
async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  const response = await fetch(url, init);

  if (response.status === 429) {
    console.warn(`[ai-gateway] ${label}: rate limited (429), retrying in 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
    const retry = await fetch(url, init);
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(
        `[ai-gateway] ${label}: rate limit retry failed (${retry.status}): ${text.substring(0, 300)}`,
      );
    }
    return retry;
  }

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 402) {
      throw new PaymentRequiredError(
        `[ai-gateway] ${label}: insufficient credits (402): ${text.substring(0, 300)}`,
      );
    }
    throw new Error(
      `[ai-gateway] ${label}: API error (${response.status}): ${text.substring(0, 500)}`,
    );
  }

  return response;
}

/**
 * Safely parse a JSON response body. Upstream AI providers occasionally return
 * an empty body on transient failures (502/504, dropped connection, gateway
 * timeout) which causes `response.json()` to throw the unhelpful
 * "Unexpected end of JSON input". This wraps the read with a clear error.
 */
async function parseJsonResponse(response: Response, label: string): Promise<any> {
  const raw = await response.text();
  if (!raw || !raw.trim()) {
    throw new Error(
      `[ai-gateway] ${label}: upstream returned empty body (status ${response.status}). The model may be overloaded — please retry.`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `[ai-gateway] ${label}: upstream returned non-JSON body (status ${response.status}): ${raw.substring(0, 300)}`,
    );
  }
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

/**
 * Call Google AI (Gemini) with OpenAI-format inputs.
 *
 * Handles model name mapping, message format conversion (including multimodal
 * with automatic image URL to base64 conversion), tool calling, and image
 * generation via responseModalities.
 *
 * @example Text generation with tool call
 * ```ts
 * const result = await callGemini({
 *   model: "google/gemini-2.5-flash",
 *   messages: [
 *     { role: "system", content: "Parse this brief..." },
 *     { role: "user", content: briefText },
 *   ],
 *   tools: [{ type: "function", function: { name: "parse_brief", parameters: {...} } }],
 *   toolChoice: { type: "function", function: { name: "parse_brief" } },
 * });
 * // result.toolCalls[0].arguments contains the parsed data
 * ```
 *
 * @example Image generation
 * ```ts
 * const result = await callGemini({
 *   model: "google/gemini-3-pro-image-preview",
 *   messages: [{ role: "user", content: "Generate a trade show booth..." }],
 *   modalities: ["image", "text"],
 * });
 * // result.images[0].base64Data contains the generated image
 * ```
 */
export async function callGemini(options: GeminiOptions): Promise<AIResponse> {
  const started = Date.now();
  try {
    const result = await _callGeminiInner(options);
    if (options.usage) {
      logUsageEvent({
        context: options.usage,
        model: options.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        imageCount: result.images?.length ?? 0,
        durationMs: Date.now() - started,
        status: "success",
      });
    }
    return result;
  } catch (e) {
    if (options.usage) {
      logUsageEvent({
        context: options.usage,
        model: options.model,
        durationMs: Date.now() - started,
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

async function _callGeminiInner(options: GeminiOptions): Promise<AIResponse> {
  // Prefer the Lovable AI gateway when available — it pools quota across
  // workspaces and avoids the per-key Google free-tier rate limits.
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    // Auto-fallback chain for image-generation models when workspace runs out
    // of credits on the premium tier (402). Order: Pro → Flash preview → 2.5 flash.
    const isImage = options.modalities?.includes("image");
    const fallbackChain = isImage
      ? [
          options.model,
          "google/gemini-3.1-flash-image-preview",
          "google/gemini-2.5-flash-image",
        ]
      : [options.model];
    const tried = new Set<string>();
    let lastErr: unknown;
    for (const model of fallbackChain) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        return await callGeminiViaLovable({ ...options, model }, lovableKey);
      } catch (e) {
        lastErr = e;
        if (e instanceof PaymentRequiredError && isImage) {
          console.warn(`[ai-gateway] ${model} returned 402, trying cheaper image model...`);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    throw new Error("[ai-gateway] Neither LOVABLE_API_KEY nor GOOGLE_AI_API_KEY is configured");
  }

  // Resolve model name
  const resolvedModel = GEMINI_MODEL_MAP[options.model] || options.model;

  // Convert messages
  const { systemInstruction, contents } = await convertMessagesToGemini(options.messages);

  // Build request body
  const body: Record<string, any> = { contents };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  // Generation config
  const generationConfig: Record<string, any> = {};

  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature;
  }

  if (options.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = options.maxTokens;
  }

  if (options.modalities && options.modalities.length > 0) {
    generationConfig.responseModalities = options.modalities.map((m) => m.toUpperCase());
  }

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  // Tools
  if (options.tools && options.tools.length > 0) {
    body.tools = convertToolsToGemini(options.tools);
  }

  if (options.toolChoice) {
    body.toolConfig = convertToolChoiceToGemini(options.toolChoice);
  }

  // Make API call
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

  console.log(`[ai-gateway] Gemini call (direct): model=${resolvedModel}, parts=${contents.length}, tools=${options.tools?.length ?? 0}`);

  const response = await fetchWithRateLimitRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    `Gemini/${resolvedModel}`,
  );

  const data = await parseJsonResponse(response, `Gemini/${resolvedModel}`);
  return parseGeminiResponse(data);
}

/**
 * Calls Gemini via the Lovable AI gateway (OpenAI-compatible chat completions).
 * Uses the gateway's pooled quota instead of the project's Google API key.
 */
async function callGeminiViaLovable(
  options: GeminiOptions,
  lovableKey: string,
): Promise<AIResponse> {
  // The gateway expects the "google/<model>" form — no mapping needed.
  const model = options.model.startsWith("google/") || options.model.startsWith("openai/")
    ? options.model
    : `google/${options.model}`;

  const body: Record<string, any> = {
    model,
    messages: options.messages,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.tools && options.tools.length > 0) body.tools = options.tools;
  if (options.toolChoice) body.tool_choice = options.toolChoice;
  if (options.modalities && options.modalities.length > 0) body.modalities = options.modalities;

  console.log(`[ai-gateway] Gemini call (lovable): model=${model}, messages=${options.messages.length}, tools=${options.tools?.length ?? 0}`);

  const response = await fetchWithRateLimitRetry(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify(body),
    },
    `Lovable/${model}`,
  );

  const data = await parseJsonResponse(response, `Lovable/${model}`);
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error(`[ai-gateway] Lovable returned no choices: ${JSON.stringify(data).substring(0, 300)}`);
  }

  const result: AIResponse = {};
  const msg = choice.message ?? {};
  const collectedImages: Array<{ mimeType: string; base64Data: string }> = [];

  if (typeof msg.content === "string" && msg.content.length > 0) {
    result.text = msg.content;
  } else if (Array.isArray(msg.content)) {
    const texts: string[] = [];
    for (const part of msg.content) {
      if (part?.type === "text" && part.text) texts.push(part.text);
      if (part?.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
        const m = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) collectedImages.push({ mimeType: m[1], base64Data: m[2] });
      }
    }
    if (texts.length) result.text = texts.join("");
  }

  // Lovable AI gateway (OpenAI-compatible) returns generated images on `message.images`,
  // separate from `message.content`. Each entry: { type: "image_url", image_url: { url: "data:..." } }.
  if (Array.isArray(msg.images)) {
    for (const img of msg.images) {
      const url = img?.image_url?.url ?? img?.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        const m = url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) collectedImages.push({ mimeType: m[1], base64Data: m[2] });
      }
    }
  }

  if (collectedImages.length) result.images = collectedImages;

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    result.toolCalls = msg.tool_calls.map((tc: any) => {
      let args: any = tc.function?.arguments;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { /* keep as string */ }
      }
      return { name: tc.function?.name, arguments: args };
    });
  }

  if (data.usage) {
    result.usage = {
      inputTokens: data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? data.usage.output_tokens ?? 0,
    };
  }

  return result;
}

/**
 * Call Anthropic (Claude) Messages API.
 *
 * Uses claude-sonnet-4-20250514 by default. Designed for structured generation
 * tasks like presentation creation.
 *
 * @example Tool-based generation
 * ```ts
 * const result = await callAnthropic({
 *   system: "You are a presentation strategist...",
 *   messages: [{ role: "user", content: "Create a deck for..." }],
 *   tools: [{
 *     name: "create_presentation",
 *     input_schema: { type: "object", properties: { slides: {...} } },
 *   }],
 *   toolChoice: { type: "tool", name: "create_presentation" },
 * });
 * // result.toolCalls[0].arguments.slides contains the slides
 * ```
 */
/**
 * Resolve which Anthropic API key to use. Tries the canonical name first
 * (ANTHROPIC_API_KEY), then falls back to common alternates that Lovable
 * users have historically set under different names (LOVABLE_API_KEY from
 * the old Lovable gateway era, ANTHROPIC_KEY, CLAUDE_API_KEY).
 *
 * This is defensive: when a user rotates a key but updates the wrong
 * secret name, we still find a working key as long as ONE of these is
 * valid. Without this fallback, a stale ANTHROPIC_API_KEY blocks the
 * function even if a fresh key sits two slots over.
 */
function resolveAnthropicKey(): { key: string; sourceName: string } | null {
  const candidates = [
    "ANTHROPIC_API_KEY",
    "LOVABLE_API_KEY",
    "ANTHROPIC_KEY",
    "CLAUDE_API_KEY",
  ];
  for (const name of candidates) {
    const value = Deno.env.get(name);
    if (value && value.trim().length > 0) {
      return { key: value.trim(), sourceName: name };
    }
  }
  return null;
}

export async function callAnthropic(options: AnthropicOptions): Promise<AIResponse> {
  const started = Date.now();
  try {
    const result = await _callAnthropicInner(options);
    if (options.usage) {
      logUsageEvent({
        context: options.usage,
        model: options.model ?? "claude-sonnet-4-20250514",
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        durationMs: Date.now() - started,
        status: "success",
      });
    }
    return result;
  } catch (e) {
    if (options.usage) {
      logUsageEvent({
        context: options.usage,
        model: options.model ?? "claude-sonnet-4-20250514",
        durationMs: Date.now() - started,
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

async function _callAnthropicInner(options: AnthropicOptions): Promise<AIResponse> {
  const resolved = resolveAnthropicKey();
  if (!resolved) {
    throw new Error(
      "[ai-gateway] No Anthropic API key configured. Set ANTHROPIC_API_KEY in Supabase Edge Function Secrets.",
    );
  }

  const body: Record<string, any> = {
    model: options.model ?? "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens ?? 8192,
    messages: options.messages,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  if (options.system) {
    body.system = options.system;
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  if (options.toolChoice) {
    body.tool_choice = options.toolChoice;
  }

  console.log(
    `[ai-gateway] Anthropic call: model=${body.model}, messages=${options.messages.length}, tools=${options.tools?.length ?? 0}, key_source=${resolved.sourceName}`,
  );

  const callWith = async (apiKey: string) =>
    fetchWithRateLimitRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      `Anthropic/${body.model}`,
    );

  let response: Response;
  try {
    response = await callWith(resolved.key);
  } catch (e) {
    // If the primary key 401'd and there's a fallback candidate with a
    // different value, try that before giving up. This is the rotation
    // safety net — user updated LOVABLE_API_KEY but ANTHROPIC_API_KEY is
    // stale, or vice versa.
    const isAuthError =
      e instanceof Error && /\b401\b|invalid x-api-key|authentication_error/i.test(e.message);
    if (!isAuthError) throw e;

    const fallbackName = ["ANTHROPIC_API_KEY", "LOVABLE_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"]
      .filter((n) => n !== resolved.sourceName)
      .find((n) => {
        const v = Deno.env.get(n);
        return v && v.trim() !== resolved.key;
      });
    if (!fallbackName) throw e;

    const fallbackValue = Deno.env.get(fallbackName)!.trim();
    console.warn(
      `[ai-gateway] Primary key (${resolved.sourceName}) auth failed; retrying with ${fallbackName}`,
    );
    response = await callWith(fallbackValue);
  }

  const data = await parseJsonResponse(response, `Anthropic/${body.model}`);
  return parseAnthropicResponse(data);
}

// ─── OPENAI IMAGE (gpt-image-2) ─────────────────────────────────────────────
//
// Gemini's image model ("nano banana" / gemini-3-pro-image-preview) is fast
// and cheap but struggles with two things our users hit constantly:
//   1. Logo fidelity — supplied brand marks come out as approximations, not
//      the actual logo, even when included as reference images.
//   2. Prompt adherence on complex / organic structures — it tends toward
//      generic geometric shapes when asked for fluid, asymmetric forms.
//
// gpt-image-2 (OpenAI) is meaningfully better at both. We expose it as an
// alternate model the user can pick per render. Direct OpenAI API path is
// simpler than Replicate (no polling) and uses the same secret pattern as
// ANTHROPIC_API_KEY.

export interface OpenAIImageOptions {
  /** Text prompt. Required. */
  prompt: string;
  /**
   * Reference images for image-edit mode. When provided, the call goes to
   * /v1/images/edits which uses the references as visual context (logo,
   * style, composition). Each reference is a public URL — we fetch it and
   * forward as multipart/form-data.
   */
  referenceImageUrls?: string[];
  /**
   * Aspect ratio. gpt-image-2 supports "1024x1024" (1:1), "1536x1024" (3:2),
   * "1024x1536" (2:3). We map common label strings to these.
   */
  size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
  /**
   * Output quality. "high" is the visibly-best option but slowest + costliest.
   * "medium" is a reasonable default. "low" only for previews.
   */
  quality?: "low" | "medium" | "high" | "auto";
  /**
   * Background — "transparent" is great for logo-on-transparent reference
   * style. Default "auto" picks based on the model's discretion.
   */
  background?: "transparent" | "opaque" | "auto";
  /**
   * Number of images to generate. Defaults to 1. >1 increases cost linearly.
   */
  n?: number;
}

export interface OpenAIImageResult {
  /** Base64-encoded image bytes (no data: prefix). */
  base64Data: string;
  /** MIME type, always image/png from gpt-image-2. */
  mimeType: string;
  /** Index in the response array — useful when n > 1. */
  index: number;
}

/**
 * Resolve OpenAI API key. Same multi-secret fallback pattern as Anthropic
 * so a key rotation that lands in any common slot still works.
 */
function resolveOpenAIKey(): { key: string; sourceName: string } | null {
  const candidates = ["OPENAI_API_KEY", "OPENAI_KEY", "GPT_IMAGE_API_KEY"];
  for (const name of candidates) {
    const value = Deno.env.get(name);
    if (value && value.trim().length > 0) {
      return { key: value.trim(), sourceName: name };
    }
  }
  return null;
}

/**
 * Map an aspect-ratio label ("16:9", "1:1", "9:16") to the closest
 * gpt-image-2 supported size. The model only offers three landscape/
 * portrait/square options, so 16:9 lands on the closest 3:2 frame.
 */
function aspectRatioToSize(aspect?: string): "1024x1024" | "1536x1024" | "1024x1536" {
  if (!aspect) return "1024x1024";
  const a = String(aspect).toLowerCase().replace(/\s+/g, "");
  if (a === "1:1" || a === "1024x1024") return "1024x1024";
  if (/^9:16$|^2:3$|^3:4$|^1024x1536$/.test(a)) return "1024x1536";
  // Anything wider than square → landscape.
  return "1536x1024";
}

/**
 * Generate an image with OpenAI gpt-image-2. Returns base64 PNG bytes ready
 * for save-render-image (the existing storage pipeline accepts both
 * "data:image/png;base64,..." and raw HTTP URLs).
 *
 * When referenceImageUrls is non-empty, hits /v1/images/edits with the
 * references attached so the model treats them as visual context. The first
 * reference is the primary "image" parameter; additional references are
 * sent as image[] entries. (gpt-image-2 supports a small number of
 * references; we cap at 4.)
 */
export async function callOpenAIImage(
  options: OpenAIImageOptions,
): Promise<OpenAIImageResult[]> {
  const resolved = resolveOpenAIKey();
  if (!resolved) {
    throw new Error(
      "[ai-gateway] No OpenAI API key configured. Set OPENAI_API_KEY in Supabase Edge Function Secrets to use gpt-image-2.",
    );
  }

  const size = options.size ?? aspectRatioToSize();
  const quality = options.quality ?? "medium";
  const n = Math.min(Math.max(options.n ?? 1, 1), 4);
  const refs = (options.referenceImageUrls ?? []).slice(0, 4);

  console.log(
    `[ai-gateway] OpenAI gpt-image-2 call: size=${size}, quality=${quality}, refs=${refs.length}, key_source=${resolved.sourceName}`,
  );

  let response: Response;

  if (refs.length === 0) {
    // No references → /v1/images/generations (JSON body).
    response = await fetchWithRateLimitRetry(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: options.prompt,
          size,
          quality,
          n,
          // PNG explicitly — keeps the data: URL pattern working downstream
          // (save-render-image expects "data:image/png;base64,...").
          output_format: "png",
          ...(options.background && options.background !== "auto"
            ? { background: options.background }
            : {}),
        }),
      },
      "OpenAI/gpt-image-2",
    );
  } else {
    // With references → /v1/images/edits (multipart form data).
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", options.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("n", String(n));
    form.append("output_format", "png");
    if (options.background && options.background !== "auto") {
      form.append("background", options.background);
    }
    // Fetch each reference, attach as a Blob. OpenAI's /v1/images/edits
    // expects:
    //   - single image: field name "image"
    //   - multiple images: field name "image[]" for EACH file (array form)
    // Sending "image" + "image[]" mixed makes the API only see the first.
    // So decide field name once based on count, then attach all.
    const fieldName = refs.length === 1 ? "image" : "image[]";
    for (let i = 0; i < refs.length; i++) {
      const url = refs[i]!;
      try {
        const fetched = await fetch(url);
        if (!fetched.ok) {
          console.warn(`[ai-gateway] Could not fetch reference ${i}: ${fetched.status}`);
          continue;
        }
        const blob = await fetched.blob();
        form.append(fieldName, blob, `ref-${i}.png`);
      } catch (e) {
        console.warn(`[ai-gateway] Reference fetch threw at ${i}:`, e);
      }
    }
    response = await fetchWithRateLimitRetry(
      "https://api.openai.com/v1/images/edits",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${resolved.key}` },
        body: form,
      },
      "OpenAI/gpt-image-2",
    );
  }

  const data = await parseJsonResponse(response, "OpenAI/gpt-image-2");
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  if (items.length === 0) {
    throw new Error("[ai-gateway] OpenAI returned no images");
  }
  return items.map((item, idx) => {
    // gpt-image-2 returns base64 in the b64_json field.
    const base64 = item?.b64_json;
    if (!base64) {
      throw new Error(`[ai-gateway] OpenAI image ${idx} missing b64_json`);
    }
    return {
      base64Data: String(base64),
      mimeType: "image/png",
      index: idx,
    };
  });
}
