import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Copy, Loader2, AlertCircle, ArrowRight, ArrowLeft, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ParsedBrief } from "@/types/brief";
import { ProjectTypeSelector } from "@/components/brief/ProjectTypeSelector";
import { DEFAULT_PROJECT_TYPE } from "@/lib/projectTypes";
import { useClients, useUpsertClient, useBatchCreateIntelligence } from "@/hooks/useClients";
import { extractBrandIntelligence } from "@/lib/brandIntelligenceExtractor";

interface BriefUploadProps {
  projectId: string | null;
}

type UploadStep = "type-select" | "client-select" | "upload";

export function BriefUpload({ projectId }: BriefUploadProps) {
  const [step, setStep] = useState<UploadStep>("type-select");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { setActiveStep } = useProjectStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const upsertClient = useUpsertClient();
  const batchCreateIntel = useBatchCreateIntelligence();

  /** Send brief text to AI-powered parser edge function */
  const parseBriefWithAI = async (text: string, fileBase64?: string, fileType?: string): Promise<ParsedBrief> => {
    const body: Record<string, any> = {};
    if (fileBase64 && fileType) {
      body.fileBase64 = fileBase64;
      body.fileType = fileType;
      if (text) body.briefText = text;
    } else {
      body.briefText = text;
    }

    // Use direct fetch with a 90s timeout — supabase.functions.invoke can time out at ~25s
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    let resp: Response;
    try {
      resp = await fetch(`${supabaseUrl}/functions/v1/parse-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${accessToken || anonKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "Unknown error");
      throw new Error(`Parse request failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    if (data?.error) throw new Error(data.error);
    if (!data?.data) throw new Error("No parsed data returned");

    return data.data as ParsedBrief;
  };

  /** Create a DB project if none exists, returns the project ID */
  const ensureDbProject = async (name: string, type: string): Promise<string> => {
    if (projectId) return projectId;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error("You must be logged in to create a project");

    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: userId, name, status: "draft", project_type: type, client_id: selectedClientId } as any)
      .select("id")
      .single();

    if (error) throw error;
    return data.id;
  };

  const processBrief = async (
    text: string,
    sourceName: string,
    fileBase64?: string,
    fileType?: string,
    originalFile?: File
  ) => {
    const type = selectedType ?? DEFAULT_PROJECT_TYPE;
    setIsProcessing(true);
    try {
      const dbProjectId = await ensureDbProject(sourceName, type);

      let briefFileUrl: string | null = null;
      if (originalFile && user) {
        const ext = originalFile.name.split(".").pop()?.toLowerCase();
        const storagePath = `${user.id}/${dbProjectId}/original.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("briefs")
          .upload(storagePath, originalFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = await supabase.storage
            .from("briefs")
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
          briefFileUrl = urlData?.signedUrl ?? null;
        }
      }

      const parsedBrief = await parseBriefWithAI(text, fileBase64, fileType);

      const { error: updateError } = await supabase
        .from("projects")
        .update({
          brief_text: text,
          brief_file_name: sourceName,
          brief_file_url: briefFileUrl,
          parsed_brief: parsedBrief as any,
          status: "reviewed",
          project_type: type,
        } as any)
        .eq("id", dbProjectId);

      if (updateError) console.error("Failed to save brief to DB:", updateError);

      // Auto-extract brand intelligence if a client is linked
      if (selectedClientId && parsedBrief) {
        try {
          const entries = extractBrandIntelligence(parsedBrief, selectedClientId, dbProjectId);
          if (entries.length > 0) {
            await batchCreateIntel.mutateAsync(entries);
          }
        } catch (intelError) {
          console.warn("Brand intelligence extraction failed (non-blocking):", intelError);
        }
      }

      const { loadFromDb } = useProjectStore.getState();
      loadFromDb({
        id: dbProjectId,
        name: sourceName,
        projectType: type,
        clientId: selectedClientId,
        rawBrief: text,
        parsedBrief,
        elements: {
          bigIdea: { type: "bigIdea", status: "pending", data: null },
          experienceFramework: { type: "experienceFramework", status: "pending", data: null },
          interactiveMechanics: { type: "interactiveMechanics", status: "pending", data: null },
          digitalStorytelling: { type: "digitalStorytelling", status: "pending", data: null },
          humanConnection: { type: "humanConnection", status: "pending", data: null },
          adjacentActivations: { type: "adjacentActivations", status: "pending", data: null },
          spatialStrategy: { type: "spatialStrategy", status: "pending", data: null },
          budgetLogic: { type: "budgetLogic", status: "pending", data: null },
        },
        renderPrompts: null,
      });
      setActiveStep("review");

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

  /** Convert a File to base64 string */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    const sourceName = file.name.replace(/\.[^/.]+$/, "");

    if (ext === "docx" || ext === "pdf") {
      // Send binary files as base64 for server-side extraction
      const fileBase64 = await fileToBase64(file);
      await processBrief("", sourceName, fileBase64, ext as "docx" | "pdf", file);
    } else if (ext === "txt") {
      const text = await file.text();
      if (!text || text.trim().length < 20) {
        toast({
          title: "Could not extract text",
          description: "The file appears empty or unreadable. Try pasting the text instead.",
          variant: "destructive",
        });
        return;
      }
      await processBrief(text, sourceName, undefined, undefined, file);
    } else {
      toast({
        title: "Unsupported file type",
        description: "Please upload a DOCX, PDF, or TXT file.",
        variant: "destructive",
      });
    }
  }, [user, navigate, toast, projectId, selectedType, selectedClientId]);

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

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    const result = await upsertClient.mutateAsync({ name: newClientName.trim() });
    setSelectedClientId((result as any).id);
    setNewClientName("");
    setIsCreatingClient(false);
  };

  // ─── STEP 1: Type Selection ──────────────────────────────────────────────
  if (step === "type-select") {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ProjectTypeSelector
          selected={selectedType}
          onSelect={setSelectedType}
        />
        <div className="flex justify-end">
          <Button
            size="lg"
            className="btn-glow px-8 h-12 rounded-xl"
            disabled={!selectedType}
            onClick={() => setStep("client-select")}
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Client Selection ─────────────────────────────────────────────
  if (step === "client-select") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          onClick={() => setStep("type-select")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Change project type
        </button>

        <div>
          <h2 className="text-xl font-semibold mb-1">Select Client</h2>
          <p className="text-sm text-muted-foreground">
            Link this project to a client to enable brand intelligence. You can skip this step.
          </p>
        </div>

        <div className="grid gap-3">
          {/* No client option */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary/30",
              selectedClientId === null && "border-primary bg-primary/5"
            )}
            onClick={() => setSelectedClientId(null)}
          >
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <span className="text-sm font-medium">No Client</span>
                <p className="text-xs text-muted-foreground">Skip client association for now</p>
              </div>
            </CardContent>
          </Card>

          {/* Existing clients */}
          {clients.map((client) => (
            <Card
              key={client.id}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/30",
                selectedClientId === client.id && "border-primary bg-primary/5"
              )}
              onClick={() => setSelectedClientId(client.id)}
            >
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: client.primary_color ? `${client.primary_color}20` : undefined }}
                >
                  <Building2
                    className="h-4 w-4"
                    style={{ color: client.primary_color || undefined }}
                  />
                </div>
                <div>
                  <span className="text-sm font-medium">{client.name}</span>
                  {client.industry && (
                    <p className="text-xs text-muted-foreground">{client.industry}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Create new client inline */}
          {isCreatingClient ? (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <Input
                  autoFocus
                  placeholder="Client name..."
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateClient();
                    if (e.key === "Escape") setIsCreatingClient(false);
                  }}
                  className="h-9"
                />
                <Button size="sm" onClick={handleCreateClient} disabled={!newClientName.trim()}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsCreatingClient(false)}>
                  Cancel
                </Button>
              </CardContent>
            </Card>
          ) : (
            <button
              onClick={() => setIsCreatingClient(true)}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors py-2"
            >
              <Plus className="h-4 w-4" />
              Add new client
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            size="lg"
            className="btn-glow px-8 h-12 rounded-xl"
            onClick={() => setStep("upload")}
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Brief Upload ────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back to client selection */}
      <button
        onClick={() => setStep("client-select")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Change client
      </button>

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
            spatial requirements, and creative constraints tailored to your project type.
            You can review and edit all extracted data before generating strategy elements.
          </p>
        </div>
      </div>
    </div>
  );
}
