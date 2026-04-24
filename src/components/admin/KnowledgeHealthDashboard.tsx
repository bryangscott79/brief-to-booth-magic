// KnowledgeHealthDashboard — agency-wide KB telemetry.
//
// Shows totals, per-scope distribution, embedding status breakdown, recent
// uploads, and any failed documents (with one-click re-embed).
//
// Mounts inside AdminSettings as the "KB Health" tab.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Database,
  Layers as LayersIcon,
  Building2,
  Zap,
  FolderKanban,
  Sparkles,
  Archive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAgency } from "@/hooks/useAgency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ScopeName = "agency" | "client" | "activation_type" | "project";
type DocStatus = "pending" | "processing" | "embedded" | "failed";

interface DocRow {
  id: string;
  filename: string;
  title: string | null;
  scope: string;
  scope_id: string;
  status: string;
  chunk_count: number;
  processing_error: string | null;
  created_at: string;
  doc_type: string | null;
  file_size_bytes: number | null;
}

const SCOPE_META: Record<ScopeName, { label: string; icon: typeof Building2; color: string }> = {
  agency: { label: "Agency", icon: Building2, color: "text-blue-600 dark:text-blue-400" },
  activation_type: { label: "Activation Types", icon: Zap, color: "text-amber-600 dark:text-amber-400" },
  client: { label: "Clients", icon: LayersIcon, color: "text-violet-600 dark:text-violet-400" },
  project: { label: "Projects", icon: FolderKanban, color: "text-pink-600 dark:text-pink-400" },
};

export function KnowledgeHealthDashboard() {
  const { agency, isLoading: agencyLoading } = useAgency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const agencyId = agency?.id;
  const [migrating, setMigrating] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["kb-health", agencyId],
    queryFn: async (): Promise<{ docs: DocRow[]; chunkTotal: number }> => {
      if (!agencyId) return { docs: [], chunkTotal: 0 };

      const { data: docs, error } = await supabase
        .from("knowledge_documents")
        .select("id, filename, title, scope, scope_id, status, chunk_count, processing_error, created_at, doc_type, file_size_bytes")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const chunkTotal = (docs || []).reduce((sum, d) => sum + (d.chunk_count || 0), 0);
      return { docs: (docs || []) as DocRow[], chunkTotal };
    },
    enabled: !!agencyId,
  });

  const stats = useMemo(() => {
    const docs = data?.docs || [];
    const byStatus: Record<DocStatus, number> = {
      pending: 0,
      processing: 0,
      embedded: 0,
      failed: 0,
    };
    const byScope: Record<ScopeName, number> = {
      agency: 0,
      activation_type: 0,
      client: 0,
      project: 0,
    };
    for (const d of docs) {
      const status = (d.status as DocStatus) || "pending";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const scope = d.scope as ScopeName;
      if (scope in byScope) byScope[scope]++;
    }
    const totalSize = docs.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0);
    return {
      total: docs.length,
      byStatus,
      byScope,
      totalSize,
      embeddedPct: docs.length === 0 ? 0 : Math.round((byStatus.embedded / docs.length) * 100),
    };
  }, [data]);

  const failedDocs = useMemo(
    () => (data?.docs || []).filter((d) => d.status === "failed"),
    [data],
  );

  const recentDocs = useMemo(() => (data?.docs || []).slice(0, 8), [data]);

  const handleReembed = async (doc: DocRow) => {
    try {
      const { error } = await supabase.functions.invoke("embed-document", {
        body: { document_id: doc.id },
      });
      if (error) throw error;
      toast({ title: "Re-embedding started", description: doc.filename });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["kb-health", agencyId] });
      }, 1500);
    } catch (e) {
      toast({
        title: "Re-embed failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleReembedAll = async () => {
    if (failedDocs.length === 0) return;
    if (!confirm(`Re-embed ${failedDocs.length} failed document(s)?`)) return;

    let success = 0;
    for (const doc of failedDocs) {
      try {
        await supabase.functions.invoke("embed-document", { body: { document_id: doc.id } });
        success++;
      } catch (e) {
        console.error("Re-embed failed for", doc.filename, e);
      }
    }
    toast({
      title: `Triggered re-embed for ${success}/${failedDocs.length} documents`,
    });
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["kb-health", agencyId] });
    }, 2000);
  };

  const handleMigrateLegacy = async () => {
    if (!confirm(
      "Backfill legacy KB files (knowledge_base_files + activation_type_kb_files) into the new RAG system?\n\n" +
        "Files already migrated or conflicting with existing documents will be skipped.",
    )) return;
    setMigrating(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("migrate-legacy-kb", {
        body: { limit: 200 },
      });
      if (error) throw error;
      const stats = (res as any)?.stats ?? [];
      const summary = stats
        .map(
          (s: any) =>
            `${s.source_table}: ${s.migrated} migrated, ${s.skipped_already_done} already done, ${s.skipped_conflict} conflicts, ${s.failed} failed`,
        )
        .join(" • ");
      toast({ title: "Legacy KB migration complete", description: summary || "Nothing to migrate." });
      queryClient.invalidateQueries({ queryKey: ["kb-health", agencyId] });
    } catch (e) {
      toast({
        title: "Migration failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setMigrating(false);
    }
  };

  if (agencyLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agency) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No agency context available.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Knowledge Base Health
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live telemetry for the RAG pipeline across all scopes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMigrateLegacy}
            disabled={migrating}
            title="Backfill legacy knowledge_base_files into the new RAG system"
          >
            <Archive className={`h-4 w-4 mr-2 ${migrating ? "animate-pulse" : ""}`} />
            {migrating ? "Migrating…" : "Migrate legacy KB"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Documents"
          value={stats.total}
          icon={FileText}
          subtext={formatBytes(stats.totalSize)}
        />
        <StatCard
          label="Embedded chunks"
          value={data?.chunkTotal ?? 0}
          icon={Database}
          subtext="indexed for retrieval"
        />
        <StatCard
          label="Ready"
          value={stats.byStatus.embedded}
          icon={CheckCircle2}
          accent="text-emerald-600 dark:text-emerald-400"
          subtext={`${stats.embeddedPct}% of total`}
        />
        <StatCard
          label="Failed"
          value={stats.byStatus.failed}
          icon={AlertCircle}
          accent={stats.byStatus.failed > 0 ? "text-red-600 dark:text-red-400" : undefined}
          subtext={stats.byStatus.failed > 0 ? "needs attention" : "all healthy"}
        />
      </div>

      {/* Embedding pipeline status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Embedding pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={stats.embeddedPct} className="h-2" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <PipelineStat label="Pending" count={stats.byStatus.pending} icon={Loader2} />
            <PipelineStat label="Processing" count={stats.byStatus.processing} icon={Loader2} spinning />
            <PipelineStat
              label="Embedded"
              count={stats.byStatus.embedded}
              icon={CheckCircle2}
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <PipelineStat
              label="Failed"
              count={stats.byStatus.failed}
              icon={AlertCircle}
              accent={stats.byStatus.failed > 0 ? "text-red-600 dark:text-red-400" : undefined}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-scope distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents by scope</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(SCOPE_META) as ScopeName[]).map((scope) => {
              const meta = SCOPE_META[scope];
              const Icon = meta.icon;
              const count = stats.byScope[scope];
              const pct = stats.total === 0 ? 0 : Math.round((count / stats.total) * 100);
              return (
                <div
                  key={scope}
                  className="flex flex-col gap-2 rounded-lg border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-2xl font-semibold">{count}</div>
                  <Progress value={pct} className="h-1" />
                  <div className="text-xs text-muted-foreground">{pct}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Failed docs (with re-embed) */}
      {failedDocs.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                Failed embeddings ({failedDocs.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                These documents couldn't be processed. Retry to re-embed them.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleReembedAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {failedDocs.slice(0, 10).map((doc) => (
              <div
                key={doc.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {doc.title || doc.filename}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <ScopePill scope={doc.scope as ScopeName} />
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                  </div>
                  {doc.processing_error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1.5 line-clamp-2">
                      {doc.processing_error}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleReembed(doc)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {failedDocs.length > 10 && (
              <div className="text-xs text-muted-foreground text-center pt-1">
                + {failedDocs.length - 10} more failed
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent uploads */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Recent uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentDocs.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No documents uploaded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {doc.title || doc.filename}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <ScopePill scope={doc.scope as ScopeName} />
                        <span>•</span>
                        <span>{doc.chunk_count || 0} chunks</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <StatusPill status={doc.status as DocStatus} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  subtext,
}: {
  label: string;
  value: number | string;
  icon: typeof FileText;
  accent?: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
            <div className={`text-3xl font-semibold mt-1 ${accent || ""}`}>{value}</div>
            {subtext && (
              <div className="text-xs text-muted-foreground mt-1">{subtext}</div>
            )}
          </div>
          <Icon className={`h-5 w-5 ${accent || "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineStat({
  label,
  count,
  icon: Icon,
  accent,
  spinning,
}: {
  label: string;
  count: number;
  icon: typeof Loader2;
  accent?: string;
  spinning?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={`h-4 w-4 ${accent || "text-muted-foreground"} ${spinning && count > 0 ? "animate-spin" : ""}`}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto font-semibold ${accent || ""}`}>{count}</span>
    </div>
  );
}

function ScopePill({ scope }: { scope: ScopeName }) {
  const meta = SCOPE_META[scope];
  if (!meta) return <Badge variant="outline" className="text-xs">{scope}</Badge>;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className="text-xs gap-1 font-normal">
      <Icon className={`h-2.5 w-2.5 ${meta.color}`} />
      {meta.label}
    </Badge>
  );
}

function StatusPill({ status }: { status: DocStatus }) {
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
      <Badge variant="destructive" className="gap-1 text-xs">
        <AlertCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Loader2 className="h-3 w-3 animate-spin" />
      {status === "processing" ? "Processing" : "Pending"}
    </Badge>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
