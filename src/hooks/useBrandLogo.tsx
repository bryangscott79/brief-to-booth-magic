// useBrandLogo — per-project brand logo storage + upload.
//
// The logo is what the AI uses as a visual reference for branding in every
// generated render — not just a piece of metadata. Stored in the project
// KB (scope='project') with userTags=["brand-logo"] so it surfaces in the
// Files tab too. The most-recent brand-logo document is the active one.
//
// Render generation (generate-hero / generate-view) reads the active
// logo URL via this hook and includes it as a reference image in the
// model call.

import { useCallback, useMemo } from "react";
import { useKnowledgeDocuments } from "@/hooks/useKnowledgeDocuments";
import { supabase } from "@/integrations/supabase/client";

const LOGO_TAG = "brand-logo";

export interface BrandLogo {
  documentId: string;
  /** Public URL on Supabase storage suitable for direct <img src=""> use. */
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

  // Active logo = most-recently uploaded document tagged "brand-logo".
  // We resolve a public URL via Supabase storage's getPublicUrl since the
  // KB stores storage_path (not a URL) on the document row.
  const activeLogo = useMemo<BrandLogo | null>(() => {
    if (!documents || documents.length === 0) return null;
    const logos = documents
      .filter((d) => Array.isArray(d.user_tags) && d.user_tags.includes(LOGO_TAG))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (logos.length === 0) return null;
    const doc = logos[0]!;
    const { data } = supabase.storage
      .from(doc.storage_bucket)
      .getPublicUrl(doc.storage_path);
    return {
      documentId: doc.id,
      publicUrl: data.publicUrl,
      filename: doc.filename,
      uploadedAt: doc.created_at,
      mimeType: doc.mime_type,
    };
  }, [documents]);

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
