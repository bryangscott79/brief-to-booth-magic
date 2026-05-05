// useBrandLogo — per-project brand logo storage + upload.
//
// The logo is what the AI uses as a visual reference for branding in every
// generated render — not just a piece of metadata. Stored in the project
// KB (scope='project') with userTags=["brand-logo"] so it surfaces in the
// Files tab too. The most-recent brand-logo document is the active one.
//
// Render generation (generate-hero / generate-view) reads the active
// logo URL via this hook and includes it as a reference image in the
// model call. URLs are SIGNED (1-hour TTL) because the
// knowledge-documents bucket is private — public URLs return 403.

import { useCallback, useMemo } from "react";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";
import { useSignedUrls } from "@/hooks/useSignedUrls";

const LOGO_TAG = "brand-logo";

export interface BrandLogo {
  documentId: string;
  /**
   * Signed Supabase Storage URL valid for ~1 hour. Long enough for both
   * <img> rendering and edge function fetches; the URL is regenerated on
   * each page load so a refresh always gives a fresh signature.
   */
  publicUrl: string;
  filename: string;
  uploadedAt: string;
  mimeType: string | null;
}

export function useBrandLogo(projectId: string | null | undefined) {
  const { documents, isLoading, uploadDocument, deleteDocument } = useKnowledgeDocuments({
    scope: "project",
    scopeId: projectId ?? undefined,
  });

  // Pick out logo-tagged docs and sign their URLs in one go.
  const logoDocs = useMemo(() => {
    if (!documents) return [];
    return documents
      .filter((d) => Array.isArray(d.user_tags) && d.user_tags.includes(LOGO_TAG))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [documents]);

  const signedUrls = useSignedUrls(logoDocs);

  const activeLogo = useMemo<BrandLogo | null>(() => {
    if (logoDocs.length === 0) return null;
    const doc = logoDocs[0]!;
    const url = signedUrls[doc.id];
    if (!url) return null; // still signing — caller waits a tick
    return {
      documentId: doc.id,
      publicUrl: url,
      filename: doc.filename,
      uploadedAt: doc.created_at,
      mimeType: doc.mime_type,
    };
  }, [logoDocs, signedUrls]);

  const upload = useCallback(
    async (file: File) => {
      await uploadDocument.mutateAsync({
        file,
        title: `Brand logo — ${file.name}`,
        userTags: [LOGO_TAG, "image"],
      });
    },
    [uploadDocument],
  );

  const remove = useCallback(async () => {
    if (!activeLogo) return;
    const doc = documents?.find((d) => d.id === activeLogo.documentId);
    if (!doc) return;
    await deleteDocument.mutateAsync(doc);
  }, [activeLogo, documents, deleteDocument]);

  return {
    activeLogo,
    isLoading,
    upload,
    isUploading: uploadDocument.isPending,
    remove,
    isRemoving: deleteDocument.isPending,
  };
}
