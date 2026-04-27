// /admin/industries/:slug — single-industry detail with tabs:
//   - Overview      vocabulary preview + counts
//   - Project Types assign / unassign activation_types to this industry
//   - Knowledge     industry-scoped KB (5th RAG scope)
//   - Vocabulary    JSON editor for vocab swaps

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Save,
  Star,
  Sparkles,
  Building2,
  TreePine,
  Film,
  Speaker,
  Layers,
  Plus,
  Check,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminIndustries,
  useUpdateIndustry,
  useActivationTypesByIndustry,
  useAllActivationTypes,
  useSetActivationTypeIndustries,
  type IndustryActivationTypeRow,
} from "@/hooks/useAdminIndustries";
import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, typeof Sparkles> = {
  Sparkles,
  Building2,
  TreePine,
  Film,
  Speaker,
  Layers,
};

function getIcon(name: string | null | undefined) {
  if (!name) return Layers;
  return ICON_MAP[name] ?? Layers;
}

export default function AdminIndustryDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const { data: isSuper, isLoading: roleLoading } = useIsSuperAdmin();
  const { data: industries = [], isLoading: industriesLoading } = useAdminIndustries();

  const industry = industries.find((i) => i.slug === slug);

  if (roleLoading || industriesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuper) return <Navigate to="/projects" replace />;

  if (!industry) {
    return (
      <AppLayout>
        <Card className="max-w-3xl mx-auto mt-10 p-6">
          <p className="text-muted-foreground">Industry not found.</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/admin/industries">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to industries
            </Link>
          </Button>
        </Card>
      </AppLayout>
    );
  }

  const Icon = getIcon(industry.icon);
  const projectTypeTerm =
    (industry.vocabulary as any)?.project_types ?? "Project types";

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/industries">
            <ArrowLeft className="h-4 w-4 mr-1" />
            All industries
          </Link>
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#A78BFA]/20 to-[#F472B6]/20 border border-white/10 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6 text-[#A78BFA]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{industry.label}</h1>
                {industry.is_builtin && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Star className="h-3 w-3" />
                    Built-in
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{industry.slug}</p>
              {industry.description && (
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{industry.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryTile label={projectTypeTerm} value={industry.project_type_count} />
          <SummaryTile label="Total agencies" value={industry.agency_count} tone="emerald" />
          <SummaryTile label="As primary" value={industry.primary_agency_count} tone="violet" />
          <SummaryTile label="KB documents" value={industry.knowledge_doc_count} tone="amber" />
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="types">{projectTypeTerm}</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-6 space-y-4">
            <OverviewForm industry={industry} />
          </TabsContent>

          {/* PROJECT TYPES */}
          <TabsContent value="types" className="mt-6">
            <ProjectTypesTab industrySlug={industry.slug} industryLabel={industry.label} projectTypeTerm={projectTypeTerm} />
          </TabsContent>

          {/* KNOWLEDGE */}
          <TabsContent value="knowledge" className="mt-6">
            <Card className="p-6">
              <KnowledgeBasePanel
                scope="industry"
                scopeId={industry.id}
                title={`${industry.label} — Industry knowledge`}
                description="Global, super-admin curated knowledge. Every agency working in this industry sees these documents in their RAG retrieval."
              />
            </Card>
          </TabsContent>

          {/* VOCABULARY */}
          <TabsContent value="vocabulary" className="mt-6">
            <VocabularyEditor industry={industry} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ─── Overview form ──────────────────────────────────────────────────────────

function OverviewForm({ industry }: { industry: ReturnType<typeof useAdminIndustries>["data"] extends (infer T)[] | undefined ? T : never }) {
  const update = useUpdateIndustry();
  const { toast } = useToast();
  const [label, setLabel] = useState(industry.label);
  const [description, setDescription] = useState(industry.description ?? "");
  const [icon, setIcon] = useState(industry.icon ?? "");
  const [sortOrder, setSortOrder] = useState(String(industry.sort_order));

  useEffect(() => {
    setLabel(industry.label);
    setDescription(industry.description ?? "");
    setIcon(industry.icon ?? "");
    setSortOrder(String(industry.sort_order));
  }, [industry.slug]);

  const dirty =
    label !== industry.label ||
    (description ?? "") !== (industry.description ?? "") ||
    (icon ?? "") !== (industry.icon ?? "") ||
    Number(sortOrder) !== industry.sort_order;

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        slug: industry.slug,
        label: label.trim() || undefined,
        description: description.trim() || null,
        icon: icon.trim() || null,
        sort_order: Number(sortOrder) || 100,
      });
      toast({ title: "Industry updated" });
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overview</CardTitle>
        <CardDescription>Display name, description, icon, and sort order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Icon (Lucide name)</Label>
          <Input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="Sparkles · Building2 · TreePine · Film · Speaker · Layers"
            className="font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Maps to a Lucide React icon name. Falls back to Layers if unrecognized.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Project types tab ──────────────────────────────────────────────────────

function ProjectTypesTab({
  industrySlug,
  industryLabel,
  projectTypeTerm,
}: {
  industrySlug: string;
  industryLabel: string;
  projectTypeTerm: string;
}) {
  const { data: tagged = [], isLoading: taggedLoading } = useActivationTypesByIndustry(industrySlug);
  const { data: all = [], isLoading: allLoading } = useAllActivationTypes();
  const setIndustries = useSetActivationTypeIndustries();
  const { toast } = useToast();

  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const taggedIds = useMemo(() => new Set(tagged.map((t) => t.id)), [tagged]);
  const candidates = useMemo(
    () =>
      all.filter(
        (t) =>
          !taggedIds.has(t.id) &&
          (!search ||
            t.label.toLowerCase().includes(search.toLowerCase()) ||
            t.slug.toLowerCase().includes(search.toLowerCase())),
      ),
    [all, taggedIds, search],
  );

  const handleTag = async (item: IndustryActivationTypeRow) => {
    try {
      await setIndustries.mutateAsync({
        activationTypeId: item.id,
        industries: Array.from(new Set([...(item.industries ?? []), industrySlug])),
      });
      toast({ title: `Added to ${industryLabel}` });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleUntag = async (item: IndustryActivationTypeRow) => {
    try {
      await setIndustries.mutateAsync({
        activationTypeId: item.id,
        industries: (item.industries ?? []).filter((s) => s !== industrySlug),
      });
      toast({ title: "Removed from industry" });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  if (taggedLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">{projectTypeTerm} in {industryLabel}</CardTitle>
          <CardDescription>
            {tagged.length} tagged. Use Add to assign existing project types from other industries
            (e.g. cross-tag a "Pop-up retail" type so it appears for both experiential and retail).
          </CardDescription>
        </div>
        <Button onClick={() => setShowPicker(!showPicker)}>
          <Plus className="h-4 w-4 mr-2" />
          {showPicker ? "Done" : "Add existing"}
        </Button>
      </CardHeader>
      <CardContent>
        {tagged.length === 0 && !showPicker ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No {projectTypeTerm.toLowerCase()} tagged yet. Click "Add existing" to assign types
            from other industries, or create new types via the agency-side Activation Types page.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tagged.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{t.label}</span>
                    {t.is_builtin && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Star className="h-2.5 w-2.5" />
                        Built-in
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="font-mono">{t.slug}</span>
                    {t.category && <span>· {t.category}</span>}
                    {(t.industries?.length ?? 0) > 1 && (
                      <span>
                        · also in:{" "}
                        {t.industries.filter((s) => s !== industrySlug).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => handleUntag(t)}>
                  <X className="h-3.5 w-3.5 text-foreground/55 hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Picker for cross-tagging existing types */}
        {showPicker && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Add an existing project type
            </Label>
            <Input
              placeholder="Search by label or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-2"
            />
            {allLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mt-3 space-y-1 max-h-96 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search
                      ? "No matches."
                      : "All existing project types are already tagged with this industry."}
                  </p>
                ) : (
                  candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTag(t)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                        "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5 text-[#A78BFA]" />
                        <span className="font-medium text-sm">{t.label}</span>
                        {t.is_builtin && <Star className="h-2.5 w-2.5 text-amber-300" />}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 ml-5">
                        <span className="font-mono">{t.slug}</span>
                        {t.industries?.length > 0 && (
                          <span>· in: {t.industries.join(", ")}</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Vocabulary editor ──────────────────────────────────────────────────────

function VocabularyEditor({ industry }: { industry: ReturnType<typeof useAdminIndustries>["data"] extends (infer T)[] | undefined ? T : never }) {
  const update = useUpdateIndustry();
  const { toast } = useToast();
  const [draft, setDraft] = useState(JSON.stringify(industry.vocabulary ?? {}, null, 2));

  useEffect(() => {
    setDraft(JSON.stringify(industry.vocabulary ?? {}, null, 2));
  }, [industry.slug]);

  const handleSave = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(draft || "{}");
    } catch {
      toast({ title: "Vocabulary must be valid JSON", variant: "destructive" });
      return;
    }
    try {
      await update.mutateAsync({ slug: industry.slug, vocabulary: parsed });
      toast({ title: "Vocabulary saved" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vocabulary</CardTitle>
        <CardDescription>
          Maps generic Canopy terms to the wording that fits this industry. The UI swaps headers,
          buttons, and copy based on the agency's primary industry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          rows={14}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-1.5">
          <div className="font-medium text-foreground/80">Recognized keys</div>
          {[
            ["project_type", "What's an 'activation type' called here?"],
            ["project_types", "Plural form."],
            ["project", "What's a 'project' called here?"],
            ["projects", "Plural form."],
            ["deliverable", "Final-output noun (deck, drawing set, equipment list)."],
            ["render", "What we generate visually."],
            ["spatial_plan", "Floor plan / site plan / stage plan."],
            ["brief", "What we parse on input."],
            ["client", "Who we're delivering to."],
          ].map(([key, hint]) => (
            <div key={key} className="flex items-start gap-2">
              <code className="font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-[#A78BFA]">
                {key}
              </code>
              <span className="text-muted-foreground">{hint}</span>
            </div>
          ))}
        </div>
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          Save vocabulary
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Summary tile ───────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "violet" | "emerald" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "text-foreground",
    violet: "text-[#A78BFA]",
    emerald: "text-emerald-400",
    amber: "text-amber-300",
    red: "text-red-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}
