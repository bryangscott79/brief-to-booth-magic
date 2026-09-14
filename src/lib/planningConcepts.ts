// planningConcepts — the client half of the Planning step's chat→images
// pipeline.
//
//   planConcepts()   one call to the `plan-concepts` edge function: the
//                    chat turn goes in, a reply + 0-4 complete renderer
//                    prompts come back.
//   renderConcept()  one call to `generate-hero` PER concept, with the
//                    director's prompt forwarded as composedPrompt.renderer
//                    (generate-hero uses that text VERBATIM) and the
//                    standard negative list from normalizedBrief.
//
// Deliberately NOT writing project_images: a concept card is a sketch on a
// board, not a project render. It becomes a real render only when the user
// presses "Add to project renders", which goes through the normal
// save-render-image path (see ConceptCard / Planning.tsx).

import { supabase } from "@/integrations/supabase/client";
import { resolveKnowledgeScope } from "@/lib/knowledgeScope";
import { STANDARD_NEGATIVE } from "@/lib/normalizedBrief";
import type { ParsedBrief } from "@/types/brief";
import { imageModelToProvider } from "@/lib/imageModels";

// ─── ERROR EXTRACTION ────────────────────────────────────────────────────────

/** supabase-js hides a function's real message behind error.context —
 *  dig it out instead of surfacing "non-2xx status code". Mirrors the
 *  invoke pattern in useAdminRole.tsx. */
async function invokeErrorMessage(error: unknown, fnName: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const detail = (await ctx.clone().json()) as { error?: unknown; fn_version?: unknown };
      if (typeof detail?.error === "string") {
        return detail.fn_version
          ? detail.error
          : `${detail.error} — an older version of the ${fnName} function is still deployed; wait for the deploy (or redeploy it) and retry.`;
      }
    } catch {
      /* non-JSON body — fall through */
    }
  }
  return error instanceof Error ? error.message : `Failed to call ${fnName}`;
}

// ─── plan-concepts ───────────────────────────────────────────────────────────

export interface PlannedConcept {
  label: string;
  prompt: string;
  rationale: string;
}

export interface PlanConceptsResult {
  reply: string;
  concepts: PlannedConcept[];
}

export interface PlanConceptsInput {
  /** The parsed brief JSON — the director's only source of facts. */
  brief: ParsedBrief | null;
  /** Last ~10 turns, oldest first. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** What the user just typed. */
  message: string;
  /** Cards already on the board, so follow-ups can build on their prompts. */
  existingCards: Array<{ id: string; label: string; prompt: string }>;
  boothSizeLabel?: string;
  /** Scopes retrieval to the agency's knowledge base. */
  projectId?: string;
}

export async function planConcepts(input: PlanConceptsInput): Promise<PlanConceptsResult> {
  const { data: { session } } = await supabase.auth.getSession();

  // Planning is where the direction is actually decided, so it is the step
  // that most needs the agency's own past work in front of it.
  const scope = await resolveKnowledgeScope(input.projectId);

  const res = await supabase.functions.invoke("plan-concepts", {
    body: {
      brief: input.brief,
      history: input.history,
      message: input.message,
      existingCards: input.existingCards,
      boothSizeLabel: input.boothSizeLabel,
      ...scope,
    },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });

  if (res.error) throw new Error(await invokeErrorMessage(res.error, "plan-concepts"));
  const data = res.data as { error?: string; reply?: string; concepts?: unknown } | null;
  if (data?.error) throw new Error(data.error);

  const concepts: PlannedConcept[] = Array.isArray(data?.concepts)
    ? (data!.concepts as PlannedConcept[])
        .filter((c) => typeof c?.prompt === "string" && c.prompt.trim().length > 0)
        .map((c, i) => ({
          label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : `Concept ${i + 1}`,
          prompt: c.prompt.trim(),
          rationale: typeof c.rationale === "string" ? c.rationale.trim() : "",
        }))
    : [];

  return {
    reply: typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : "",
    concepts,
  };
}

// ─── generate-hero (one image per concept) ───────────────────────────────────

export interface RenderConceptInput {
  /** The director's complete renderer prompt — used VERBATIM. */
  prompt: string;
  projectId: string;
  boothSize?: string;
  /**
   * Full image-model id from the agency preference (e.g.
   * "openai/gpt-image-2.5"), forwarded to generate-hero as
   * `image_model`. Unknown/retired ids degrade down the fallback chain.
   */
  imageModel?: string;
  /** Brand mark, sent as a reference image so signage renders the real logo. */
  brandLogoUrl?: string | null;
  /** Overrides the standard negative list when the caller has a composed one. */
  negative?: string;
}

export interface RenderConceptResult {
  imageUrl: string;
  modelUsed?: string;
  primaryError?: string;
  /** The exact prompt generate-hero sent to the image model. */
  promptUsed: string;
  negative: string;
}

/**
 * Render ONE concept. `composedPrompt.renderer` takes the top branch in
 * generate-hero (used verbatim, no edge-side assembly); `project_id` gates
 * the server-side Storage upload so we get a short URL back instead of a
 * multi-MB data: URL.
 *
 * generate-hero still validates a top-level `prompt` of ≥10 chars even on
 * the composed path, so the same text rides along there.
 */
export async function renderConcept(input: RenderConceptInput): Promise<RenderConceptResult> {
  const negative = input.negative ?? STANDARD_NEGATIVE;
  const { data: { session } } = await supabase.auth.getSession();

  const res = await supabase.functions.invoke("generate-hero", {
    body: {
      prompt: input.prompt,
      composedPrompt: {
        renderer: input.prompt,
        negative,
        // The Planning step has no NormalizedBrief yet (that's composed on
        // the Prompts step from the spatial canvas), so there is no
        // geometry summary or compliance set to attach. generate-hero only
        // persists artifacts downstream — it never reads them here.
        artifacts: {
          briefJson: null,
          geometrySummary: "",
          renderer: input.prompt,
          negative,
          compliance: [],
        },
      },
      ...(await resolveKnowledgeScope(input.projectId)),
      boothSize: input.boothSize || undefined,
      // Full model id — the contract generate-hero reads.
      image_model: input.imageModel ?? undefined,
      // Legacy coarse provider flag, for deployments that predate it.
      imageModel: input.imageModel
        ? imageModelToProvider(input.imageModel)
        : undefined,
      brandLogoUrl: input.brandLogoUrl || undefined,
    },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });

  if (res.error) throw new Error(await invokeErrorMessage(res.error, "generate-hero"));
  const data = res.data as
    | { error?: string; imageUrl?: string; modelUsed?: string; primaryError?: string; promptUsed?: string }
    | null;
  if (data?.error) throw new Error(data.error);
  if (!data?.imageUrl) throw new Error("The image model returned no image");

  return {
    imageUrl: data.imageUrl,
    modelUsed: typeof data.modelUsed === "string" ? data.modelUsed : undefined,
    primaryError: typeof data.primaryError === "string" ? data.primaryError : undefined,
    promptUsed:
      typeof data.promptUsed === "string" && data.promptUsed.trim().length > 0
        ? data.promptUsed
        : input.prompt,
    negative,
  };
}

// ─── generate-hero EDIT MODE (concept focus) ─────────────────────────────────

export interface ReviseConceptInput {
  /** The version being edited — the authoritative source image. */
  previousImageUrl: string;
  /** Composed edit instruction (buildAnnotationEditInstruction). */
  instruction: string;
  projectId: string;
  boothSize?: string;
  imageModel?: string;
  /**
   * Alpha-mask PNG data URL from the marked REGIONS (transparent =
   * editable, opaque = preserved), as produced by rasterizePolygonMask.
   * Null/undefined → the whole image is editable per the instruction.
   */
  maskDataUrl?: string | null;
}

/**
 * Revise ONE concept version in place: generate-hero's EDIT MODE —
 * `previousImageUrl` + `feedback`, and deliberately NO `composedPrompt`,
 * because composedPrompt takes the top branch in generate-hero and would
 * regenerate from scratch instead of editing the source image.
 *
 * MASK CAVEAT (verified against supabase/functions/generate-hero/index.ts):
 * generate-hero only forwards `maskDataUrl` to the image model on the
 * existing-space branch (`if (existingSpacePhotoUrl) { … maskUrlForOpenAI
 * = maskDataUrl }`) — on the plain edit-mode branch the mask is dropped.
 * So when we have a mask we ALSO send the source image as
 * `existingSpacePhotoUrl`. That is the same image either way: the branch
 * makes it the sole reference and lets the mask through, while the prompt
 * branch is still edit mode (previousImageUrl + feedback, no
 * composedPrompt). Without a mask we take the ordinary edit path, which
 * also keeps the brand logo in the reference list.
 */
export async function reviseConcept(input: ReviseConceptInput): Promise<RenderConceptResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const mask = input.maskDataUrl ?? null;

  const res = await supabase.functions.invoke("generate-hero", {
    body: {
      // generate-hero rejects a body whose top-level `prompt` is under 10
      // chars before it ever looks at the mode — the instruction rides
      // along there as well as in `feedback`.
      prompt: input.instruction,
      feedback: input.instruction,
      previousImageUrl: input.previousImageUrl,
      ...(mask ? { existingSpacePhotoUrl: input.previousImageUrl, maskDataUrl: mask } : {}),
      ...(await resolveKnowledgeScope(input.projectId)),
      boothSize: input.boothSize || undefined,
      image_model: input.imageModel ?? undefined,
      imageModel: input.imageModel ? imageModelToProvider(input.imageModel) : undefined,
    },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });

  if (res.error) throw new Error(await invokeErrorMessage(res.error, "generate-hero"));
  const data = res.data as
    | { error?: string; imageUrl?: string; modelUsed?: string; primaryError?: string; promptUsed?: string }
    | null;
  if (data?.error) throw new Error(data.error);
  if (!data?.imageUrl) throw new Error("The image model returned no image");

  return {
    imageUrl: data.imageUrl,
    modelUsed: typeof data.modelUsed === "string" ? data.modelUsed : undefined,
    primaryError: typeof data.primaryError === "string" ? data.primaryError : undefined,
    promptUsed:
      typeof data.promptUsed === "string" && data.promptUsed.trim().length > 0
        ? data.promptUsed
        : input.instruction,
    negative: STANDARD_NEGATIVE,
  };
}

// ─── PROMPT TRANSPARENCY ─────────────────────────────────────────────────────

/** The prompt_artifacts payload a concept card carries — both for the
 *  "View prompt" dialog on the board and for save-render-image when the
 *  card is pushed into project renders. */
export function conceptPromptArtifacts(args: {
  prompt: string;
  negative: string;
  label: string;
  rationale?: string;
  model?: string;
  brandLogoUrl?: string | null;
  generatedAt?: string;
}): Record<string, unknown> {
  return {
    prompt: args.prompt,
    negative: args.negative,
    model: args.model,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    conceptLabel: args.label,
    ...(args.rationale ? { conceptRationale: args.rationale } : {}),
    references: args.brandLogoUrl ? [{ label: "Brand logo", url: args.brandLogoUrl }] : [],
    compliance: [],
    source: "planning-canvas",
  };
}

/** angle_id for a card promoted to a project render. Stable per card so a
 *  re-push replaces rather than duplicates. */
export function conceptAngleId(index: number): string {
  return `concept_${index + 1}`;
}
