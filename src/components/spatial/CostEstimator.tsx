/**
 * CostEstimator — Real-time cost estimation panel for spatial layouts
 *
 * Shows per-zone cost breakdown, running total vs. budget,
 * quality tier selector, and budget optimization suggestions.
 */

import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  estimateZoneCosts,
  validateBudgetFeasibility,
  type QualityTier,
} from "@/lib/exhibitConstraints";
import type { NormalizedZone, BoothDimensions } from "@/lib/spatialUtils";

// ============================================
// PROPS
// ============================================

interface CostEstimatorProps {
  zones: NormalizedZone[];
  boothDimensions: BoothDimensions;
  budgetMax?: number;
  onTierChange?: (tier: QualityTier) => void;
}

// ============================================
// COMPONENT
// ============================================

export function CostEstimator({
  zones,
  boothDimensions,
  budgetMax = 0,
  onTierChange,
}: CostEstimatorProps) {
  const [selectedTier, setSelectedTier] = useState<QualityTier>("premium");
  const totalSqft = boothDimensions.totalSqft;

  const handleTierChange = (tier: QualityTier) => {
    setSelectedTier(tier);
    onTierChange?.(tier);
  };

  // Calculate costs
  const costEstimate = useMemo(
    () => estimateZoneCosts(zones, totalSqft, selectedTier),
    [zones, totalSqft, selectedTier]
  );

  // Budget feasibility
  const budgetCheck = useMemo(
    () => validateBudgetFeasibility(zones, totalSqft, budgetMax || undefined, selectedTier),
    [zones, totalSqft, budgetMax, selectedTier]
  );

  // Budget gauge
  const budget = budgetMax || costEstimate.grandTotal * 1.2; // Default to 120% of estimate if no budget
  const budgetUsage = Math.round((costEstimate.grandTotal / budget) * 100);
  const budgetColor =
    budgetUsage > 100 ? "text-red-500" : budgetUsage > 85 ? "text-yellow-500" : "text-green-500";
  const budgetBarColor =
    budgetUsage > 100 ? "bg-red-500" : budgetUsage > 85 ? "bg-yellow-500" : "bg-green-500";

  // Generate budget optimization suggestions
  const suggestions = useMemo(() => {
    const tips: string[] = [];
    if (budgetUsage > 100) {
      // Find the most expensive zone
      const sortedZones = [...costEstimate.perZone].sort((a, b) => b.total - a.total);
      const topZone = sortedZones[0];
      if (topZone) {
        const savings = Math.round(topZone.total * 0.1);
        tips.push(`Reduce "${topZone.name}" by 10% to save ~$${savings.toLocaleString()}`);
      }
      if (selectedTier === "ultra") {
        tips.push("Switch to Premium tier to reduce costs by ~30-40%");
      } else if (selectedTier === "premium") {
        tips.push("Switch to Standard tier to reduce costs by ~30-40%");
      }
    }
    if (budgetUsage > 85 && budgetUsage <= 100) {
      tips.push("Consider using standard-tier finishes in service/storage zones");
      tips.push("Rent furniture instead of custom builds for meeting zones");
    }
    return tips;
  }, [budgetUsage, costEstimate, selectedTier]);

  return (
    <div className="space-y-4">
      {/* Quality Tier Selector */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Quality Tier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(["standard", "premium", "ultra"] as QualityTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => handleTierChange(tier)}
                className={cn(
                  "p-2 rounded-lg border text-center transition-all text-xs",
                  selectedTier === tier
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="font-medium capitalize">{tier}</div>
                <div className="text-muted-foreground mt-0.5">
                  {tier === "standard" && "$150-200/sqft"}
                  {tier === "premium" && "$250-350/sqft"}
                  {tier === "ultra" && "$400-600/sqft"}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Budget Gauge */}
      <Card className="element-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Estimated Total</span>
            <span className={cn("text-xl font-bold", budgetColor)}>
              ${costEstimate.grandTotal.toLocaleString()}
            </span>
          </div>

          {budgetMax > 0 && (
            <>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={cn("h-full rounded-full transition-all", budgetBarColor)}
                  style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                />
                {/* Budget limit marker */}
                <div className="absolute top-0 right-0 h-full w-0.5 bg-foreground/30" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{budgetUsage}% of budget</span>
                <span>Budget: ${budgetMax.toLocaleString()}</span>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 mt-3 text-xs">
            {budgetUsage <= 85 ? (
              <Badge variant="outline" className="text-green-500 border-green-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Within Budget
              </Badge>
            ) : budgetUsage <= 100 ? (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Approaching Limit
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-500 border-red-500/30">
                <TrendingUp className="h-3 w-3 mr-1" />
                Over Budget by ${(costEstimate.grandTotal - budget).toLocaleString()}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs ml-auto">
              ${costEstimate.costPerSqft}/sqft avg
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Per-Zone Breakdown */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Zone Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {costEstimate.perZone.map((zone) => {
            const zoneSqft = zones.find((z) => z.name === zone.name)?.sqft || 0;
            const costPerSqft = zoneSqft > 0 ? Math.round(zone.total / zoneSqft) : 0;
            return (
              <div key={zone.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{zone.name}</span>
                  <span className="text-xs font-bold">${zone.total.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${(zone.total / costEstimate.grandTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-2xs text-muted-foreground w-16 text-right">
                    ${costPerSqft}/sqft
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-2xs">
                    Build: ${zone.structure.toLocaleString()}
                  </Badge>
                  {zone.technology > 0 && (
                    <Badge variant="secondary" className="text-2xs">
                      Tech: ${zone.technology.toLocaleString()}
                    </Badge>
                  )}
                  {zone.furniture > 0 && (
                    <Badge variant="secondary" className="text-2xs">
                      FF&E: ${zone.furniture.toLocaleString()}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Budget Suggestions */}
      {suggestions.length > 0 && (
        <Card className="element-card border-yellow-500/20 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Budget Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <TrendingDown className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                <span className="text-xs text-muted-foreground">{tip}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feasibility Warnings */}
      {budgetCheck.length > 0 && (
        <div className="space-y-1">
          {budgetCheck
            .filter((v) => v.severity !== "info")
            .map((v, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 p-2 rounded text-xs",
                  v.severity === "error" ? "bg-red-500/10 text-red-500" : "bg-yellow-500/10 text-yellow-600"
                )}
              >
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{v.message}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
