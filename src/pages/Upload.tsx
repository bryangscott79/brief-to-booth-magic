import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BriefUpload } from "@/components/brief/BriefUpload";
import { GuidedBriefBuilder } from "@/components/brief/GuidedBriefBuilder";
import { InspirationIntake } from "@/components/brief/InspirationIntake";
import { BrandLogoUpload } from "@/components/brief/BrandLogoUpload";
import { BrandWebsiteCard } from "@/components/brief/BrandWebsiteCard";
import { ProjectKnowledgeBase } from "@/components/files/ProjectKnowledgeBase";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useClients } from "@/hooks/useClients";
import { useSearchParams } from "react-router-dom";
import { Loader2, FileText, Sparkles, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


type Mode = "choose" | "upload" | "guided";

export default function UploadPage() {
  const { projectId, isLoading, dbProject } = useProjectSync();
  const [searchParams] = useSearchParams();
  const isSuiteMode = searchParams.get("suite") === "true";
  const { data: clients = [] } = useClients();
  const linkedClient = dbProject?.client_id
    ? clients.find((c) => c.id === dbProject.client_id) ?? null
    : null;


  // Show chooser for fresh/empty projects; skip only if a brief already exists
  const hasBriefContent = Boolean(
    dbProject?.brief_text || dbProject?.brief_file_url || dbProject?.parsed_brief,
  );
  const [mode, setMode] = useState<Mode>(hasBriefContent ? "upload" : "choose");

  // Confirm-step state lifted out of BriefUpload so the Continue CTA can
  // live BELOW the brand logo / inspiration / KB context cards. Users see
  // every supporting widget before the final action — they're more likely
  // to upload their brand assets when the button isn't already shouting
  // "you're done."
  const [continueState, setContinueState] = useState<{
    confirm: () => Promise<void>;
    canContinue: boolean;
    isSaving: boolean;
  } | null>(null);

  if (isLoading) {
    return (
      <AppLayout surface="light">
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout surface="light">
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
              {!hasBriefContent && (
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
              <BriefUpload
                projectId={projectId}
                hideContinueCTA
                onContinueStateChange={setContinueState}
              />
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
          <>
            {/* Brand website — captured up front so we can scrape brand data
             * (colors, logo, fonts, voice) before the brief even parses.
             * When a client is linked, extraction runs immediately. */}
            <div className="max-w-3xl mx-auto">
              <BrandWebsiteCard
                projectId={projectId}
                initialUrl={(dbProject as any)?.brand_website_url ?? null}
                client={linkedClient}
              />
            </div>

            {/* Brand logo upload — captured early so every downstream
             * render references it. Image generation includes the logo
             * URL as a reference image so signage and fascia render with
             * the actual mark, not a hallucinated approximation. */}
            <div className="max-w-3xl mx-auto">
              <BrandLogoUpload projectId={projectId} />
            </div>


            {/* Inspiration intake — collected first so it grounds every
             * downstream generation step. Documents land in the project
             * KB tagged 'inspiration' and are retrieved by project-scope
             * RAG during strategy + prompt generation. */}
            <div className="max-w-3xl mx-auto">
              <InspirationIntake projectId={projectId} />
            </div>

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

            {/* Continue to Review — placed below all the supporting widgets
              * so users finish capturing project context (logo, inspiration,
              * KB) before advancing. Only renders once the BriefUpload
              * component reaches its confirm step. */}
            {continueState && (
              <div className="max-w-3xl mx-auto pt-2">
                <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Ready when you are</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You can keep adding context above any time — it'll all flow into strategy
                      and renders.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="btn-glow px-8 h-12 rounded-xl shrink-0"
                    disabled={!continueState.canContinue || continueState.isSaving}
                    onClick={() => {
                      void continueState.confirm();
                    }}
                  >
                    {continueState.isSaving ? (
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
            )}
          </>
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
