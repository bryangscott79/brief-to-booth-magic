// renderPromptArtifacts — builds the JSON payload persisted into
// project_images.prompt_artifacts alongside every saved render.
//
// Feature: prompt transparency. Every image the platform generates keeps
// the EXACT prompt that produced it (plus negative prompt, geometry
// summary, hard constraints, attached reference images, model, and a
// timestamp) so users can always audit "what did the model actually
// see" — from the Prompts-step gallery or the Files lightbox.
//
// Size discipline: project_images rows must not balloon. The prompt
// text is capped (a few KB of text is fine), reference entries carry
// LABELED URLS ONLY — data: URLs (base64 images, rasterized masks)
// are never stored.

export interface RenderReference {
  /** Human-readable role, e.g. "Brand logo", "Hero reference". */
  label: string;
  /** Public HTTP(S) URL. Never a data: URL. */
  url: string;
}

export interface RenderPromptArtifactsPayload {
  /** Structural compatibility with Record<string, unknown> consumers
   *  (renderStore save payloads, prompt_artifacts JSONB merges). */
  [key: string]: unknown;
  /** The full prompt text actually sent to the image model. */
  prompt: string;
  /** True when the stored prompt was cut at MAX_PROMPT_CHARS. */
  promptTruncated?: boolean;
  /** Negative prompt (appended to the renderer text for gpt-image-2). */
  negative?: string;
  /** One-line geometry summary from the composer. */
  geometrySummary?: string;
  /** Hard-constraint / compliance list from the composer. */
  compliance?: unknown[];
  /** Labeled reference-image URLs attached to the generation call. */
  references?: RenderReference[];
  /** Model that was asked for / used (canonical id when known). */
  model?: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
}

/** Cap for stored prompt text — generous (composed prompts are ~2-6 KB). */
export const MAX_PROMPT_CHARS = 20_000;
/** URLs longer than this are almost certainly not real URLs — drop them. */
const MAX_URL_CHARS = 2_000;

/**
 * Build the prompt_artifacts payload for one render. Returns null when
 * there is no prompt text at all (nothing worth persisting).
 *
 * Guarantees:
 *   - prompt capped at MAX_PROMPT_CHARS (promptTruncated flags the cut)
 *   - references: deduped by URL, data: URLs filtered (no base64 in DB),
 *     blank/overlong URLs dropped, labels defaulted
 *   - empty optional fields omitted rather than stored as "" / []
 */
export function buildRenderPromptArtifacts(input: {
  prompt: string | null | undefined;
  negative?: string | null;
  geometrySummary?: string | null;
  compliance?: unknown[] | null;
  references?: Array<{ label?: string; url?: string | null } | null | undefined>;
  model?: string | null;
  generatedAt?: string;
}): RenderPromptArtifactsPayload | null {
  const promptText = (input.prompt ?? "").trim();
  if (!promptText) return null;

  const truncated = promptText.length > MAX_PROMPT_CHARS;

  const seen = new Set<string>();
  const references: RenderReference[] = [];
  for (const ref of input.references ?? []) {
    const url = ref?.url?.trim();
    if (!url) continue;
    // Never persist inline image data — that's what ballooned rows.
    if (url.startsWith("data:")) continue;
    if (url.length > MAX_URL_CHARS) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    references.push({ label: ref?.label?.trim() || "Reference", url });
  }

  const negative = (input.negative ?? "").trim();
  const geometrySummary = (input.geometrySummary ?? "").trim();
  const compliance = Array.isArray(input.compliance) ? input.compliance : [];
  const model = (input.model ?? "").trim();

  return {
    prompt: truncated ? promptText.slice(0, MAX_PROMPT_CHARS) : promptText,
    ...(truncated ? { promptTruncated: true } : {}),
    ...(negative ? { negative } : {}),
    ...(geometrySummary ? { geometrySummary } : {}),
    ...(compliance.length > 0 ? { compliance } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...(model ? { model } : {}),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
