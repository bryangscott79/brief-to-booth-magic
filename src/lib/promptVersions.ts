// Prompt version persistence — saves/loads metadata for prompt versions.
//
// Storage strategy is schema-resilient because Lovable's migration pipeline
// is unreliable. We try to write a JSONB column on the projects table; if
// that column doesn't exist yet (or the user lacks permission), we fall back
// to localStorage keyed by projectId. Either way the shape on disk is the
// same and the rest of the app doesn't care.

import { supabase } from "@/integrations/supabase/client";
import type { PromptStylePresetId } from "@/lib/promptStylePresets";

export interface PromptVersionMeta {
  id: string;
  /** Style preset used for this version. */
  preset: PromptStylePresetId;
  /** User-visible label (auto-generated, but renamable later). */
  label: string;
  /** Optional custom emphasis text — only meaningful when preset === 'custom'. */
  customEmphasis?: string;
  /** ISO timestamp when this version was first created. */
  createdAt: string;
  /** Last time the user generated/regenerated something inside this version. */
  updatedAt: string;
  /** Free-form notes — user can annotate why this version exists. */
  notes?: string;
}

const LOCAL_STORAGE_PREFIX = "canopy:prompt-versions:";

function localKey(projectId: string) {
  return `${LOCAL_STORAGE_PREFIX}${projectId}`;
}

function readLocal(projectId: string): PromptVersionMeta[] {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PromptVersionMeta[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(projectId: string, versions: PromptVersionMeta[]) {
  try {
    localStorage.setItem(localKey(projectId), JSON.stringify(versions));
  } catch {
    /* quota / private mode — ignore */
  }
}

function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /column .* does not exist|prompt_versions.*does not exist|could not find the .* column/i.test(
    msg,
  );
}

/**
 * Load versions for a project. Tries the DB column first, falls back to
 * localStorage. Returns [] when nothing is saved anywhere.
 */
export async function loadPromptVersions(projectId: string): Promise<PromptVersionMeta[]> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("prompt_versions" as any)
      .eq("id", projectId)
      .maybeSingle();
    if (error && !isMissingColumnError(error)) {
      // Some other error — fall back to local rather than throwing.
      console.warn("[loadPromptVersions] DB read failed, falling back to local:", error.message);
      return readLocal(projectId);
    }
    if (!error && data && Array.isArray((data as any).prompt_versions)) {
      return (data as any).prompt_versions as PromptVersionMeta[];
    }
  } catch (e) {
    if (!isMissingColumnError(e)) {
      console.warn("[loadPromptVersions] DB read threw, falling back to local:", e);
    }
  }
  return readLocal(projectId);
}

/**
 * Save versions for a project. Best-effort write to the DB; mirror to
 * localStorage so the next page load is fast even if the network is slow.
 */
export async function savePromptVersions(
  projectId: string,
  versions: PromptVersionMeta[],
): Promise<void> {
  // Mirror first so we never lose state to a network blip.
  writeLocal(projectId, versions);

  try {
    const { error } = await supabase
      .from("projects")
      .update({ prompt_versions: versions } as any)
      .eq("id", projectId);
    if (error && !isMissingColumnError(error)) {
      console.warn("[savePromptVersions] DB write failed (non-fatal):", error.message);
    }
  } catch (e) {
    if (!isMissingColumnError(e)) {
      console.warn("[savePromptVersions] DB write threw (non-fatal):", e);
    }
  }
}

// ─── Versioned angle ID helpers ─────────────────────────────────────────────
//
// Image rows are keyed by `(project_id, angle_id)` and the save edge function
// flips prior images to is_current=false on collision. To keep versions
// independent we suffix the angleId with a versionId. The base angleId is
// still extractable so the renderer (which builds prompts from base angle ids)
// can do its job.

const VERSION_SUFFIX_DELIM = "__v__";

export function makeVersionedAngleId(baseAngleId: string, versionId: string): string {
  return `${baseAngleId}${VERSION_SUFFIX_DELIM}${versionId}`;
}

export function parseVersionedAngleId(angleId: string): {
  baseAngleId: string;
  versionId: string | null;
} {
  const idx = angleId.indexOf(VERSION_SUFFIX_DELIM);
  if (idx < 0) return { baseAngleId: angleId, versionId: null };
  return {
    baseAngleId: angleId.slice(0, idx),
    versionId: angleId.slice(idx + VERSION_SUFFIX_DELIM.length),
  };
}

// ─── Orphan recovery ───────────────────────────────────────────────────────
//
// When a version's metadata gets lost (deleted accidentally, localStorage
// wiped on a different device, or DB persistence failed), the renders
// generated under that version still exist in project_images — they're
// just orphaned because no version metadata claims them. This helper
// scans a list of saved images and identifies version suffixes that
// don't appear in the current versions list. The UI uses this to offer
// a one-click "recover orphan version" flow.

export interface OrphanedVersionInfo {
  versionId: string;
  imageCount: number;
  /** Newest image timestamp, used to label the recovered version. */
  latestImageAt: string | null;
  /** Sample of base angle ids found, useful for diagnostics. */
  baseAngles: string[];
}

export function findOrphanedVersions(params: {
  savedImages: Array<{ angle_id: string; created_at?: string | null }>;
  knownVersionIds: string[];
}): OrphanedVersionInfo[] {
  const { savedImages, knownVersionIds } = params;
  const known = new Set(knownVersionIds);
  const byVersion = new Map<string, OrphanedVersionInfo>();

  for (const img of savedImages) {
    const { baseAngleId, versionId } = parseVersionedAngleId(img.angle_id);
    if (!versionId || known.has(versionId)) continue;
    const existing = byVersion.get(versionId);
    const createdAt = img.created_at ?? null;
    if (existing) {
      existing.imageCount += 1;
      if (!existing.baseAngles.includes(baseAngleId)) existing.baseAngles.push(baseAngleId);
      if (createdAt && (!existing.latestImageAt || createdAt > existing.latestImageAt)) {
        existing.latestImageAt = createdAt;
      }
    } else {
      byVersion.set(versionId, {
        versionId,
        imageCount: 1,
        latestImageAt: createdAt,
        baseAngles: [baseAngleId],
      });
    }
  }
  // Newest first.
  return Array.from(byVersion.values()).sort((a, b) => {
    const aT = a.latestImageAt ?? "";
    const bT = b.latestImageAt ?? "";
    return aT > bT ? -1 : aT < bT ? 1 : 0;
  });
}
