import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Copy, Loader2, AlertCircle } from "lucide-react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { saveProjectField } from "@/hooks/useProjectSync";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ParsedBrief } from "@/types/brief";

interface BriefUploadProps {
  projectId: string | null;
}

export function BriefUpload({ projectId }: BriefUploadProps) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { currentProject, createProject, setRawBrief, setParsedBrief, setActiveStep } = useProjectStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  /** Send brief text to AI-powered parser edge function */
  const parseBriefWithAI = async (text: string): Promise<ParsedBrief> => {
    const { data, error } = await supabase.functions.invoke("parse-brief", {
      body: { briefText: text },
    });

    if (error) throw new Error(error.message || "Failed to parse brief");
    if (data?.error) throw new Error(data.error);
    if (!data?.data) throw new Error("No parsed data returned");

    return data.data as ParsedBrief;
  };

  /** Create a DB project if none exists, returns the project ID */
  const ensureDbProject = async (name: string): Promise<string> => {
    if (projectId) return projectId;
    if (!user) throw new Error("You must be logged in to create a project");

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name, status: "draft" })
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  };

  const processBrief = async (text: string, sourceName: string) => {
    setIsProcessing(true);
    try {
      // Auto-create DB project if needed
      const dbProjectId = await ensureDbProject(sourceName);

      createProject(sourceName);
      setRawBrief(text);

      const parsedBrief = await parseBriefWithAI(text);

      setParsedBrief(parsedBrief);
      setActiveStep("review");

      // Save to DB
      await saveProjectField(dbProjectId, "brief_text", text);
      await saveProjectField(dbProjectId, "parsed_brief", parsedBrief);
      await saveProjectField(dbProjectId, "status", "reviewed");

      toast({
        title: "Brief parsed successfully",
        description: "Review the extracted data before generating elements.",
      });
      navigate(`/review?project=${dbProjectId}`);
    } catch (error) {
      console.error("Brief parsing error:", error);
      toast({
        title: "Parsing failed",
        description: error instanceof Error ? error.message : "There was an error processing your brief.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /** Extract readable text from a DOCX file using JSZip */
  const extractDocxText = async (file: File): Promise<string> => {
    const zip = await JSZip.loadAsync(file);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) throw new Error("Could not read document.xml from DOCX");
    // Strip XML tags to get plain text, preserve paragraph breaks
    const text = docXml
      .replace(/<\/w:p[^>]*>/g, "\n")   // paragraph breaks
      .replace(/<\/w:r>/g, " ")          // run breaks → space
      .replace(/<[^>]+>/g, "")           // strip all XML tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, " ")          // collapse whitespace
      .replace(/\n /g, "\n")
      .replace(/\n{3,}/g, "\n\n")       // collapse blank lines
      .trim();
    return text;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    let text: string;
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "docx") {
      text = await extractDocxText(file);
    } else {
      // TXT and PDF fallback (PDF will be raw text — works for text-based PDFs)
      text = await file.text();
    }

    if (!text || text.trim().length < 20) {
      toast({
        title: "Could not extract text",
        description: "The file appears empty or unreadable. Try pasting the text instead.",
        variant: "destructive",
      });
      return;
    }

    await processBrief(text, file.name.replace(/\.[^/.]+$/, ""));
  }, [createProject, setRawBrief, setParsedBrief, navigate, toast, projectId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) return;
    await processBrief(pasteText, "Pasted Brief");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setMode("upload")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            mode === "upload" 
              ? "bg-card text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload className="inline-block h-4 w-4 mr-2" />
          Upload File
        </button>
        <button
          onClick={() => setMode("paste")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            mode === "paste" 
              ? "bg-card text-foreground shadow-sm" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Copy className="inline-block h-4 w-4 mr-2" />
          Paste Text
        </button>
      </div>

      {/* Upload Zone */}
      {mode === "upload" && (
        <div
          {...getRootProps()}
          className={cn(
            "upload-zone rounded-xl p-12 text-center cursor-pointer",
            isDragActive && "dragging",
            isProcessing && "pointer-events-none opacity-50"
          )}
        >
          <input {...getInputProps()} />
          {isProcessing ? (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
              <p className="text-lg font-medium">Parsing brief with AI...</p>
              <p className="text-sm text-muted-foreground">
                Extracting brand, spatial, budget and strategic data
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragActive ? "Drop your brief here" : "Upload your brief"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drag and drop or click to browse
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted rounded">PDF</span>
                <span className="px-2 py-1 bg-muted rounded">DOCX</span>
                <span className="px-2 py-1 bg-muted rounded">TXT</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paste Zone */}
      {mode === "paste" && (
        <div className="space-y-4">
          <Textarea
            placeholder="Paste your brief text here..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
            disabled={isProcessing}
          />
          <Button 
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim() || isProcessing}
            className="w-full btn-glow"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing with AI...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Process Brief
              </>
            )}
          </Button>
        </div>
      )}

      {/* Help Text */}
      <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
        <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">What happens next?</p>
          <p>
            We'll use AI to parse your brief and extract brand information, objectives, 
            spatial requirements, and creative constraints. You can review and 
            edit all extracted data before generating response elements.
          </p>
        </div>
      </div>
    </div>
  );
}
