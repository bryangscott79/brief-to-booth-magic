import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Trash2, FileText, Image, File } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KBFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  public_url: string;
  created_at: string;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function ActivationTypeKnowledgeBase({ activationTypeId }: { activationTypeId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["activation-type-kb", activationTypeId],
    enabled: !!activationTypeId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activation_type_kb_files" as any)
        .select("*")
        .eq("activation_type_id", activationTypeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KBFile[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (file: KBFile) => {
      await supabase.storage.from("knowledge-base").remove([`activation-types/${activationTypeId}/${file.file_name}`]);
      const { error } = await supabase
        .from("activation_type_kb_files" as any)
        .delete()
        .eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activation-type-kb", activationTypeId] });
      toast({ title: "File removed" });
    },
  });

  const onDrop = useCallback(async (accepted: globalThis.File[]) => {
    if (!user?.id || accepted.length === 0) return;
    setUploading(true);
    try {
      for (const file of accepted) {
        const path = `activation-types/${activationTypeId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("knowledge-base").upload(path, file);
        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage.from("knowledge-base").getPublicUrl(path);

        const { error: dbErr } = await supabase
          .from("activation_type_kb_files" as any)
          .insert({
            activation_type_id: activationTypeId,
            user_id: user.id,
            file_name: file.name,
            file_type: file.type || "application/octet-stream",
            storage_path: path,
            public_url: urlData.publicUrl,
            file_size_bytes: file.size,
          } as any);
        if (dbErr) throw dbErr;
      }
      qc.invalidateQueries({ queryKey: ["activation-type-kb", activationTypeId] });
      toast({ title: `${accepted.length} file(s) uploaded` });
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [activationTypeId, user?.id, qc, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [],
      "application/pdf": [],
      "text/plain": [],
      "text/csv": [],
      "application/json": [],
    },
    maxSize: 10 * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drop images, PDFs, or text files here to add context for this activation type
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Max 10 MB per file</p>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No files yet. Upload reference materials to give the AI more context about this activation type.
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-2 rounded-md border bg-card text-sm">
              {fileIcon(f.file_type)}
              <span className="truncate flex-1">{f.file_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.file_size_bytes)}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(f)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
