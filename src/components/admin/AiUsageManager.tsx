// AiUsageManager — super-admin AI usage + cost reporting panel.
//
// Layout:
//   1. Date-range chips + 6 fleet stats (cost, calls, tokens, agencies, users, in/out split)
//   2. Agency leaderboard sorted by cost
//   3. Cross-agency user leaderboard sorted by cost
//   4. Feature × model breakdown sorted by cost
//
// Data comes from the Lovable-authored RPCs in
// supabase/migrations/20260507214400_*.sql (signatures: _from / _to,
// columns: calls / total_tokens / cost_usd). Aggregations are global —
// per-agency drill-in is reachable from the leaderboard click later
// when more granular RPCs land.

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Activity,
  TrendingUp,
  Users,
  Building2,
  Sparkles,
  AlertCircle,
  FileText,
  ChevronRight,
} from "lucide-react";
import {
  useAiUsageFleetTotals,
  useAiUsageByAgency,
  useAiUsageByUser,
  useAiUsageByFeature,
  rangeFromPreset,
} from "@/hooks/useAiUsage";

type RangePreset = "today" | "7d" | "30d" | "90d";

const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function AiUsageManager() {
  const [preset, setPreset] = useState<RangePreset>("30d");

  const range = useMemo(() => rangeFromPreset(preset), [preset]);

  const fleet = useAiUsageFleetTotals(range);
  const byAgency = useAiUsageByAgency(range);
  const byUser = useAiUsageByUser(range);
  const byFeature = useAiUsageByFeature(range);

  const isLoading =
    fleet.isLoading || byAgency.isLoading || byUser.isLoading || byFeature.isLoading;
  const error = fleet.error ?? byAgency.error ?? byUser.error ?? byFeature.error;

  return (
    <div className="space-y-6">
      {/* Header + range chips */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            AI Usage &amp; Cost
          </h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Per-call telemetry across Anthropic, OpenAI, Google direct, and the Lovable
            gateway. Cost is computed at write time from the gateway's pricing rate
            table — historical rows preserve their original price.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          {(Object.keys(RANGE_LABELS) as RangePreset[]).map((p) => (
            <Button
              key={p}
              variant={preset === p ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPreset(p)}
            >
              {RANGE_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* Error surface — turns "function not found" into actionable text. */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="min-w-0 break-words">{(error as Error).message}</div>
            </div>
            {/exist|not found|404/i.test((error as Error).message) && (
              <div className="text-[11px] text-muted-foreground pl-6">
                The <code className="font-mono">ai_usage_*</code> RPCs come from the
                ai_usage_events migration. Apply the migrations under
                <code className="font-mono mx-1">supabase/migrations/</code> via the
                Supabase dashboard or your deploy pipeline, then refresh.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fleet stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={TrendingUp}
          label="Total cost"
          value={isLoading ? "…" : formatUsd(fleet.data?.total_cost_usd ?? 0)}
        />
        <StatCard
          icon={Activity}
          label="Calls"
          value={isLoading ? "…" : (fleet.data?.total_calls ?? 0).toLocaleString()}
        />
        <StatCard
          icon={FileText}
          label="Tokens"
          value={
            isLoading
              ? "…"
              : formatTokens(
                  (fleet.data?.total_input_tokens ?? 0) +
                    (fleet.data?.total_output_tokens ?? 0),
                )
          }
          hint={
            fleet.data
              ? `${formatTokens(fleet.data.total_input_tokens)} in · ${formatTokens(fleet.data.total_output_tokens)} out`
              : undefined
          }
        />
        <StatCard
          icon={Building2}
          label="Agencies"
          value={isLoading ? "…" : (fleet.data?.unique_agencies ?? 0).toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Users"
          value={isLoading ? "…" : (fleet.data?.unique_users ?? 0).toLocaleString()}
        />
        <StatCard
          icon={Sparkles}
          label="Range"
          value={RANGE_LABELS[preset]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agency leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              By agency
            </CardTitle>
            <CardDescription className="text-xs">
              Sorted by cost over the selected range.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <div className="px-2 pb-3 space-y-1">
                {byAgency.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                )}
                {!byAgency.isLoading && (byAgency.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No agency activity in this window.
                  </p>
                )}
                {(byAgency.data ?? []).map((row) => (
                  <div
                    key={row.agency_id ?? "unattributed"}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {row.agency_name ?? <span className="italic text-muted-foreground">Unattributed</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.calls.toLocaleString()} call{row.calls === 1 ? "" : "s"} ·{" "}
                        {formatTokens(row.total_tokens)} tokens
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{formatUsd(row.cost_usd)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* User leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              By user
            </CardTitle>
            <CardDescription className="text-xs">
              Cross-agency totals — every user that triggered an AI call.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <div className="px-2 pb-3 space-y-1">
                {byUser.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                )}
                {!byUser.isLoading && (byUser.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No user activity in this window.
                  </p>
                )}
                {(byUser.data ?? []).map((row) => (
                  <div
                    key={row.user_id ?? "unattributed"}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {row.user_email ?? <span className="italic text-muted-foreground">Unknown user</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.calls.toLocaleString()} call{row.calls === 1 ? "" : "s"} ·{" "}
                        {formatTokens(row.total_tokens)} tokens
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">{formatUsd(row.cost_usd)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Feature breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            By feature × model
          </CardTitle>
          <CardDescription className="text-xs">
            Where the spend goes. Each row is a feature/model combination; the sum across
            rows matches total cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {byFeature.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
          {!byFeature.isLoading && (byFeature.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No feature activity in this window.
            </p>
          )}
          <div className="space-y-1">
            {(byFeature.data ?? []).map((f, idx) => (
              <div
                key={`${f.feature}-${f.model ?? "unknown"}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
              >
                <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs truncate">{f.feature}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  <Badge variant="outline" className="text-[10px]">
                    {f.model ?? "—"}
                  </Badge>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{formatUsd(f.cost_usd)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {f.calls.toLocaleString()} · {formatTokens(f.total_tokens)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
