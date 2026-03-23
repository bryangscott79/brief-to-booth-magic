import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { BrandAsset } from "@/types/brief";

// ─── DB ROW SHAPE ─────────────────────────────────────────────────────────────

interface BrandAssetRow {
  id: string;
  client_id: string;
  user_id: string;
  asset_type: BrandAsset["assetType"];
  label: string;
  storage_path: string;
  public_url: string;
  file_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function rowToAsset(r: BrandAssetRow): BrandAsset {
  return {
    id: r.id,
    clientId: r.client_id,
    assetType: r.asset_type,
    label: r.label,
    publicUrl: r.public_url,
    fileType: r.file_type,
    metadata: r.metadata,
  };
}

// ─── QUERY: FETCH ALL ASSETS FOR CLIENT ──────────────────────────────────────

export function useBrandAssets(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["brand-assets", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_assets" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as unknown as BrandAssetRow[]).map(rowToAsset);
    },
  });
}

// ─── MUTATION: UPLOAD ASSET ──────────────────────────────────────────────────

interface UploadBrandAssetInput {
  clientId: string;
  file: File;
  assetType: BrandAsset["assetType"];
  label: string;
  metadata?: Record<string, unknown> | null;
}

export function useUploadBrandAsset() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ clientId, file, assetType, label, metadata }: UploadBrandAssetInput) => {
      if (!user) throw new Error("Not authenticated");

      // Upload to storage
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${user.id}/${clientId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(storagePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("brand-assets")
        .getPublicUrl(storagePath);

      // Insert DB row
      const { data, error } = await supabase
        .from("brand_assets" as any)
        .insert({
          client_id: clientId,
          user_id: user.id,
          asset_type: assetType,
          label,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          file_type: file.type || null,
          metadata: metadata ?? null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return rowToAsset(data as unknown as BrandAssetRow);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["brand-assets", result.clientId] });
      toast({ title: "Brand asset uploaded" });
    },
    onError: (e: any) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });
}

// ─── MUTATION: DELETE ASSET ──────────────────────────────────────────────────

interface DeleteBrandAssetInput {
  id: string;
  clientId: string;
  storagePath: string;
}

export function useDeleteBrandAsset() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, storagePath }: DeleteBrandAssetInput) => {
      // Delete from storage
      await supabase.storage.from("brand-assets").remove([storagePath]);

      // Delete DB row
      const { error } = await supabase
        .from("brand_assets" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["brand-assets", variables.clientId] });
      toast({ title: "Brand asset deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });
}
