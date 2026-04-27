// useKnowledgeDocuments — the new RAG-backed knowledge base hook.
// Scoped by (scope, scope_id) within the user's agency.
//
// Replaces the legacy `useKnowledgeBase` hook. Writes to `knowledge_documents`
// and triggers `embed-document` + `auto-tag-document` edge functions on upload.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useAgency } from "./useAgency";
import type { Tables } from "@/integrations/supabase/types";

export type KnowledgeScope =
  | "agency"
  | "activation_type"
  | "activation_type_agency"
  | "client"
  | "project"
  | "industry";
export type KnowledgeDocument = Tables<"knowledge_documents">;

interface UseKnowledgeDocumentsOptions {
  scope: KnowledgeScope;
  scopeId: string | null | undefined;
}

export function useKnowledgeDocuments({ scope, scopeId }: UseKnowledgeDocumentsOptions) {
  const { user } = useAuth();
  const { agency } = useAgency();
  const queryClient = useQueryClient();
  const agencyId = agency?.id;
  // Industry-scoped docs are global — they have no agency_id and are
  // editable only by super admins. The hook still works (RLS handles auth).
  const isIndustryScope = scope === "industry";

  const documentsQuery = useQuery({
    queryKey: ["knowledge-documents", scope, scopeId, isIndustryScope ? "global" : agencyId],
    queryFn: async (): Promise<KnowledgeDocument[]> => {
      if (!scopeId) return [];
      if (!isIndustryScope && !agencyId) return [];
      let q = supabase
        .from("knowledge_documents")
        .select("*")
        .eq("scope", scope)
        .eq("scope_id", scopeId)
        .order("created_at", { ascending: false });
      if (isIndustryScope) {
        q = q.is("agency_id", null);
      } else {
        q = q.eq("agency_id", agencyId!);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as KnowledgeDocument[];
    },
    enabled: !!scopeId && (isIndustryScope || !!agencyId),
  });

  const uploadDocument = useMutation({
    mutationFn: async ({
      file,
      title,
      userTags,
    }: {
      file: File;
      title?: string;
      userTags?: string[];
    }) => {
      if (!scopeId || !user) {
        throw new Error("Missing scope_id or user context");
      }
      if (!isIndustryScope && !agencyId) {
        throw new Error("Missing agency context");
      }

      // Storage path. Agency-scoped: {agency_id}/{scope}/{scope_id}/...
      // Industry-scoped: industry/{industry_uuid}/...
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = isIndustryScope
        ? `industry/${scopeId}/${Date.now()}_${safeName}`
        : `${agencyId}/${scope}/${scopeId}/${Date.now()}_${safeName}`;

      // 1. Upload file to storage
      const { error: uploadErr } = await supabase.storage
        .from("knowledge-documents")
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadErr) throw uploadErr;

      // 2. Insert the knowledge_documents row (status 'pending')
      const { data: doc, error: dbErr } = await supabase
        .from("knowledge_documents")
        .insert({
          scope,
          scope_id: scopeId,
          agency_id: isIndustryScope ? (null as any) : agencyId,
          filename: file.name,
          storage_bucket: "knowledge-documents",
          storage_path: storagePath,
          mime_type: file.type || null,
          file_size_bytes: file.size,
          title: title || null,
          user_tags: userTags || [],
          status: "pending",
          uploaded_by: user.id,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      // 3. Kick off embed-document (async, doesn't block the UI)
      const { error: embedErr } = await supabase.functions.invoke("embed-document", {
        body: { document_id: doc.id },
      });
      if (embedErr) {
        console.error("[useKnowledgeDocuments] embed-document failed:", embedErr);
        // Don't throw — the doc row exists; status will show 'failed'
      }

      // 4. Kick off auto-tag (non-blocking; runs after text extraction)
      // Delay briefly so embed-document has a chance to extract text first.
      setTimeout(async () => {
        try {
          await supabase.functions.invoke("auto-tag-document", {
            body: { document_id: doc.id },
          });
        } catch (e) {
          console.warn("[useKnowledgeDocuments] auto-tag failed (non-fatal):", e);
        }
      }, 3000);

      return doc as KnowledgeDocument;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", scope, scopeId, isIndustryScope ? "global" : agencyId] });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (doc: KnowledgeDocument) => {
      // Remove storage object (best-effort)
      await supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]);
      // Delete the row (cascade will clean up chunks)
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", scope, scopeId, isIndustryScope ? "global" : agencyId] });
    },
  });

  const updateDocument = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<KnowledgeDocument, "title" | "user_tags" | "summary" | "priority_weight" | "is_pinned">>;
    }) => {
      const { error } = await supabase
        .from("knowledge_documents")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", scope, scopeId, isIndustryScope ? "global" : agencyId] });
    },
  });

  const reembedDocument = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.functions.invoke("embed-document", {
        body: { document_id: documentId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-documents", scope, scopeId, isIndustryScope ? "global" : agencyId] });
    },
  });

  return {
    documents: documentsQuery.data || [],
    isLoading: documentsQuery.isLoading,
    uploadDocument,
    deleteDocument,
    updateDocument,
    reembedDocument,
  };
}
