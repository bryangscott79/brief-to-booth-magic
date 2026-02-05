import { useState } from "react";
import { useProjectStore, ELEMENT_META } from "@/store/projectStore";
import type { ElementType, ElementState } from "@/types/brief";
import { cn } from "@/lib/utils";
import { 
  Play, 
  Check, 
  Loader2, 
  AlertCircle,
  ChevronRight,
  Sparkles,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const ELEMENT_ORDER: ElementType[] = [
  "bigIdea",
  "experienceFramework",
  "interactiveMechanics",
  "digitalStorytelling",
  "humanConnection",
  "adjacentActivations",
  "spatialStrategy",
  "budgetLogic",
];

export function ElementDashboard() {
  const { currentProject, setElementStatus, setElementData, setActiveStep } = useProjectStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  if (!currentProject?.parsedBrief) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No brief data available</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/upload")}>
          Upload a Brief
        </Button>
      </div>
    );
  }

  const elements = currentProject.elements;
  const completedCount = ELEMENT_ORDER.filter(
    (type) => elements[type].status === "complete"
  ).length;

  const generateAllElements = async () => {
    setIsGenerating(true);
    
    for (const elementType of ELEMENT_ORDER) {
      setElementStatus(elementType, "generating");
      
      // Simulate AI generation
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock data generation (would be replaced with actual AI calls)
      const mockData = generateMockData(elementType, currentProject.parsedBrief!);
      setElementData(elementType, mockData);
    }
    
    setIsGenerating(false);
    toast({
      title: "All elements generated",
      description: "Review each element or proceed to spatial planning.",
    });
  };

  const regenerateElement = async (elementType: ElementType) => {
    setElementStatus(elementType, "generating");
    await new Promise(resolve => setTimeout(resolve, 800));
    const mockData = generateMockData(elementType, currentProject.parsedBrief!);
    setElementData(elementType, mockData);
    toast({
      title: `${ELEMENT_META[elementType].title} regenerated`,
    });
  };

  const handleContinue = () => {
    setActiveStep("spatial");
    navigate("/spatial");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Generate Elements</h2>
          <p className="text-muted-foreground">
            {completedCount} of {ELEMENT_ORDER.length} elements ready
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={generateAllElements}
            disabled={isGenerating}
            className="btn-glow"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : completedCount === ELEMENT_ORDER.length ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate All
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate All
              </>
            )}
          </Button>
          {completedCount === ELEMENT_ORDER.length && (
            <Button onClick={handleContinue} variant="outline">
              Continue to Spatial
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${(completedCount / ELEMENT_ORDER.length) * 100}%` }}
        />
      </div>

      {/* Elements Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ELEMENT_ORDER.map((elementType) => {
          const element = elements[elementType];
          const meta = ELEMENT_META[elementType];
          
          return (
            <ElementCard
              key={elementType}
              element={element}
              meta={meta}
              onRegenerate={() => regenerateElement(elementType)}
              isGenerating={element.status === "generating"}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ElementCardProps {
  element: ElementState;
  meta: typeof ELEMENT_META[ElementType];
  onRegenerate: () => void;
  isGenerating: boolean;
}

function ElementCard({ element, meta, onRegenerate, isGenerating }: ElementCardProps) {
  const statusStyles = {
    pending: "bg-muted text-muted-foreground",
    generating: "bg-primary/10 text-primary",
    complete: "bg-status-complete/10 text-status-complete",
    error: "bg-destructive/10 text-destructive",
  };

  const statusIcons = {
    pending: null,
    generating: <Loader2 className="h-3 w-3 animate-spin" />,
    complete: <Check className="h-3 w-3" />,
    error: <AlertCircle className="h-3 w-3" />,
  };

  return (
    <Card className={cn(
      "element-card transition-all",
      element.status === "complete" && "active"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <span className="text-2xl">{meta.icon}</span>
          <Badge 
            variant="secondary" 
            className={cn("text-xs", statusStyles[element.status])}
          >
            {statusIcons[element.status]}
            <span className="ml-1 capitalize">{element.status}</span>
          </Badge>
        </div>
        <CardTitle className="text-sm font-medium">{meta.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {meta.description}
        </p>
        
        {element.status === "complete" && element.data && (
          <div className="text-xs text-foreground/80 mb-3 line-clamp-2">
            {getPreviewText(element)}
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isGenerating}
          className="w-full text-xs"
        >
          {element.status === "complete" ? (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              Regenerate
            </>
          ) : element.status === "generating" ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="mr-1 h-3 w-3" />
              Generate
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function getPreviewText(element: ElementState): string {
  const data = element.data;
  if (!data) return "";
  
  switch (element.type) {
    case "bigIdea":
      return data.headline || "";
    case "experienceFramework":
      return data.conceptDescription || "";
    case "interactiveMechanics":
      return data.hero?.name || "";
    case "digitalStorytelling":
      return data.philosophy || "";
    case "humanConnection":
      return data.scalingNotes || "";
    case "adjacentActivations":
      return data.competitivePositioning || "";
    case "spatialStrategy":
      return data.scalingStrategy?.conceptIntegrity || "";
    case "budgetLogic":
      return `$${data.totalPerShow?.toLocaleString() || ""}`;
    default:
      return "";
  }
}

function generateMockData(type: ElementType, brief: any): any {
  const mockData: Record<ElementType, any> = {
    bigIdea: {
      headline: "The Threat You Can't See Is the One That Wins.",
      subheadline: `${brief.brand.name} Makes the Invisible Visible.`,
      narrative: `Every cybersecurity brand sells protection. ${brief.brand.name} sells sight — the ability to see what others can't, before it becomes a crisis. The booth experience transforms abstract digital threats into a tangible, living ecosystem that visitors don't just observe — they influence.`,
      strategicPosition: "Situational awareness experience, not product booth",
      differentiation: "Light, intelligent, participatory space vs. dark fortress aesthetic",
      coreTension: "Control vs. Chaos — when the system is under stress, can you see what matters?",
      briefAlignment: brief.winningCriteria || [],
    },
    experienceFramework: {
      conceptDescription: "A living data landscape where visitors become participants in an unfolding security scenario",
      designPrinciples: [
        { name: "Light Over Dark", description: "Ambient illumination that suggests insight, not fear", briefReference: "Avoid fortress aesthetic" },
        { name: "Participation Over Observation", description: "Every touchpoint invites engagement", briefReference: "Think like experience architects" },
        { name: "Systems Over Products", description: "Show the ecosystem, not the SKUs", briefReference: "Systems thinking framework" },
      ],
      visitorJourney: [
        { stage: "Arrival", description: "Drawn in by ambient data visualization", touchpoints: ["Hero installation", "Welcome desk"], colorCode: "#F59E0B" },
        { stage: "Discovery", description: "Explore interactive threat landscape", touchpoints: ["Storytelling stations", "Demo pods"], colorCode: "#3B82F6" },
        { stage: "Connection", description: "Deep-dive conversations", touchpoints: ["Lounge", "Meeting rooms"], colorCode: "#10B981" },
      ],
      audienceRouting: brief.audiences.map((aud: any) => ({
        persona: aud.name,
        pathway: ["Entry", "Hero", aud.priority === 1 ? "Executive Lounge" : "Demo Station"],
        timing: aud.priority === 1 ? "10-15 min" : "15-25 min",
        keyTouchpoints: [aud.engagementNeeds],
      })),
    },
    interactiveMechanics: {
      hero: {
        name: "The Nexus",
        concept: "A suspended, luminous data sculpture that responds to collective visitor input",
        physicalForm: {
          structure: "Tensioned fabric ceiling with LED array",
          dimensions: "12' x 12' overhead, 8' clear height",
          materials: ["Translucent fabric", "RGB LED matrix", "Gesture sensors"],
          visualLanguage: "Flowing data streams, pulsing nodes, threat indicators",
        },
        interactionModel: [
          { step: 1, name: "Approach", description: "Installation detects presence", userAction: "Walk toward center", systemResponse: "Data flow intensifies in that sector" },
          { step: 2, name: "Engage", description: "Touch interaction point", userAction: "Gesture or touch sensor", systemResponse: "Trigger simulated threat scenario" },
          { step: 3, name: "Resolve", description: "See system response", userAction: "Watch visualization", systemResponse: "Show threat neutralization" },
        ],
        technicalSpecs: {
          displayTechnology: "LED matrix with projection mapping",
          contentEngine: "Real-time generative graphics",
          inputMethod: "Depth cameras + touch sensors",
          simultaneousUsers: "4-8",
          cycleDuration: "90 seconds",
          idleState: "Ambient data flow visualization",
        },
        audienceValue: {
          forExecutives: "Strategic view of threat landscape",
          forTechnical: "Technical deep-dive capability",
          forPartners: "Demonstration of differentiation",
        },
      },
      secondary: [
        { name: "Threat Theater", type: "demo", description: "Guided attack simulation", location: "Adjacent to hero", purpose: "Technical credibility" },
        { name: "Intel Stations", type: "self-service", description: "Industry-specific threat data", location: "Perimeter", purpose: "Lead qualification" },
      ],
    },
    digitalStorytelling: {
      philosophy: "Content adapts to the visitor, not the other way around",
      audienceTracks: brief.audiences.map((aud: any) => ({
        trackName: `${aud.name} Track`,
        targetAudience: aud.description,
        format: aud.priority === 1 ? "Guided presentation" : "Self-directed exploration",
        contentFocus: aud.engagementNeeds,
        tone: aud.priority === 1 ? "Strategic, executive" : "Technical, detailed",
        deliveryMethod: aud.priority === 1 ? "Large display + staff" : "Touch stations",
      })),
      contentModules: [
        { title: "Threat Landscape Overview", description: "Industry-wide security trends", duration: "2 min", reusability: "All shows" },
        { title: "Product Deep-Dives", description: "Technical capability walkthroughs", duration: "5 min each", reusability: "Updateable per show" },
        { title: "Customer Stories", description: "Case studies by vertical", duration: "3 min each", reusability: "Refresh quarterly" },
      ],
      productionNotes: {
        modularity: "All content built in 30-second chapters",
        refreshCycle: "Quarterly updates, show-specific intros",
        guidedVsSelfDirected: "70% self-directed, 30% staff-guided",
      },
    },
    humanConnection: {
      configs: brief.spatial.footprints.map((fp: any) => ({
        footprintSize: fp.size,
        zones: [
          { name: "Executive Lounge", capacity: "4-6", description: "Private conversation space", designFeatures: ["Acoustic panels", "Ambient lighting", "Comfortable seating"], purpose: "CISO meetings" },
          { name: "Quick Connect", capacity: "2-3", description: "Standing conversation pods", designFeatures: ["High tables", "Device charging", "Privacy screens"], purpose: "Fast follow-ups" },
        ],
      })),
      operational: {
        booking: "Pre-scheduled + walk-up availability",
        contentSupport: "Customizable presentation on demand",
        transitionDesign: "Soft barriers, visual cues",
      },
      scalingNotes: "Smaller footprints prioritize quality over quantity — fewer seats, better experience",
    },
    adjacentActivations: {
      activations: [
        {
          name: "CISO Dinner Series",
          type: "primary" as const,
          format: "Intimate dinner for 20-25 executives",
          capacity: "25",
          venueType: "Private dining room",
          venueRecommendations: brief.events.shows.map((show: any) => ({
            show: show.name,
            venues: ["High-end restaurant near venue"],
          })),
          programFormat: "Thought leadership keynote + roundtable discussion",
          atmosphere: "Sophisticated, unhurried, relationship-focused",
          takeaway: "Exclusive content preview + direct executive access",
          briefAlignment: ["Thought leadership positioning", "Executive engagement"],
        },
      ],
      competitivePositioning: "Where competitors host parties, we host conversations",
    },
    spatialStrategy: {
      configs: brief.spatial.footprints.map((fp: any) => ({
        footprintSize: fp.size,
        totalSqft: fp.sqft,
        zones: [
          { id: "hero", name: "Hero Installation", percentage: 25, sqft: fp.sqft * 0.25, colorCode: "#F59E0B", position: { x: 35, y: 10, width: 30, height: 35 }, requirements: ["Central visibility", "Tech infrastructure"], adjacencies: ["storytelling"], notes: "Heart of the experience" },
          { id: "storytelling", name: "Storytelling", percentage: 20, sqft: fp.sqft * 0.2, colorCode: "#3B82F6", position: { x: 10, y: 10, width: 25, height: 40 }, requirements: ["A/V equipment", "Seating"], adjacencies: ["hero", "lounge"], notes: "Audience-adaptive content" },
          { id: "lounge", name: "Human Connection", percentage: 20, sqft: fp.sqft * 0.2, colorCode: "#10B981", position: { x: 65, y: 10, width: 25, height: 40 }, requirements: ["Privacy", "Comfortable seating"], adjacencies: ["hero"], notes: "Executive conversations" },
          { id: "reception", name: "Reception", percentage: 15, sqft: fp.sqft * 0.15, colorCode: "#8B5CF6", position: { x: 35, y: 55, width: 30, height: 20 }, requirements: ["High visibility", "Lead capture"], adjacencies: ["hero"], notes: "First impression" },
          { id: "service", name: "Service/Storage", percentage: 10, sqft: fp.sqft * 0.1, colorCode: "#64748B", position: { x: 10, y: 55, width: 20, height: 20 }, requirements: ["Hidden from view", "Easy access"], adjacencies: [], notes: "Staff support" },
          { id: "demo", name: "Demo Stations", percentage: 10, sqft: fp.sqft * 0.1, colorCode: "#EC4899", position: { x: 70, y: 55, width: 20, height: 20 }, requirements: ["Tech infrastructure", "Staff presence"], adjacencies: ["lounge"], notes: "Technical deep-dives" },
        ],
      })),
      scalingStrategy: {
        whatScalesDown: ["Demo stations", "Lounge capacity"],
        whatEliminates: ["Secondary service area"],
        whatStaysProportional: ["Hero installation", "Reception"],
        conceptIntegrity: "Core experience remains intact at any size",
      },
      materialsAndMood: [
        { material: "Backlit translucent panels", use: "Perimeter walls", feel: "Luminous, inviting" },
        { material: "Brushed aluminum", use: "Structural elements", feel: "Technical precision" },
        { material: "Acoustic fabric", use: "Lounge area", feel: "Warm, private" },
        { material: "Glass/acrylic", use: "Demo stations", feel: "Transparent, modern" },
      ],
      trafficFlow: [
        { from: "aisle", to: "reception", label: "Primary entry" },
        { from: "reception", to: "hero", label: "Natural progression" },
        { from: "hero", to: "storytelling", label: "Content discovery" },
        { from: "hero", to: "lounge", label: "Conversation pathway" },
      ],
    },
    budgetLogic: {
      totalPerShow: brief.budget.perShow || 400000,
      allocation: [
        { category: "Design & Engineering", percentage: 15, amount: (brief.budget.perShow || 400000) * 0.15, description: "Concept, drawings, project management" },
        { category: "Fabrication", percentage: 35, amount: (brief.budget.perShow || 400000) * 0.35, description: "Structure, finishes, custom elements" },
        { category: "A/V & Technology", percentage: 25, amount: (brief.budget.perShow || 400000) * 0.25, description: "Displays, interactives, content" },
        { category: "Graphics & Branding", percentage: 10, amount: (brief.budget.perShow || 400000) * 0.1, description: "Signage, environmental graphics" },
        { category: "Installation & Logistics", percentage: 10, amount: (brief.budget.perShow || 400000) * 0.1, description: "I&D labor, shipping, show services" },
        { category: "Contingency", percentage: 5, amount: (brief.budget.perShow || 400000) * 0.05, description: "Unforeseen costs" },
      ],
      amortization: [
        { showNumber: 1, estimatedCost: brief.budget.perShow || 400000, savings: "Base investment" },
        { showNumber: 2, estimatedCost: (brief.budget.perShow || 400000) * 0.4, savings: "60% savings from reuse" },
        { showNumber: 3, estimatedCost: (brief.budget.perShow || 400000) * 0.35, savings: "65% savings" },
      ],
      riskFactors: [
        { factor: "Technology integration complexity", impact: "Schedule delays, cost overruns", level: "medium" as const },
        { factor: "Shipping logistics", impact: "Damage, delays", level: "low" as const },
        { factor: "Show service costs", impact: "Variable by venue", level: "high" as const },
      ],
    },
  };

  return mockData[type];
}
