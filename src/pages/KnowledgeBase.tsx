import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
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
  FolderOpen,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
  if (type.includes("pdf") || type.includes("text")) return <FileText className="h-5 w-5 text-muted-foreground" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

export default function KnowledgeBasePage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { files, isLoading: kbLoading, uploadFile, deleteFile, updateExtractedText } = useKnowledgeBase(projectId);
  const { toast } = useToast();
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        const extracted = await extractTextFromFile(file);
        await uploadFile.mutateAsync({ file, extractedText: extracted || undefined });
        toast({ title: `Uploaded ${file.name}` });
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

  const isLoading = syncLoading || kbLoading;

  return (
    <AppLayout>
      <div className="container py-12 max-w-4xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !projectId ? (
          <div className="text-center py-24">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Select a project to manage its knowledge base</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <BookOpen className="h-6 w-6" />
                Knowledge Base
              </h1>
              <p className="text-muted-foreground mt-1">
                Upload previous projects, inspiration, pricing docs, materials specs — anything to inform AI generation beyond the brief.
              </p>
            </div>

            {/* Upload Zone */}
            <div
              {...getRootProps()}
              className={`upload-zone rounded-xl p-8 text-center cursor-pointer ${isDragActive ? "dragging" : ""}`}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">
                {isDragActive ? "Drop files here..." : "Drag & drop files, or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDFs, images, spreadsheets, docs — any file up to 20MB
              </p>
              {uploadFile.isPending && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>

            {/* File List */}
            {files.length === 0 ? (
              <Card className="element-card">
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground">No files uploaded yet. Add reference materials to enhance AI generation.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""} uploaded</p>
                {files.map((file) => {
                  const isExpanded = expandedFile === file.id;
                  const currentText = editingText[file.id] ?? file.extracted_text ?? "";
                  return (
                    <Card key={file.id} className="element-card">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.file_type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatBytes(file.file_size_bytes || 0)}</span>
                              <span>•</span>
                              <span>{new Date(file.created_at).toLocaleDateString()}</span>
                              {file.extracted_text && (
                                <>
                                  <span>•</span>
                                  <Badge variant="secondary" className="text-xs">Has content</Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setExpandedFile(isExpanded ? null : file.id);
                              if (!isExpanded && !(file.id in editingText)) {
                                setEditingText(prev => ({ ...prev, [file.id]: file.extracted_text || "" }));
                              }
                            }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete File?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove "{file.file_name}" from the knowledge base.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteFile.mutate(file)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                Content / Notes (included in AI generation)
                              </label>
                              <Textarea
                                value={currentText}
                                onChange={(e) => setEditingText(prev => ({ ...prev, [file.id]: e.target.value }))}
                                placeholder="Paste or type key information from this file that should inform AI generation..."
                                rows={6}
                                className="text-sm"
                              />
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleSaveText(file.id)}
                              disabled={savingText === file.id}
                            >
                              {savingText === file.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Save className="mr-1 h-3 w-3" />
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
        )}
      </div>
    </AppLayout>
  );
}
