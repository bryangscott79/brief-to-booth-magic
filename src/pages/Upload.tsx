import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BriefUpload } from "@/components/brief/BriefUpload";
import { GuidedBriefBuilder } from "@/components/brief/GuidedBriefBuilder";
import { ProjectKnowledgeBase } from "@/components/files/ProjectKnowledgeBase";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useSearchParams } from "react-router-dom";
import { Loader2, FileText, Sparkles, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "choose" | "upload" | "guided";

export default function UploadPage() {
  const { projectId, isLoading, dbProject } = useProjectSync();
  const [searchParams] = useSearchParams();
  const isSuiteMode = searchParams.get("suite") === "true";

  // Show chooser for fresh/empty projects; skip only if a brief already exists
  const hasBriefContent = Boolean(
    dbProject?.brief_text || dbProject?.brief_file_url || dbProject?.parsed_brief,
  );
  const [mode, setMode] = useState<Mode>(hasBriefContent ? "upload" : "choose");

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-12 space-y-12">
        <div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">
              {isSuiteMode ? "Upload Suite Brief" : "New Project"}
            </h1>
            <p className="text-muted-foreground">
              {mode === "choose"
                ? "Start with a brief — or build one with us."
                : mode === "upload"
                ? isSuiteMode
                  ? "Upload the master brief for this suite — activations will inherit this context"
                  : "Upload your brief and let AI extract the details — then confirm and continue"
                : "Answer a few questions and we'll craft a complete, structured brief."}
            </p>
          </div>

          {mode === "choose" && (
            <ChooserCards
              onUpload={() => setMode("upload")}
              onGuided={() => setMode("guided")}
            />
          )}

          {mode === "upload" && (
            <div className="space-y-6">
              {!projectId && (
                <div className="max-w-3xl mx-auto">
                  <button
                    onClick={() => setMode("choose")}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Choose a different way to start
                  </button>
                </div>
              )}
              <BriefUpload projectId={projectId} />
            </div>
          )}

          {mode === "guided" && (
            <div className="space-y-6">
              <div className="max-w-3xl mx-auto">
                <button
                  onClick={() => setMode("choose")}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Choose a different way to start
                </button>
              </div>
              <GuidedBriefBuilder
                projectId={projectId}
                onCancel={() => setMode("choose")}
              />
            </div>
          )}
        </div>

        {projectId && mode === "upload" && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">Project Knowledge Base</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add supporting docs — RFPs, inspiration, pricing, brand assets — so the AI can
                reference them when generating strategy, prompts, and exports.
              </p>
            </div>
            <ProjectKnowledgeBase projectId={projectId} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Chooser Cards ───────────────────────────────────────────────────────────

function ChooserCards({
  onUpload,
  onGuided,
}: {
  onUpload: () => void;
  onGuided: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
      <ChooserCard
        icon={<FileText className="h-7 w-7" />}
        title="Upload a brief"
        subtitle="I have a brief"
        description="Drop in a PDF, DOCX, or paste text. AI extracts brand, objectives, audience, budget, and creative direction."
        cta="Upload brief"
        onClick={onUpload}
      />
      <ChooserCard
        icon={<Sparkles className="h-7 w-7" />}
        title="Build from scratch"
        subtitle="I'm starting from nothing"
        description="Answer a guided set of questions about the brand, show, audience, and creative direction. We'll synthesize a complete brief."
        cta="Start guided builder"
        onClick={onGuided}
        accent
      />
    </div>
  );
}

function ChooserCard({
  icon,
  title,
  subtitle,
  description,
  cta,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  cta: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-2xl border-2 p-6 transition-all",
        "hover:border-primary hover:shadow-lg hover:-translate-y-0.5",
        accent
          ? "border-primary/40 bg-gradient-to-br from-primary/5 to-transparent"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-xl",
            accent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {subtitle}
        </span>
      </div>
      <h3 className="text-lg font-bold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{description}</p>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-semibold",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {cta} →
      </div>
    </button>
  );
}
