// useRenderReferences — per-angle scratchpad of supplemental images the
// user wants to attach to the NEXT regeneration of that view. The user
// clicks "Attach reference" on a card, picks a file; we upload it to the
// project KB tagged "render-reference" so it persists in Files but
// doesn't become permanent brand context. The URL goes into a pending
// list keyed by angleId. When that angle regenerates, the URLs flow
// through as extraReferenceUrls. The list is cleared after a successful
// regen but kept on failure so the user can retry without re-uploading.

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";

export interface PendingReference {
  id: string;
  filename: string;
  url: string;
  status: "uploading" | "ready" | "error";
  errorMsg?: string;
}

export function useRenderReferences(projectId: string | null | undefined) {
  const { uploadDocument } = useKnowledgeDocuments({
    scope: "project",
    scopeId: projectId ?? undefined,
  });
  const [byAngle, setByAngle] = useState<Record<string, PendingReference[]>>({});

  const attach = useCallback(
    async (angleId: string, file: File) => {
      if (!projectId) return;
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const placeholder: PendingReference = {
        id: tempId,
        filename: file.name,
        url: "",
        status: "uploading",
      };
      setByAngle((prev) => ({
        ...prev,
        [angleId]: [...(prev[angleId] ?? []), placeholder],
      }));

      try {
        const result = await uploadDocument.mutateAsync({
          file,
          title: `Render reference — ${file.name}`,
          userTags: ["render-reference", "image"],
        });
        // Resolve a public URL from the storage path.
        const { data } = supabase.storage
          .from(result.storage_bucket)
          .getPublicUrl(result.storage_path);
        setByAngle((prev) => ({
          ...prev,
          [angleId]: (prev[angleId] ?? []).map((r) =>
            r.id === tempId ? { ...r, status: "ready", url: data.publicUrl } : r,
          ),
        }));
      } catch (e) {
        setByAngle((prev) => ({
          ...prev,
          [angleId]: (prev[angleId] ?? []).map((r) =>
            r.id === tempId
              ? {
                  ...r,
                  status: "error",
                  errorMsg: e instanceof Error ? e.message : String(e),
                }
              : r,
          ),
        }));
      }
    },
    [projectId, uploadDocument],
  );

  const remove = useCallback((angleId: string, refId: string) => {
    setByAngle((prev) => ({
      ...prev,
      [angleId]: (prev[angleId] ?? []).filter((r) => r.id !== refId),
    }));
  }, []);

  const clear = useCallback((angleId: string) => {
    setByAngle((prev) => {
      const next = { ...prev };
      delete next[angleId];
      return next;
    });
  }, []);

  /** Pending refs for an angle that have a usable URL (status === "ready"). */
  const urlsForAngle = useCallback(
    (angleId: string): string[] => {
      return (byAngle[angleId] ?? [])
        .filter((r) => r.status === "ready" && r.url)
        .map((r) => r.url);
    },
    [byAngle],
  );

  return { byAngle, attach, remove, clear, urlsForAngle };
}
