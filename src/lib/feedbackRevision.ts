// feedbackRevision — applying a parsed client-feedback round to the
// project's existing renders.
//
// The whole point of this flow: the client already approved the DESIGN.
// Their notes are deltas, not a new brief. So every revision reuses the
// ORIGINAL image and iterates on it — generate-hero's EDIT MODE
// (previousImageUrl + feedback and deliberately NO composedPrompt, which
// is what makes the edge function take its edit branch and treat the
// attached image as the authoritative source). Nothing is regenerated
// from a prompt.
//
// Everything above `applyFeedbackRound` is pure so it can be unit-tested
// without React, Supabase, or a network:
//   - selectCurrentRenders   → which saved images are "the current set"
//   - resolveItemTargets     → one item → the images it edits
//   - buildRevisionEditInstruction → the locked edit instruction
//   - summarizeRoundProgress → batch status transitions
//
// After an item is applied, the revised image is saved under the SAME
// full angle_id it came from (version + config suffixes intact), so
// save-render-image flips the previous row to is_current=false and the
// revision becomes the current render for that angle. No new angle ids,
// no new prompt version — the round history is the audit trail.

import { supabase } from "@/integrations/supabase/client";
import { unwrapInvokeError } from "@/lib/supabaseInvokeError";
import { buildRenderPromptArtifacts } from "@/lib/renderPromptArtifacts";
import { parseVersionedAngleId } from "@/lib/promptVersions";

// ─── SHAPES ──────────────────────────────────────────────────────────────────

/** Scope of a parsed item: the whole render set, or one view. */
export type RevisionScope = "global" | "single";

/** Lifecycle of one parsed item as the batch runs. */
export type RevisionItemStatus = "pending" | "applying" | "applied" | "error" | "skipped";

/** Lifecycle of one target image inside an item. */
export type RevisionTargetStatus = "pending" | "running" | "done" | "error";

/** A saved render that a revision can target. */
export interface CurrentRender {
  /** Full stored angle_id — carries the __v__ / __cfg__ suffixes. */
  angleId: string;
  /** Suffix-stripped angle id ("hero_34", "front", …) — what the model knows. */
  baseAngleId: string;
  angleName: string;
  imageUrl: string;
  /** Sanitized footprint config key, or null for legacy/untagged rows. */
  configKey: string | null;
}

/** One image a revision item will edit, with its live status. */
export interface RevisionTarget {
  angleId: string;
  baseAngleId: string;
  angleName: string;
  /** The render as it stands now — this is the EDIT MODE source image. */
  beforeUrl: string;
  /** Populated once the edit lands. */
  afterUrl?: string;
  status: RevisionTargetStatus;
  error?: string;
}

/** A parsed revision item, as stored in client_feedback_rounds.items. */
export interface FeedbackRevisionItem {
  id: string;
  /** A specific base angle id, or the literal "all". */
  angleId: string;
  instruction: string;
  scope: RevisionScope;
  /** 0-1 model confidence from parse-client-feedback. */
  confidence: number;
  /** User include/exclude toggle in the review table. Defaults to true. */
  include: boolean;
  status: RevisionItemStatus;
  /** Resolved per-image results, filled in as the batch runs. */
  targets?: RevisionTarget[];
  error?: string;
}

/** Round-level status — mirrors the DB check constraint. */
export type FeedbackRoundStatus = "new" | "parsed" | "applying" | "applied";

/** The literal angleId the parser emits for whole-set changes. */
export const ALL_RENDERS = "all";

// ─── PURE: WHICH RENDERS ARE "CURRENT" ───────────────────────────────────────

interface SavedImageLike {
  angle_id: string;
  angle_name: string;
  public_url: string;
  is_current: boolean;
  prompt_artifacts?: { configKey?: unknown; [key: string]: unknown } | null;
}

/**
 * The set of renders a feedback round operates on: every CURRENT image
 * belonging to the ACTIVE footprint config.
 *
 * Config scoping mirrors PromptGenerator's hydration rule — an image
 * belongs to the active booth size when its config key matches, or when
 * it is untagged (pre-multi-config) and the active size is the project's
 * first config. Projects with no configs skip the filter entirely.
 *
 * De-duped by angle_id keeping the first occurrence, so callers can pass
 * the raw `created_at DESC` list from useProjectImages.
 */
export function selectCurrentRenders(
  images: SavedImageLike[] | null | undefined,
  activeConfigKey: string | null,
  defaultConfigKey: string | null,
): CurrentRender[] {
  const out: CurrentRender[] = [];
  const seen = new Set<string>();

  for (const img of images ?? []) {
    if (!img?.is_current) continue;
    if (!img.public_url) continue;

    const { baseAngleId, configKey: parsedConfigKey } = parseVersionedAngleId(img.angle_id);
    const artifactConfigKey =
      typeof img.prompt_artifacts?.configKey === "string" ? img.prompt_artifacts.configKey : null;
    const imgConfigKey = parsedConfigKey ?? artifactConfigKey;

    if (activeConfigKey) {
      const matches =
        imgConfigKey === activeConfigKey ||
        (imgConfigKey === null && activeConfigKey === defaultConfigKey);
      if (!matches) continue;
    }

    if (seen.has(img.angle_id)) continue;
    seen.add(img.angle_id);

    out.push({
      angleId: img.angle_id,
      baseAngleId,
      angleName: img.angle_name,
      imageUrl: img.public_url,
      configKey: imgConfigKey,
    });
  }

  // Hero first, then whatever order the caller gave us.
  return out.sort((a, b) => {
    const aHero = a.baseAngleId === "hero_34" ? 0 : 1;
    const bHero = b.baseAngleId === "hero_34" ? 0 : 1;
    return aHero - bHero;
  });
}

// ─── PURE: ITEM → TARGET IMAGES ──────────────────────────────────────────────

/**
 * Resolve the images one parsed item edits.
 *
 *   - a "global" item (or angleId "all") fans out to EVERY current render
 *   - a "single" item targets the render whose full angle_id OR
 *     suffix-stripped base angle id matches
 *
 * Returns [] when nothing matches — the caller marks the item skipped
 * rather than guessing at a target.
 */
export function resolveItemTargets(
  item: Pick<FeedbackRevisionItem, "angleId" | "scope">,
  renders: CurrentRender[],
): RevisionTarget[] {
  const isGlobal = item.scope === "global" || item.angleId === ALL_RENDERS;
  const matched = isGlobal
    ? renders
    : renders.filter((r) => r.angleId === item.angleId || r.baseAngleId === item.angleId);

  return matched.map((r) => ({
    angleId: r.angleId,
    baseAngleId: r.baseAngleId,
    angleName: r.angleName,
    beforeUrl: r.imageUrl,
    status: "pending" as const,
  }));
}

// ─── PURE: THE LOCKED EDIT INSTRUCTION ───────────────────────────────────────

/**
 * Build the edit-style instruction sent to generate-hero's EDIT MODE.
 * Mirrors buildHangingEditInstruction: name the change, lock everything
 * else, then restate the locks so the model can't drift into a redesign.
 *
 * generate-hero wraps this in its own "IMAGE EDIT TASK — NOT A
 * REGENERATION" template, so this text is the EDIT INSTRUCTION body.
 * The client's note is embedded VERBATIM — never paraphrased here.
 */
export function buildRevisionEditInstruction(params: {
  /** The parsed instruction for this item (already client-facing prose). */
  instruction: string;
  /** Human name of the view being edited ("3/4 Hero View", "Front"). */
  angleName: string;
  scope: RevisionScope;
  /** Active footprint label ("20x40") — context only, never a new constraint. */
  boothSizeLabel?: string | null;
}): string {
  const { instruction, angleName, scope, boothSizeLabel } = params;

  const scopeLine =
    scope === "global"
      ? "This change was asked for across every view of the design, so apply it here exactly as it is being applied to the other views — consistently, and with nothing else altered."
      : "This change was asked for on this view only.";

  return [
    "Modify ONLY what the revision request below asks for. Keep the booth structure, footprint, floor, furnishings, people, environment, lighting, and camera angle IDENTICAL to the reference image — do not redesign, move, or restyle anything the request does not name.",
    "",
    `VIEW BEING EDITED: ${angleName}${boothSizeLabel ? ` · ${boothSizeLabel}` : ""}`,
    "",
    "CLIENT REVISION REQUEST:",
    instruction.trim(),
    "",
    scopeLine,
    "",
    "Everything not named in the request is LOCKED: materials, finishes, colours, signage and graphic copy, product placement, seating, ceiling and hanging elements, the number and position of people, and the surrounding environment all stay exactly as they are in the reference image. Do not change the camera angle, crop, focal length, or composition. Do not add overlaid text or annotations. Output the reference image with this one change applied.",
  ].join("\n");
}

// ─── PURE: WHAT THE ROUND ACTUALLY CHANGED ───────────────────────────────────

/** A target that finished — before/after pair for the comparison strip. */
export interface RevisedPair extends RevisionTarget {
  afterUrl: string;
}

/**
 * Flatten every successfully revised image across the round, one entry
 * per angle. A global and a single item can both touch the same angle in
 * one round; the LAST edit is the one that's current, so it wins.
 */
export function collectRevisedTargets(items: FeedbackRevisionItem[]): RevisedPair[] {
  const out: RevisedPair[] = [];
  const indexByAngle = new Map<string, number>();

  for (const item of items) {
    for (const t of item.targets ?? []) {
      if (t.status !== "done" || !t.afterUrl) continue;
      const pair: RevisedPair = { ...t, afterUrl: t.afterUrl };
      const existing = indexByAngle.get(t.angleId);
      if (existing !== undefined) {
        // Keep the ORIGINAL before image — that's what the client saw.
        out[existing] = { ...pair, beforeUrl: out[existing].beforeUrl };
      } else {
        indexByAngle.set(t.angleId, out.length);
        out.push(pair);
      }
    }
  }

  return out;
}

// ─── PURE: BATCH STATUS TRANSITIONS ──────────────────────────────────────────

export interface RoundProgress {
  /** Items the user chose to include. */
  total: number;
  /** Included items that finished successfully. */
  applied: number;
  /** Included items that ended in error. */
  failed: number;
  /** Included items that resolved to no target image. */
  skipped: number;
  /** Included items currently in flight. */
  running: number;
  /** Included items not started yet. */
  pending: number;
  /** Target images finished (across all included items). */
  imagesDone: number;
  /** Total target images across all included items. */
  imagesTotal: number;
  /** Round-level status implied by the item statuses. */
  status: FeedbackRoundStatus;
}

/**
 * Derive round + progress state from the item list. Single source of
 * truth for the progress bar, the round's DB status, and the "done"
 * transition — so the UI and the persisted row can never disagree.
 *
 * Transitions:
 *   nothing included / nothing started        → "parsed"
 *   any included item applying                → "applying"
 *   every included item terminal (≥1 of them) → "applied"
 */
export function summarizeRoundProgress(items: FeedbackRevisionItem[]): RoundProgress {
  const included = items.filter((i) => i.include);

  let applied = 0;
  let failed = 0;
  let skipped = 0;
  let running = 0;
  let pending = 0;
  let imagesDone = 0;
  let imagesTotal = 0;

  for (const item of included) {
    switch (item.status) {
      case "applied":
        applied += 1;
        break;
      case "error":
        failed += 1;
        break;
      case "skipped":
        skipped += 1;
        break;
      case "applying":
        running += 1;
        break;
      default:
        pending += 1;
    }
    for (const t of item.targets ?? []) {
      imagesTotal += 1;
      if (t.status === "done" || t.status === "error") imagesDone += 1;
    }
  }

  const total = included.length;
  const terminal = applied + failed + skipped;
  const status: FeedbackRoundStatus =
    running > 0 ? "applying" : total > 0 && terminal === total ? "applied" : "parsed";

  return { total, applied, failed, skipped, running, pending, imagesDone, imagesTotal, status };
}

// ─── EDIT + SAVE PORTS ───────────────────────────────────────────────────────

export interface EditRenderInput {
  projectId: string;
  /** The current render — the EDIT MODE source image. */
  previousImageUrl: string;
  /** The full locked instruction from buildRevisionEditInstruction. */
  feedback: string;
  boothSizeLabel?: string | null;
}

export interface EditRenderResult {
  imageUrl: string;
  modelUsed?: string;
  primaryError?: string;
  /** The exact prompt the edge function sent to the image model. */
  promptUsed?: string;
}

export type EditRenderFn = (input: EditRenderInput) => Promise<EditRenderResult>;

export interface SaveRevisedRenderInput {
  angleId: string;
  angleName: string;
  imageDataUrl: string;
  modelUsed?: string;
  primaryError?: string;
  configKey?: string;
  configLabel?: string;
  promptArtifacts?: Record<string, unknown>;
}

export type SaveRevisedRenderFn = (input: SaveRevisedRenderInput) => Promise<unknown>;

/** Same transient classes renderStore retries on for view generation. */
function isTransient(message: string): boolean {
  return /BOOT_ERROR|WORKER_RESOURCE_LIMIT|503|429|rate limit|timeout|failed to start|fetch failed|network/i.test(
    message,
  );
}

/**
 * Default edit port: generate-hero in EDIT MODE.
 *
 * CRITICAL — the shape of this body is what selects the edit branch:
 * `previousImageUrl` + `feedback` present, `composedPrompt` ABSENT. With
 * a composedPrompt the edge function would use that renderer verbatim
 * and regenerate from scratch, losing the original image. `prompt` is
 * only here to satisfy the edge function's ≥10-char request validation;
 * the edit branch never reads it.
 */
export const editRenderViaGenerateHero: EditRenderFn = async (input) => {
  const body: Record<string, unknown> = {
    project_id: input.projectId,
    prompt: input.feedback,
    feedback: input.feedback,
    previousImageUrl: input.previousImageUrl,
    boothSize: input.boothSizeLabel || undefined,
  };

  const { data, error } = await supabase.functions.invoke("generate-hero", { body });
  if (error) throw new Error(await unwrapInvokeError(error));
  if (data?.error) throw new Error(String(data.error));
  const imageUrl = typeof data?.imageUrl === "string" ? data.imageUrl : "";
  if (!imageUrl) throw new Error("Edit returned no image");

  return {
    imageUrl,
    modelUsed: typeof data?.modelUsed === "string" ? data.modelUsed : undefined,
    primaryError: typeof data?.primaryError === "string" ? data.primaryError : undefined,
    promptUsed: typeof data?.promptUsed === "string" ? data.promptUsed : undefined,
  };
};

// ─── THE BATCH RUNNER ────────────────────────────────────────────────────────

export interface ApplyFeedbackRoundParams {
  projectId: string;
  /** The full item list — excluded items are left untouched. */
  items: FeedbackRevisionItem[];
  /** The current render set (selectCurrentRenders). */
  renders: CurrentRender[];
  boothSizeLabel?: string | null;
  configKey?: string | null;
  configLabel?: string | null;
  /** Called after every state change with the FULL item list. */
  onItemsChange?: (items: FeedbackRevisionItem[]) => void;
  /** Injected for tests. Defaults to generate-hero EDIT MODE. */
  edit?: EditRenderFn;
  /** The normal save path (save-render-image via useSaveRenderImage). */
  save: SaveRevisedRenderFn;
  /** Matches renderStore's ceiling — the image gateway 429s above this. */
  concurrency?: number;
}

/**
 * Run a whole round. Concurrency 3 across TARGET IMAGES (not items), one
 * retry per image on transient errors, and no failure ever aborts the
 * batch: a failed image marks its target (and its item) error and the
 * rest keeps going.
 *
 * Returns the final item list; `onItemsChange` fires on every transition
 * so the UI can render live progress.
 */
export async function applyFeedbackRound(
  params: ApplyFeedbackRoundParams,
): Promise<FeedbackRevisionItem[]> {
  const {
    projectId,
    renders,
    boothSizeLabel,
    configKey,
    configLabel,
    onItemsChange,
    edit = editRenderViaGenerateHero,
    save,
    concurrency = 3,
  } = params;

  // Working copy — never mutate the caller's array.
  let items: FeedbackRevisionItem[] = params.items.map((i) => ({ ...i }));

  const publish = () => {
    items = items.map((i) => ({ ...i }));
    onItemsChange?.(items);
  };

  const patchItem = (id: string, patch: Partial<FeedbackRevisionItem>) => {
    items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  };

  const patchTarget = (itemId: string, angleId: string, patch: Partial<RevisionTarget>) => {
    items = items.map((i) =>
      i.id === itemId
        ? { ...i, targets: (i.targets ?? []).map((t) => (t.angleId === angleId ? { ...t, ...patch } : t)) }
        : i,
    );
  };

  // ── Plan: resolve every included item's targets up front, so the
  // review table shows the real fan-out before anything renders.
  interface Unit {
    itemId: string;
    instruction: string;
    scope: RevisionScope;
    target: RevisionTarget;
  }
  const units: Unit[] = [];

  for (const item of params.items) {
    if (!item.include) continue;
    const targets = resolveItemTargets(item, renders);
    if (targets.length === 0) {
      patchItem(item.id, {
        status: "skipped",
        targets: [],
        error: "No current render matched this item",
      });
      continue;
    }
    patchItem(item.id, { status: "applying", targets, error: undefined });
    for (const target of targets) {
      units.push({ itemId: item.id, instruction: item.instruction, scope: item.scope, target });
    }
  }
  publish();

  // ── Run one target image: edit → save.
  const runUnit = async (unit: Unit) => {
    patchTarget(unit.itemId, unit.target.angleId, { status: "running", error: undefined });
    publish();

    const feedback = buildRevisionEditInstruction({
      instruction: unit.instruction,
      angleName: unit.target.angleName,
      scope: unit.scope,
      boothSizeLabel,
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await edit({
          projectId,
          previousImageUrl: unit.target.beforeUrl,
          feedback,
          boothSizeLabel,
        });

        // Save through the normal path under the SAME full angle_id, so
        // save-render-image flips the prior row to is_current=false and
        // this revision becomes the current render for that angle.
        const promptArtifacts = buildRenderPromptArtifacts({
          prompt: result.promptUsed ?? feedback,
          model: result.modelUsed,
          references: [{ label: "Previous render (edit source)", url: unit.target.beforeUrl }],
        });

        await save({
          angleId: unit.target.angleId,
          angleName: unit.target.angleName,
          imageDataUrl: result.imageUrl,
          modelUsed: result.modelUsed,
          primaryError: result.primaryError,
          configKey: configKey ?? undefined,
          configLabel: configLabel ?? undefined,
          promptArtifacts: promptArtifacts
            ? { ...promptArtifacts, clientRevision: true }
            : undefined,
        });

        patchTarget(unit.itemId, unit.target.angleId, {
          status: "done",
          afterUrl: result.imageUrl,
          error: undefined,
        });
        publish();
        return;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 0 && isTransient(message)) {
          await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
          continue;
        }
        break;
      }
    }

    patchTarget(unit.itemId, unit.target.angleId, {
      status: "error",
      error: lastError instanceof Error ? lastError.message : "Failed to apply revision",
    });
    publish();
  };

  // ── Concurrency-capped batches. allSettled so one failure never
  // aborts the rest of the round.
  const size = Math.max(1, concurrency);
  for (let i = 0; i < units.length; i += size) {
    await Promise.allSettled(units.slice(i, i + size).map(runUnit));
  }

  // ── Roll each item up from its targets.
  items = items.map((item) => {
    if (item.status !== "applying") return item;
    const targets = item.targets ?? [];
    const errored = targets.filter((t) => t.status === "error");
    if (errored.length === targets.length && targets.length > 0) {
      return { ...item, status: "error", error: errored[0]?.error ?? "All revisions failed" };
    }
    if (errored.length > 0) {
      return {
        ...item,
        status: "applied",
        error: `${errored.length} of ${targets.length} views failed`,
      };
    }
    return { ...item, status: "applied", error: undefined };
  });
  publish();

  return items;
}
