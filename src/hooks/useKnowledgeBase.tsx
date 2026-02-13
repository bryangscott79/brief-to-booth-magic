import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface KBFile {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  public_url: string;
  extracted_text: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

export function useKnowledgeBase(projectId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const filesQuery = useQuery({
    queryKey: ["kb-files", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("knowledge_base_files" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as KBFile[];
    },
    enabled: !!projectId && !!user,
  });

  const uploadFile = useMutation({
    mutationFn: async ({ file, extractedText }: { file: File; extractedText?: string }) => {
      if (!projectId || !user) throw new Error("No project or user");

      const path = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-base")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("knowledge-base")
        .getPublicUrl(path);

      const { error: dbError } = await supabase
        .from("knowledge_base_files" as any)
        .insert({
          project_id: projectId,
          user_id: user.id,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          storage_path: path,
          public_url: urlData.publicUrl,
          extracted_text: extractedText || null,
          file_size_bytes: file.size,
        });
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-files", projectId] });
    },
  });

  const deleteFile = useMutation({
    mutationFn: async (file: KBFile) => {
      await supabase.storage.from("knowledge-base").remove([file.storage_path]);
      const { error } = await supabase
        .from("knowledge_base_files" as any)
        .delete()
        .eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-files", projectId] });
    },
  });

  const updateExtractedText = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from("knowledge_base_files" as any)
        .update({ extracted_text: text })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-files", projectId] });
    },
  });

  return {
    files: filesQuery.data || [],
    isLoading: filesQuery.isLoading,
    uploadFile,
    deleteFile,
    updateExtractedText,
  };
}

// Helper to extract text from common file types client-side
export async function extractTextFromFile(file: File): Promise<string | null> {
  const textTypes = [
    "text/plain", "text/csv", "text/markdown", "text/html",
    "application/json", "application/xml",
  ];
  
  if (textTypes.includes(file.type) || file.name.match(/\.(txt|md|csv|json|xml|yaml|yml|log)$/i)) {
    return await file.text();
  }
  
  // For other types, return null — user can add notes manually
  return null;
}
