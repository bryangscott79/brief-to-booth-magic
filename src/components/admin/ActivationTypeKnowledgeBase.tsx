import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Upload, Trash2, FileText, Image as ImageIcon, File, Video,
  FolderOpen, ChevronDown, ChevronUp, Save, Link2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface KBFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  public_url: string;
  extracted_text: string | null;
  folder: string;
  created_at: string;
}

const ACTIVATION_FOLDERS = [
  { value: "images", label: "Images", icon: ImageIcon, description: "Reference images, mood boards, inspiration" },
  { value: "docs", label: "Documents", icon: FileText, description: "Specs, briefs, guidelines" },
  { value: "video", label: "Video", icon: Video, description: "Walkthrough videos, reference clips" },
  { value: "reference", label: "Reference", icon: File, description: "General reference materials" },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-primary" />;
  if (type.startsWith("video/")) return <Video className="h-4 w-4 text-primary/70" />;
  if (type.includes("pdf")) return <FileText className="h-4 w-4 text-destructive/70" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function ActivationTypeKnowledgeBase({ activationTypeId }: { activationTypeId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [activeFolder, setActiveFolder] = useState("images");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<string | null>(null);

  const { data: allFiles = [], isLoading } = useQuery({
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

  const files = allFiles.filter((f) => f.folder === activeFolder);

  const folderCounts = ACTIVATION_FOLDERS.reduce((acc, f) => {
    acc[f.value] = allFiles.filter((file) => file.folder === f.value).length;
    return acc;
  }, {} as Record<string, number>);

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

  const updateTextMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from("activation_type_kb_files" as any)
        .update({ extracted_text: text } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activation-type-kb", activationTypeId] }),
  });

  const handleSaveText = async (fileId: string) => {
    const text = editingText[fileId];
    if (text === undefined) return;
    setSavingText(fileId);
    try {
      await updateTextMutation.mutateAsync({ id: fileId, text });
      toast({ title: "Notes saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingText(null);
    }
  };

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
            folder: activeFolder,
          } as any);
        if (dbErr) throw dbErr;
      }
      qc.invalidateQueries({ queryKey: ["activation-type-kb", activationTypeId] });
      toast({ title: `${accepted.length} file(s) uploaded to ${activeFolder}` });
    } catch (e: unknown) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [activationTypeId, user?.id, activeFolder, qc, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 20 * 1024 * 1024,
  });

  const currentFolderMeta = ACTIVATION_FOLDERS.find((f) => f.value === activeFolder);

  return (
    <div className="space-y-4">
      {/* Folder tabs */}
      <div className="flex gap-2 flex-wrap">
        {ACTIVATION_FOLDERS.map((folder) => {
          const Icon = folder.icon;
          const isActive = activeFolder === folder.value;
          return (
            <button
              key={folder.value}
              onClick={() => setActiveFolder(folder.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {folder.label}
              {folderCounts[folder.value] > 0 && (
                <span className={`ml-0.5 ${isActive ? "opacity-70" : "opacity-50"}`}>
                  {folderCounts[folder.value]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
            <p className="text-xs text-muted-foreground">
              Drop files into <span className="font-medium text-foreground">{currentFolderMeta?.label}</span> — {currentFolderMeta?.description}
            </p>
          </>
        )}
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-6">
          <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            No files in {currentFolderMeta?.label}. Upload reference materials to give the AI context.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const isExpanded = expandedFile === f.id;
            const currentText = editingText[f.id] ?? f.extracted_text ?? "";
            return (
              <Card key={f.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {fileIcon(f.file_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatBytes(f.file_size_bytes)}</span>
                        {f.extracted_text && (
                          <>
                            <span>·</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">AI-readable</Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <a href={f.public_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                    </a>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      setExpandedFile(isExpanded ? null : f.id);
                      if (!isExpanded && !(f.id in editingText)) {
                        setEditingText((prev) => ({ ...prev, [f.id]: f.extracted_text || "" }));
                      }
                    }}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{f.file_name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this file.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(f)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 space-y-2 pl-7">
                      {f.file_type.startsWith("image/") && (
                        <img src={f.public_url} alt={f.file_name} className="max-h-40 rounded-lg object-contain border border-border" />
                      )}
                      <Textarea
                        value={currentText}
                        onChange={(e) => setEditingText((prev) => ({ ...prev, [f.id]: e.target.value }))}
                        placeholder="Add notes or context about this file…"
                        rows={3}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={() => handleSaveText(f.id)} disabled={savingText === f.id}>
                        {savingText === f.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
                        Save Notes
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
