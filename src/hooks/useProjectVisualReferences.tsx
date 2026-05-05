// useProjectVisualReferences — aggregates every visual reference the user
// has attached to a project so the image generator can use them on every
// render call. The user's mental model is "Canopy already has my brand
// stuff — use it." This hook makes that real by routing the project KB's
// images into the same image_url content array the model sees on every
// generation.
//
// Sources, in priority order (most important first — Gemini accepts
// multiple reference images but earlier ones get more weight):
//   1. Brand logo  (tag: "brand-logo")            → render literally on signage
//   2. Inspiration (tag: "inspiration" + image)   → mood / material / composition
//   3. Other project KB images (image mime type) → general visual context
//
// We cap the total at MAX_REFS to avoid flooding the model. The brand
// logo always takes a slot if present; the rest are filled newest-first.
//
// URLs are SIGNED (1-hour TTL) because the knowledge-documents bucket
// is private — getPublicUrl returns links that 403.

import { useMemo } from "react";
import {
  useKnowledgeDocuments,
  type KnowledgeDocument,
} from "@/hooks/useKnowledgeDocuments";
import { useSignedUrls } from "@/hooks/useSignedUrls";

/**
 * Hard cap on the number of reference images we send. Gemini will accept
 * more, but quality degrades when too many references compete; 5 is a
 * sweet spot from production tests.
 */
const MAX_REFS = 5;

export interface VisualReference {
  documentId: string;
  url: string;
  filename: string;
  /** Why this image is included — used by the edge function to label
   *  the reference for the model. */
  role: "brand-logo" | "inspiration" | "brand-image" | "other";
  uploadedAt: string;
}

function isImageDoc(doc: KnowledgeDocument): boolean {
  if (typeof doc.mime_type === "string" && doc.mime_type.startsWith("image/")) return true;
  if (Array.isArray(doc.user_tags) && doc.user_tags.includes("image")) return true;
  // Fallback: filename extension.
  const lower = (doc.filename ?? "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg|heic|heif)$/.test(lower);
}

function classifyRole(doc: KnowledgeDocument): VisualReference["role"] {
  const tags = Array.isArray(doc.user_tags) ? doc.user_tags : [];
  if (tags.includes("brand-logo")) return "brand-logo";
  if (tags.includes("inspiration")) return "inspiration";
  // Brand intelligence documents flagged as brand assets.
  if (tags.includes("brand") || tags.includes("brand-asset") || tags.includes("logo")) {
    return "brand-image";
  }
  // Render references are excluded from the project-wide pool — they're
  // per-view scratch attachments and live in useRenderReferences instead.
  return "other";
}

export function useProjectVisualReferences(projectId: string | null | undefined) {
  const { documents, isLoading } = useKnowledgeDocuments({
    scope: "project",
    scopeId: projectId ?? undefined,
  });

  // Filter + sort relevant image docs.
  const relevantDocs = useMemo(() => {
    if (!documents) return [];
    return documents
      .filter(isImageDoc)
      .filter((d) => {
        const tags = Array.isArray(d.user_tags) ? d.user_tags : [];
        // Skip transient render-references — those are handled per-view.
        if (tags.includes("render-reference")) return false;
        return true;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [documents]);

  // Pick a capped set with the brand logo always first if present.
  const selectedDocs = useMemo(() => {
    if (relevantDocs.length === 0) return [];
    const logo = relevantDocs.find((d) => classifyRole(d) === "brand-logo") ?? null;
    const inspiration = relevantDocs.filter((d) => classifyRole(d) === "inspiration");
    const brandImages = relevantDocs.filter((d) => classifyRole(d) === "brand-image");
    const other = relevantDocs.filter((d) => classifyRole(d) === "other");

    const chosen: KnowledgeDocument[] = [];
    if (logo) chosen.push(logo);
    for (const r of inspiration) {
      if (chosen.length >= MAX_REFS) break;
      chosen.push(r);
    }
    for (const r of brandImages) {
      if (chosen.length >= MAX_REFS) break;
      chosen.push(r);
    }
    for (const r of other) {
      if (chosen.length >= MAX_REFS) break;
      chosen.push(r);
    }
    return chosen;
  }, [relevantDocs]);

  const signedUrls = useSignedUrls(selectedDocs);

  // Materialize VisualReference[] only when URLs have arrived.
  const selected = useMemo<VisualReference[]>(() => {
    return selectedDocs
      .map<VisualReference | null>((doc) => {
        const url = signedUrls[doc.id];
        if (!url) return null;
        return {
          documentId: doc.id,
          url,
          filename: doc.filename,
          role: classifyRole(doc),
          uploadedAt: doc.created_at,
        };
      })
      .filter((r): r is VisualReference => r !== null);
  }, [selectedDocs, signedUrls]);

  // URLs only — convenient for passing into the edge function. Excludes
  // the brand logo because it goes in its own dedicated slot
  // (brandLogoUrl) so the edge function can label it as a literal mark.
  const inspirationUrls = useMemo<string[]>(
    () => selected.filter((r) => r.role !== "brand-logo").map((r) => r.url),
    [selected],
  );

  return {
    selected,
    inspirationUrls,
    isLoading,
    /** The brand-logo reference, if one exists. Re-exported so callers
     *  can avoid double-fetching via useBrandLogo. */
    brandLogo: selected.find((r) => r.role === "brand-logo") ?? null,
  };
}
