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
 * Generate layout variations from normalized zones with proper spatial math
 */
export function generateLayoutVariations(
  baseZones: NormalizedZone[], 
  footprintSize: string,
  totalSqft: number
): LayoutVariation[] {
  // Create balanced (unchanged) variation
  const balancedValidation = validateSpatialLayout(baseZones, totalSqft);
  const balanced: LayoutVariation = {
    id: "balanced",
    name: "Balanced Flow",
    type: "balanced",
    description: "Optimized for even visitor distribution and smooth traffic flow",
    reasoning: "This layout distributes visitors evenly across all zones, preventing bottlenecks and ensuring every element gets attention. The central hero installation draws initial interest while adjacent zones capture overflow traffic naturally.",
    bestFor: ["High traffic shows", "Brand awareness goals", "Multiple product demos"],
    tradeoffs: ["Less dramatic hero impact", "Requires more staff coverage"],
    score: 92,
    zones: baseZones,
    totalPercentage: balancedValidation.totalPercentage,
    isValid: balancedValidation.valid,
  };

  // Create hero-focused variation
  const heroZones = createLayoutVariation(baseZones, totalSqft, 'hero-focused');
  const heroValidation = validateSpatialLayout(heroZones, totalSqft);
  const heroFocused: LayoutVariation = {
    id: "hero-focused",
    name: "Hero-Centric",
    type: "hero-focused",
    description: "Maximum impact from the central installation with supporting zones",
    reasoning: "Prioritizes the hero installation as the dominant draw, with all other zones arranged to funnel visitors toward the centerpiece. Best for creating memorable 'wow' moments and strong social media presence.",
    bestFor: ["Product launches", "Social media impact", "Award submissions"],
    tradeoffs: ["Longer queue times", "Less lounge capacity"],
    score: 87,
    zones: heroZones,
    totalPercentage: heroValidation.totalPercentage,
    isValid: heroValidation.valid,
  };

  // Create engagement-first variation
  const engagementZones = createLayoutVariation(baseZones, totalSqft, 'engagement-first');
  const engagementValidation = validateSpatialLayout(engagementZones, totalSqft);
  const engagementFirst: LayoutVariation = {
    id: "engagement-first",
    name: "Engagement Maximizer",
    type: "engagement-first",
    description: "Optimized for lead capture and meaningful conversations",
    reasoning: "Expands the lounge and demo areas at the expense of the hero zone, creating more opportunities for 1:1 conversations and product demonstrations. Ideal when lead quality matters more than foot traffic.",
    bestFor: ["B2B sales focus", "Complex products", "Relationship building"],
    tradeoffs: ["Lower foot traffic", "Less visual impact from aisle"],
    score: 84,
    zones: engagementZones,
    totalPercentage: engagementValidation.totalPercentage,
    isValid: engagementValidation.valid,
  };

  return [balanced, heroFocused, engagementFirst];
}
