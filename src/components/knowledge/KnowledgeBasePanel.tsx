// KnowledgeBasePanel — reusable RAG knowledge base UI for any scope.
//
// Drop-in component that shows an upload dropzone + list of documents
// with their embedding/tagging status. Used for:
//   - Agency KB:           <KnowledgeBasePanel scope="agency"          scopeId={agency.id} />
//   - Activation Type KB:  <KnowledgeBasePanel scope="activation_type" scopeId={type.id} />
//   - Client KB:           <KnowledgeBasePanel scope="client"          scopeId={clientId} />
//   - Project KB:          <KnowledgeBasePanel scope="project"         scopeId={projectId} />

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { formatDistanceToNow } from "date-fns";
import {
  Upload,
  FileText,
  FileIcon,
  FileSpreadsheet,
  FileImage,
  FileCode,
  Presentation,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  RefreshCw,
  Pin,
  PinOff,
  Eye,
  Download,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useKnowledgeDocuments,
  type KnowledgeScope,
  type KnowledgeDocument,
} from "@/hooks/useKnowledgeDocuments";

interface Props {
  scope: KnowledgeScope;
  scopeId: string | null | undefined;
  /** Optional: additional title shown above the dropzone. */
  title?: string;
  /** Optional: description shown under the title. */
  description?: string;
  /** Optional: show only documents with these tags. */
  filterTags?: string[];
}

const MIME_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function KnowledgeBasePanel({
  scope,
  scopeId,
  title = "Knowledge base",
  description,
  filterTags,
}: Props) {
  const { toast } = useToast();
  const { documents, isLoading, uploadDocument, deleteDocument, reembedDocument, updateDocument } =
    useKnowledgeDocuments({ scope, scopeId });

  const [searchQuery, setSearchQuery] = useState("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!scopeId) {
        toast({
          title: "Cannot upload",
          description: "No active scope.",
          variant: "destructive",
        });
        return;
      }
      for (const file of acceptedFiles) {
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: `${file.name} is too large`,
            description: "Max file size is 50 MB.",
            variant: "destructive",
          });
          continue;
        }
        try {
          await uploadDocument.mutateAsync({ file });
          toast({
            title: "Uploaded",
            description: `${file.name} is being embedded and tagged…`,
          });
        } catch (e) {
          toast({
            title: "Upload failed",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        }
      }
    },
    [scopeId, uploadDocument, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: MIME_ACCEPT,
    maxSize: MAX_FILE_SIZE,
    disabled: !scopeId,
  });

  const filtered = documents.filter((doc) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = doc.filename.toLowerCase().includes(q);
      const matchesTitle = doc.title?.toLowerCase().includes(q);
      const matchesTags = [...(doc.auto_tags || []), ...(doc.user_tags || [])]
        .some((t) => t.toLowerCase().includes(q));
      if (!matchesName && !matchesTitle && !matchesTags) return false;
    }
    if (filterTags && filterTags.length > 0) {
      const docTags = [...(doc.auto_tags || []), ...(doc.user_tags || [])];
      if (!filterTags.some((t) => docTags.includes(t))) return false;
    }
    return true;
  });

  const handleDelete = async (doc: KnowledgeDocument) => {
    if (!confirm(`Delete "${doc.filename}"? This removes the file and all embeddings.`)) return;
    try {
      await deleteDocument.mutateAsync(doc);
      toast({ title: "Document deleted" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleTogglePin = async (doc: KnowledgeDocument) => {
    try {
      await updateDocument.mutateAsync({ id: doc.id, updates: { is_pinned: !doc.is_pinned } });
      toast({ title: doc.is_pinned ? "Unpinned" : "Pinned", description: doc.filename });
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleReembed = async (doc: KnowledgeDocument) => {
    try {
      await reembedDocument.mutateAsync(doc.id);
      toast({ title: "Re-embedding started", description: doc.filename });
    } catch (e) {
      toast({
        title: "Re-embed failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          !scopeId && "opacity-50 cursor-not-allowed",
          uploadDocument.isPending && "pointer-events-none opacity-70",
        )}
      >
        <input {...getInputProps()} />
        {uploadDocument.isPending ? (
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragActive
                ? "Drop files here"
                : "Drag & drop or click to upload documents"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, or images · up to 50 MB
            </p>
          </>
        )}
      </div>

      {/* Search */}
      {documents.length > 3 && (
        <Input
          placeholder="Search by filename, title, or tag…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      )}

      {/* Document list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {documents.length === 0
              ? "No documents yet. Drop a file above to start building the knowledge base."
              : "No documents match your search."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.id}
              document={doc}
              onDelete={() => handleDelete(doc)}
              onReembed={() => handleReembed(doc)}
              onTogglePin={() => handleTogglePin(doc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── File visual helper ──────────────────────────────────────────────────────

function getFileVisual(filename: string, mimeType: string | null) {
  const lower = (filename || "").toLowerCase();
  const mt = (mimeType || "").toLowerCase();

  if (mt.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|tiff?)$/.test(lower)) {
    return { Icon: FileImage, tone: "bg-primary/10 text-primary" };
  }
  if (mt.includes("pdf") || lower.endsWith(".pdf")) {
    return { Icon: FileText, tone: "bg-destructive/10 text-destructive" };
  }
  if (mt.includes("spreadsheet") || mt.includes("excel") || /\.(xlsx?|csv|tsv|numbers)$/.test(lower)) {
    return { Icon: FileSpreadsheet, tone: "bg-accent/20 text-accent-foreground" };
  }
  if (mt.includes("presentation") || /\.(pptx?|key)$/.test(lower)) {
    return { Icon: Presentation, tone: "bg-accent/20 text-accent-foreground" };
  }
  if (mt.includes("word") || /\.(docx?|rtf|odt)$/.test(lower)) {
    return { Icon: FileText, tone: "bg-primary/10 text-primary" };
  }
  if (/\.(json|xml|ya?ml|toml|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|sh|html?|css|svg)$/.test(lower)) {
    return { Icon: FileCode, tone: "bg-muted text-muted-foreground" };
  }
  return { Icon: FileIcon, tone: "bg-muted text-muted-foreground" };
}

// ─── DocumentRow ─────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: KnowledgeDocument;
  onDelete: () => void;
  onReembed: () => void;
  onTogglePin: () => void;
}

function DocumentRow({ document: doc, onDelete, onReembed, onTogglePin }: DocumentRowProps) {
  const tags = [...(doc.auto_tags || []), ...(doc.user_tags || [])];

  const { Icon, tone } = getFileVisual(doc.filename, doc.mime_type);

  return (
    <Card className={cn("p-3 flex items-start gap-3", doc.is_pinned && "border-primary/40 bg-primary/5")}>
      <div className={cn("h-10 w-10 rounded flex items-center justify-center shrink-0", tone)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {doc.title || doc.filename}
            </div>
            {doc.title && (
              <div className="text-xs text-muted-foreground truncate">{doc.filename}</div>
            )}
            {doc.summary && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {doc.summary}
              </div>
            )}
          </div>
          <StatusBadge status={doc.status} error={doc.processing_error} />
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {doc.doc_type && (
            <Badge variant="secondary" className="text-xs">
              {doc.doc_type.replace(/_/g, " ")}
            </Badge>
          )}
          {tags.slice(0, 5).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs gap-1">
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </Badge>
          ))}
          {tags.length > 5 && (
            <span className="text-xs text-muted-foreground">+{tags.length - 5} more</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {doc.chunk_count > 0 && `${doc.chunk_count} chunks · `}
            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={onTogglePin}
          title={doc.is_pinned ? "Unpin (let ranking decide)" : "Pin (always include in retrieval)"}
        >
          {doc.is_pinned ? (
            <Pin className="h-4 w-4 fill-primary text-primary" />
          ) : (
            <PinOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        {doc.status === "failed" && (
          <Button size="icon" variant="ghost" onClick={onReembed} title="Retry embedding">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  if (status === "embedded") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs bg-green-100 text-green-900 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-100">
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs" title={error || undefined}>
        <AlertCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Loader2 className="h-3 w-3 animate-spin" />
      Pending
    </Badge>
  );
}
