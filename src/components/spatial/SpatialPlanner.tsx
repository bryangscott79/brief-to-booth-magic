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
  ImageIcon
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useState, useMemo, useCallback } from "react";
import { LayoutMetrics, generateLayoutMetrics } from "./LayoutMetrics";
import { FlowOverlay, generateFlowPaths } from "./FlowOverlay";
import { LayoutVariations, LayoutReasoning, generateLayoutVariations, type LayoutVariation } from "./LayoutVariations";
import { InspirationUpload, type InspirationImage } from "./InspirationUpload";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { FloorPlanAnnotations, type FloorPlanAnnotation } from "./FloorPlanAnnotations";
import { supabase } from "@/integrations/supabase/client";
import { useProjectImages, useSaveRenderImage } from "@/hooks/useProjectImages";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { saveProjectField } from "@/hooks/useProjectSync";

// Fallback palette when zones don't have a colorCode from DB
const ZONE_PALETTE = [
  { bg: "rgba(0, 71, 171, 0.2)", border: "rgba(0, 71, 171, 0.8)", text: "#0047AB" },
  { bg: "rgba(70, 130, 180, 0.2)", border: "rgba(70, 130, 180, 0.8)", text: "#4682B4" },
  { bg: "rgba(176, 196, 222, 0.25)", border: "rgba(100, 140, 180, 0.8)", text: "#4A6D8C" },
  { bg: "rgba(47, 79, 79, 0.2)", border: "rgba(47, 79, 79, 0.8)", text: "#2F4F4F" },
  { bg: "rgba(218, 165, 32, 0.2)", border: "rgba(218, 165, 32, 0.8)", text: "#B8860B" },
  { bg: "rgba(139, 69, 19, 0.2)", border: "rgba(139, 69, 19, 0.8)", text: "#8B4513" },
  { bg: "rgba(85, 107, 47, 0.2)", border: "rgba(85, 107, 47, 0.8)", text: "#556B2F" },
  { bg: "rgba(128, 0, 128, 0.2)", border: "rgba(128, 0, 128, 0.8)", text: "#800080" },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getZoneColors(zone: any, index: number) {
  if (zone.colorCode) {
    return {
      bg: hexToRgba(zone.colorCode, 0.2),
      border: hexToRgba(zone.colorCode, 0.8),
      text: zone.colorCode,
    };
  }
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
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
  const [activeTab, setActiveTab] = useState<"layout" | "metrics">("layout");
  const [selectedZone, setSelectedZone] = useState<{ zone: any; colors: any } | null>(null);
  const [floorPlanView, setFloorPlanView] = useState<"blocks" | "render">("blocks");
  const [floorPlanImage, setFloorPlanImage] = useState<string | null>(null);
  const [isGeneratingFloorPlan, setIsGeneratingFloorPlan] = useState(false);
  const [floorPlanAnnotations, setFloorPlanAnnotations] = useState<FloorPlanAnnotation[]>([]);

  const { data: savedImages = [] } = useProjectImages(projectId);
  const saveImage = useSaveRenderImage(projectId);

  const spatialData = currentProject?.elements.spatialStrategy.data;
  const currentConfig = spatialData?.configs?.[activeFootprint];
  const brief = currentProject?.parsedBrief;
  const bigIdea = currentProject?.elements.bigIdea.data;

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
  
  // Generate layout variations - must be before conditional return
  const variations = useMemo(() => {
    if (!currentConfig?.zones) return [];
    return generateLayoutVariations(currentConfig.zones, currentConfig.footprintSize);
  }, [currentConfig]);
  
  const activeLayout = useMemo(() => 
    variations.find(v => v.id === activeVariation) || variations[0],
    [variations, activeVariation]
  );
  
  const metrics = useMemo(() => {
    if (!activeLayout?.zones) return null;
    return generateLayoutMetrics(activeLayout.zones, activeLayout.type);
  }, [activeLayout]);
  
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

    const footprint = brief?.spatial?.footprints?.[0]?.size || currentConfig.footprintSize;
    const fpMatch = footprint.match(/(\d+)\s*[x×X]\s*(\d+)/);
    const w = fpMatch ? parseInt(fpMatch[1], 10) : 30;
    const d = fpMatch ? parseInt(fpMatch[2], 10) : 30;

    const zoneDescriptions = activeLayout.zones
      .map((z: any) => `- ${z.name}: ${z.percentage}% (${z.sqft} sq ft) — positioned at ${Math.round((z.position.x <= 1 ? z.position.x * 100 : z.position.x))}% from left, ${Math.round((z.position.y <= 1 ? z.position.y * 100 : z.position.y))}% from top`)
      .join("\n");

    const heroName = currentProject?.elements.interactiveMechanics?.data?.hero?.name || "Hero installation";
    const materials = spatialData?.materialsAndMood?.map((m: any) => `${m.material}: ${m.feel}`).join(", ") || "";

    // Layout variation context
    const variationContext = `LAYOUT STRATEGY: "${activeLayout.name}" (${activeLayout.score}% match)
- ${activeLayout.description}
- Optimized for: ${activeLayout.bestFor.join(", ")}
- Reasoning: ${activeLayout.reasoning}`;

    // Annotation feedback
    const annotationBlock = floorPlanAnnotations.length > 0
      ? `\nUSER FEEDBACK (CRITICAL — apply all of these changes):\n${floorPlanAnnotations.map((a, i) => `${i + 1}. At position (${Math.round(a.x)}% from left, ${Math.round(a.y)}% from top): "${a.comment}"`).join("\n")}\nMake sure every feedback item above is reflected in the updated floor plan.`
      : "";

    const prompt = `Generate a professional top-down 2D booth floor plan for a ${w}' × ${d}' trade show exhibit for ${brief?.brand?.name || "client"}.

STYLE: Black-and-white technical architectural floor plan on a light blue graph-paper / grid background. Bird's-eye view looking STRAIGHT DOWN. Clean black outlines. NO color fills, NO 3D, NO perspective — purely flat 2D like a hand-drawn exhibit blueprint.

BOOTH DIMENSIONS: ${w} feet wide × ${d} feet deep (${w > d ? "landscape / wider than deep" : d > w ? "portrait / deeper than wide" : "square"}). Draw the booth outline as a bold black rectangle to exact proportions.

${variationContext}

ZONE LAYOUT:
${zoneDescriptions}

DRAWING REQUIREMENTS:
- Bold black rectangular booth outline with dimension labels ("${w}'" and "${d}'")
- Each zone clearly labeled in clean sans-serif text (zone name + sq ft)
- Individual furniture items drawn as simple black-outline icons/shapes viewed from above: tables as rectangles, chairs as small squares, screens/monitors as thin rectangles, counters as long rectangles, storage units as filled rectangles, display stands as circles or rounded shapes
- Label every piece of furniture with small text (e.g. "table", "storage unit", "display", "counter", "screen")
- Thin blue lines or dashed lines separating major zone areas
- Entry arrows from the main aisle (bottom edge of booth)
- ${heroName} drawn as the prominent centerpiece feature

${bigIdea ? `THEME: "${bigIdea.headline}"` : ""}
BRAND: ${brief?.brand?.name || ""}

RENDERING STYLE: Think professional exhibit design blueprint. Light blue graph-paper grid background. All furniture and walls in clean black line-art. Zone names in bold uppercase. Furniture labels in smaller text. No color fills — only black outlines on grid paper. Crisp, technical, presentation-ready.

The image must be a WIDE landscape format matching the booth's ${w}:${d} proportions.${annotationBlock}`;

    try {
      const { data, error } = await supabase.functions.invoke("generate-hero", {
        body: { prompt, boothSize: footprint },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setFloorPlanImage(data.imageUrl);
      setFloorPlanView("render");

      if (projectId) {
        saveImage.mutate(
          { angleId: "floor_plan_2d", angleName: "2D Floor Plan", imageDataUrl: data.imageUrl },
          { onError: (err) => console.error("Failed to save floor plan:", err) }
        );
      }

      toast({ title: "Floor plan generated", description: floorPlanAnnotations.length > 0 ? `Applied ${floorPlanAnnotations.length} feedback note(s)` : "AI-rendered 2D floor plan is ready" });
    } catch (err) {
      console.error("Floor plan generation error:", err);
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setIsGeneratingFloorPlan(false);
    }
  }, [brief, currentConfig, activeLayout, spatialData, bigIdea, projectId, currentProject, floorPlanAnnotations]);

  // Annotation handlers
  const handleAddAnnotation = useCallback((annotation: FloorPlanAnnotation) => {
    const updated = [...floorPlanAnnotations, annotation];
    setFloorPlanAnnotations(updated);
    // Persist to DB
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
            Floor plan visualization, flow analysis, and zone optimization
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
                ({config.totalSqft} sq ft)
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
                {activeLayout.name} • {metrics.flowEfficiency}% flow efficiency
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
              /* Zone Blocks View */
              <div 
                className="grid-pattern rounded-lg p-4 overflow-auto"
                style={{ minHeight: "400px" }}
              >
              <div 
                className="relative bg-muted/30 rounded border border-dashed border-border"
                style={{ 
                  width: `${300 * zoom}px`, 
                  height: `${300 * zoom}px`,
                  margin: "0 auto",
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
                
                {activeLayout.zones.map((zone: any, index: number) => {
                  const colors = getZoneColors(zone, index);
                  const zoneMetric = metrics.zoneMetrics.find(m => m.zoneId === zone.id);
                  const x = zone.position.x <= 1 ? zone.position.x * 100 : zone.position.x;
                  const y = zone.position.y <= 1 ? zone.position.y * 100 : zone.position.y;
                  const w = zone.position.width <= 1 ? zone.position.width * 100 : zone.position.width;
                  const h = zone.position.height <= 1 ? zone.position.height * 100 : zone.position.height;
                  
                  return (
                    <div
                      key={zone.id}
                      className="absolute rounded-md flex items-center justify-center p-1 transition-all cursor-pointer hover:opacity-90 hover:shadow-md group overflow-hidden"
                      onClick={() => setSelectedZone({ zone, colors })}
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        width: `${w}%`,
                        height: `${h}%`,
                        backgroundColor: colors.bg,
                        borderWidth: "2px",
                        borderStyle: "solid",
                        borderColor: colors.border,
                        zIndex: zone.id === "Z5" ? 2 : 1,
                      }}
                    >
                      <div className="text-center overflow-hidden">
                        <div className="font-semibold leading-tight" style={{ color: colors.text, fontSize: `${Math.max(8, Math.min(12, w * 0.4))}px` }}>
                          {zone.name}
                        </div>
                        <div className="text-muted-foreground mt-0.5" style={{ fontSize: `${Math.max(7, Math.min(10, w * 0.3))}px` }}>
                          {zone.sqft} sq ft
                        </div>
                        {zoneMetric && (
                          <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-2 py-1 shadow-md whitespace-nowrap z-10" style={{ fontSize: "10px" }}>
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
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Tabbed */}
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="layout" className="flex-1">
                <Layers className="h-4 w-4 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="metrics" className="flex-1">
                <TrendingUp className="h-4 w-4 mr-1" />
                Metrics
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
                  {activeLayout.zones.map((zone: any, index: number) => {
                    const colors = getZoneColors(zone, index);
                    return (
                      <div key={zone.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded border" style={{ backgroundColor: colors.bg, borderColor: colors.border }} />
                          <span className="text-sm">{zone.name}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {zone.percentage}%
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="metrics" className="space-y-4 mt-4">
              <LayoutMetrics metrics={metrics} />
            </TabsContent>
          </Tabs>
          
          {/* Inspiration Images - Always visible */}
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
