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
  Layers
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useState, useMemo } from "react";
import { LayoutMetrics, generateLayoutMetrics } from "./LayoutMetrics";
import { FlowOverlay, generateFlowPaths } from "./FlowOverlay";
import { LayoutVariations, LayoutReasoning, generateLayoutVariations, type LayoutVariation } from "./LayoutVariations";
import { InspirationUpload, type InspirationImage } from "./InspirationUpload";

const ZONE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  hero: { bg: "bg-zone-hero/30", border: "border-zone-hero", text: "text-zone-hero" },
  storytelling: { bg: "bg-zone-storytelling/30", border: "border-zone-storytelling", text: "text-zone-storytelling" },
  lounge: { bg: "bg-zone-lounge/30", border: "border-zone-lounge", text: "text-zone-lounge" },
  reception: { bg: "bg-zone-reception/30", border: "border-zone-reception", text: "text-zone-reception" },
  service: { bg: "bg-zone-service/30", border: "border-zone-service", text: "text-zone-service" },
  demo: { bg: "bg-pink-500/30", border: "border-pink-500", text: "text-pink-500" },
};

export function SpatialPlanner() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const [activeFootprint, setActiveFootprint] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showFlow, setShowFlow] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [activeVariation, setActiveVariation] = useState("balanced");
  const [inspirationImages, setInspirationImages] = useState<InspirationImage[]>([]);
  const [activeTab, setActiveTab] = useState<"layout" | "metrics">("layout");

  const spatialData = currentProject?.elements.spatialStrategy.data;
  const currentConfig = spatialData?.configs?.[activeFootprint];
  
  // Generate layout variations - must be before conditional return
  const variations = useMemo(() => {
    if (!currentConfig?.zones) return [];
    return generateLayoutVariations(currentConfig.zones, currentConfig.footprintSize);
  }, [currentConfig]);
  
  // Get active layout and its metrics
  const activeLayout = useMemo(() => 
    variations.find(v => v.id === activeVariation) || variations[0],
    [variations, activeVariation]
  );
  
  const metrics = useMemo(() => {
    if (!activeLayout?.zones) return null;
    return generateLayoutMetrics(activeLayout.zones, activeLayout.type);
  }, [activeLayout]);
  
  // Generate flow paths
  const flowPaths = useMemo(() => {
    if (!activeLayout?.zones) return [];
    return generateFlowPaths(activeLayout.zones);
  }, [activeLayout?.zones]);
  
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
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setZoom(z => Math.min(2, z + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setZoom(1)}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
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
                
                {activeLayout.zones.map((zone: any) => {
                  const colors = ZONE_COLORS[zone.id] || ZONE_COLORS.service;
                  const zoneMetric = metrics.zoneMetrics.find(m => m.zoneId === zone.id);
                  
                  return (
                    <div
                      key={zone.id}
                      className={cn(
                        "absolute rounded border-2 flex items-center justify-center p-2 transition-all cursor-pointer hover:opacity-90 group",
                        colors.bg,
                        colors.border
                      )}
                      style={{
                        left: `${zone.position.x}%`,
                        top: `${zone.position.y}%`,
                        width: `${zone.position.width}%`,
                        height: `${zone.position.height}%`,
                      }}
                    >
                      <div className="text-center">
                        <div className={cn("text-xs font-semibold", colors.text)}>
                          {zone.name}
                        </div>
                        <div className="text-2xs text-muted-foreground">
                          {zone.sqft} sq ft
                        </div>
                        {/* Hover metrics */}
                        {zoneMetric && (
                          <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-popover border rounded-md px-2 py-1 text-2xs shadow-md whitespace-nowrap z-10">
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
                  {activeLayout.zones.map((zone: any) => {
                    const colors = ZONE_COLORS[zone.id] || ZONE_COLORS.service;
                    return (
                      <div key={zone.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded", colors.bg, colors.border, "border")} />
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
    </div>
  );
}
