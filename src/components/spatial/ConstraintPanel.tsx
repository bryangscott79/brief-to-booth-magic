/**
 * ConstraintPanel — Real-time spatial constraint validation display
 *
 * Shows ADA compliance, zone minimum sizes, circulation space,
 * sightline analysis, and utility requirements based on the
 * exhibitConstraints library.
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Accessibility,
  Ruler,
  Eye,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  validateZoneMinimums,
  validateCirculationSpace,
  calculateUtilityRequirements,
  validateSightlines,
  validateFullLayout,
  ADA_REQUIREMENTS,
  classifyZoneFunction,
  ZONE_CONSTRAINTS,
} from "@/lib/exhibitConstraints";
import type { NormalizedZone, BoothDimensions } from "@/lib/spatialUtils";

// ============================================
// PROPS
// ============================================

interface ConstraintPanelProps {
  zones: NormalizedZone[];
  boothDimensions: BoothDimensions;
  compact?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function ConstraintPanel({ zones, boothDimensions, compact = false }: ConstraintPanelProps) {
  const totalSqft = boothDimensions.totalSqft;

  // Run all validations
  const validationResults = useMemo(() => {
    const zoneMinimums = validateZoneMinimums(zones, totalSqft);
    const circulation = validateCirculationSpace(zones, totalSqft);
    const utilities = calculateUtilityRequirements(zones);
    const sightlines = validateSightlines(zones, boothDimensions.width, boothDimensions.depth);
    const fullLayout = validateFullLayout(zones, totalSqft, boothDimensions.width, boothDimensions.depth);

    // Calculate total staff from zone constraints
    const totalStaff = zones.reduce((sum, z) => {
      const fn = classifyZoneFunction(z.name);
      const constraint = ZONE_CONSTRAINTS[fn];
      return sum + constraint.staffCount.min;
    }, 0);

    return { zoneMinimums, circulation, utilities, sightlines, fullLayout, totalStaff };
  }, [zones, totalSqft, boothDimensions.width, boothDimensions.depth]);

  // Aggregate all issues
  const allIssues = validationResults.fullLayout;
  const errors = allIssues.filter((v) => v.severity === "error");
  const warnings = allIssues.filter((v) => v.severity === "warning");
  const infos = allIssues.filter((v) => v.severity === "info");

  // Calculate overall health score
  const healthScore = Math.max(0, 100 - errors.length * 20 - warnings.length * 5 - infos.length * 1);
  const healthColor = healthScore >= 80 ? "text-green-500" : healthScore >= 60 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="space-y-4">
      {/* Health Score */}
      <Card className="element-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className={cn("h-5 w-5", healthColor)} />
              <span className="text-sm font-medium">Layout Health</span>
            </div>
            <span className={cn("text-2xl font-bold", healthColor)}>{healthScore}</span>
          </div>
          <Progress value={healthScore} className="h-2" />
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {errors.length > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="h-3 w-3" /> {errors.length} errors
              </span>
            )}
            {warnings.length > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="h-3 w-3" /> {warnings.length} warnings
              </span>
            )}
            {errors.length === 0 && warnings.length === 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <CheckCircle2 className="h-3 w-3" /> All checks passed
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Issue List */}
      {(errors.length > 0 || warnings.length > 0) && (
        <Card className="element-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Issues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {errors.map((issue, i) => (
              <div key={`error-${i}`} className="flex items-start gap-2 p-2 rounded bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-500">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-xs text-muted-foreground mt-0.5">{issue.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
            {warnings.map((issue, i) => (
              <div key={`warn-${i}`} className="flex items-start gap-2 p-2 rounded bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-yellow-600">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-xs text-muted-foreground mt-0.5">{issue.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!compact && (
        <>
          {/* ADA Compliance */}
          <Card className="element-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Accessibility className="h-4 w-4" />
                ADA Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ADA_REQUIREMENTS.map((req, idx) => {
                // Match ADA issues by checking if any validation message references this rule
                const hasIssue = allIssues.some(
                  (v) => v.category === "ada" || v.message.toLowerCase().includes(req.rule.toLowerCase().substring(0, 15))
                );
                return (
                  <div key={idx} className="flex items-center gap-2">
                    {hasIssue ? (
                      <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground">{req.rule}</span>
                    <Badge variant="outline" className="text-2xs ml-auto">{req.measurement}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Zone Size Compliance */}
          <Card className="element-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Zone Sizing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {validationResults.zoneMinimums.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  {v.severity === "error" ? (
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  ) : v.severity === "warning" ? (
                    <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground">{v.message}</span>
                </div>
              ))}
              {validationResults.zoneMinimums.length === 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-muted-foreground">All zones meet minimum size requirements</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sightlines */}
          <Card className="element-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Sightlines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {validationResults.sightlines.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  {v.severity === "warning" ? (
                    <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground">{v.message}</span>
                </div>
              ))}
              {validationResults.sightlines.length === 0 && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-muted-foreground">Hero installation has clear sightlines from aisles</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Utility Requirements */}
          <Card className="element-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Utility Estimate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold">{validationResults.utilities.totalWatts.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Watts</p>
                </div>
                <div>
                  <div className="text-lg font-bold">{validationResults.utilities.dataDrops}</div>
                  <p className="text-xs text-muted-foreground">Data Drops</p>
                </div>
                <div>
                  <div className="text-lg font-bold">{validationResults.totalStaff}</div>
                  <p className="text-xs text-muted-foreground">Min Staff</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold">{validationResults.utilities.totalAmps20}</div>
                  <p className="text-xs text-muted-foreground">20A Circuits</p>
                </div>
                <div>
                  <div className="text-sm font-bold">{validationResults.utilities.dedicatedCircuits}</div>
                  <p className="text-xs text-muted-foreground">Dedicated Circuits</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
