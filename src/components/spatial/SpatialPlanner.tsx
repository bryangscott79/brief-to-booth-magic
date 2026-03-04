import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  Maximize2,
  Download,
  Eye,
  EyeOff,
  TrendingUp,
  Layers,
  Sparkles,
  Loader2,
  ImageIcon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useState, useMemo, useCallback } from "react";
import { LayoutMetrics, generateLayoutMetrics } from "./LayoutMetrics";
import { FlowOverlay, generateFlowPaths } from "./FlowOverlay";
import { LayoutVariations, LayoutReasoning, generateLayoutVariations } from "./LayoutVariations";
import { InspirationUpload, type InspirationImage } from "./InspirationUpload";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { FloorPlanAnnotations, type FloorPlanAnnotation } from "./FloorPlanAnnotations";
import { ConstraintPanel } from "./ConstraintPanel";
import { CostEstimator } from "./CostEstimator";
import type { QualityTier } from "@/lib/exhibitConstraints";
import { supabase } from "@/integrations/supabase/client";
import { useProjectImages, useSaveRenderImage } from "@/hooks/useProjectImages";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { saveProjectField } from "@/hooks/useProjectSync";

// Import spatial utilities
import {
  calculateBoothDimensions,
  normalizeZones,
  validateSpatialLayout,
  generateScaleContext,
  type NormalizedZone,
  type ValidationResult,
  type BoothDimensions,
} from "@/lib/spatialUtils";

// Zone color palette
const ZONE_PALETTE = [
  { bg: "rgba(0, 71, 171, 0.45)", border: "rgba(0, 71, 171, 0.9)", text: "#002D6B" },
  { bg: "rgba(70, 130, 180, 0.45)", border: "rgba(70, 130, 180, 0.9)", text: "#2A6496" },
  { bg: "rgba(47, 79, 79, 0.45)", border: "rgba(47, 79, 79, 0.9)", text: "#1A3A3A" },
  { bg: "rgba(218, 165, 32, 0.45)", border: "rgba(218, 165, 32, 0.9)", text: "#8B6914" },
  { bg: "rgba(139, 69, 19, 0.45)", border: "rgba(139, 69, 19, 0.9)", text: "#6B3410" },
  { bg: "rgba(85, 107, 47, 0.45)", border: "rgba(85, 107, 47, 0.9)", text: "#3A4A20" },
  { bg: "rgba(128, 0, 128, 0.45)", border: "rgba(128, 0, 128, 0.9)", text: "#5C005C" },
  { bg: "rgba(176, 60, 60, 0.45)", border: "rgba(176, 60, 60, 0.9)", text: "#7A2020" },
];

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(100, 100, 100, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getZoneColors(zone: NormalizedZone, index: number) {
  if (zone.colorCode && zone.colorCode.startsWith('#')) {
    return {
      bg: hexToRgba(zone.colorCode, 0.45),
      border: hexToRgba(zone.colorCode, 0.9),
      text: zone.colorCode,
    };
  }
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

// Validation Panel Component
function ValidationPanel({ validation }: { validation: ValidationResult }) {
  if (validation.valid && validation.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary p-3 bg-primary/5 rounded-lg border border-primary/20">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>Layout validated — {validation.totalPercentage}% allocated across {validation.normalizedZones.length} zones</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
      <div className="text-sm font-medium flex items-center gap-2">
        {validation.errors.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        )}
        Layout Issues ({validation.errors.length} errors, {validation.warnings.length} warnings)
      </div>
      
      {validation.errors.map((error, i) => (
        <div key={`e-${i}`} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ))}
      
      {validation.warnings.map((warning, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 text-sm text-amber-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

export function SpatialPlanner() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [activeFootprint, setActiveFootprint] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showFlow, setShowFlow] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [activeVariation, setActiveVariation] = useState("balanced");
  const [inspirationImages, setInspirationImages] = useState<InspirationImage[]>([]);
  const [activeTab, setActiveTab] = useState<"layout" | "metrics" | "constraints" | "costs">("layout");
  const [selectedZone, setSelectedZone] = useState<{ zone: NormalizedZone; colors: any } | null>(null);
  const [floorPlanView, setFloorPlanView] = useState<"blocks" | "render">("blocks");
  const [floorPlanImage, setFloorPlanImage] = useState<string | null>(null);
  const [isGeneratingFloorPlan, setIsGeneratingFloorPlan] = useState(false);
  const [floorPlanAnnotations, setFloorPlanAnnotations] = useState<FloorPlanAnnotation[]>([]);
  const [qualityTier, setQualityTier] = useState<QualityTier>("premium");

  const { data: savedImages = [] } = useProjectImages(projectId);
  const saveImage = useSaveRenderImage(projectId);

  const spatialData = currentProject?.elements.spatialStrategy.data;
  const currentConfig = spatialData?.configs?.[activeFootprint];
  const brief = currentProject?.parsedBrief;
  const bigIdea = currentProject?.elements.bigIdea.data;

  // Calculate booth dimensions with proper aspect ratio
  const boothDimensions: BoothDimensions = useMemo(() => {
    const footprintStr = currentConfig?.footprintSize || 
      brief?.spatial?.footprints?.[activeFootprint]?.size || 
      "30x30";
    return calculateBoothDimensions(footprintStr);
  }, [currentConfig, brief, activeFootprint]);

  // Normalize and validate zones
  const { normalizedZones, validation } = useMemo(() => {
    if (!currentConfig?.zones) {
      return { 
        normalizedZones: [], 
        validation: { valid: false, errors: ['No zones defined'], warnings: [], normalizedZones: [], totalPercentage: 0, totalSqft: 0 }
      };
    }
    
    const normalized = normalizeZones(currentConfig.zones, boothDimensions.totalSqft);
    const validationResult = validateSpatialLayout(normalized, boothDimensions.totalSqft);
    
    return { normalizedZones: normalized, validation: validationResult };
  }, [currentConfig, boothDimensions.totalSqft]);

  // Hydrate floor plan from saved images
  useMemo(() => {
    const saved = savedImages.find(img => img.angle_id === "floor_plan_2d" && img.is_current);
    if (saved && !floorPlanImage) setFloorPlanImage(saved.public_url);
  }, [savedImages]);

  // Hydrate annotations from spatial data
  useMemo(() => {
    const saved = spatialData?.floorPlanAnnotations;
    if (saved && Array.isArray(saved) && floorPlanAnnotations.length === 0) {
      setFloorPlanAnnotations(saved);
    }
  }, [spatialData]);
  
  // Extract budget from brief
  const budgetMax = useMemo(() => {
    const budgetRange = brief?.budget?.range;
    const perShow = brief?.budget?.perShow;
    return perShow || (budgetRange ? budgetRange.max : 0);
  }, [brief]);

  // Generate layout variations using normalized zones
  const variations = useMemo(() => {
    if (normalizedZones.length === 0) return [];
    return generateLayoutVariations(
      normalizedZones,
      currentConfig?.footprintSize || "30x30",
      boothDimensions.totalSqft,
      budgetMax || undefined,
      qualityTier
    );
  }, [normalizedZones, currentConfig, boothDimensions.totalSqft, budgetMax, qualityTier]);
  
  const activeLayout = useMemo(() => 
    variations.find(v => v.id === activeVariation) || variations[0],
    [variations, activeVariation]
  );
  
  const metrics = useMemo(() => {
    if (!activeLayout?.zones) return null;
    return generateLayoutMetrics(activeLayout.zones, activeLayout.type, boothDimensions.totalSqft);
  }, [activeLayout, boothDimensions.totalSqft]);
  
  const flowPaths = useMemo(() => {
    if (!activeLayout?.zones) return [];
    return generateFlowPaths(activeLayout.zones);
  }, [activeLayout?.zones]);

  const handleGenerateFloorPlan = useCallback(async () => {
    if (!currentConfig || !activeLayout) {
      toast({ title: "Missing data", description: "Spatial layout data is required to generate a floor plan.", variant: "destructive" });
      return;
    }
    setIsGeneratingFloorPlan(true);

    const scaleContext = generateScaleContext(boothDimensions.footprintLabel);

    const zoneDescriptions = activeLayout.zones
      .map((z: NormalizedZone) => `- ${z.name}: ${z.percentage}% (${z.sqft} sq ft) — positioned at ${Math.round(z.position.x)}% from left, ${Math.round(z.position.y)}% from top, ${Math.round(z.position.width)}% wide × ${Math.round(z.position.height)}% deep`)
      .join("\n");

    const heroName = currentProject?.elements.interactiveMechanics?.data?.hero?.name || "Hero installation";
    const materials = spatialData?.materialsAndMood?.map((m: any) => `${m.material}: ${m.feel}`).join(", ") || "";

    const variationContext = `LAYOUT STRATEGY: "${activeLayout.name}" (${activeLayout.score}% match)
- ${activeLayout.description}
- Optimized for: ${activeLayout.bestFor.join(", ")}`;

    const annotationBlock = floorPlanAnnotations.length > 0
      ? `\nUSER FEEDBACK (CRITICAL — apply all of these changes):\n${floorPlanAnnotations.map((a, i) => `${i + 1}. At position (${Math.round(a.x)}% from left, ${Math.round(a.y)}% from top): "${a.comment}"`).join("\n")}`
      : "";

    const prompt = `Generate a professional top-down 2D booth floor plan for a ${boothDimensions.width}' × ${boothDimensions.depth}' (${boothDimensions.totalSqft} sq ft) trade show exhibit for ${brief?.brand?.name || "client"}.

STYLE: Black-and-white technical architectural floor plan on light blue graph-paper background. Bird's-eye view looking STRAIGHT DOWN. Clean black outlines. NO color fills, NO 3D, NO perspective — purely flat 2D blueprint.

${scaleContext}

${variationContext}

ZONE LAYOUT (with exact positions):
${zoneDescriptions}

DRAWING REQUIREMENTS:
- Bold black rectangular booth outline with dimension labels ("${boothDimensions.width}'" and "${boothDimensions.depth}'")
- Each zone clearly labeled with zone name + sq ft
- Individual furniture items as simple black-outline icons from above
- Thin lines separating major zone areas
- Entry points marked with arrows from aisle side
- The hero "${heroName}" should be drawn as a prominent central fixture

MATERIALS CONTEXT: ${materials}
${annotationBlock}

Aspect ratio: ${boothDimensions.aspectRatio >= 1 ? '4:3' : '3:4'}`;

    try {
      const { data, error } = await supabase.functions.invoke("generate-view", {
        body: {
          prompt,
          angleId: "floor_plan_2d",
          projectId,
          boothSize: currentConfig.footprintSize,
        },
      });

      if (error) throw error;
      if (!data?.imageUrl) throw new Error("No image returned");

      setFloorPlanImage(data.imageUrl);
      setFloorPlanView("render");

      // Save to DB
      if (projectId) {
        await saveImage.mutateAsync({
          angleId: "floor_plan_2d",
          angleName: "Floor Plan (2D)",
          imageDataUrl: data.imageUrl,
        });
      }

      toast({ 
        title: "Floor plan generated", 
        description: floorPlanAnnotations.length > 0 
          ? `Applied ${floorPlanAnnotations.length} feedback note(s)` 
          : "AI-rendered 2D floor plan is ready" 
      });
    } catch (err) {
      console.error("Floor plan generation error:", err);
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setIsGeneratingFloorPlan(false);
    }
  }, [brief, currentConfig, activeLayout, spatialData, bigIdea, projectId, currentProject, floorPlanAnnotations, boothDimensions]);

  // Annotation handlers
  const handleAddAnnotation = useCallback((annotation: FloorPlanAnnotation) => {
    const updated = [...floorPlanAnnotations, annotation];
    setFloorPlanAnnotations(updated);
    if (projectId && spatialData) {
      saveProjectField(projectId, "spatial_strategy", { ...spatialData, floorPlanAnnotations: updated });
    }
  }, [floorPlanAnnotations, projectId, spatialData]);

  const handleRemoveAnnotation = useCallback((id: string) => {
    const updated = floorPlanAnnotations.filter(a => a.id !== id);
    setFloorPlanAnnotations(updated);
    if (projectId && spatialData) {
      saveProjectField(projectId, "spatial_strategy", { ...spatialData, floorPlanAnnotations: updated });
    }
  }, [floorPlanAnnotations, projectId, spatialData]);

  // Early return after all hooks
  if (!spatialData?.configs || !currentConfig || !activeLayout || !metrics) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No spatial data available</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/generate")}>
          Generate Elements First
        </Button>
      </div>
    );
  }

  const handleContinue = () => {
    setActiveStep("prompts");
    navigate("/prompts");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Spatial Strategy</h2>
          <p className="text-muted-foreground">
            {boothDimensions.footprintLabel} {boothDimensions.scaleDescription} • {validation.totalPercentage}% zone coverage
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export SVG
          </Button>
          <Button onClick={handleContinue} className="btn-glow">
            Generate Prompts
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Validation Alert (if issues) */}
      {(!validation.valid || validation.warnings.length > 0) && (
        <ValidationPanel validation={validation} />
      )}

      {/* Footprint Selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {spatialData.configs.map((config: any, index: number) => (
            <button
              key={config.footprintSize}
              onClick={() => setActiveFootprint(index)}
              className={cn(
                "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                activeFootprint === index
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/30"
              )}
            >
              {config.footprintSize}
              <span className="text-xs opacity-70 ml-2">
                ({config.totalSqft || calculateBoothDimensions(config.footprintSize).totalSqft} sq ft)
              </span>
            </button>
          ))}
        </div>
        
        {/* View toggles */}
        <div className="flex gap-2">
          <Button
            variant={showFlow ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowFlow(!showFlow)}
          >
            {showFlow ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Flow
          </Button>
          <Button
            variant={showHeatmap ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Heatmap
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Floor Plan */}
        <Card className="lg:col-span-2 element-card overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Floor Plan — {currentConfig.footprintSize}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {activeLayout.name} • {metrics.flowEfficiency}% flow efficiency • {boothDimensions.width}' × {boothDimensions.depth}'
              </p>
            </div>
            <div className="flex gap-1">
              {/* View mode toggle */}
              <div className="flex rounded-md border border-border mr-2">
                <button
                  onClick={() => setFloorPlanView("blocks")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors rounded-l-md",
                    floorPlanView === "blocks" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <Layers className="h-3.5 w-3.5 inline mr-1" />
                  Zones
                </button>
                <button
                  onClick={() => floorPlanImage ? setFloorPlanView("render") : handleGenerateFloorPlan()}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors rounded-r-md",
                    floorPlanView === "render" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <ImageIcon className="h-3.5 w-3.5 inline mr-1" />
                  Render
                </button>
              </div>
              {floorPlanView === "blocks" && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(2, z + 0.25))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </>
              )}
              {floorPlanView === "render" && floorPlanImage && (
                <Button variant="ghost" size="sm" className="h-8" onClick={handleGenerateFloorPlan} disabled={isGeneratingFloorPlan}>
                  {isGeneratingFloorPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="ml-1 text-xs">Regenerate</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {floorPlanView === "render" ? (
              /* AI-Rendered Floor Plan with Annotations */
              <div style={{ minHeight: "400px" }}>
                {isGeneratingFloorPlan && !floorPlanImage ? (
                  <div className="flex flex-col items-center justify-center h-[400px] gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generating 2D floor plan...</p>
                    <p className="text-xs text-muted-foreground/60">This takes 15-30 seconds</p>
                  </div>
                ) : floorPlanImage ? (
                  <FloorPlanAnnotations
                    imageUrl={floorPlanImage}
                    annotations={floorPlanAnnotations}
                    onAddAnnotation={handleAddAnnotation}
                    onRemoveAnnotation={handleRemoveAnnotation}
                    isRegenerating={isGeneratingFloorPlan}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] gap-3">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No rendered floor plan yet</p>
                    <Button onClick={handleGenerateFloorPlan} disabled={isGeneratingFloorPlan}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Floor Plan
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Zone Blocks View - WITH PROPER ASPECT RATIO */
              <div 
                className="grid-pattern rounded-lg p-4 overflow-auto"
                style={{ minHeight: "400px" }}
              >
                {/* Booth container with correct aspect ratio */}
                <div className="relative mx-auto" style={{ width: 'fit-content' }}>
                  {/* Width label */}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-muted-foreground font-medium">
                    {boothDimensions.width}'
                  </div>
                  
                  {/* Depth label */}
                  <div 
                    className="absolute -left-6 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg) translateY(50%)' }}
                  >
                    {boothDimensions.depth}'
                  </div>
                  
                  {/* Main floor plan container */}
                  <div 
                    className="relative bg-muted/30 rounded border-2 border-dashed border-border"
                    style={{ 
                      width: `${boothDimensions.displayWidth * zoom}px`, 
                      height: `${boothDimensions.displayHeight * zoom}px`,
                      transition: "all 0.3s ease"
                    }}
                  >
                    {/* Flow overlay */}
                    {showFlow && (
                      <FlowOverlay 
                        paths={flowPaths} 
                        showHeatmap={showHeatmap}
                        zones={activeLayout.zones}
                      />
                    )}
                    
                    {/* Render each zone */}
                    {activeLayout.zones.map((zone: NormalizedZone, index: number) => {
                      const colors = getZoneColors(zone, index);
                      const zoneMetric = metrics.zoneMetrics.find(m => m.zoneId === zone.id);
                      
                      // Use already-normalized positions (0-100 scale)
                      const { x, y, width, height } = zone.position;
                      
                      return (
                        <div
                          key={zone.id}
                          className="absolute rounded-md flex items-center justify-center p-1 transition-all cursor-pointer hover:opacity-90 hover:shadow-md group overflow-hidden"
                          onClick={() => setSelectedZone({ zone, colors })}
                          style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            width: `${width}%`,
                            height: `${height}%`,
                            backgroundColor: colors.bg,
                            borderWidth: "2px",
                            borderStyle: "solid",
                            borderColor: colors.border,
                            zIndex: zone.id === "hero" ? 2 : 1,
                          }}
                        >
                          <div className="text-center overflow-hidden">
                            <div 
                              className="font-semibold leading-tight truncate" 
                              style={{ 
                                color: colors.text, 
                                fontSize: `${Math.max(8, Math.min(12, width * 0.35 * zoom))}px` 
                              }}
                            >
                              {zone.name}
                            </div>
                            <div 
                              className="text-muted-foreground mt-0.5" 
                              style={{ fontSize: `${Math.max(7, Math.min(10, width * 0.25 * zoom))}px` }}
                            >
                              {zone.sqft} sqft
                            </div>
                            {zoneMetric && (
                              <div 
                                className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-2 py-1 shadow-md whitespace-nowrap z-10" 
                                style={{ fontSize: "10px" }}
                              >
                                {zoneMetric.engagementScore}% engagement • {Math.round(zoneMetric.avgDwellTime / 60)}min avg
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Aisle indicator */}
                    <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
                      ← Main Aisle →
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Tabbed */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "layout" | "metrics" | "constraints" | "costs")}>
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="layout">
                <Layers className="h-3.5 w-3.5 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="metrics">
                <TrendingUp className="h-3.5 w-3.5 mr-1" />
                Metrics
              </TabsTrigger>
              <TabsTrigger value="constraints" className="relative">
                {validation.errors.length > 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-destructive" />
                ) : validation.warnings.length > 0 ? (
                  <AlertCircle className="h-3.5 w-3.5 mr-1 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" />
                )}
                Validate
              </TabsTrigger>
              <TabsTrigger value="costs">
                <span className="mr-1 text-xs">$</span>
                Costs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="layout" className="space-y-4 mt-4">
              {/* Layout Variations */}
              <LayoutVariations
                variations={variations}
                activeVariation={activeVariation}
                onSelect={setActiveVariation}
              />

              {/* Layout Reasoning */}
              <LayoutReasoning variation={activeLayout} />

              {/* Zone Legend */}
              <Card className="element-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Zone Allocation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeLayout.zones.map((zone: NormalizedZone, index: number) => {
                    const colors = getZoneColors(zone, index);
                    return (
                      <div key={zone.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded border"
                            style={{ backgroundColor: colors.bg, borderColor: colors.border }}
                          />
                          <span className="text-sm">{zone.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{zone.sqft} sqft</span>
                          <Badge variant="secondary" className="text-xs">
                            {zone.percentage}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total */}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="text-sm font-medium">Total</span>
                    <Badge variant={validation.totalPercentage > 100 ? "destructive" : "default"} className="text-xs">
                      {validation.totalPercentage}%
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="space-y-4 mt-4">
              <LayoutMetrics metrics={metrics} />
            </TabsContent>

            <TabsContent value="constraints" className="space-y-4 mt-4">
              {/* Full constraint panel with ADA, zone sizing, sightlines, utilities */}
              <ConstraintPanel
                zones={activeLayout.zones}
                boothDimensions={boothDimensions}
              />
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 mt-4">
              {/* Cost estimator with tier selection, budget gauge, per-zone breakdown */}
              <CostEstimator
                zones={activeLayout.zones}
                boothDimensions={boothDimensions}
                budgetMax={budgetMax}
                onTierChange={setQualityTier}
              />
            </TabsContent>
          </Tabs>
          
          {/* Inspiration Images */}
          <InspirationUpload 
            images={inspirationImages}
            onImagesChange={setInspirationImages}
          />
          
          {/* Materials & Mood */}
          <Card className="element-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Materials & Mood</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {spatialData.materialsAndMood?.map((mat: any, i: number) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{mat.material}</span>
                  <p className="text-xs text-muted-foreground">
                    {mat.use} — {mat.feel}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Zone Detail Panel */}
      <ZoneDetailPanel
        zone={selectedZone?.zone ?? null}
        open={!!selectedZone}
        onClose={() => setSelectedZone(null)}
        colors={selectedZone?.colors ?? { bg: "", border: "", text: "" }}
      />
    </div>
  );
}
