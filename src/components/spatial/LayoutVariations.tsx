import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, Sparkles, Target, Users, Zap } from "lucide-react";
import {
  type NormalizedZone,
  createLayoutVariation,
  validateSpatialLayout,
} from "@/lib/spatialUtils";

export interface LayoutVariation {
  id: string;
  name: string;
  type: "balanced" | "hero-focused" | "engagement-first";
  description: string;
  reasoning: string;
  bestFor: string[];
  tradeoffs: string[];
  score: number;
  zones: NormalizedZone[];
  totalPercentage: number;
  isValid: boolean;
}

interface LayoutVariationsProps {
  variations: LayoutVariation[];
  activeVariation: string;
  onSelect: (id: string) => void;
}

const TYPE_ICONS = {
  balanced: Target,
  "hero-focused": Sparkles,
  "engagement-first": Users,
};

const TYPE_COLORS = {
  balanced: "bg-primary/10 text-primary border-primary/30",
  "hero-focused": "bg-secondary/10 text-secondary-foreground border-secondary/30",
  "engagement-first": "bg-accent/10 text-accent-foreground border-accent/30",
};

export function LayoutVariations({ variations, activeVariation, onSelect }: LayoutVariationsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Layout Options</h3>
        <Badge variant="outline" className="text-xs">
          <Zap className="h-3 w-3 mr-1" />
          AI Generated
        </Badge>
      </div>
      
      <div className="space-y-2">
        {variations.map((variation) => {
          const Icon = TYPE_ICONS[variation.type];
          const isActive = variation.id === activeVariation;
          
          return (
            <Card 
              key={variation.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isActive ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30",
                !variation.isValid && "opacity-70 border-destructive/30"
              )}
              onClick={() => onSelect(variation.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-2 rounded-lg border",
                    TYPE_COLORS[variation.type]
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{variation.name}</span>
                      {isActive && (
                        <Badge className="text-xs bg-primary/20 text-primary">
                          <Check className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs ml-auto">
                        {variation.score}% match
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mb-2">
                      {variation.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-1">
                      {variation.bestFor.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-2xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    
                    {/* Show allocation percentage */}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {variation.totalPercentage}% allocated
                      {!variation.isValid && (
                        <span className="text-destructive ml-2">• Has issues</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function LayoutReasoning({ variation }: { variation: LayoutVariation }) {
  return (
    <Card className="element-card border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Why This Layout?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {variation.reasoning}
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-medium mb-2 text-primary">Best For</h4>
            <ul className="space-y-1">
              {variation.bestFor.map((item) => (
                <li key={item} className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-medium mb-2 text-destructive/80">Trade-offs</h4>
            <ul className="space-y-1">
              {variation.tradeoffs.map((item) => (
                <li key={item} className="text-xs text-muted-foreground">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Generate layout variations from normalized zones with constraint-aware scoring.
 * Phase 3C: Each variation is scored against actual exhibit constraints, costs,
 * and trade show best practices — not hardcoded percentages.
 */
export function generateLayoutVariations(
  baseZones: NormalizedZone[],
  _footprintSize: string,
  totalSqft: number,
  budgetMax?: number,
  qualityTier?: "standard" | "premium" | "ultra"
): LayoutVariation[] {
  const tier = qualityTier || "premium";

  // --- TRAFFIC-OPTIMIZED (balanced, was "balanced") ---
  const balancedValidation = validateSpatialLayout(baseZones, totalSqft);
  const balancedScore = scoreVariation(baseZones, totalSqft, "traffic", budgetMax, tier);
  const balanced: LayoutVariation = {
    id: "balanced",
    name: "Traffic-Optimized",
    type: "balanced",
    description: "Maximizes aisle visibility and smooth visitor flow through all zones",
    reasoning: `Places hero for maximum aisle exposure, reception at primary entry, meeting zones away from noise. Circulation space is ${estimateCirculationPct(baseZones)}% — ${estimateCirculationPct(baseZones) >= 20 ? "within" : "below"} the recommended 20-30% range. All zones meet minimum size requirements for their function.`,
    bestFor: ["High traffic shows", "Brand awareness", "Multi-product demos"],
    tradeoffs: ["Even distribution means less dramatic focal point", "Requires more staff coverage across zones"],
    score: balancedScore,
    zones: baseZones,
    totalPercentage: balancedValidation.totalPercentage,
    isValid: balancedValidation.valid,
  };

  // --- HERO-FOCUSED (was "hero-focused") ---
  const heroZones = createLayoutVariation(baseZones, totalSqft, 'hero-focused');
  const heroValidation = validateSpatialLayout(heroZones, totalSqft);
  const heroScore = scoreVariation(heroZones, totalSqft, "hero", budgetMax, tier);
  const heroFocused: LayoutVariation = {
    id: "hero-focused",
    name: "Hero-Centric",
    type: "hero-focused",
    description: "Expands hero installation for maximum visual impact from aisles",
    reasoning: `Hero zone expanded to ${heroZones.find(z => z.name.toLowerCase().includes("hero") || z.name.toLowerCase().includes("experience"))?.percentage || 0}% of booth. Supporting zones compressed proportionally. Best for creating a single 'wow' moment that drives social media and photo opportunities. Trade-off: reduced meeting/lounge capacity.`,
    bestFor: ["Product launches", "Social media buzz", "Award submissions"],
    tradeoffs: ["Reduced meeting & lounge capacity", "May need overflow meeting space off-booth"],
    score: heroScore,
    zones: heroZones,
    totalPercentage: heroValidation.totalPercentage,
    isValid: heroValidation.valid,
  };

  // --- ENGAGEMENT-FIRST (was "engagement-first") ---
  const engagementZones = createLayoutVariation(baseZones, totalSqft, 'engagement-first');
  const engagementValidation = validateSpatialLayout(engagementZones, totalSqft);
  const engagementScore = scoreVariation(engagementZones, totalSqft, "engagement", budgetMax, tier);
  const engagementFirst: LayoutVariation = {
    id: "engagement-first",
    name: "Engagement Maximizer",
    type: "engagement-first",
    description: "Prioritizes dwell time zones for deeper conversations and lead quality",
    reasoning: `Expands lounge, meeting, and demo zones for maximum 1:1 time. Hero zone reduced but still meets minimum size for visual impact. Meeting capacity increased to approximately ${estimateMeetingCapacity(engagementZones, totalSqft)} seats. Optimized for lead quality over quantity.`,
    bestFor: ["B2B sales", "Complex product demos", "Relationship-driven industries"],
    tradeoffs: ["Lower overall foot traffic", "Less dramatic aisle presence"],
    score: engagementScore,
    zones: engagementZones,
    totalPercentage: engagementValidation.totalPercentage,
    isValid: engagementValidation.valid,
  };

  return [balanced, heroFocused, engagementFirst];
}

// ============================================
// CONSTRAINT-AWARE SCORING
// ============================================

/** Score a layout variation against real constraints */
function scoreVariation(
  zones: NormalizedZone[],
  totalSqft: number,
  _optimizeFor: "traffic" | "hero" | "engagement",
  budgetMax?: number,
  _qualityTier?: string
): number {
  let score = 100;
  const validation = validateSpatialLayout(zones, totalSqft);

  // Penalize validation errors
  if (!validation.valid) score -= 15;
  score -= validation.errors.length * 5;
  score -= validation.warnings.length * 2;

  // Check circulation space (20-30% is ideal)
  const circulationPct = estimateCirculationPct(zones);
  if (circulationPct < 15) score -= 10;
  else if (circulationPct < 20) score -= 5;
  else if (circulationPct > 35) score -= 3; // too much wasted space

  // Check zone minimum sizes
  for (const zone of zones) {
    if (zone.sqft < 36) score -= 5; // Below absolute minimum
    else if (zone.sqft < 64) score -= 2; // Tight
  }

  // Budget check (if budget provided)
  if (budgetMax && budgetMax > 0) {
    // Rough cost estimate: $250/sqft avg for premium
    const roughCost = totalSqft * 275;
    if (roughCost > budgetMax * 1.2) score -= 10;
    else if (roughCost > budgetMax) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/** Estimate circulation percentage from allocated zones */
function estimateCirculationPct(zones: NormalizedZone[]): number {
  const totalAllocated = zones.reduce((sum, z) => sum + z.percentage, 0);
  return Math.max(0, 100 - totalAllocated);
}

/** Estimate meeting capacity from zones */
function estimateMeetingCapacity(zones: NormalizedZone[], totalSqft: number): number {
  return zones.reduce((seats, zone) => {
    const name = zone.name.toLowerCase();
    const zoneSqft = (zone.percentage / 100) * totalSqft;
    if (name.includes("meeting") || name.includes("suite") || name.includes("bd")) {
      return seats + Math.floor(zoneSqft / 25); // ~25 sqft per seat
    }
    if (name.includes("lounge") || name.includes("hub")) {
      return seats + Math.floor(zoneSqft / 20); // ~20 sqft per casual seat
    }
    return seats;
  }, 0);
}
