// /admin/industries — super-admin industry management.
//
// Lists every industry with counts (project types / agencies / KB docs)
// and lets super admins create + edit + delete. Drilling in via the row
// goes to /admin/industries/:slug for the detail tabs.

import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Crown,
  Search,
  Star,
  Sparkles,
  Building2,
  TreePine,
  Film,
  Speaker,
  Layers,
  ChevronRight,
  Save,
  Trash2,
  AlertTriangle,
  Copy,
  Check as CheckIcon,
  Database,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import {
  useAdminIndustries,
  useCreateIndustry,
  useDeleteIndustry,
  type AdminIndustryRow,
} from "@/hooks/useAdminIndustries";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_INDUSTRIES } from "@/lib/builtinIndustries";
import { INDUSTRIES_SETUP_SQL } from "@/lib/industriesSetupSql";

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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminIndustries() {
  const { data: isSuper, isLoading: roleLoading } = useIsSuperAdmin();
  const { data: queryResult, isLoading } = useAdminIndustries();
  const industries = queryResult?.rows ?? [];
  const isSchemaReady = queryResult?.isSchemaReady ?? true;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Auto-ensure the 5 canonical industries exist in the DB on first
  // super-admin visit, but ONLY when the table actually exists. If the
  // schema isn't ready, we don't try (the user must run setup SQL first).
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (
      ensuredRef.current ||
      !isSuper ||
      isLoading ||
      !isSchemaReady ||
      industries.some((i) => !i.id.startsWith("00000000-0000-4000-8000")) // already real rows
    ) {
      return;
    }
    ensuredRef.current = true;
    void (async () => {
      const rows = BUILTIN_INDUSTRIES.map((b) => ({
        slug: b.slug,
        label: b.label,
        description: b.description,
        icon: b.icon,
        vocabulary: b.vocabulary,
        sort_order: b.sort_order,
        is_builtin: true,
      }));
      const { error } = await (supabase.from("industries" as any) as any)
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
      if (error) {
        // Permissions or transient issue — silent. Page still renders from constants.
        console.warn("[AdminIndustries] auto-upsert failed:", error.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["admin", "industries"] });
      queryClient.invalidateQueries({ queryKey: ["industries"] });
    })();
  }, [isSuper, isLoading, isSchemaReady, industries, queryClient]);

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuper) {
    return <Navigate to="/projects" replace />;
  }

  const filtered = industries.filter(
    (i) =>
      !search ||
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      i.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Industries</h1>
              <p className="text-sm text-muted-foreground">
                The verticals Canopy serves. Each industry has its own vocabulary, project-type
                taxonomy, and global knowledge base.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New industry
            </Button>
          </div>
        </div>

        {/* Schema-not-ready banner */}
        {!isSchemaReady && !isLoading && (
          <SchemaSetupBanner />
        )}

        {/* Summary */}
        {industries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile label="Industries" value={industries.length} />
            <SummaryTile
              label="Built-in"
              value={industries.filter((i) => i.is_builtin).length}
              tone="amber"
            />
            <SummaryTile
              label="Custom"
              value={industries.filter((i) => !i.is_builtin).length}
              tone="violet"
            />
            <SummaryTile
              label="Total project types"
              value={industries.reduce((s, i) => s + i.project_type_count, 0)}
              tone="emerald"
            />
          </div>
        )}

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All industries</CardTitle>
            <CardDescription>
              Click an industry to manage its project types, knowledge, and vocabulary.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              search ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No industries match your search.
                </div>
              ) : (
                // Transient state during auto-upsert. If you see this for
                // more than a second the upsert hit an error — check the
                // toast for the message.
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Initializing canonical industries…
                  </p>
                </div>
              )
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((ind) => (
                  <IndustryRow key={ind.slug} industry={ind} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateIndustryDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(slug) => {
          toast({
            title: "Industry created",
            description: `Open it to add project types and knowledge.`,
          });
          // Soft navigate to the detail page
          if (typeof window !== "undefined") {
            window.location.href = `/admin/industries/${slug}`;
          }
        }}
      />
    </AppLayout>
  );
}

// ─── Industry list row ──────────────────────────────────────────────────────

function IndustryRow({ industry }: { industry: AdminIndustryRow }) {
  const Icon = getIcon(industry.icon);
  const projectTypeTerm =
    (industry.vocabulary?.project_types as string | undefined) ?? "Project types";
  const deleteIndustry = useDeleteIndustry();
  const { toast } = useToast();

  const inUse = industry.agency_count > 0;

  return (
    <div className="px-5 py-3 hover:bg-white/[0.02] transition-colors flex items-center gap-4">
      <Link to={`/admin/industries/${industry.slug}`} className="flex items-center gap-4 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#F472B6]/20 border border-white/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[#A78BFA]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{industry.label}</span>
            {industry.is_builtin && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Star className="h-2.5 w-2.5" />
                Built-in
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="font-mono">{industry.slug}</span>
            <span>·</span>
            <span>
              {industry.project_type_count} {projectTypeTerm.toLowerCase()}
            </span>
            <span>·</span>
            <span>
              {industry.agency_count} {industry.agency_count === 1 ? "agency" : "agencies"}
              {industry.primary_agency_count > 0 && ` (${industry.primary_agency_count} primary)`}
            </span>
            {industry.knowledge_doc_count > 0 && (
              <>
                <span>·</span>
                <span className="text-[#A78BFA]">{industry.knowledge_doc_count} KB docs</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Link>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="shrink-0">
            <Trash2 className="h-3.5 w-3.5 text-foreground/55 hover:text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {industry.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {inUse ? (
                <>
                  <span className="text-amber-400 font-medium">
                    {industry.agency_count} {industry.agency_count === 1 ? "agency" : "agencies"} currently use this industry.
                  </span>{" "}
                  Deleting will detach them and remove this industry from any project types tagged
                  with it. This cannot be undone.
                </>
              ) : (
                "This will delete the industry and detach it from any project types tagged with it. Cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteIndustry.mutateAsync({ slug: industry.slug, force: true });
                  toast({ title: "Industry deleted" });
                } catch (e) {
                  toast({
                    title: "Delete failed",
                    description: e instanceof Error ? e.message : String(e),
                    variant: "destructive",
                  });
                }
              }}
              className="bg-destructive hover:bg-destructive/80"
            >
              Delete industry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Create dialog ──────────────────────────────────────────────────────────

function CreateIndustryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (slug: string) => void;
}) {
  const create = useCreateIndustry();
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  // Vocabulary as JSON for power users
  const [vocab, setVocab] = useState(
    JSON.stringify(
      {
        project_type: "Project type",
        project_types: "Project types",
        project: "Project",
        projects: "Projects",
      },
      null,
      2,
    ),
  );

  const handleSubmit = async () => {
    let parsed: any = {};
    try {
      parsed = JSON.parse(vocab || "{}");
    } catch {
      toast({ title: "Vocabulary must be valid JSON", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        slug: slug.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
        label: label.trim(),
        description: description.trim() || null,
        vocabulary: parsed,
      });
      onOpenChange(false);
      onCreated(slug.toLowerCase().replace(/[^a-z0-9_]+/g, "_"));
      setSlug("");
      setLabel("");
      setDescription("");
    } catch (e) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New industry</DialogTitle>
          <DialogDescription>
            Define a new vertical Canopy serves. After creation you can add project types and
            knowledge documents from its detail page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="hospitality"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase identifier, used in URLs + APIs.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Hospitality"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-sentence description of the vertical."
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vocab">Vocabulary (JSON)</Label>
            <Textarea
              id="vocab"
              value={vocab}
              onChange={(e) => setVocab(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-400 shrink-0" />
              Keys: project_type, project_types, project, projects, deliverable, render,
              spatial_plan, brief, client. The UI swaps generic terms for these.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!slug.trim() || !label.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Create industry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schema setup banner ────────────────────────────────────────────────────
// Shown when the `industries` table doesn't exist on this DB. Provides
// the SQL needed to bring the schema current. The banner stays until
// the underlying schema is real.

function SchemaSetupBanner() {
  const [copied, setCopied] = useState(false);
  const [showSql, setShowSql] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INDUSTRIES_SETUP_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked — fall back to expanding the SQL block so the user can select & copy manually.
      setShowSql(true);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Database className="h-4 w-4 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">Database setup required</div>
          <p className="text-xs text-foreground/65 mt-1 leading-relaxed">
            The Canopy industries schema isn't initialized on this Supabase project, so the 5
            verticals below are rendered from code with placeholder counts. Editing vocabulary,
            uploading industry knowledge, and accurate counts require the underlying tables.
          </p>
          <p className="text-xs text-foreground/65 mt-2 leading-relaxed">
            <span className="font-medium text-foreground/80">To fix:</span>{" "}
            paste the setup SQL into the{" "}
            <a
              href="https://supabase.com/dashboard/project/_/sql/new"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Supabase SQL Editor
            </a>{" "}
            and run it. Idempotent — safe to re-run.
          </p>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Button size="sm" onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 mr-1.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy setup SQL
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowSql((v) => !v)}>
              {showSql ? "Hide SQL" : "Show SQL"}
            </Button>
          </div>

          {showSql && (
            <pre className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] font-mono text-foreground/80 overflow-auto max-h-72 whitespace-pre">
              {INDUSTRIES_SETUP_SQL}
            </pre>
          )}
        </div>
      </div>
    </div>
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
