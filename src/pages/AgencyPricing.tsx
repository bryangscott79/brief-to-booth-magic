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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, IconWell, SectionLabel, SpecMono, StatusChip } from "@/components/shell";
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
        <PageHeader
          eyebrow="Agency · Rate cards &amp; supplier feeds"
          title="Pricing"
          titleAside={<StatusChip variant="generating">Beta</StatusChip>}
          subtitle="Rate cards, regional adjustments, and supplier feeds — applied to any project's bill of materials."
        />

        {/* Overview card */}
        <Card>
          <CardContent className="flex flex-col sm:flex-row items-start gap-4 p-6">
            <IconWell icon={Calculator} size={44} />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-navy mb-1">How it works</h2>
              <p className="text-[13px] leading-[19px] text-slate mb-3">
                Add line items to a project's bill of materials, choose region and quality
                tier, and the engine returns the best-available unit price for each line.
                Per-project editing happens inside the project; everything below this header —
                rate cards, supplier credentials, regional grids — lives at the agency.
              </p>
              <p className="text-xs text-slate-faint">
                Coverage today is strongest for architecture, construction, and exhibit
                builds. CSI MasterFormat divisions are wired in; Uniformat support is partial.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Projects with active BOMs */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <SectionLabel accent="blue">Projects with a bill of materials</SectionLabel>
            <Link
              to="/projects"
              className="text-xs font-medium text-link hover:underline"
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
              <EmptyState
                icon={Calculator}
                title="No bills of materials yet"
                body="Start a BOM from any project — region and quality tier carry through automatically."
                action={
                  <Button asChild size="sm">
                    <Link to="/projects">
                      Pick a project
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {projectsWithBoms.map(({ project, rollup }) => (
                <Link
                  key={project.id}
                  to={`/pricing?project=${project.id}`}
                  className="flex items-center justify-between gap-3 rounded-media border border-cloud-line bg-card px-4 py-3 hover:border-navy/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy truncate">
                      {project.name || "Untitled project"}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate">
                      <span className="inline-flex items-center rounded-full border border-cloud-line bg-white px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight text-navy">
                        {rollup.item_count} line item{rollup.item_count === 1 ? "" : "s"}
                      </span>
                      {rollup.last_updated && (
                        <span>
                          Updated{" "}
                          <SpecMono className="text-[11px]">
                            {formatDistanceToNow(new Date(rollup.last_updated), {
                              addSuffix: true,
                            })}
                          </SpecMono>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Roadmap */}
        <section className="space-y-3">
          <SectionLabel accent="violet">Coming soon</SectionLabel>
          <p className="text-xs text-slate">
            We're building toward a full Xactimate-class pricing engine for this account.
            These capabilities are planned next:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROADMAP_ITEMS.map((item, i) => {
              const isGenerative = item.title === "Estimate with AI";
              return (
                <Card key={item.title} className="border-l-[3px]" style={{ borderLeftColor: ["#8FD3F4", "#A78BFA", "#C084FC", "#F472B6"][i % 4] }}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2.5">
                      <IconWell icon={item.icon} size={28} generative={isGenerative} />
                      <h3 className="text-sm font-semibold text-navy">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-[18px] text-slate">{item.body}</p>
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
