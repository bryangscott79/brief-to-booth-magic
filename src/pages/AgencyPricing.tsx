// AgencyPricing — agency-level entry point for the pricing engine.
// Route: /agency/pricing
//
// Purpose: pricing is a cross-project capability (rate cards, regional
// factors, supplier feeds) that lives at the agency, not on individual
// projects. This page is the home base — it explains what the engine
// does, lists projects that already have a bill of materials in
// progress, and routes the user into the per-project editor at
// /pricing?project=:id.
//
// Phase 1A scope (now):
//   - Overview of the engine + status badge ("Beta")
//   - List of projects with plan_items rows (grouped by project, with
//     line-item counts and last-edited timestamp)
//   - Empty state explaining how to start a BOM
//   - Roadmap teaser (Phase 1B+: rate cards, AI estimation, blueprint→BOM)
//
// Phase 1B (next): rate-card library, supplier credentials, regional
// adjustment grid, snapshot history all land here.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  ImagePlus,
  Plug,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProjects } from "@/hooks/useProjects";

interface PlanItemRollup {
  project_id: string;
  item_count: number;
  last_updated: string | null;
}

function usePlanItemRollups() {
  return useQuery<PlanItemRollup[]>({
    queryKey: ["agency-pricing", "plan-item-rollups"],
    queryFn: async () => {
      // Light-weight aggregation: pull (project_id, updated_at) and roll
      // up client-side. plan_items is RLS-scoped to the agency, so this
      // returns only what the user is allowed to see.
      const { data, error } = await (supabase.from("plan_items" as any) as any)
        .select("project_id, updated_at")
        .order("updated_at", { ascending: false });

      // Table may not exist yet (Phase 1A migration not applied) — swallow.
      if (error) {
        const msg = String(error.message ?? "");
        if (/does not exist|could not find the table/i.test(msg)) return [];
        throw error;
      }

      const byProject = new Map<string, PlanItemRollup>();
      for (const row of (data ?? []) as Array<{ project_id: string; updated_at: string | null }>) {
        const existing = byProject.get(row.project_id);
        if (existing) {
          existing.item_count += 1;
          if (row.updated_at && (!existing.last_updated || row.updated_at > existing.last_updated)) {
            existing.last_updated = row.updated_at;
          }
        } else {
          byProject.set(row.project_id, {
            project_id: row.project_id,
            item_count: 1,
            last_updated: row.updated_at,
          });
        }
      }
      return Array.from(byProject.values());
    },
    staleTime: 30_000,
  });
}

const ROADMAP_ITEMS = [
  {
    icon: FileSpreadsheet,
    title: "Rate-card import",
    body: "Drop in your supplier price lists or Xactimate exports — Canopy normalizes them into the engine.",
  },
  {
    icon: Sparkles,
    title: "Estimate with AI",
    body: "Describe a line item; the engine returns a unit price with regional adjustment and confidence.",
  },
  {
    icon: ImagePlus,
    title: "Blueprint → BOM",
    body: "Drop a floor plan or a site photo and let the model extract a starting bill of materials.",
  },
  {
    icon: Plug,
    title: "Live supplier feeds",
    body: "Connect commodity, materials, and logistics feeds so totals refresh as markets move.",
  },
];

export default function AgencyPricing() {
  const { projects = [], isLoading: projectsLoading } = useProjects();
  const { data: rollups = [], isLoading: rollupsLoading } = usePlanItemRollups();

  const projectsById = useMemo(() => {
    const map = new Map<string, (typeof projects)[number]>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const projectsWithBoms = useMemo(() => {
    return rollups
      .map((r) => ({ rollup: r, project: projectsById.get(r.project_id) }))
      .filter((row) => !!row.project) as Array<{
        rollup: PlanItemRollup;
        project: (typeof projects)[number];
      }>;
  }, [rollups, projectsById]);

  const isLoading = projectsLoading || rollupsLoading;

  return (
    <AppLayout surface="light">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Pricing</h1>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Beta
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Build accurate cost estimates from your plans. Manage rate cards, regional
              adjustments, and supplier feeds at the agency level — apply them to any project.
            </p>
          </div>
        </div>

        {/* Overview card */}
        <Card>
          <CardContent className="flex flex-col sm:flex-row items-start gap-4 p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calculator className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold mb-1">How it works</h2>
              <p className="text-sm text-muted-foreground mb-3">
                Add line items to a project's bill of materials, choose region and quality
                tier, and the engine returns the best-available unit price for each line.
                Per-project editing happens inside the project; everything below this header —
                rate cards, supplier credentials, regional grids — lives at the agency.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Coverage today is strongest for architecture, construction, and exhibit
                builds. CSI MasterFormat divisions are wired in; Uniformat support is partial.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Projects with active BOMs */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Projects with a bill of materials</h2>
            <Link
              to="/projects"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all projects →
            </Link>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : projectsWithBoms.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Calculator className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="text-sm font-medium mb-1">No bills of materials yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  Start a BOM from any project. Open a project, jump into the spatial planner,
                  then add line items — region and quality tier carry through automatically.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/projects">
                    <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                    Pick a project
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {projectsWithBoms.map(({ project, rollup }) => (
                <Link
                  key={project.id}
                  to={`/pricing?project=${project.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {project.name || "Untitled project"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {rollup.item_count} line item{rollup.item_count === 1 ? "" : "s"}
                      </span>
                      {rollup.last_updated && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span>
                            Updated{" "}
                            {formatDistanceToNow(new Date(rollup.last_updated), {
                              addSuffix: true,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Roadmap */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Coming soon</h2>
          <p className="text-xs text-muted-foreground">
            We're building toward a full Xactimate-class pricing engine for this account.
            These capabilities are planned next:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROADMAP_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-xs">{item.body}</CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
