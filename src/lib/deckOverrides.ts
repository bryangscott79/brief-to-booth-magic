// deckOverrides — per-project, per-slide content edits applied on top of
// the auto-generated proposal data right before export.
//
// The proposal builder reads the brief and elements verbatim and produces a
// generated deck. Users want to clean things up — change a headline, sharpen
// a bullet, swap an image — without going back upstream to /generate. We
// store those edits as a sparse override map keyed by the section's stable
// id; the export renderer merges overrides onto the auto-built data right
// before the PPTX/PDF is generated. Untouched sections are unaffected.
//
// Schema-resilient persistence: tries `projects.deck_overrides` (JSONB)
// first; falls back to localStorage when the column is missing. Same
// pattern as promptVersions.

import { supabase } from "@/integrations/supabase/client";

export interface DeckSlideOverride {
  /** Section id (stable across regeneration) — e.g. "executive-summary". */
  sectionId: string;
  /** Hide this slide from the deck. Skipped at render time. */
  hidden?: boolean;
  /** Override the slide title. */
  title?: string;
  /** Override section.content.headline if present. */
  headline?: string;
  /** Override section.content.subheadline if present. */
  subheadline?: string;
  /** Override section.content.narrative / conceptDescription / philosophy. */
  narrative?: string;
  /** Override section.content.caption (image slides). */
  caption?: string;
  /**
   * Override a single bullet array on the slide. Many sections expose
   * multiple arrays (briefAlignment, designPrinciples, etc.) — keyed by
   * the field name on section.content.
   */
  bullets?: Record<string, string[]>;
  /** Override the angle id featured on image slides. */
  imageAngleId?: string;
  /** Free-form notes — never rendered, but stored for the user. */
  notes?: string;
}

export interface DeckOverrides {
  /** Map of sectionId → override. */
  bySection: Record<string, DeckSlideOverride>;
  /**
   * Custom slide order — list of section ids. When set, overrides the
   * default template order. Sections not present here render in their
   * default position (after the listed ones).
   */
  order?: string[];
  /** Last-edited timestamp. */
  updatedAt: string;
}

const LOCAL_STORAGE_PREFIX = "canopy:deck-overrides:";

function localKey(projectId: string) {
  return `${LOCAL_STORAGE_PREFIX}${projectId}`;
}

function readLocal(projectId: string): DeckOverrides | null {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.bySection) {
      return parsed as DeckOverrides;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLocal(projectId: string, overrides: DeckOverrides) {
  try {
    localStorage.setItem(localKey(projectId), JSON.stringify(overrides));
  } catch {
    /* ignore quota / private mode */
  }
}

function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /column .* does not exist|deck_overrides.*does not exist|could not find the .* column/i.test(
    msg,
  );
}

export async function loadDeckOverrides(projectId: string): Promise<DeckOverrides | null> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("deck_overrides" as any)
      .eq("id", projectId)
      .maybeSingle();
    if (error && !isMissingColumnError(error)) {
      console.warn("[loadDeckOverrides] DB read failed, using local:", error.message);
      return readLocal(projectId);
    }
    if (!error && data && (data as any).deck_overrides) {
      return (data as any).deck_overrides as DeckOverrides;
    }
  } catch (e) {
    if (!isMissingColumnError(e)) {
      console.warn("[loadDeckOverrides] DB read threw, using local:", e);
    }
  }
  return readLocal(projectId);
}

export async function saveDeckOverrides(
  projectId: string,
  overrides: DeckOverrides,
): Promise<void> {
  const stamped: DeckOverrides = { ...overrides, updatedAt: new Date().toISOString() };
  writeLocal(projectId, stamped);
  try {
    const { error } = await supabase
      .from("projects")
      .update({ deck_overrides: stamped } as any)
      .eq("id", projectId);
    if (error && !isMissingColumnError(error)) {
      console.warn("[saveDeckOverrides] DB write failed (non-fatal):", error.message);
    }
  } catch (e) {
    if (!isMissingColumnError(e)) {
      console.warn("[saveDeckOverrides] DB write threw (non-fatal):", e);
    }
  }
}

// ─── Apply overrides to generated sections ─────────────────────────────────

interface ProposalSectionLike {
  id: string;
  title: string;
  type: string;
  content: any;
}

/**
 * Returns a new section list with user overrides merged in. Original
 * sections are not mutated. Hidden sections are dropped entirely. Custom
 * order (overrides.order) is applied if present.
 */
export function applyDeckOverrides<T extends ProposalSectionLike>(
  sections: T[],
  overrides: DeckOverrides | null | undefined,
): T[] {
  if (!overrides) return sections;
  const { bySection, order } = overrides;

  const merged: T[] = sections.flatMap((section) => {
    const o = bySection[section.id];
    if (o?.hidden) return [];
    if (!o) return [section];

    // Shallow-clone content so we don't mutate the source.
    const nextContent: any = { ...section.content };

    if (o.headline !== undefined) nextContent.headline = o.headline;
    if (o.subheadline !== undefined) nextContent.subheadline = o.subheadline;
    if (o.narrative !== undefined) {
      nextContent.narrative = o.narrative;
      // Some section content shapes use these other field names instead.
      if ("conceptDescription" in nextContent) nextContent.conceptDescription = o.narrative;
      if ("philosophy" in nextContent) nextContent.philosophy = o.narrative;
    }
    if (o.caption !== undefined) nextContent.caption = o.caption;
    if (o.bullets) {
      for (const [field, values] of Object.entries(o.bullets)) {
        nextContent[field] = values;
      }
    }
    if (o.imageAngleId !== undefined) nextContent.imageAngleId = o.imageAngleId;

    return [
      {
        ...section,
        title: o.title ?? section.title,
        content: nextContent,
      } as T,
    ];
  });

  // Apply custom order if set: sections in `order` first (in that order),
  // unlisted sections after in their original relative order.
  if (order && order.length > 0) {
    const orderSet = new Set(order);
    const indexById = new Map(order.map((id, i) => [id, i]));
    const head = merged
      .filter((s) => orderSet.has(s.id))
      .sort((a, b) => (indexById.get(a.id)! - indexById.get(b.id)!));
    const tail = merged.filter((s) => !orderSet.has(s.id));
    return [...head, ...tail];
  }

  return merged;
}

// ─── Helpers for the editor UI ─────────────────────────────────────────────

/**
 * Walks a section.content object and finds string-array fields that are
 * good candidates for inline bullet editing. Returns field-name → array.
 * Filters out nested non-string arrays (e.g. arrays of objects).
 */
export function extractEditableBullets(content: any): Record<string, string[]> {
  if (!content || typeof content !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(content)) {
    if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string")) {
      out[key] = value as string[];
    }
  }
  return out;
}

/**
 * Returns a friendly label for a section.content field, used in the inline
 * editor's bullet section headers.
 */
export function fieldLabel(field: string): string {
  // Camel/snake-case → Title Case with spaces.
  const spaced = field.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
