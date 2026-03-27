import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload, Trash2, FileText, Image as ImageIcon, File, Loader2, BookOpen,
  ChevronDown, ChevronUp, Save, FileSpreadsheet, Link2, Building2, Search,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { extractTextFromFile } from "@/hooks/useKnowledgeBase";

// ─── Agency KB uses knowledge_base_files with a sentinel project_id ────────────
// We use "00000000-0000-0000-0000-000000000000" as the agency-level project slot.
// This keeps the schema unchanged while isolating agency docs.
const AGENCY_KB_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface KbFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  public_url: string;
  storage_path: string;
  extracted_text: string | null;
  created_at: string;
  user_id: string;
  project_id: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-primary" />;
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-primary/70" />;
  if (type.includes("pdf") || type.includes("text") || type.includes("word"))
    return <FileText className="h-5 w-5 text-foreground/60" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

const FOLDERS = [
  { value: "activation-types", label: "Activation Types", icon: "⚡" },
  { value: "cost", label: "Cost & Pricing", icon: "💰" },
  { value: "operations", label: "Operations", icon: "⚙️" },
  { value: "branding", label: "Branding", icon: "🎨" },
  { value: "vendors", label: "Vendors", icon: "🏭" },
  { value: "templates", label: "Templates", icon: "📄" },
  { value: "case-studies", label: "Case Studies", icon: "📊" },
  { value: "general", label: "General", icon: "📁" },
];

export function AgencyKnowledgeBase() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState("activation-types");

  // ─── Fetch ────────────────────────────────────────────────────────────────
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["agency-kb", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_files")
        .select("*")
        .eq("project_id", AGENCY_KB_PROJECT_ID)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as KbFile[];
    },
    enabled: !!user,
  });

  // ─── Upload ───────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async ({ file, extractedText }: { file: File; extractedText?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const storagePath = `agency/${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-base")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("knowledge-base").getPublicUrl(storagePath);
      const { error: dbError } = await supabase.from("knowledge_base_files").insert({
        user_id: user.id,
        project_id: AGENCY_KB_PROJECT_ID,
        file_name: file.name,
        file_type: file.type || `application/${ext}`,
        file_size_bytes: file.size,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        extracted_text: extractedText ?? null,
        folder: activeFolder,
      } as any);
      if (dbError) throw dbError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agency-kb"] }),
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  // ─── Delete ───────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (file: KbFile) => {
      await supabase.storage.from("knowledge-base").remove([file.storage_path]);
      const { error } = await supabase.from("knowledge_base_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-kb"] });
      toast({ title: "File deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // ─── Update text ──────────────────────────────────────────────────────────
  const updateTextMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from("knowledge_base_files").update({ extracted_text: text }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency-kb"] });
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        const extracted = await extractTextFromFile(file);
        await uploadMutation.mutateAsync({ file, extractedText: extracted || undefined });
        toast({ title: `Uploaded "${file.name}"` });
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    }
  }, [uploadMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 20 * 1024 * 1024,
  });

  const handleSaveText = async (fileId: string) => {
    const text = editingText[fileId];
    if (text === undefined) return;
    setSavingText(fileId);
    try {
      await updateTextMutation.mutateAsync({ id: fileId, text });
      toast({ title: "Notes saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingText(null);
    }
  };

  // ─── Filter ───────────────────────────────────────────────────────────────
  const folderFiles = files.filter((f: any) => (f.folder || "general") === activeFolder);
  const filtered = folderFiles.filter((f) => {
    const matchSearch = !search || f.file_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.extracted_text ?? "").toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const folderCounts = FOLDERS.reduce((acc, folder) => {
    acc[folder.value] = files.filter((f: any) => (f.folder || "general") === folder.value).length;
    return acc;
  }, {} as Record<string, number>);

  const currentFolderMeta = FOLDERS.find((f) => f.value === activeFolder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-4">
        <Building2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Agency Knowledge Base</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Upload agency-level documents that inform all projects. Organize by folder to keep activation types,
            cost data, operations docs, and branding materials structured for AI reference.
          </p>
        </div>
      </div>

      {/* Folder tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {FOLDERS.map((folder) => (
          <button
            key={folder.value}
            onClick={() => setActiveFolder(folder.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              activeFolder === folder.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted"
            }`}
          >
            <span>{folder.icon}</span>
            {folder.label}
            {folderCounts[folder.value] > 0 && (
              <span className={`ml-0.5 ${activeFolder === folder.value ? "opacity-70" : "opacity-50"}`}>
                {folderCounts[folder.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`upload-zone rounded-xl p-6 text-center cursor-pointer transition-colors ${isDragActive ? "dragging" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop files here…" : `Upload to ${currentFolderMeta?.label ?? "folder"}`}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Up to 20MB each</p>
        {uploadMutation.isPending && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        )}
      </div>

      {/* Search */}
      {folderFiles.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files in this folder…"
            className="pl-8 h-9 text-sm"
          />
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              {files.length === 0
                ? "No agency documents yet. Upload brand guidelines, pricing, and reference materials."
                : "No files match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} file{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map((file) => {
            const isExpanded = expandedFile === file.id;
            const currentText = editingText[file.id] ?? file.extracted_text ?? "";
            return (
              <Card key={file.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{getFileIcon(file.file_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatBytes(file.file_size_bytes || 0)}</span>
                        <span>·</span>
                        <span>{new Date(file.created_at).toLocaleDateString()}</span>
                        {file.extracted_text && (
                          <>
                            <span>·</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4">AI-readable</Badge>
                          </>
                        )}
                      </div>
                    </div>

                    <a
                      href={file.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Open file"
                    >
                      <Link2 className="h-4 w-4" />
                    </a>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setExpandedFile(isExpanded ? null : file.id);
                        if (!isExpanded && !(file.id in editingText)) {
                          setEditingText((prev) => ({ ...prev, [file.id]: file.extracted_text || "" }));
                        }
                      }}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete file?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove "{file.file_name}" from the agency knowledge base.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(file)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 pl-8">
                      {file.file_type.startsWith("image/") && (
                        <img
                          src={file.public_url}
                          alt={file.file_name}
                          className="max-h-48 rounded-lg object-contain border border-border"
                        />
                      )}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                          Notes / Extracted content (used in AI generation across all projects)
                        </label>
                        <Textarea
                          value={currentText}
                          onChange={(e) => setEditingText((prev) => ({ ...prev, [file.id]: e.target.value }))}
                          placeholder="Add notes or key agency information from this file…"
                          rows={5}
                          className="text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSaveText(file.id)}
                        disabled={savingText === file.id}
                      >
                        {savingText === file.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
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
