import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileText, Copy, Loader2, AlertCircle, ArrowRight, ArrowLeft,
  Building2, Plus, CheckCircle2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ParsedBrief } from "@/types/brief";
import { ProjectTypeSelector } from "@/components/brief/ProjectTypeSelector";
import type { AiTypeSuggestion, NewCustomType } from "@/components/brief/ProjectTypeSelector";
import { ALL_PROJECT_TYPES, DEFAULT_PROJECT_TYPE } from "@/lib/projectTypes";
import { useClients, useUpsertClient, useBatchCreateIntelligence } from "@/hooks/useClients";
import { extractBrandIntelligence } from "@/lib/brandIntelligenceExtractor";
import { useCustomProjectTypes, useUpsertCustomProjectType } from "@/hooks/useCustomProjectTypes";

interface BriefUploadProps {
  projectId: string | null;
}

// Step 1: Upload brief
// Step 2: Parsing (auto-advance)
// Step 3: Confirm — review extracted snapshot, pick type, pick client, fill gaps
type UploadStep = "upload" | "parsing" | "confirm";

interface ParseResult {
  parsed: ParsedBrief;
  sourceName: string;
  briefText: string;
  fileBase64?: string;
  fileType?: string;
  originalFile?: File;
  briefFileUrl?: string | null;
  dbProjectId?: string;
}

export function BriefUpload({ projectId }: BriefUploadProps) {
  const [step, setStep] = useState<UploadStep>("upload");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");

  // Populated after AI parsing
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Confirm-step state
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiTypeSuggestion | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { setActiveStep } = useProjectStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const upsertClient = useUpsertClient();
  const batchCreateIntel = useBatchCreateIntelligence();
  const { data: customTypes = [] } = useCustomProjectTypes();
  const upsertCustomType = useUpsertCustomProjectType();

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const parseBriefWithAI = async (
    text: string,
    fileBase64?: string,
    fileType?: string
  ): Promise<ParsedBrief> => {
    const body: Record<string, any> = {};
    if (fileBase64 && fileType) {
      body.fileBase64 = fileBase64;
      body.fileType = fileType;
      if (text) body.briefText = text;
    } else {
      body.briefText = text;
    }

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
          apikey: anonKey,
          Authorization: `Bearer ${accessToken || anonKey}`,
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

  const ensureDbProject = async (name: string): Promise<string> => {
    if (projectId) return projectId;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error("You must be logged in to create a project");
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: userId, name, status: "draft", project_type: DEFAULT_PROJECT_TYPE } as any)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ─── Step 1: trigger parse then advance to confirm ─────────────────────────

  const startParsing = async (
    text: string,
    sourceName: string,
    fileBase64?: string,
    fileType?: string,
    originalFile?: File
  ) => {
    setStep("parsing");
    try {
      // Create DB record early so we can store the file
      const dbProjectId = await ensureDbProject(sourceName);

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

      const parsed = await parseBriefWithAI(text, fileBase64, fileType);

      // Auto-detect project type suggestion from parsed brief
      const rawType = (parsed as any)?.projectType;
      if (rawType) {
        const matchBuiltIn = ALL_PROJECT_TYPES.find(
          (t) =>
            t.id === rawType ||
            t.label.toLowerCase() === rawType.toLowerCase()
        );
        if (matchBuiltIn) {
          setSelectedType(matchBuiltIn.id);
        } else if (typeof rawType === "string" && rawType.trim()) {
          // Treat as AI suggestion for a custom type
          setAiSuggestion({
            type_id: rawType.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
            label: rawType,
            tagline: "",
            description: "",
            render_context: "",
            icon: "🏷️",
            confidence: 0.85,
          });
        }
      }

      setParseResult({
        parsed,
        sourceName,
        briefText: text,
        fileBase64,
        fileType,
        originalFile,
        briefFileUrl,
        dbProjectId,
      });

      setStep("confirm");
    } catch (error) {
      console.error("Brief parsing error:", error);
      toast({
        title: "Parsing failed",
        description:
          error instanceof Error
            ? error.message
            : "There was an error processing your brief.",
        variant: "destructive",
      });
      setStep("upload");
    }
  };

  // ─── Step 3: Save everything and navigate to review ──────────────────────

  const handleConfirmAndContinue = async () => {
    if (!parseResult) return;
    const type = selectedType ?? DEFAULT_PROJECT_TYPE;
    setIsSaving(true);

    try {
      const dbProjectId = parseResult.dbProjectId ?? (await ensureDbProject(parseResult.sourceName));

      const { error: updateError } = await supabase
        .from("projects")
        .update({
          brief_text: parseResult.briefText,
          brief_file_name: parseResult.sourceName,
          brief_file_url: parseResult.briefFileUrl ?? null,
          parsed_brief: parseResult.parsed as any,
          status: "reviewed",
          project_type: type,
          client_id: selectedClientId,
        } as any)
        .eq("id", dbProjectId);

      if (updateError) console.error("Failed to save brief:", updateError);

      // Brand intelligence extraction
      if (selectedClientId && parseResult.parsed) {
        try {
          const entries = extractBrandIntelligence(parseResult.parsed, selectedClientId, dbProjectId);
          if (entries.length > 0) await batchCreateIntel.mutateAsync(entries);
        } catch (e) {
          console.warn("Brand intelligence extraction failed (non-blocking):", e);
        }
      }

      const { loadFromDb } = useProjectStore.getState();
      loadFromDb({
        id: dbProjectId,
        name: parseResult.sourceName,
        projectType: type,
        clientId: selectedClientId,
        rawBrief: parseResult.briefText,
        parsedBrief: parseResult.parsed,
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
        title: "Brief saved",
        description: "Review and refine extracted data before generating strategy.",
      });
      navigate(`/review?project=${dbProjectId}`);
    } catch (error) {
      toast({
        title: "Error saving project",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCustomType = async (newType: NewCustomType) => {
    try {
      await upsertCustomType.mutateAsync({ ...newType, confirmed_by_user: true, is_ai_detected: false });
      setSelectedType(newType.type_id);
    } catch (e) {
      toast({ title: "Failed to save project type", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleConfirmAiSuggestion = async (suggestion: AiTypeSuggestion) => {
    try {
      await upsertCustomType.mutateAsync({
        type_id: suggestion.type_id,
        label: suggestion.label,
        tagline: suggestion.tagline,
        description: suggestion.description,
        icon: suggestion.icon,
        render_context: suggestion.render_context,
        is_ai_detected: true,
        confirmed_by_user: true,
      });
      setAiSuggestion(null);
    } catch (_) {}
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    const result = await upsertClient.mutateAsync({ name: newClientName.trim() });
    setSelectedClientId((result as any).id);
    setNewClientName("");
    setIsCreatingClient(false);
  };

  // ─── Drop handlers ────────────────────────────────────────────────────────

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      const sourceName = file.name.replace(/\.[^/.]+$/, "");

      if (ext === "docx" || ext === "pdf") {
        const fileBase64 = await fileToBase64(file);
        await startParsing("", sourceName, fileBase64, ext as "docx" | "pdf", file);
      } else if (ext === "txt") {
        const text = await file.text();
        if (!text || text.trim().length < 20) {
          toast({ title: "Could not extract text", description: "The file appears empty. Try pasting the text instead.", variant: "destructive" });
          return;
        }
        await startParsing(text, sourceName, undefined, undefined, file);
      } else {
        toast({ title: "Unsupported file type", description: "Please upload a DOCX, PDF, or TXT file.", variant: "destructive" });
      }
    },
    [user, projectId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    disabled: step !== "upload",
  });

  // ─── Step indicators ──────────────────────────────────────────────────────

  const STEPS = [
    { key: "upload", label: "Upload Brief" },
    { key: "parsing", label: "AI Extraction" },
    { key: "confirm", label: "Confirm Details" },
  ];
  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  const StepBar = () => (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((s, i) => {
        const done = i < currentStepIdx;
        const active = i === currentStepIdx;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground/40"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium whitespace-nowrap",
                  active ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-16 mb-5 mx-2 transition-colors",
                  done ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── STEP 1: Upload ────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <StepBar />

        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold mb-1">Upload your brief</h2>
          <p className="text-sm text-muted-foreground">
            Drop in your brief and AI will extract all key details automatically.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          {(["upload", "paste"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "upload" ? (
                <><Upload className="inline-block h-4 w-4 mr-2" />Upload File</>
              ) : (
                <><Copy className="inline-block h-4 w-4 mr-2" />Paste Text</>
              )}
            </button>
          ))}
        </div>

        {/* Upload Zone */}
        {mode === "upload" && (
          <div
            {...getRootProps()}
            className={cn(
              "upload-zone rounded-xl p-14 text-center cursor-pointer",
              isDragActive && "dragging"
            )}
          >
            <input {...getInputProps()} />
            <div className="space-y-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragActive ? "Drop your brief here" : "Upload your brief"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Drag and drop or click to browse</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted rounded">PDF</span>
                <span className="px-2 py-1 bg-muted rounded">DOCX</span>
                <span className="px-2 py-1 bg-muted rounded">TXT</span>
              </div>
            </div>
          </div>
        )}

        {/* Paste Zone */}
        {mode === "paste" && (
          <div className="space-y-4">
            <Textarea
              placeholder="Paste your brief text here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="min-h-[280px] font-mono text-sm"
            />
            <Button
              onClick={() => startParsing(pasteText, "Pasted Brief")}
              disabled={!pasteText.trim()}
              className="w-full btn-glow"
            >
              <FileText className="mr-2 h-4 w-4" />
              Extract Brief Data with AI
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            AI will extract brand, objectives, spatial requirements, budget, and creative constraints.
            You'll review and confirm everything — including project type and client — before proceeding.
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Parsing ──────────────────────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="max-w-2xl mx-auto">
        <StepBar />
        <div className="flex flex-col items-center justify-center py-20 space-y-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-9 w-9 text-primary" />
            </div>
            <Loader2 className="absolute -top-1 -right-1 h-7 w-7 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">Reading your brief…</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Extracting brand details, objectives, spatial data, budgets, and audience insights
            </p>
          </div>
          <div className="flex flex-col gap-2 w-64">
            {[
              "Brand & identity",
              "Business objectives",
              "Spatial requirements",
              "Budget & deliverables",
              "Creative constraints",
            ].map((label, i) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2
                  className="h-3 w-3 text-primary animate-spin"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Confirm ──────────────────────────────────────────────────────
  const pb = parseResult?.parsed;
  const confirmedCustomTypes = customTypes.filter((t) => t.confirmed_by_user);

  // Summary of what was extracted
  const extractedSummary = pb
    ? [
        pb.brand?.name && { label: "Brand", value: pb.brand.name },
        pb.objectives?.primary && { label: "Primary objective", value: pb.objectives.primary },
        pb.events?.shows?.length && {
          label: "Show(s)",
          value: pb.events.shows.map((s) => s.name).filter(Boolean).join(", "),
        },
        pb.spatial?.footprints?.length && {
          label: "Footprint(s)",
          value: pb.spatial.footprints.map((f) => f.size).join(", "),
        },
        pb.budget?.perShow && {
          label: "Budget / show",
          value: `$${pb.budget.perShow.toLocaleString()}`,
        },
        pb.audiences?.length && {
          label: "Audiences",
          value: pb.audiences.map((a) => a.name).join(", "),
        },
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

  const selectedTypeLabel =
    selectedType
      ? ALL_PROJECT_TYPES.find((t) => t.id === selectedType)?.label ??
        confirmedCustomTypes.find((t) => t.type_id === selectedType)?.label ??
        selectedType
      : null;

  const selectedClientLabel =
    selectedClientId
      ? clients.find((c) => c.id === selectedClientId)?.name
      : null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <StepBar />

      {/* Extracted data preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <h2 className="text-base font-semibold">
            AI extracted {extractedSummary.length} data points from your brief
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {extractedSummary.map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">
                {label}
              </p>
              <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          You can review and edit all extracted data in detail after continuing.
        </p>
      </div>

      <div className="border-t border-border" />

      {/* Project Type */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Project type</h3>
          <p className="text-xs text-muted-foreground">
            {aiSuggestion
              ? "AI detected a project type from your brief — confirm or choose a different one."
              : selectedType
              ? "AI matched your brief to a project type — change it if needed."
              : "Choose the type that best fits this project."}
          </p>
        </div>
        <ProjectTypeSelector
          selected={selectedType}
          onSelect={setSelectedType}
          customTypes={customTypes}
          aiSuggestion={aiSuggestion}
          onConfirmAiSuggestion={(s) => { handleConfirmAiSuggestion(s); setSelectedType(s.type_id); }}
          onDismissAiSuggestion={() => setAiSuggestion(null)}
          onAddCustomType={handleAddCustomType}
        />
      </div>

      <div className="border-t border-border" />

      {/* Client */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Client</h3>
          <p className="text-xs text-muted-foreground">
            Link this project to a client to enable brand intelligence tracking. Optional.
          </p>
        </div>

        {/* Current selection */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedClientId(null)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
              selectedClientId === null
                ? "border-primary bg-primary/8 text-primary font-medium"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            No client
          </button>
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClientId(c.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                selectedClientId === c.id
                  ? "border-primary bg-primary/8 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              <Building2 className="h-3 w-3" />
              {c.name}
            </button>
          ))}
          {!isCreatingClient && (
            <button
              onClick={() => setIsCreatingClient(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New client
            </button>
          )}
        </div>

        {/* Inline new client */}
        {isCreatingClient && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Client name..."
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateClient();
                if (e.key === "Escape") setIsCreatingClient(false);
              }}
              className="h-9 max-w-xs"
            />
            <Button size="sm" onClick={handleCreateClient} disabled={!newClientName.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsCreatingClient(false)}>Cancel</Button>
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Action row */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => setStep("upload")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Upload different brief
        </button>

        <div className="flex items-center gap-3">
          {/* Summary chips */}
          {selectedTypeLabel && (
            <Badge variant="secondary" className="text-xs gap-1">
              {selectedTypeLabel}
            </Badge>
          )}
          {selectedClientLabel && (
            <Badge variant="outline" className="text-xs gap-1">
              <Building2 className="h-3 w-3" />
              {selectedClientLabel}
            </Badge>
          )}

          <Button
            size="lg"
            className="btn-glow px-8 h-12 rounded-xl"
            disabled={!selectedType || isSaving}
            onClick={handleConfirmAndContinue}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Continue to Review
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
