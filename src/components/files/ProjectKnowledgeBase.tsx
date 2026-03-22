import { useState, useCallback } from "react";
import { useKnowledgeBase, extractTextFromFile } from "@/hooks/useKnowledgeBase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  Loader2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Save,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  Link2,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-blue-500" />;
  if (type.startsWith("video/")) return <FileVideo className="h-5 w-5 text-purple-500" />;
  if (type.startsWith("audio/")) return <FileAudio className="h-5 w-5 text-pink-500" />;
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv"))
    return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (type.includes("pdf") || type.includes("text") || type.includes("word"))
    return <FileText className="h-5 w-5 text-orange-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

const CATEGORY_OPTIONS = [
  { value: "inspiration", label: "Inspiration" },
  { value: "reference", label: "Reference" },
  { value: "pricing", label: "Pricing" },
  { value: "materials", label: "Materials" },
  { value: "communication", label: "Communication" },
  { value: "deliverable", label: "Deliverable" },
  { value: "other", label: "Other" },
];

interface Props {
  projectId: string;
}

export function ProjectKnowledgeBase({ projectId }: Props) {
  const { files, isLoading, uploadFile, deleteFile, updateExtractedText } = useKnowledgeBase(projectId);
  const { toast } = useToast();
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        const extracted = await extractTextFromFile(file);
        await uploadFile.mutateAsync({ file, extractedText: extracted || undefined });
        toast({ title: `Uploaded "${file.name}"` });
      } catch (e: any) {
        toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      }
    }
  }, [uploadFile, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 20 * 1024 * 1024,
  });

  const handleSaveText = async (fileId: string) => {
    const text = editingText[fileId];
    if (text === undefined) return;
    setSavingText(fileId);
    try {
      await updateExtractedText.mutateAsync({ id: fileId, text });
      toast({ title: "Notes saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingText(null);
    }
  };

  const displayFiles = filterCat === "all" ? files : files.filter((f) => {
    // Simple category guess from file type
    if (filterCat === "inspiration" || filterCat === "reference") return f.file_type.startsWith("image/") || f.file_type.includes("pdf");
    if (filterCat === "materials" || filterCat === "pricing") return f.file_type.includes("spreadsheet") || f.file_type.includes("pdf") || f.file_type.includes("text");
    if (filterCat === "communication") return f.file_type.includes("pdf") || f.file_type.includes("word");
    if (filterCat === "deliverable") return true;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5 flex items-start gap-3">
        <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Project Document Library</p>
          <p className="text-xs text-muted-foreground">
            Upload anything relevant to this project — briefs, inspiration, pricing, RFPs, materials specs,
            communication records, images, videos, or deliverables. Documents with extractable text are used
            to inform AI generation.
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`upload-zone rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? "dragging" : ""}`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop files here…" : "Drag & drop files, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDFs, images, spreadsheets, Word docs, videos, audio — up to 20MB each
        </p>
        {uploadFile.isPending && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </div>
        )}
      </div>

      {/* Filter pills */}
      {files.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterCat("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCat === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            All <span className="opacity-70 ml-1">{files.length}</span>
          </button>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilterCat(cat.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterCat === cat.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* File List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayFiles.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              {files.length === 0
                ? "No files yet. Upload documents, images, and reference materials to build the project library."
                : "No files match this filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{displayFiles.length} file{displayFiles.length !== 1 ? "s" : ""}</p>
          {displayFiles.map((file) => {
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

                    {/* View link */}
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
                            This will permanently remove "{file.file_name}" from the project library.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteFile.mutate(file)} className="bg-destructive hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3 pl-8">
                      {/* Image preview */}
                      {file.file_type.startsWith("image/") && (
                        <img
                          src={file.public_url}
                          alt={file.file_name}
                          className="max-h-48 rounded-lg object-contain border border-border"
                        />
                      )}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                          Notes / Extracted content (included in AI generation)
                        </label>
                        <Textarea
                          value={currentText}
                          onChange={(e) => setEditingText((prev) => ({ ...prev, [file.id]: e.target.value }))}
                          placeholder="Add notes or key information from this file to guide AI generation…"
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
