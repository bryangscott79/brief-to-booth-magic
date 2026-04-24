import { useState } from "react";
import type { ElementType } from "@/types/brief";
import { ELEMENT_META } from "@/store/projectStore";
import { LucideIcon } from "@/components/ui/lucide-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Target,
  Zap,
  Monitor,
  Users,
  Tent,
  LayoutGrid,
  DollarSign,
  TrendingUp,
  Eye,
  Sparkles,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ElementDetailPanelProps {
  elementType: ElementType;
  data: any;
  onBack: () => void;
  onRegenerate: (feedback?: string) => void;
  onUpdateField: (path: string, value: any) => void;
  isRegenerating: boolean;
}

export function ElementDetailPanel({
  elementType,
  data,
  onBack,
  onRegenerate,
  onUpdateField,
  isRegenerating,
}: ElementDetailPanelProps) {
  const meta = ELEMENT_META[elementType];
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleRegenerate = () => {
    onRegenerate(feedback || undefined);
    setFeedback("");
    setFeedbackOpen(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <LucideIcon name={meta.icon} className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-semibold">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!feedbackOpen ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFeedbackOpen(true)}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Give Feedback
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRegenerate()}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Regenerate
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What would you like changed?"
                className="w-80 h-10 min-h-[40px] text-sm"
              />
              <Button size="sm" onClick={handleRegenerate} disabled={isRegenerating}>
                {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setFeedbackOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {isRegenerating && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Generating with AI research and industry trends...</p>
        </div>
      )}

      {!isRegenerating && data && (
        <div className="space-y-6">
          {elementType === "bigIdea" && <BigIdeaDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "experienceFramework" && <ExperienceFrameworkDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "interactiveMechanics" && <InteractiveMechanicsDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "digitalStorytelling" && <DigitalStorytellingDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "humanConnection" && <HumanConnectionDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "adjacentActivations" && <AdjacentActivationsDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "spatialStrategy" && <SpatialStrategyDetail data={data} onUpdateField={onUpdateField} />}
          {elementType === "budgetLogic" && <BudgetLogicDetail data={data} onUpdateField={onUpdateField} />}
        </div>
      )}
    </div>
  );
}

// ============= EDITABLE FIELD COMPONENT =============
function EditableText({
  value,
  onChange,
  multiline = false,
  className,
  as: Tag = "p",
}: {
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return multiline ? (
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={cn("min-h-[100px]", className)}
          autoFocus
        />
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => { onChange(draft); setEditing(false); }}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setDraft(value); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={cn("bg-transparent border-b border-primary outline-none w-full", className)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") { onChange(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => { onChange(draft); setEditing(false); }}>
          <Check className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Tag
      className={cn("cursor-pointer hover:bg-primary/5 rounded px-1 -mx-1 transition-colors group relative", className)}
      onClick={() => setEditing(true)}
    >
      {value}
      <Edit3 className="h-3 w-3 inline-block ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />
    </Tag>
  );
}

// ============= COLLAPSIBLE SECTION =============
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  accent = false,
}: {
  title: string;
  icon?: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all",
      accent && "border-primary/30 shadow-[var(--shadow-amber)]"
    )}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-accent/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-5 w-5 text-primary" />}
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 animate-fade-in">
          <Separator />
          {children}
        </div>
      )}
    </div>
  );
}

// ============= BIG IDEA =============
function BigIdeaDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      {/* Hero section */}
      <div className="rounded-xl p-8 hero-gradient text-card-foreground dark:text-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
        <div className="relative space-y-4">
          <Badge className="bg-primary/20 text-primary border-0">Core Concept</Badge>
          <EditableText
            value={data.headline || ""}
            onChange={(v) => onUpdateField("headline", v)}
            as="h1"
            className="text-3xl font-bold tracking-tight text-white"
          />
          <EditableText
            value={data.subheadline || ""}
            onChange={(v) => onUpdateField("subheadline", v)}
            as="h3"
            className="text-xl text-white/70 font-normal"
          />
        </div>
      </div>

      <Section title="Strategic Narrative" icon={Lightbulb} accent>
        <EditableText
          value={data.narrative || ""}
          onChange={(v) => onUpdateField("narrative", v)}
          multiline
          className="text-sm leading-relaxed whitespace-pre-wrap"
        />
      </Section>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Strategic Position" icon={Target}>
          <EditableText
            value={data.strategicPosition || ""}
            onChange={(v) => onUpdateField("strategicPosition", v)}
            multiline
            className="text-sm"
          />
        </Section>

        <Section title="Core Tension" icon={Zap}>
          <EditableText
            value={data.coreTension || ""}
            onChange={(v) => onUpdateField("coreTension", v)}
            multiline
            className="text-sm"
          />
        </Section>
      </div>

      <Section title="Differentiation" icon={Sparkles}>
        <EditableText
          value={data.differentiation || ""}
          onChange={(v) => onUpdateField("differentiation", v)}
          multiline
          className="text-sm"
        />
      </Section>

      {data.competitiveAnalysis && (
        <Section title="Competitive Analysis" icon={BarChart3}>
          <EditableText
            value={data.competitiveAnalysis || ""}
            onChange={(v) => onUpdateField("competitiveAnalysis", v)}
            multiline
            className="text-sm"
          />
        </Section>
      )}

      {data.emotionalResonance && (
        <Section title="Emotional Resonance Strategy" icon={Users}>
          <EditableText
            value={data.emotionalResonance || ""}
            onChange={(v) => onUpdateField("emotionalResonance", v)}
            multiline
            className="text-sm"
          />
        </Section>
      )}

      {data.industryTrends?.length > 0 && (
        <Section title="Industry Trends Alignment" icon={TrendingUp}>
          <div className="grid gap-3">
            {data.industryTrends.map((trend: any, i: number) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-accent/50">
                <Badge variant="outline" className="shrink-0 h-fit">{trend.trend}</Badge>
                <p className="text-sm text-muted-foreground">{trend.relevance}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.briefAlignment?.length > 0 && (
        <Section title="Brief Alignment" icon={Check} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {data.briefAlignment.map((item: string, i: number) => (
              <Badge key={i} variant="secondary" className="text-sm py-1">{item}</Badge>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ============= EXPERIENCE FRAMEWORK =============
function ExperienceFrameworkDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      <Section title="Concept Overview" icon={Eye} accent>
        <EditableText
          value={data.conceptDescription || ""}
          onChange={(v) => onUpdateField("conceptDescription", v)}
          multiline
          className="text-sm leading-relaxed whitespace-pre-wrap"
        />
      </Section>

      <Section title="Design Principles" icon={Target}>
        <div className="grid gap-4">
          {data.designPrinciples?.map((p: any, i: number) => (
            <div key={i} className="p-4 rounded-lg border bg-accent/30 space-y-2">
              <div className="flex items-center justify-between">
                <EditableText value={p.name} onChange={(v) => onUpdateField(`designPrinciples.${i}.name`, v)} as="h4" className="font-semibold" />
                <Badge variant="outline" className="text-xs shrink-0">{p.briefReference}</Badge>
              </div>
              <EditableText value={p.description} onChange={(v) => onUpdateField(`designPrinciples.${i}.description`, v)} className="text-sm text-muted-foreground" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Visitor Journey" icon={Users}>
        <div className="relative">
          {/* Journey timeline */}
          <div className="space-y-0">
            {data.visitorJourney?.map((stage: any, i: number) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 border-primary bg-primary/10 text-primary shrink-0">
                    {i + 1}
                  </div>
                  {i < (data.visitorJourney?.length || 0) - 1 && (
                    <div className="w-0.5 h-full bg-border min-h-[40px]" />
                  )}
                </div>
                <div className="pb-6 flex-1">
                  <EditableText value={stage.stage} onChange={(v) => onUpdateField(`visitorJourney.${i}.stage`, v)} as="h4" className="font-semibold" />
                  <EditableText value={stage.description} onChange={(v) => onUpdateField(`visitorJourney.${i}.description`, v)} className="text-sm text-muted-foreground mt-1" />
                  {stage.emotionalArc && <p className="text-xs text-primary mt-1 italic">Emotional arc: {stage.emotionalArc}</p>}
                  {stage.timing && <Badge variant="outline" className="text-xs mt-2">{stage.timing}</Badge>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {stage.touchpoints?.map((tp: string, j: number) => (
                      <Badge key={j} variant="secondary" className="text-xs">{tp}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {data.audienceRouting?.length > 0 && (
        <Section title="Audience Routing" icon={LayoutGrid}>
          <div className="grid gap-4 md:grid-cols-2">
            {data.audienceRouting.map((route: any, i: number) => (
              <div key={i} className="p-4 rounded-lg border space-y-3">
                <h4 className="font-semibold">{route.persona}</h4>
                <div className="flex items-center gap-1 flex-wrap">
                  {route.pathway?.map((step: string, j: number) => (
                    <span key={j} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{step}</Badge>
                      {j < (route.pathway?.length || 0) - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>⏱ {route.timing}</span>
                  {route.engagementGoal && <span>🎯 {route.engagementGoal}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.sensoryDesign && (
        <Section title="Sensory Design" icon={Eye} defaultOpen={false}>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(data.sensoryDesign).map(([key, val]) => (
              <div key={key} className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{key}</p>
                <p className="text-sm">{String(val)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.staffChoreography?.length > 0 && (
        <Section title="Staff Choreography" icon={Users} defaultOpen={false}>
          <div className="space-y-2">
            {data.staffChoreography.map((staff: any, i: number) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-accent/30">
                <Badge variant="outline" className="shrink-0 h-fit">{staff.role}</Badge>
                <div>
                  <p className="text-sm">{staff.responsibility}</p>
                  {staff.location && <p className="text-xs text-muted-foreground mt-1">📍 {staff.location}</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.kpiFramework?.length > 0 && (
        <Section title="KPI Framework" icon={BarChart3} defaultOpen={false}>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left p-2">Metric</th><th className="text-left p-2">Target</th><th className="text-left p-2">Method</th></tr></thead>
              <tbody>
                {data.kpiFramework.map((kpi: any, i: number) => (
                  <tr key={i} className="border-b border-border/50"><td className="p-2 font-medium">{kpi.metric}</td><td className="p-2 text-muted-foreground">{kpi.target}</td><td className="p-2 text-muted-foreground">{kpi.method}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}

// ============= INTERACTIVE MECHANICS =============
function InteractiveMechanicsDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  const hero = data.hero || {};
  return (
    <>
      {/* Hero Installation */}
      <div className="rounded-xl border-2 border-primary/30 p-6 bg-gradient-to-br from-primary/5 to-transparent space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <Badge className="bg-primary/20 text-primary border-0">Hero Installation</Badge>
        </div>
        <EditableText value={hero.name || ""} onChange={(v) => onUpdateField("hero.name", v)} as="h2" className="text-2xl font-bold" />
        <EditableText value={hero.concept || ""} onChange={(v) => onUpdateField("hero.concept", v)} multiline className="text-sm leading-relaxed" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Physical Form" icon={LayoutGrid}>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-accent/30">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Structure</p>
              <EditableText value={hero.physicalForm?.structure || ""} onChange={(v) => onUpdateField("hero.physicalForm.structure", v)} className="text-sm" />
            </div>
            <div className="p-3 rounded-lg bg-accent/30">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Dimensions</p>
              <p className="text-sm">{hero.physicalForm?.dimensions}</p>
            </div>
            <div className="p-3 rounded-lg bg-accent/30">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Visual Language</p>
              <p className="text-sm">{hero.physicalForm?.visualLanguage}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {hero.physicalForm?.materials?.map((m: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{m}</Badge>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Technical Specifications" icon={Monitor}>
          <div className="space-y-2">
            {hero.technicalSpecs && Object.entries(hero.technicalSpecs).map(([key, val]) => (
              <div key={key} className="flex justify-between py-2 border-b border-border/50 text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">{String(val)}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Interaction Model" icon={Zap} accent>
        <div className="space-y-0">
          {hero.interactionModel?.map((step: any, i: number) => (
            <div key={i} className="flex gap-4 pb-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">{step.step}</div>
                {i < (hero.interactionModel?.length || 0) - 1 && <div className="w-0.5 h-full bg-primary/20 min-h-[20px]" />}
              </div>
              <div className="flex-1 grid md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Step</p>
                  <p className="text-sm font-medium">{step.name}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <div className="p-2 rounded bg-accent/30">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">User Action</p>
                  <p className="text-sm">{step.userAction}</p>
                </div>
                <div className="p-2 rounded bg-primary/5">
                  <p className="text-xs font-semibold uppercase text-primary">System Response</p>
                  <p className="text-sm">{step.systemResponse}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {hero.audienceValue && (
        <Section title="Audience Value" icon={Users}>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.entries(hero.audienceValue).map(([key, val]) => (
              <div key={key} className="p-4 rounded-lg border bg-accent/30 space-y-1">
                <p className="text-xs font-semibold uppercase text-primary">{key.replace("for", "For ")}</p>
                <p className="text-sm">{String(val)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.secondary?.length > 0 && (
        <Section title="Secondary Interactives" icon={LayoutGrid}>
          <div className="grid gap-4 md:grid-cols-2">
            {data.secondary.map((s: any, i: number) => (
              <div key={i} className="p-4 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{s.name}</h4>
                  <Badge variant="outline" className="text-xs">{s.type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>📍 {s.location}</span>
                  <span>🎯 {s.purpose}</span>
                </div>
                {s.technicalNotes && <p className="text-xs text-muted-foreground italic">{s.technicalNotes}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.technologyStack?.length > 0 && (
        <Section title="Technology Stack" icon={Monitor} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {data.technologyStack.map((t: string, i: number) => (
              <Badge key={i} variant="secondary">{t}</Badge>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ============= DIGITAL STORYTELLING =============
function DigitalStorytellingDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      <Section title="Content Philosophy" icon={Lightbulb} accent>
        <EditableText value={data.philosophy || ""} onChange={(v) => onUpdateField("philosophy", v)} multiline className="text-sm leading-relaxed whitespace-pre-wrap" />
      </Section>

      <Section title="Audience Tracks" icon={Users}>
        <div className="space-y-4">
          {data.audienceTracks?.map((track: any, i: number) => (
            <div key={i} className="p-5 rounded-xl border bg-gradient-to-r from-accent/30 to-transparent space-y-3">
              <div className="flex items-center justify-between">
                <EditableText value={track.trackName} onChange={(v) => onUpdateField(`audienceTracks.${i}.trackName`, v)} as="h4" className="font-semibold text-lg" />
                <Badge variant="outline">{track.format}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{track.targetAudience}</p>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-2 rounded bg-card"><span className="text-xs font-semibold uppercase text-muted-foreground block">Focus</span>{track.contentFocus}</div>
                <div className="p-2 rounded bg-card"><span className="text-xs font-semibold uppercase text-muted-foreground block">Tone</span>{track.tone}</div>
                <div className="p-2 rounded bg-card"><span className="text-xs font-semibold uppercase text-muted-foreground block">Delivery</span>{track.deliveryMethod}</div>
              </div>
              {track.keyMessages?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Key Messages</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {track.keyMessages.map((msg: string, j: number) => <li key={j}>{msg}</li>)}
                  </ul>
                </div>
              )}
              {track.sampleOutline && (
                <div className="p-3 rounded bg-card border-l-2 border-primary text-sm">
                  <p className="text-xs font-semibold uppercase text-primary mb-1">Sample Outline</p>
                  {track.sampleOutline}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Content Modules" icon={Monitor}>
        <div className="grid gap-3 md:grid-cols-2">
          {data.contentModules?.map((mod: any, i: number) => (
            <div key={i} className="p-4 rounded-lg border space-y-2">
              <h4 className="font-semibold">{mod.title}</h4>
              <p className="text-sm text-muted-foreground">{mod.description}</p>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">⏱ {mod.duration}</Badge>
                {mod.format && <Badge variant="outline">{mod.format}</Badge>}
                {mod.complexity && <Badge variant="outline">Complexity: {mod.complexity}</Badge>}
              </div>
              {mod.reusability && <p className="text-xs text-muted-foreground italic">{mod.reusability}</p>}
            </div>
          ))}
        </div>
      </Section>

      {data.socialStrategy && (
        <Section title="Social Media Strategy" icon={TrendingUp} defaultOpen={false}>
          <EditableText value={data.socialStrategy} onChange={(v) => onUpdateField("socialStrategy", v)} multiline className="text-sm" />
        </Section>
      )}

      {data.postEventPlan && (
        <Section title="Post-Event Plan" icon={BarChart3} defaultOpen={false}>
          <EditableText value={data.postEventPlan} onChange={(v) => onUpdateField("postEventPlan", v)} multiline className="text-sm" />
        </Section>
      )}
    </>
  );
}

// ============= HUMAN CONNECTION =============
function HumanConnectionDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      {data.configs?.map((config: any, ci: number) => (
        <Section key={ci} title={`${config.footprintSize} Configuration`} icon={LayoutGrid} accent={ci === 0}>
          <div className="grid gap-4 md:grid-cols-2">
            {config.zones?.map((zone: any, zi: number) => (
              <div key={zi} className="p-4 rounded-lg border space-y-2 bg-gradient-to-br from-accent/20 to-transparent">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{zone.name}</h4>
                  <Badge variant="outline">Cap: {zone.capacity}</Badge>
                </div>
                <EditableText value={zone.description} onChange={(v) => onUpdateField(`configs.${ci}.zones.${zi}.description`, v)} className="text-sm text-muted-foreground" />
                <div className="flex flex-wrap gap-1">
                  {zone.designFeatures?.map((f: string, fi: number) => (
                    <Badge key={fi} variant="secondary" className="text-xs">{f}</Badge>
                  ))}
                </div>
                <p className="text-xs text-primary font-medium">🎯 {zone.purpose}</p>
                {zone.furniture && <p className="text-xs text-muted-foreground">🪑 {zone.furniture}</p>}
                {zone.atmosphere && <p className="text-xs text-muted-foreground italic">{zone.atmosphere}</p>}
              </div>
            ))}
          </div>
        </Section>
      ))}

      {data.meetingTypes?.length > 0 && (
        <Section title="Meeting Types" icon={Users}>
          <div className="space-y-3">
            {data.meetingTypes.map((mt: any, i: number) => (
              <div key={i} className="flex gap-4 p-3 rounded-lg bg-accent/30">
                <Badge variant="outline" className="shrink-0 h-fit">{mt.type}</Badge>
                <div>
                  <p className="text-sm">{mt.description}</p>
                  {mt.duration && <p className="text-xs text-muted-foreground mt-1">⏱ {mt.duration}</p>}
                  {mt.requirements && <p className="text-xs text-muted-foreground">{mt.requirements}</p>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.operational && (
        <Section title="Operational Plan" icon={Target} defaultOpen={false}>
          <div className="grid md:grid-cols-2 gap-3">
            {Object.entries(data.operational).map(([key, val]) => (
              <div key={key} className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                <p className="text-sm">{String(val)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.hospitalityDetails && (
        <Section title="Hospitality Details" icon={Sparkles} defaultOpen={false}>
          <div className="space-y-3">
            {Object.entries(data.hospitalityDetails).map(([key, val]) => (
              <div key={key} className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                <p className="text-sm">{String(val)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Scaling Notes" icon={TrendingUp} defaultOpen={false}>
        <EditableText value={data.scalingNotes || ""} onChange={(v) => onUpdateField("scalingNotes", v)} multiline className="text-sm" />
      </Section>
    </>
  );
}

// ============= ADJACENT ACTIVATIONS =============
function AdjacentActivationsDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      <Section title="Competitive Positioning" icon={Target} accent>
        <EditableText value={data.competitivePositioning || ""} onChange={(v) => onUpdateField("competitivePositioning", v)} multiline className="text-sm leading-relaxed" />
      </Section>

      {data.activations?.map((act: any, i: number) => (
        <Section key={i} title={act.name} icon={Tent}>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Badge className={act.type === "primary" ? "bg-primary/20 text-primary" : ""}>{act.type}</Badge>
              <Badge variant="outline">{act.capacity} guests</Badge>
              <Badge variant="outline">{act.venueType}</Badge>
            </div>
            <EditableText value={act.format} onChange={(v) => onUpdateField(`activations.${i}.format`, v)} multiline className="text-sm" />
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Program</p>
                <p className="text-sm">{act.programFormat}</p>
              </div>
              <div className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Atmosphere</p>
                <p className="text-sm">{act.atmosphere}</p>
              </div>
            </div>
            {act.takeaway && (
              <div className="p-3 rounded-lg border-l-2 border-primary bg-primary/5">
                <p className="text-xs font-semibold uppercase text-primary">Takeaway</p>
                <p className="text-sm">{act.takeaway}</p>
              </div>
            )}
            {act.contentProgram && (
              <div className="p-3 rounded-lg bg-accent/30">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Content Program</p>
                <p className="text-sm">{act.contentProgram}</p>
              </div>
            )}
            {act.estimatedBudget && <Badge variant="outline">💰 {act.estimatedBudget}</Badge>}
            {act.briefAlignment?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {act.briefAlignment.map((a: string, j: number) => (
                  <Badge key={j} variant="secondary" className="text-xs">{a}</Badge>
                ))}
              </div>
            )}
          </div>
        </Section>
      ))}

      {data.timingStrategy && (
        <Section title="Timing & Scheduling" icon={BarChart3} defaultOpen={false}>
          <EditableText value={data.timingStrategy} onChange={(v) => onUpdateField("timingStrategy", v)} multiline className="text-sm" />
        </Section>
      )}

      {data.guestCuration && (
        <Section title="Guest Curation" icon={Users} defaultOpen={false}>
          <EditableText value={data.guestCuration} onChange={(v) => onUpdateField("guestCuration", v)} multiline className="text-sm" />
        </Section>
      )}

      {data.successMetrics?.length > 0 && (
        <Section title="Success Metrics" icon={BarChart3} defaultOpen={false}>
          <div className="space-y-2">
            {data.successMetrics.map((m: any, i: number) => (
              <div key={i} className="flex justify-between py-2 border-b border-border/50 text-sm">
                <span>{m.metric}</span>
                <span className="text-muted-foreground">{m.target}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ============= SPATIAL STRATEGY =============
function SpatialStrategyDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      {data.configs?.map((config: any, ci: number) => (
        <Section key={ci} title={`${config.footprintSize} — ${config.totalSqft?.toLocaleString()} sq ft`} icon={LayoutGrid} accent={ci === 0}>
          {/* Visual floor plan */}
          <div className="relative w-full aspect-[4/3] bg-muted rounded-lg overflow-hidden grid-pattern">
            {config.zones?.map((zone: any, zi: number) => (
              <div
                key={zi}
                className="absolute rounded border-2 flex flex-col items-center justify-center text-xs p-1"
                style={{
                  left: `${zone.position?.x || 0}%`,
                  top: `${zone.position?.y || 0}%`,
                  width: `${zone.position?.width || 20}%`,
                  height: `${zone.position?.height || 20}%`,
                  backgroundColor: `${zone.colorCode}33`,
                  borderColor: zone.colorCode,
                }}
              >
                <span className="font-semibold truncate">{zone.name}</span>
                <span className="text-[10px] text-muted-foreground">{zone.percentage}% • {zone.sqft} sf</span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {config.zones?.map((zone: any, zi: number) => (
              <div key={zi} className="p-3 rounded-lg border text-sm space-y-1" style={{ borderLeftColor: zone.colorCode, borderLeftWidth: 3 }}>
                <p className="font-semibold">{zone.name}</p>
                <p className="text-xs text-muted-foreground">{zone.percentage}% • {zone.sqft} sq ft</p>
                <p className="text-xs text-muted-foreground">{zone.notes}</p>
              </div>
            ))}
          </div>
        </Section>
      ))}

      {data.scalingStrategy && (
        <Section title="Scaling Strategy" icon={TrendingUp}>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-accent/30 space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Scales Down</p>
              <ul className="text-sm space-y-1">{data.scalingStrategy.whatScalesDown?.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
            </div>
            <div className="p-4 rounded-lg bg-destructive/5 space-y-2">
              <p className="text-xs font-semibold uppercase text-destructive">Eliminates</p>
              <ul className="text-sm space-y-1">{data.scalingStrategy.whatEliminates?.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
            </div>
            <div className="p-4 rounded-lg bg-primary/5 space-y-2">
              <p className="text-xs font-semibold uppercase text-primary">Stays Proportional</p>
              <ul className="text-sm space-y-1">{data.scalingStrategy.whatStaysProportional?.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
            </div>
          </div>
          <div className="p-3 rounded-lg border-l-2 border-primary bg-primary/5 mt-4">
            <EditableText value={data.scalingStrategy.conceptIntegrity || ""} onChange={(v) => onUpdateField("scalingStrategy.conceptIntegrity", v)} className="text-sm font-medium" />
          </div>
        </Section>
      )}

      {data.materialsAndMood?.length > 0 && (
        <Section title="Materials & Mood" icon={Eye}>
          <div className="grid gap-3 md:grid-cols-2">
            {data.materialsAndMood.map((mat: any, i: number) => (
              <div key={i} className="p-4 rounded-lg border space-y-1">
                <p className="font-semibold text-sm">{mat.material}</p>
                <p className="text-xs text-muted-foreground">{mat.use}</p>
                <p className="text-xs italic text-primary">{mat.feel}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.lightingStrategy && (
        <Section title="Lighting Strategy" icon={Lightbulb} defaultOpen={false}>
          <EditableText value={data.lightingStrategy} onChange={(v) => onUpdateField("lightingStrategy", v)} multiline className="text-sm" />
        </Section>
      )}

      {data.adaCompliance && (
        <Section title="ADA Compliance" icon={Check} defaultOpen={false}>
          <EditableText value={data.adaCompliance} onChange={(v) => onUpdateField("adaCompliance", v)} multiline className="text-sm" />
        </Section>
      )}
    </>
  );
}

// ============= BUDGET LOGIC =============
function BudgetLogicDetail({ data, onUpdateField }: { data: any; onUpdateField: (path: string, value: any) => void }) {
  return (
    <>
      {/* Total budget hero */}
      <div className="rounded-xl p-6 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total Per Show</p>
          <p className="text-4xl font-bold text-primary">${data.totalPerShow?.toLocaleString()}</p>
        </div>
        <DollarSign className="h-12 w-12 text-primary/20" />
      </div>

      <Section title="Budget Allocation" icon={BarChart3} accent>
        <div className="space-y-3">
          {data.allocation?.map((item: any, i: number) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.category}</span>
                <span className="text-muted-foreground">${item.amount?.toLocaleString()} ({item.percentage}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${item.percentage}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Amortization Schedule" icon={TrendingUp}>
        <div className="grid gap-4 md:grid-cols-3">
          {data.amortization?.map((show: any, i: number) => (
            <div key={i} className="p-4 rounded-lg border text-center space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Show {show.showNumber}</p>
              <p className="text-2xl font-bold">${show.estimatedCost?.toLocaleString()}</p>
              <Badge variant="secondary" className="text-xs">{show.savings}</Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Risk Factors" icon={Zap}>
        <div className="space-y-2">
          {data.riskFactors?.map((risk: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-accent/30">
              <Badge variant={risk.level === "high" ? "destructive" : risk.level === "medium" ? "default" : "secondary"} className="shrink-0">
                {risk.level}
              </Badge>
              <div className="flex-1">
                <p className="text-sm font-medium">{risk.factor}</p>
                <p className="text-xs text-muted-foreground">{risk.impact}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {data.roiFramework && (
        <Section title="ROI Framework" icon={DollarSign} defaultOpen={false}>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.entries(data.roiFramework).map(([key, val]) => (
              <div key={key} className="p-4 rounded-lg border text-center">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                <p className="text-lg font-bold text-primary">{String(val)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.valueEngineering?.length > 0 && (
        <Section title="Value Engineering" icon={Sparkles} defaultOpen={false}>
          <ul className="space-y-2">
            {data.valueEngineering.map((v: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-primary">•</span>{v}</li>
            ))}
          </ul>
        </Section>
      )}

      {data.paymentMilestones?.length > 0 && (
        <Section title="Payment Milestones" icon={DollarSign} defaultOpen={false}>
          <div className="space-y-2">
            {data.paymentMilestones.map((pm: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 text-sm">
                <span>{pm.milestone}</span>
                <div className="flex gap-2">
                  <Badge variant="outline">{pm.percentage}%</Badge>
                  <span className="text-muted-foreground">{pm.timing}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.industryBenchmarks && (
        <Section title="Industry Benchmarks" icon={BarChart3} defaultOpen={false}>
          <EditableText value={data.industryBenchmarks} onChange={(v) => onUpdateField("industryBenchmarks", v)} multiline className="text-sm" />
        </Section>
      )}
    </>
  );
}
