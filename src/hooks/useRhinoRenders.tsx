import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// ─── TYPES ──────────────────────────────────────────────────────────────────────

export interface RhinoRender {
  id: string;
  project_id: string;
  user_id: string;
  original_storage_path: string;
  original_public_url: string;
  polished_storage_path: string | null;
  polished_public_url: string | null;
  polish_status: "uploaded" | "processing" | "complete" | "error";
  polish_prompt: string | null;
  polish_feedback: string | null;
  view_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── QUERY: LIST RHINO RENDERS ──────────────────────────────────────────────────

export function useRhinoRenders(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["rhino-renders", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("rhino_renders" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RhinoRender[];
    },
    enabled: !!projectId,
  });
}

// ─── MUTATION: UPLOAD RHINO RENDER ──────────────────────────────────────────────

interface UploadRhinoParams {
  projectId: string;
  file: File;
  viewName?: string;
  notes?: string;
}

export function useUploadRhino() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, file, viewName, notes }: UploadRhinoParams) => {
      if (!user) throw new Error("Not authenticated");

      // Upload to storage
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${user.id}/${projectId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("rhino-renders")
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("rhino-renders")
        .getPublicUrl(fileName);

      // Insert row
      const { data, error } = await supabase
        .from("rhino_renders" as any)
        .insert({
          project_id: projectId,
          user_id: user.id,
          original_storage_path: fileName,
          original_public_url: urlData.publicUrl,
          view_name: viewName || null,
          notes: notes || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as RhinoRender;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rhino-renders", data.project_id] });
      toast({ title: "Rhino render uploaded" });
    },
    onError: (e: any) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });
}

// ─── MUTATION: POLISH RHINO RENDER ──────────────────────────────────────────────

interface PolishRhinoParams {
  renderId: string;
  projectId: string;
  rhinoImageUrl: string;
  projectType?: string;
  brandIntelligence?: Array<{ category: string; title: string; content: string }>;
  designContext?: string;
  polishInstructions?: string;
  stylePreset?: "photorealistic" | "sketch" | "watercolor";
}

export function usePolishRhino() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      renderId,
      rhinoImageUrl,
      projectType,
      brandIntelligence,
      designContext,
      polishInstructions,
      stylePreset,
    }: PolishRhinoParams) => {
      // Set status to processing
      await supabase
        .from("rhino_renders" as any)
        .update({ polish_status: "processing", polish_prompt: polishInstructions || null } as any)
        .eq("id", renderId);

      // Call edge function
      const { data, error } = await supabase.functions.invoke("polish-rhino-render", {
        body: {
          rhinoImageUrl,
          projectType: projectType || "trade_show_booth",
          brandIntelligence: brandIntelligence || [],
          designContext: designContext || "",
          polishInstructions: polishInstructions || "",
          stylePreset: stylePreset || "photorealistic",
        },
      });

      if (error) {
        await (supabase as any)
          .from("rhino_renders")
          .update({ polish_status: "error", polish_feedback: error.message })
          .eq("id", renderId);
        throw error;
      }

      if (!data?.imageUrl) {
        await (supabase as any)
          .from("rhino_renders")
          .update({ polish_status: "error", polish_feedback: "No image returned" })
          .eq("id", renderId);
        throw new Error("No polished image returned");
      }

      // Update record with polished image
      const { error: updateError } = await supabase
        .from("rhino_renders" as any)
        .update({
          polished_public_url: data.imageUrl,
          polished_storage_path: data.storagePath || null,
          polish_status: "complete",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", renderId);
      if (updateError) throw updateError;

      return { ...data, renderId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rhino-renders", variables.projectId] });
      toast({ title: "Render polished successfully" });
    },
    onError: (e: any) => {
      toast({ title: "Polish failed", description: e.message, variant: "destructive" });
    },
  });
}

// ─── MUTATION: UPDATE RHINO RENDER ──────────────────────────────────────────────

interface UpdateRhinoParams {
  renderId: string;
  projectId: string;
  viewName?: string;
  notes?: string;
}

export function useUpdateRhino() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ renderId, viewName, notes }: UpdateRhinoParams) => {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (viewName !== undefined) updates.view_name = viewName;
      if (notes !== undefined) updates.notes = notes;

      const { error } = await supabase.from("rhino_renders" as any).update(updates).eq("id", renderId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rhino-renders", variables.projectId] });
    },
  });
}

// ─── MUTATION: DELETE RHINO RENDER ──────────────────────────────────────────────

export function useDeleteRhino() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ renderId, projectId, storagePath, polishedStoragePath }: {
      renderId: string;
      projectId: string;
      storagePath: string;
      polishedStoragePath?: string | null;
    }) => {
      // Delete storage files
      const paths = [storagePath];
      if (polishedStoragePath) paths.push(polishedStoragePath);
      await supabase.storage.from("rhino-renders").remove(paths);

      // Delete DB row
      const { error } = await supabase.from("rhino_renders" as any).delete().eq("id", renderId);
      if (error) throw error;
      return { projectId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rhino-renders", data.projectId] });
      toast({ title: "Render deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });
}
