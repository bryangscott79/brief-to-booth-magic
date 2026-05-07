// usePromptVersions — owns the per-project list of prompt versions plus the
// "active" selection. Persists to projects.prompt_versions (JSONB) with a
// localStorage fallback.
//
// Versions are identified by short, file-safe ids (newVersionId from
// promptStylePresets). Each image saved while a version is active is stored
// under angle_id = `{baseAngleId}__v__{versionId}` so versions are isolated
// in the project_images table without any schema changes.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadPromptVersions,
  savePromptVersions,
  type PromptVersionMeta,
} from "@/lib/promptVersions";
import {
  getPresetById,
  newVersionId,
  type PromptStylePresetId,
} from "@/lib/promptStylePresets";

interface UsePromptVersionsResult {
  versions: PromptVersionMeta[];
  activeVersionId: string | null;
  activeVersion: PromptVersionMeta | null;
  isLoading: boolean;
  /** Switch to an existing version. Caller is responsible for any UI reset. */
  selectVersion: (id: string) => void;
  /**
   * Create a new version, mark it active, persist. Returns the new metadata
   * so callers can immediately use the id (e.g., for image saves).
   */
  createVersion: (params: {
    preset: PromptStylePresetId;
    label: string;
    customEmphasis?: string;
    notes?: string;
    imageModel?: "gemini" | "openai";
  }) => PromptVersionMeta;
  /** Tick the updatedAt of the active version. Cheap, debounced-ish. */
  touchActiveVersion: () => void;
  /** Delete a version's metadata (saved images stay in storage). */
  deleteVersion: (id: string) => void;
  /** Update label/preset/notes/customEmphasis/imageModel on an existing version. */
  updateVersion: (
    id: string,
    patch: Partial<Pick<PromptVersionMeta, "label" | "notes" | "customEmphasis" | "preset" | "imageModel">>,
  ) => void;
  /**
   * Insert a version with a pre-existing id (used by orphan recovery to
   * reattach images to a "Recovered" version chip without minting a new id).
   */
  insertVersion: (meta: PromptVersionMeta) => void;
}

export function usePromptVersions(projectId: string | null | undefined): UsePromptVersionsResult {
  const [versions, setVersions] = useState<PromptVersionMeta[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load on project change
  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setVersions([]);
      setActiveVersionId(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setIsLoading(true);
    void (async () => {
      const loaded = await loadPromptVersions(projectId);
      if (cancelled) return;
      setVersions(loaded);
      setActiveVersionId(loaded.length > 0 ? loaded[0]!.id : null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeVersionId) ?? null,
    [versions, activeVersionId],
  );

  const persist = useCallback(
    (next: PromptVersionMeta[]) => {
      setVersions(next);
      if (projectId) void savePromptVersions(projectId, next);
    },
    [projectId],
  );

  const selectVersion = useCallback((id: string) => {
    setActiveVersionId(id);
  }, []);

  const createVersion = useCallback(
    (params: {
      preset: PromptStylePresetId;
      label: string;
      customEmphasis?: string;
      notes?: string;
      imageModel?: "gemini" | "openai";
    }): PromptVersionMeta => {
      const preset = getPresetById(params.preset);
      const id = newVersionId();
      const now = new Date().toISOString();
      const meta: PromptVersionMeta = {
        id,
        preset: preset.id,
        label: params.label || `${preset.shortLabel} — ${new Date().toLocaleDateString()}`,
        customEmphasis: params.customEmphasis,
        createdAt: now,
        updatedAt: now,
        notes: params.notes,
        imageModel: params.imageModel,
      };
      // Newest first
      const next = [meta, ...versions];
      persist(next);
      setActiveVersionId(id);
      return meta;
    },
    [persist, versions],
  );

  const touchActiveVersion = useCallback(() => {
    if (!activeVersionId) return;
    const now = new Date().toISOString();
    const next = versions.map((v) => (v.id === activeVersionId ? { ...v, updatedAt: now } : v));
    persist(next);
  }, [activeVersionId, persist, versions]);

  const deleteVersion = useCallback(
    (id: string) => {
      const next = versions.filter((v) => v.id !== id);
      persist(next);
      if (activeVersionId === id) {
        setActiveVersionId(next.length > 0 ? next[0]!.id : null);
      }
    },
    [activeVersionId, persist, versions],
  );

  const updateVersion = useCallback(
    (
      id: string,
      patch: Partial<Pick<PromptVersionMeta, "label" | "notes" | "customEmphasis" | "preset" | "imageModel">>,
    ) => {
      const next = versions.map((v) =>
        v.id === id ? { ...v, ...patch, updatedAt: new Date().toISOString() } : v,
      );
      persist(next);
    },
    [persist, versions],
  );

  const insertVersion = useCallback(
    (meta: PromptVersionMeta) => {
      // Don't double-insert if the id already exists.
      if (versions.some((v) => v.id === meta.id)) return;
      const next = [meta, ...versions];
      persist(next);
    },
    [persist, versions],
  );

  return {
    versions,
    activeVersionId,
    activeVersion,
    isLoading,
    selectVersion,
    createVersion,
    touchActiveVersion,
    deleteVersion,
    updateVersion,
    insertVersion,
  };
}
