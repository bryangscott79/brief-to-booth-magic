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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload, Trash2, FileText, Image as ImageIcon, File, Loader2,
  ChevronDown, ChevronUp, Save, Link2, Search, Palette,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { extractTextFromFile } from "@/hooks/useKnowledgeBase";

// Layer 2 client brand docs use knowledge_base_files with a sentinel project_id per client
// Format: "00000000-0000-0000-0001-{client_id_last12}"
function clientKBProjectId(clientId: string): string {
  const suffix = clientId.replace(/-/g, "").slice(-12).padStart(12, "0");
  return `00000000-0000-0000-0001-${suffix}`;
}

interface KbFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number | null;
  public_url: string;
  storage_path: string;
  extracted_text: string | null;
  created_at: string;
  folder: string;
}

const BRAND_FOLDERS = [
  { value: "brand-guide", label: "Brand Guide", icon: "Palette", description: "Logo, colors, fonts, brand book" },
  { value: "messaging", label: "Messaging & Voice", icon: "MessageSquare", description: "Tone of voice, messaging pillars, taglines" },
  { value: "campaign", label: "Campaigns", icon: "Megaphone", description: "Current campaign themes, press releases" },
  { value: "past-booths", label: "Past Booths", icon: "Building2", description: "Previous booth photos, design files" },
  { value: "products", label: "Products & Services", icon: "Package", description: "Product descriptions, features, demos" },
  { value: "audience", label: "Audience & Personas", icon: "Users", description: "Target audience, journey maps, personas" },
  { value: "competitive", label: "Competitive", icon: "Swords", description: "Competitor references, differentiation" },
  { value: "general", label: "General", icon: "Folder", description: "Other brand-related materials" },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-primary" />;
  if (type.includes("pdf") || type.includes("text") || type.includes("word"))
    return <FileText className="h-4 w-4 text-foreground/60" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function ClientBrandKnowledgeBase({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeFolder, setActiveFolder] = useState("brand-guide");
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const kbProjectId = clientKBProjectId(clientId);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["client-brand-kb", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_files")
        .select("*")
        .eq("project_id", kbProjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as KbFile[];
    },
    enabled: !!user && !!clientId,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, extractedText }: { file: File; extractedText?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const storagePath = `clients/${clientId}/${activeFolder}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("knowledge-base")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("knowledge-base").getPublicUrl(storagePath);
      const { error: dbError } = await supabase.from("knowledge_base_files").insert({
        user_id: user.id,
        project_id: kbProjectId,
        file_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        storage_path: storagePath,
        public_url: urlData.publicUrl,
        extracted_text: extractedText ?? null,
        folder: activeFolder,
        layer: "L2",
        doc_type: "brand",
        scope: "permanent",
      } as any);
      if (dbError) throw dbError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-brand-kb", clientId] }),
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (file: KbFile) => {
      await supabase.storage.from("knowledge-base").remove([file.storage_path]);
      const { error } = await supabase.from("knowledge_base_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-brand-kb", clientId] });
      toast({ title: "File deleted" });
    },
  });

  const updateTextMutation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from("knowledge_base_files").update({ extracted_text: text }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-brand-kb", clientId] }),
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, maxSize: 20 * 1024 * 1024 });

  const handleSaveText = async (fileId: string) => {
    const text = editingText[fileId];
    if (text === undefined) return;
    setSavingText(fileId);
    try {
      await updateTextMutation.mutateAsync({ id: fileId, text });
      toast({ title: "Notes saved" });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    finally { setSavingText(null); }
  };

  const folderFiles = files.filter((f: any) => (f.folder || "general") === activeFolder);
  const filtered = folderFiles.filter((f) =>
    !search || f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.extracted_text ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const folderCounts = BRAND_FOLDERS.reduce((acc, folder) => {
    acc[folder.value] = files.filter((f: any) => (f.folder || "general") === folder.value).length;
    return acc;
  }, {} as Record<string, number>);
  const currentFolderMeta = BRAND_FOLDERS.find((f) => f.value === activeFolder);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <Palette className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Layer 2 — Client Brand RAG</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Upload brand materials for {clientName} — guides, campaign assets, past booth photos, product descriptions.
            Makes AI outputs feel like this client's pitch, not a generic template.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Naming convention: <code className="bg-muted px-1 rounded">L2_{clientName.replace(/\s+/g, "")}_[DocumentType]</code>
          </p>
        </div>
      </div>

      {/* Folder tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {BRAND_FOLDERS.map((folder) => (
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
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Drop files into <span className="font-medium text-foreground">{currentFolderMeta?.label}</span> — {currentFolderMeta?.description}
        </p>
        {uploadMutation.isPending && (
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </div>
        )}
      </div>

      {/* Search */}
      {folderFiles.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files…" className="pl-8 h-9 text-sm" />
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6">
          <Palette className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            {folderFiles.length === 0
              ? `No files in ${currentFolderMeta?.label}. Upload brand materials to improve AI output quality.`
              : "No files match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} file{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map((file) => {
            const isExpanded = expandedFile === file.id;
            const currentText = editingText[file.id] ?? file.extracted_text ?? "";
            return (
              <Card key={file.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.file_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatBytes(file.file_size_bytes)}</span>
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
                    <a href={file.public_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                    </a>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                      setExpandedFile(isExpanded ? null : file.id);
                      if (!isExpanded && !(file.id in editingText)) {
                        setEditingText((prev) => ({ ...prev, [file.id]: file.extracted_text || "" }));
                      }
                    }}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{file.file_name}"?</AlertDialogTitle>
                          <AlertDialogDescription>Permanently remove from {clientName}'s brand library.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(file)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 space-y-2 pl-7">
                      {file.file_type.startsWith("image/") && (
                        <img src={file.public_url} alt={file.file_name} className="max-h-40 rounded-lg object-contain border border-border" />
                      )}
                      <Textarea
                        value={currentText}
                        onChange={(e) => setEditingText((prev) => ({ ...prev, [file.id]: e.target.value }))}
                        placeholder="Add notes about this brand material…"
                        rows={3}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={() => handleSaveText(file.id)} disabled={savingText === file.id}>
                        {savingText === file.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
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
