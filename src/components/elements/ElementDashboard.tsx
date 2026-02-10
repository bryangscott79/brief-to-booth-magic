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
import { supabase } from "@/integrations/supabase/client";
import { ElementDetailPanel } from "./ElementDetailPanel";

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
  const [activeElement, setActiveElement] = useState<ElementType | null>(null);
  const [regeneratingElement, setRegeneratingElement] = useState<ElementType | null>(null);
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

  const generateElement = async (elementType: ElementType, feedback?: string) => {
    setElementStatus(elementType, "generating");

    try {
      const { data, error } = await supabase.functions.invoke("generate-element", {
        body: {
          elementType,
          briefData: currentProject.parsedBrief,
          existingData: feedback ? elements[elementType].data : undefined,
          feedback,
        },
      });

      if (error) throw error;
      
      if (data?.error) {
        throw new Error(data.error);
      }

      setElementData(elementType, data.data);
      toast({ title: `${ELEMENT_META[elementType].title} generated` });
    } catch (e: any) {
      console.error(`Error generating ${elementType}:`, e);
      setElementStatus(elementType, "error");
      toast({
        title: "Generation failed",
        description: e.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const generateAllElements = async () => {
    setIsGenerating(true);

    for (const elementType of ELEMENT_ORDER) {
      await generateElement(elementType);
    }

    setIsGenerating(false);
    toast({
      title: "All elements generated",
      description: "Click any element to review and edit the details.",
    });
  };

  const handleRegenerateFromDetail = async (elementType: ElementType, feedback?: string) => {
    setRegeneratingElement(elementType);
    await generateElement(elementType, feedback);
    setRegeneratingElement(null);
  };

  const handleUpdateField = (elementType: ElementType, path: string, value: any) => {
    const data = { ...elements[elementType].data };
    // Set nested path
    const keys = path.split(".");
    let obj = data;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (Array.isArray(obj[key])) {
        obj[key] = [...obj[key]];
        obj = obj[key];
      } else {
        obj[key] = { ...obj[key] };
        obj = obj[key];
      }
    }
    obj[keys[keys.length - 1]] = value;
    setElementData(elementType, data);
  };

  const handleContinue = () => {
    setActiveStep("spatial");
    navigate("/spatial");
  };

  // Show detail panel if an element is active
  if (activeElement) {
    const element = elements[activeElement];
    return (
      <ElementDetailPanel
        elementType={activeElement}
        data={element.data}
        onBack={() => setActiveElement(null)}
        onRegenerate={(feedback) => handleRegenerateFromDetail(activeElement, feedback)}
        onUpdateField={(path, value) => handleUpdateField(activeElement, path, value)}
        isRegenerating={regeneratingElement === activeElement}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Strategic Elements</h2>
          <p className="text-muted-foreground">
            {completedCount} of {ELEMENT_ORDER.length} elements ready — click any to expand
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
                Generating with AI...
              </>
            ) : completedCount === ELEMENT_ORDER.length ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate All
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate All with AI
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
              onClick={() => {
                if (element.status === "complete") {
                  setActiveElement(elementType);
                }
              }}
              onGenerate={() => generateElement(elementType)}
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
  onClick: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

function ElementCard({ element, meta, onClick, onGenerate, isGenerating }: ElementCardProps) {
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
    <Card 
      className={cn(
        "element-card transition-all",
        element.status === "complete" && "active cursor-pointer",
        element.status === "complete" && "hover:scale-[1.02]"
      )}
      onClick={element.status === "complete" ? onClick : undefined}
    >
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
          <div className="text-xs text-foreground/80 mb-3 line-clamp-3">
            {getPreviewText(element)}
          </div>
        )}

        {element.status === "complete" ? (
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            <span>Click to expand</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onGenerate(); }}
            disabled={isGenerating}
            className="w-full text-xs"
          >
            {element.status === "generating" ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Generating...
              </>
            ) : element.status === "error" ? (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </>
            ) : (
              <>
                <Play className="mr-1 h-3 w-3" />
                Generate
              </>
            )}
          </Button>
        )}
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
      return data.conceptDescription?.slice(0, 120) + "..." || "";
    case "interactiveMechanics":
      return data.hero?.name ? `${data.hero.name} — ${data.hero.concept?.slice(0, 80)}...` : "";
    case "digitalStorytelling":
      return data.philosophy?.slice(0, 120) + "..." || "";
    case "humanConnection":
      return data.scalingNotes?.slice(0, 120) + "..." || "";
    case "adjacentActivations":
      return data.competitivePositioning?.slice(0, 120) + "..." || "";
    case "spatialStrategy":
      return data.scalingStrategy?.conceptIntegrity || "";
    case "budgetLogic":
      return `$${data.totalPerShow?.toLocaleString() || ""}`;
    default:
      return "";
  }
}
