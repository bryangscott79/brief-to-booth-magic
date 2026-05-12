// BriefReadinessPanel — visualizes the briefReadiness report.
//
// Two modes:
//   • "banner" (compact, horizontal) — sits at the top of the Prompts
//     page as a pre-flight before "Generate Hero". Surfaces the score
//     + top 3 gaps. Click "Show details" to expand.
//   • "panel" (vertical, full checklist) — lives in the Spatial step's
//     side rail so the user can fix gaps in context.
//
// Each gap row is clickable and routes the user to the surface that
// owns the gap (brief / review / elements / spatial / materials /
// prompts) via the consumer's onJump callback.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  evaluateBriefReadiness,
  type ReadinessInputs,
  type CheckResult,
  type ReadinessReport,
} from "@/lib/briefReadiness";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BriefReadinessPanelProps {
  inputs: ReadinessInputs;
  /** "banner" sits at the top of a step; "panel" is the side rail. */
  variant?: "banner" | "panel";
  /** Called when the user clicks a gap row. The consumer decides
   *  what jumping means — usually navigate to the right step. */
  onJump?: (gap: CheckResult) => void;
  /** Optional className override for layout integration. */
  className?: string;
}

export function BriefReadinessPanel({
  inputs,
  variant = "banner",
  onJump,
  className,
}: BriefReadinessPanelProps) {
  // Memoize so the score doesn't recompute on unrelated parent renders.
  // The inputs object identity stability is the caller's responsibility.
  const report: ReadinessReport = useMemo(
    () => evaluateBriefReadiness(inputs),
    [inputs],
  );

  const [expanded, setExpanded] = useState(variant === "panel");

  const tone =
    report.score >= 85
      ? "emerald"
      : report.score >= 65
      ? "amber"
      : "destructive";

  const ToneIcon =
    report.score >= 85
      ? CheckCircle2
      : report.score >= 65
      ? AlertCircle
      : AlertTriangle;

  if (variant === "banner") {
    return (
      <Card
        className={cn(
          "border-2",
          tone === "emerald" && "border-emerald-500/40 bg-emerald-500/5",
          tone === "amber" && "border-amber-500/40 bg-amber-500/5",
          tone === "destructive" && "border-destructive/40 bg-destructive/5",
          className,
        )}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                tone === "emerald" && "bg-emerald-500/15 text-emerald-600",
                tone === "amber" && "bg-amber-500/15 text-amber-600",
                tone === "destructive" && "bg-destructive/15 text-destructive",
              )}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  Brief readiness: {report.score}/100
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    tone === "emerald" && "border-emerald-500/30 text-emerald-700",
                    tone === "amber" && "border-amber-500/30 text-amber-700",
                    tone === "destructive" && "border-destructive/30 text-destructive",
                  )}
                >
                  {report.score >= 85
                    ? "Tight prompt ready"
                    : report.score >= 65
                    ? "Generates OK — gaps below"
                    : "Will produce generic renders"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {report.topGaps.length > 0
                  ? `Top ${report.topGaps.length} gap${report.topGaps.length === 1 ? "" : "s"} to fix:`
                  : "All checks pass — the prompt has everything the model needs."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show details
                </>
              )}
            </Button>
          </div>

          {/* Top gaps — always visible in banner mode when score < 85
              and there are gaps. */}
          {!expanded && report.topGaps.length > 0 && (
            <div className="space-y-1.5">
              {report.topGaps.map((gap) => (
                <GapRow key={gap.id} gap={gap} onJump={onJump} />
              ))}
            </div>
          )}

          {expanded && (
            <FullChecklist report={report} onJump={onJump} />
          )}
        </CardContent>
      </Card>
    );
  }

  // Panel variant — fixed-height side rail with full checklist.
  return (
    <Card className={cn("element-card", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ToneIcon
            className={cn(
              "h-4 w-4",
              tone === "emerald" && "text-emerald-500",
              tone === "amber" && "text-amber-500",
              tone === "destructive" && "text-destructive",
            )}
          />
          Brief readiness: {report.score}/100
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          How tight the prompt will be. Click any row to jump and fix.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <FullChecklist report={report} onJump={onJump} />
      </CardContent>
    </Card>
  );
}

// ─── Internals ─────────────────────────────────────────────────────────────

function FullChecklist({
  report,
  onJump,
}: {
  report: ReadinessReport;
  onJump?: (gap: CheckResult) => void;
}) {
  return (
    <div className="space-y-3">
      {report.groups.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground uppercase tracking-wide">
              {group.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {group.earned}/{group.total}
            </span>
          </div>
          <div className="space-y-1">
            {group.checks.map((c) => (
              <GapRow key={c.id} gap={c} onJump={onJump} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GapRow({
  gap,
  onJump,
}: {
  gap: CheckResult;
  onJump?: (gap: CheckResult) => void;
}) {
  const passing = gap.severity === "pass";
  const interactive = !!onJump && !passing && !!gap.jumpTo;
  const Wrapper: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={interactive ? () => onJump?.(gap) : undefined}
      className={cn(
        "w-full text-left flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
        passing
          ? "text-muted-foreground"
          : gap.severity === "warn"
          ? "text-amber-700 bg-amber-500/5 hover:bg-amber-500/10"
          : "text-destructive bg-destructive/5 hover:bg-destructive/10",
        interactive && "cursor-pointer",
      )}
    >
      {passing ? (
        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />
      ) : gap.severity === "warn" ? (
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-medium">{gap.label}</span>
          <span className="font-mono text-[10px] opacity-60">
            +{gap.earned}/{gap.weight}
          </span>
        </div>
        <p className="text-[11px] opacity-90 leading-tight">{gap.message}</p>
        {!passing && gap.fixHint && (
          <p className="text-[11px] opacity-70 leading-tight mt-0.5">
            → {gap.fixHint}
          </p>
        )}
      </div>
    </Wrapper>
  );
}
