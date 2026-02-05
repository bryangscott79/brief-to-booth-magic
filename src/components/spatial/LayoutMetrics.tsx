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
import { cn } from "@/lib/utils";

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

// Generate simulated metrics based on layout
export function generateLayoutMetrics(zones: any[], layoutType: string = "balanced"): LayoutMetricsData {
  const baseVisitors = 450;
  const baseTime = 4.2;
  
  // Adjust based on layout type
  const multipliers: Record<string, { visitors: number; time: number; flow: number }> = {
    balanced: { visitors: 1.0, time: 1.0, flow: 85 },
    "hero-focused": { visitors: 0.9, time: 1.2, flow: 78 },
    "engagement-first": { visitors: 1.1, time: 0.9, flow: 82 },
  };
  
  const mult = multipliers[layoutType] || multipliers.balanced;
  
  const zoneMetrics: ZoneMetrics[] = zones.map((zone) => {
    // Base metrics per zone type
    const zoneDefaults: Record<string, Partial<ZoneMetrics>> = {
      hero: { trafficPercentage: 35, avgDwellTime: 180, engagementScore: 78, sentimentScore: 0.6 },
      storytelling: { trafficPercentage: 20, avgDwellTime: 120, engagementScore: 72, sentimentScore: 0.5 },
      lounge: { trafficPercentage: 18, avgDwellTime: 300, engagementScore: 85, sentimentScore: 0.8 },
      reception: { trafficPercentage: 15, avgDwellTime: 60, engagementScore: 65, sentimentScore: 0.4 },
      demo: { trafficPercentage: 12, avgDwellTime: 240, engagementScore: 88, sentimentScore: 0.7 },
      service: { trafficPercentage: 5, avgDwellTime: 30, engagementScore: 40, sentimentScore: 0.2 },
    };
    
    const defaults = zoneDefaults[zone.id] || zoneDefaults.service;
    
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      trafficPercentage: defaults.trafficPercentage || 10,
      avgDwellTime: defaults.avgDwellTime || 60,
      engagementScore: defaults.engagementScore || 50,
      sentimentScore: defaults.sentimentScore || 0.3,
    };
  });
  
  return {
    overallScore: Math.round(75 + Math.random() * 15),
    totalExpectedVisitors: Math.round(baseVisitors * mult.visitors),
    avgBoothTime: parseFloat((baseTime * mult.time).toFixed(1)),
    leadProjection: Math.round(baseVisitors * mult.visitors * 0.12),
    zoneMetrics,
    flowEfficiency: mult.flow + Math.round(Math.random() * 10 - 5),
  };
}
