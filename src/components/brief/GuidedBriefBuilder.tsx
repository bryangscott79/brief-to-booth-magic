import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, CheckCircle2, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectStore } from "@/store/projectStore";
import { useClients, useUpsertClient, useBatchCreateIntelligence } from "@/hooks/useClients";
import { extractBrandIntelligence } from "@/lib/brandIntelligenceExtractor";
import { ALL_PROJECT_TYPES, DEFAULT_PROJECT_TYPE } from "@/lib/projectTypes";
import type { ParsedBrief } from "@/types/brief";

// ─── Question definitions ────────────────────────────────────────────────────

interface FieldDef {
  key: keyof Answers;
  label: string;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
}

interface SectionDef {
  id: string;
  title: string;
  subtitle: string;
  fields: FieldDef[];
}

type Answers = {
  projectName: string;
  projectType: string;
  brandName: string;
  brandCategory: string;
  brandPersonality: string;
  brandColors: string;
  competitors: string;
  showName: string;
  venue: string;
  city: string;
  dates: string;
  footprintSize: string;
  primaryObjective: string;
  secondaryObjectives: string;
  audiences: string;
  creativeDirection: string;
  moodKeywords: string;
  avoid: string;
  heroMoment: string;
  mustHaves: string;
  budget: string;
  timeline: string;
  successCriteria: string;
  additionalNotes: string;
};

const EMPTY: Answers = {
  projectName: "", projectType: "", brandName: "", brandCategory: "",
  brandPersonality: "", brandColors: "", competitors: "", showName: "",
  venue: "", city: "", dates: "", footprintSize: "", primaryObjective: "",
  secondaryObjectives: "", audiences: "", creativeDirection: "", moodKeywords: "",
  avoid: "", heroMoment: "", mustHaves: "", budget: "", timeline: "",
  successCriteria: "", additionalNotes: "",
};

const SECTIONS: SectionDef[] = [
  {
    id: "project",
    title: "The project",
    subtitle: "Let's start with the basics.",
    fields: [
      { key: "projectName", label: "Project name", placeholder: "e.g. Samsung CES 2027 Booth" },
      {
        key: "projectType",
        label: "Project type",
        help: "Trade show booth, brand activation, premiere, permanent install, architectural, etc.",
        placeholder: "e.g. Trade show booth",
      },
    ],
  },
  {
    id: "brand",
    title: "The brand",
    subtitle: "Who is this for and how should it feel?",
    fields: [
      { key: "brandName", label: "Brand or company", placeholder: "e.g. Samsung Biologics" },
      { key: "brandCategory", label: "Category / industry", placeholder: "e.g. Biopharma manufacturing" },
      {
        key: "brandPersonality",
        label: "Brand personality",
        help: "3-6 adjectives that describe the brand voice.",
        placeholder: "e.g. Precise, human, forward-looking, confident",
        multiline: true,
      },
      {
        key: "brandColors",
        label: "Brand colors",
        help: "Hex codes or color names. Optional.",
        placeholder: "e.g. #0033A0, white, accent silver",
        optional: true,
      },
      {
        key: "competitors",
        label: "Competitors or category players",
        help: "Who else shows up in this space?",
        placeholder: "e.g. Lonza, Catalent, WuXi",
        optional: true,
      },
    ],
  },
  {
    id: "show",
    title: "The show & venue",
    subtitle: "Where and when does this live?",
    fields: [
      { key: "showName", label: "Show or event name", placeholder: "e.g. CPHI Worldwide 2027", optional: true },
      { key: "venue", label: "Venue", placeholder: "e.g. Fira Barcelona Gran Via", optional: true },
      { key: "city", label: "City", placeholder: "e.g. Barcelona", optional: true },
      { key: "dates", label: "Dates", placeholder: "e.g. Oct 2027", optional: true },
      {
        key: "footprintSize",
        label: "Footprint / size",
        help: "Booth size, square footage, or rough scale.",
        placeholder: "e.g. 20x40 (800 sq ft)",
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & audience",
    subtitle: "Why are we doing this and who is it for?",
    fields: [
      {
        key: "primaryObjective",
        label: "Primary objective",
        help: "The single most important thing this project must achieve.",
        placeholder: "e.g. Position Samsung Biologics as the most trusted CDMO partner in Europe",
        multiline: true,
      },
      {
        key: "secondaryObjectives",
        label: "Secondary goals",
        help: "Other things you'd like it to do.",
        placeholder: "e.g. Drive 200 qualified leads, launch new ADC service line, attract talent",
        multiline: true,
        optional: true,
      },
      {
        key: "audiences",
        label: "Target audiences",
        help: "Who do we need to reach? Decision-makers, partners, press, etc.",
        placeholder: "e.g. Pharma execs, biotech founders, M&A advisors",
        multiline: true,
      },
    ],
  },
  {
    id: "creative",
    title: "Creative direction",
    subtitle: "What should it look and feel like?",
    fields: [
      {
        key: "creativeDirection",
        label: "Core creative idea",
        help: "If you already have a direction or theme, share it. Otherwise describe the vibe.",
        placeholder: "e.g. A precision-built atrium that feels like a working lab — calm, modular, glowing",
        multiline: true,
      },
      {
        key: "moodKeywords",
        label: "Mood / style keywords",
        placeholder: "e.g. minimal, sculptural, warm tech, biophilic, monochrome",
      },
      {
        key: "avoid",
        label: "What to avoid",
        help: "Tropes, materials, colors, or vibes you do NOT want.",
        placeholder: "e.g. Cold blue gradients, generic trade-show booths, anything plastic",
        multiline: true,
        optional: true,
      },
    ],
  },
  {
    id: "experience",
    title: "Experience pillars",
    subtitle: "What must the experience deliver?",
    fields: [
      {
        key: "heroMoment",
        label: "Hero moment / signature experience",
        help: "The one thing visitors will photograph, talk about, and remember.",
        placeholder: "e.g. A 12-ft luminous bioreactor visitors can step inside",
        multiline: true,
      },
      {
        key: "mustHaves",
        label: "Must-have elements",
        help: "Specific deliverables or features the project must include.",
        placeholder: "e.g. Private meeting room, demo wall, hospitality bar, branded swag",
        multiline: true,
        optional: true,
      },
    ],
  },
  {
    id: "logistics",
    title: "Budget & success",
    subtitle: "Last details. Anything you skip, AI will suggest sensible defaults for.",
    fields: [
      {
        key: "budget",
        label: "Budget",
        help: "Total or per-show. Range is fine.",
        placeholder: "e.g. $750K total, or $450K-$600K per show",
        optional: true,
      },
      { key: "timeline", label: "Timeline", placeholder: "e.g. Approval Q1, build Q2-Q3, install Sept", optional: true },
      {
        key: "successCriteria",
        label: "How you'll know it worked",
        help: "KPIs, qualitative signals, or both.",
        placeholder: "e.g. 200+ qualified leads, 5 press hits, partner exec NPS > 8",
        multiline: true,
        optional: true,
      },
      {
        key: "additionalNotes",
        label: "Anything else?",
        help: "Constraints, sensitivities, references — anything we should know.",
        multiline: true,
        optional: true,
      },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface GuidedBriefBuilderProps {
  projectId: string | null;
  onCancel?: () => void;
}

export function GuidedBriefBuilder({ projectId, onCancel }: GuidedBriefBuilderProps) {
  const [sectionIdx, setSectionIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [suggestingField, setSuggestingField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSuiteMode = searchParams.get("suite") === "true";
  const { user } = useAuth();
  const { toast } = useToast();
  const { setActiveStep } = useProjectStore();
  const { data: clients = [] } = useClients();
  const upsertClient = useUpsertClient();
  const batchCreateIntel = useBatchCreateIntelligence();

  const currentSection = SECTIONS[sectionIdx];
  const isLast = sectionIdx === SECTIONS.length - 1;

  const setField = (key: keyof Answers, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const sectionComplete = (s: SectionDef) =>
    s.fields.every((f) => f.optional || answers[f.key].trim().length > 0);

  const canProceed = sectionComplete(currentSection);

  // ─── AI suggestion per-field ──────────────────────────────────────────────
  const suggestField = async (field: FieldDef) => {
    setSuggestingField(field.key);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-brief-field", {
        body: {
          fieldLabel: field.label,
          fieldHelp: field.help,
          priorAnswers: answers,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Suggestion failed");
      setField(field.key, data.suggestion ?? "");
    } catch (e) {
      toast({
        title: "Couldn't suggest",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSuggestingField(null);
    }
  };

  // ─── Final synthesis ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) {
      toast({ title: "You must be logged in", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setSubmitStage("Synthesizing your brief…");

    try {
      // 1. Synthesize
      const { data: synth, error: synthErr } = await supabase.functions.invoke(
        "synthesize-brief",
        { body: { answers } },
      );
      if (synthErr) throw synthErr;
      if (!synth?.success) throw new Error(synth?.error ?? "Synthesis failed");

      const parsed = synth.data.parsed as ParsedBrief;
      const briefText = synth.data.briefText as string;

      setSubmitStage("Saving your project…");

      // 2. Determine project type
      const projectTypeLabel = answers.projectType.toLowerCase();
      let projectType = DEFAULT_PROJECT_TYPE;
      if (/film|premiere|red.?carpet/.test(projectTypeLabel)) projectType = "film_premiere";
      else if (/game|gaming|console/.test(projectTypeLabel)) projectType = "game_release_activation";
      else if (/pop.?up|activation|festival|outdoor|stunt/.test(projectTypeLabel))
        projectType = "live_brand_activation";
      else if (/permanent|flagship|museum|installation/.test(projectTypeLabel))
        projectType = "permanent_installation";
      else if (/architectural|interior|hospitality|hotel|restaurant/.test(projectTypeLabel))
        projectType = "architectural_brief";
      const found = ALL_PROJECT_TYPES.find(
        (t) => t.label.toLowerCase() === projectTypeLabel,
      );
      if (found) projectType = found.id;

      // 3. Create or update project
      let dbProjectId = projectId;
      const projectName = answers.projectName.trim() || parsed.brand?.name || "Untitled project";

      if (!dbProjectId) {
        const { data, error } = await supabase
          .from("projects")
          .insert({
            user_id: user.id,
            name: projectName,
            status: "reviewed",
            project_type: projectType,
            brief_text: briefText,
            parsed_brief: parsed as any,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        dbProjectId = data.id;
      } else {
        const { error } = await supabase
          .from("projects")
          .update({
            name: projectName,
            status: "reviewed",
            project_type: projectType,
            brief_text: briefText,
            parsed_brief: parsed as any,
          } as any)
          .eq("id", dbProjectId);
        if (error) throw error;
      }

      // 4. Match or create client + capture brand intelligence
      let clientId: string | null = null;
      if (parsed.brand?.name) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const bn = norm(parsed.brand.name);
        const match = clients.find((c) => {
          const cn = norm(c.name);
          return bn === cn || bn.includes(cn) || cn.includes(bn);
        });
        if (match) {
          clientId = match.id;
        } else {
          try {
            const created = await upsertClient.mutateAsync({
              name: parsed.brand.name,
              industry: parsed.brand.category ?? undefined,
              description: parsed.brand.pov ?? undefined,
              primary_color: parsed.brand.visualIdentity?.colors?.[0] ?? undefined,
            });
            clientId = (created as any).id;
          } catch (e) {
            console.warn("client create failed:", e);
          }
        }

        if (clientId && dbProjectId) {
          await supabase
            .from("projects")
            .update({ client_id: clientId } as any)
            .eq("id", dbProjectId);
          try {
            const entries = extractBrandIntelligence(parsed, clientId, dbProjectId);
            if (entries.length > 0) await batchCreateIntel.mutateAsync(entries);
          } catch (e) {
            console.warn("brand intel capture failed:", e);
          }
        }
      }

      // 5. Hydrate the project store
      const { loadFromDb } = useProjectStore.getState();
      loadFromDb({
        id: dbProjectId!,
        name: projectName,
        projectType,
        clientId,
        rawBrief: briefText,
        parsedBrief: parsed,
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
        title: "Brief created",
        description: "Your project is ready — review and refine on the next screen.",
      });
      navigate(isSuiteMode ? `/suite?project=${dbProjectId}` : `/review?project=${dbProjectId}`);
    } catch (e) {
      console.error("guided builder submit error:", e);
      toast({
        title: "Couldn't build the brief",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setIsSubmitting(false);
      setSubmitStage("");
    }
  };

  // ─── Submitting view ──────────────────────────────────────────────────────
  if (isSubmitting) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-9 w-9 text-primary" />
            </div>
            <Loader2 className="absolute -top-1 -right-1 h-7 w-7 text-primary animate-spin" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">{submitStage || "Working…"}</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              We're turning your answers into a polished, structured brief and seeding your knowledge base.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Wizard view ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Progress */}
      <div className="flex items-center justify-center gap-2">
        {SECTIONS.map((s, i) => {
          const done = i < sectionIdx;
          const active = i === sectionIdx;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary/10 text-primary",
                  !done && !active && "border-muted-foreground/30 text-muted-foreground/40",
                )}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < SECTIONS.length - 1 && (
                <div className={cn("h-px w-6", done ? "bg-primary" : "bg-muted-foreground/20")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Section header */}
      <div className="text-center space-y-1.5">
        <p className="text-xs uppercase tracking-wider text-primary/70 font-semibold">
          Step {sectionIdx + 1} of {SECTIONS.length}
        </p>
        <h2 className="text-2xl font-bold">{currentSection.title}</h2>
        <p className="text-sm text-muted-foreground">{currentSection.subtitle}</p>
      </div>

      {/* Fields */}
      <div className="space-y-5">
        {currentSection.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium">
                {field.label}
                {field.optional && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                    Optional
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => suggestField(field)}
                disabled={suggestingField === field.key}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                {suggestingField === field.key ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                Suggest with AI
              </button>
            </div>
            {field.help && (
              <p className="text-xs text-muted-foreground">{field.help}</p>
            )}
            {field.multiline ? (
              <Textarea
                value={answers[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
              />
            ) : (
              <Input
                value={answers[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          variant="ghost"
          onClick={() => {
            if (sectionIdx === 0) {
              onCancel?.();
            } else {
              setSectionIdx((i) => i - 1);
            }
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {sectionIdx === 0 ? "Back" : "Previous"}
        </Button>

        {isLast ? (
          <Button onClick={handleSubmit} disabled={!canProceed} className="btn-glow">
            <Sparkles className="mr-2 h-4 w-4" />
            Build my brief
          </Button>
        ) : (
          <Button
            onClick={() => setSectionIdx((i) => i + 1)}
            disabled={!canProceed}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
