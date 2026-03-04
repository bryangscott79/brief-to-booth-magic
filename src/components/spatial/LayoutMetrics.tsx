import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Clock,
  TrendingUp,
  Smile,
  Meh,
  Target,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react";
import {
  classifyZoneFunction,
  ZONE_CONSTRAINTS,
  type ZoneFunction,
} from "@/lib/exhibitConstraints";
import type { NormalizedZone } from "@/lib/spatialUtils";

export interface ZoneMetrics {
  zoneId: string;
  zoneName: string;
  trafficPercentage: number;
  avgDwellTime: number; // in seconds
  engagementScore: number; // 0-100
  sentimentScore: number; // -1 to 1
  conversions?: number;
}

export interface LayoutMetricsData {
  overallScore: number;
  totalExpectedVisitors: number;
  avgBoothTime: number; // minutes
  leadProjection: number;
  zoneMetrics: ZoneMetrics[];
  flowEfficiency: number; // 0-100
}

interface LayoutMetricsProps {
  metrics: LayoutMetricsData;
  compact?: boolean;
}

function SentimentIndicator({ score }: { score: number }) {
  if (score > 0.3) {
    return <Smile className="h-4 w-4 text-primary" />;
  } else if (score < -0.3) {
    return <Meh className="h-4 w-4 text-destructive" />;
  }
  return <Meh className="h-4 w-4 text-muted-foreground" />;
}

function TrendIndicator({ value, benchmark }: { value: number; benchmark: number }) {
  const diff = ((value - benchmark) / benchmark) * 100;
  if (diff > 5) {
    return <ArrowUp className="h-3 w-3 text-primary" />;
  } else if (diff < -5) {
    return <ArrowDown className="h-3 w-3 text-destructive" />;
  }
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function LayoutMetrics({ metrics, compact = false }: LayoutMetricsProps) {
  return (
    <div className="space-y-4">
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="element-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Expected Visitors</span>
            </div>
            <div className="text-2xl font-bold">{metrics.totalExpectedVisitors.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">per show day</p>
          </CardContent>
        </Card>

        <Card className="element-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Avg Dwell Time</span>
            </div>
            <div className="text-2xl font-bold">{metrics.avgBoothTime} min</div>
            <p className="text-xs text-muted-foreground">industry avg: 3.5 min</p>
          </CardContent>
        </Card>

        <Card className="element-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Flow Efficiency</span>
            </div>
            <div className="text-2xl font-bold">{metrics.flowEfficiency}%</div>
            <Progress value={metrics.flowEfficiency} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card className="element-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Lead Projection</span>
            </div>
            <div className="text-2xl font-bold">{metrics.leadProjection}</div>
            <p className="text-xs text-muted-foreground">qualified leads/day</p>
          </CardContent>
        </Card>
      </div>

      {/* Zone Breakdown */}
      {!compact && (
        <Card className="element-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Zone Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {metrics.zoneMetrics.map((zone) => (
              <div key={zone.zoneId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{zone.zoneName}</span>
                  <div className="flex items-center gap-2">
                    <SentimentIndicator score={zone.sentimentScore} />
                    <Badge variant="outline" className="text-xs">
                      {zone.engagementScore}% engaged
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {zone.trafficPercentage}% traffic
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.round(zone.avgDwellTime / 60)}:{String(zone.avgDwellTime % 60).padStart(2, '0')} avg
                  </div>
                  <div className="flex items-center gap-1">
                    <TrendIndicator value={zone.engagementScore} benchmark={60} />
                    vs benchmark
                  </div>
                </div>
                <Progress
                  value={zone.engagementScore}
                  className="h-1"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// ZONE PERFORMANCE BENCHMARKS (industry data)
// ============================================

/**
 * Dwell time benchmarks by zone function (seconds).
 * Source: CEIR / industry research on trade show engagement.
 */
const DWELL_TIME_BENCHMARKS: Record<ZoneFunction, { base: number; perSqft: number }> = {
  hero:         { base: 90,  perSqft: 0.5 },   // High engagement, scales with size
  experience:   { base: 120, perSqft: 0.6 },
  reception:    { base: 30,  perSqft: 0.1 },   // Quick pass-through
  welcome:      { base: 25,  perSqft: 0.1 },
  meeting:      { base: 600, perSqft: 0.3 },   // 10+ minutes for meetings
  lounge:       { base: 300, perSqft: 0.4 },   // Casual dwell
  hospitality:  { base: 240, perSqft: 0.3 },
  demo:         { base: 180, perSqft: 0.5 },
  product:      { base: 60,  perSqft: 0.3 },
  storytelling: { base: 120, perSqft: 0.4 },
  storage:      { base: 0,   perSqft: 0 },
  command:      { base: 0,   perSqft: 0 },
  service:      { base: 0,   perSqft: 0 },
  general:      { base: 45,  perSqft: 0.2 },
};

/**
 * Traffic attraction weight by zone function.
 * Higher = more likely to attract walk-by traffic from aisles.
 */
const TRAFFIC_ATTRACTION: Record<ZoneFunction, number> = {
  hero: 10,
  experience: 8,
  reception: 6,
  welcome: 5,
  demo: 7,
  product: 5,
  storytelling: 6,
  lounge: 3,
  hospitality: 4,
  meeting: 1,    // Not outward-facing
  storage: 0,
  command: 0,
  service: 0,
  general: 2,
};

/**
 * Engagement score modifiers by zone function.
 * Reflects depth of interaction (not just visit).
 */
const ENGAGEMENT_BENCHMARKS: Record<ZoneFunction, number> = {
  hero: 72,
  experience: 80,
  reception: 45,
  welcome: 40,
  meeting: 90,    // High conversion zone
  lounge: 75,
  hospitality: 70,
  demo: 85,
  product: 60,
  storytelling: 68,
  storage: 0,
  command: 0,
  service: 15,
  general: 35,
};

/** Sentiment baseline by zone type (-1 to 1) */
const SENTIMENT_BENCHMARKS: Record<ZoneFunction, number> = {
  hero: 0.6,
  experience: 0.7,
  reception: 0.3,
  welcome: 0.4,
  meeting: 0.5,
  lounge: 0.8,
  hospitality: 0.85,
  demo: 0.6,
  product: 0.4,
  storytelling: 0.65,
  storage: 0,
  command: 0,
  service: 0.1,
  general: 0.3,
};

// ============================================
// FORMULA-DRIVEN METRICS GENERATOR
// ============================================

/**
 * Generate layout metrics using formula-driven projections
 * based on zone types, sizes, positions, and layout strategy.
 */
export function generateLayoutMetrics(
  zones: NormalizedZone[],
  layoutType: string = "balanced",
  totalSqft?: number
): LayoutMetricsData {
  const boothSqft = totalSqft || zones.reduce((s, z) => s + z.sqft, 0);

  // === VISITOR PROJECTION ===
  // Industry benchmark: ~0.5-1.0 visitors per sqft per day for well-trafficked shows
  // Modulated by booth size (diminishing returns) and layout type
  const baseVisitorRate = boothSqft <= 400 ? 0.9 : boothSqft <= 900 ? 0.7 : boothSqft <= 1600 ? 0.55 : 0.45;
  const layoutMultiplier = layoutType === "balanced" ? 1.0
    : layoutType === "hero-focused" ? 0.85   // Fewer total but more impactful
    : layoutType === "engagement-first" ? 1.1 // Draws more people in
    : 1.0;
  const totalExpectedVisitors = Math.round(boothSqft * baseVisitorRate * layoutMultiplier);

  // === PER-ZONE METRICS ===
  // Calculate traffic distribution based on attraction weight and position
  // Weighted traffic distribution
  const totalAttractionWeight = zones.reduce((sum, z) => {
    const fn = classifyZoneFunction(z.name);
    const baseWeight = TRAFFIC_ATTRACTION[fn];
    // Position bonus: zones near front (low y) get more traffic
    const positionBonus = z.position.y < 40 ? 1.3 : z.position.y < 60 ? 1.0 : 0.7;
    // Size bonus: larger zones attract slightly more
    const sizeBonus = 1 + (z.percentage / 100) * 0.5;
    return sum + baseWeight * positionBonus * sizeBonus;
  }, 0);

  const zoneMetrics: ZoneMetrics[] = zones.map((zone) => {
    const fn = classifyZoneFunction(zone.name);
    const constraint = ZONE_CONSTRAINTS[fn];
    const dwellBenchmark = DWELL_TIME_BENCHMARKS[fn];

    // Traffic percentage based on weighted attraction
    const positionBonus = zone.position.y < 40 ? 1.3 : zone.position.y < 60 ? 1.0 : 0.7;
    const sizeBonus = 1 + (zone.percentage / 100) * 0.5;
    const weight = TRAFFIC_ATTRACTION[fn] * positionBonus * sizeBonus;
    const trafficPercentage = totalAttractionWeight > 0
      ? Math.round((weight / totalAttractionWeight) * 100)
      : 0;

    // Dwell time: base + per-sqft scaling
    const avgDwellTime = Math.round(dwellBenchmark.base + zone.sqft * dwellBenchmark.perSqft);

    // Engagement score: base + modifiers for size adequacy and staff
    let engagementScore = ENGAGEMENT_BENCHMARKS[fn];
    // Bonus if zone exceeds minimum size (more comfortable = more engaged)
    if (zone.sqft > constraint.minSqft * 1.5) engagementScore += 5;
    if (zone.sqft < constraint.minSqft) engagementScore -= 15; // Cramped = bad engagement
    // Layout type modifiers
    if (layoutType === "engagement-first" && (fn === "meeting" || fn === "lounge" || fn === "demo")) {
      engagementScore += 8;
    }
    if (layoutType === "hero-focused" && fn === "hero") {
      engagementScore += 10;
    }
    engagementScore = Math.max(0, Math.min(100, engagementScore));

    // Sentiment score
    let sentimentScore = SENTIMENT_BENCHMARKS[fn];
    // Cramped zones reduce sentiment
    if (zone.sqft < constraint.minSqft) sentimentScore -= 0.2;
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore));

    return {
      zoneId: zone.id,
      zoneName: zone.name,
      trafficPercentage,
      avgDwellTime,
      engagementScore: Math.round(engagementScore),
      sentimentScore: parseFloat(sentimentScore.toFixed(2)),
    };
  });

  // === OVERALL DWELL TIME ===
  // Weighted average of visitor-facing zone dwell times
  const totalTrafficWeight = zoneMetrics.reduce((s, z) => s + z.trafficPercentage, 0);
  const weightedDwellSeconds = totalTrafficWeight > 0
    ? zoneMetrics.reduce((s, z) => s + z.avgDwellTime * z.trafficPercentage, 0) / totalTrafficWeight
    : 180;
  // Most visitors see 2-3 zones, so multiply by typical zone visits (1.5-2.5)
  const zoneVisitCount = layoutType === "engagement-first" ? 2.5 : layoutType === "hero-focused" ? 1.8 : 2.2;
  const avgBoothTimeMinutes = parseFloat(((weightedDwellSeconds * zoneVisitCount) / 60).toFixed(1));

  // === FLOW EFFICIENCY ===
  // Based on circulation space, zone arrangement, and dead-end avoidance
  const totalZonePct = zones.reduce((s, z) => s + z.percentage, 0);
  const circulationPct = 100 - totalZonePct;
  let flowEfficiency = 70; // Base
  // Circulation sweet spot: 20-30%
  if (circulationPct >= 20 && circulationPct <= 30) flowEfficiency += 15;
  else if (circulationPct >= 15 && circulationPct < 20) flowEfficiency += 5;
  else if (circulationPct < 15) flowEfficiency -= 15;
  else if (circulationPct > 35) flowEfficiency -= 5; // Wasted space
  // Front-loaded zones improve flow (visitors don't have to go deep to engage)
  const frontZoneCount = zones.filter((z) => z.position.y < 50 && TRAFFIC_ATTRACTION[classifyZoneFunction(z.name)] > 3).length;
  flowEfficiency += Math.min(10, frontZoneCount * 3);
  // Layout type bonuses
  if (layoutType === "balanced") flowEfficiency += 5;
  flowEfficiency = Math.max(0, Math.min(100, flowEfficiency));

  // === LEAD PROJECTION ===
  // Conversion funnel: visitors × engagement rate × conversion rate
  const avgEngagement = zoneMetrics.length > 0
    ? zoneMetrics.reduce((s, z) => s + z.engagementScore, 0) / zoneMetrics.length
    : 50;
  // Typical trade show conversion: 8-15% of visitors become leads
  const conversionRate = (avgEngagement / 100) * 0.15;
  const leadProjection = Math.round(totalExpectedVisitors * conversionRate);

  // === OVERALL SCORE ===
  // Weighted composite of flow, engagement, and dwell time adequacy
  const dwellScore = Math.min(100, (avgBoothTimeMinutes / 5) * 100); // 5 min = 100%
  const overallScore = Math.round(
    flowEfficiency * 0.3 +
    avgEngagement * 0.4 +
    dwellScore * 0.3
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    totalExpectedVisitors,
    avgBoothTime: avgBoothTimeMinutes,
    leadProjection,
    zoneMetrics,
    flowEfficiency: Math.round(flowEfficiency),
  };
}
