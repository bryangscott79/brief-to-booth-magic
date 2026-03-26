import { useState, useMemo } from "react";
import { Loader2, Compass, Plus, RotateCcw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProjectStore } from "@/store/projectStore";
import { useRenderStore } from "@/store/renderStore";
import { useProjectImages } from "@/hooks/useProjectImages";
import { PanoramaViewer, type Hotspot } from "./PanoramaViewer";

export interface PanoramaSpace {
  id: string;
  name: string;
  panoramaUrl: string | null;
  isGenerating: boolean;
  /** Zones this space connects to (hotspots) */
  connections: Array<{ targetId: string; label: string; yaw: number; pitch: number }>;
}

export function BoothExplorer() {
  const { toast } = useToast();
  const project = useProjectStore((s) => s.currentProject);
  const projectId = project?.id ?? null;
  const consistencyTokens = useRenderStore((s) => s.consistencyTokens);
  const { data: images } = useProjectImages(projectId);
  const [spaces, setSpaces] = useState<PanoramaSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get hero image as reference for consistency
  const heroImage = useMemo(
    () => images?.find((i) => i.angle_id === "hero_34" && i.is_current),
    [images]
  );

  // Build initial spaces from spatial zones if available
  const spatialZones = useMemo(() => {
    const configs =
      (project?.elements?.spatialStrategy as { configs?: Array<{ zones?: Array<{ id: string; name: string; percentage: number }> }> })
        ?.configs;
    return configs?.[0]?.zones ?? [];
  }, [project]);

  // Initialize spaces from zones if empty
  const initializeSpaces = () => {
    const newSpaces: PanoramaSpace[] = [
      {
        id: "main-interior",
        name: "Main Booth Interior",
        panoramaUrl: null,
        isGenerating: false,
        connections: [],
      },
    ];

    // Add a space for each spatial zone
    for (const zone of spatialZones) {
      const connections: PanoramaSpace["connections"] = [
        { targetId: "main-interior", label: "Back to Main", yaw: 180, pitch: -10 },
      ];
      newSpaces.push({
        id: `zone-${zone.id}`,
        name: zone.name,
        panoramaUrl: null,
        isGenerating: false,
        connections,
      });

      // Add hotspot from main to this zone
      const idx = spatialZones.indexOf(zone);
      const yaw = -90 + (180 / Math.max(spatialZones.length - 1, 1)) * idx;
      newSpaces[0].connections.push({
        targetId: `zone-${zone.id}`,
        label: zone.name,
        yaw,
        pitch: -5,
      });
    }

    setSpaces(newSpaces);
    setActiveSpaceId("main-interior");
  };

  // Generate a single panorama
  const generatePanorama = async (spaceId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space || !project) return;

    setSpaces((prev) =>
      prev.map((s) => (s.id === spaceId ? { ...s, isGenerating: true } : s))
    );

    try {
      const boothSize =
        (project.parsedBrief as { spatial?: { footprints?: Array<{ size?: string }> } })
          ?.spatial?.footprints?.[0]?.size;

      const prompt = buildPromptForSpace(space, project);

      const { data, error } = await supabase.functions.invoke(
        "generate-panorama",
        {
          body: {
            spaceName: space.name,
            prompt,
            referenceImageUrl: heroImage?.public_url ?? undefined,
            boothSize,
            projectType: project.projectType ?? "trade_show_booth",
            consistencyTokens: consistencyTokens ?? undefined,
          },
        }
      );

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSpaces((prev) =>
        prev.map((s) =>
          s.id === spaceId
            ? { ...s, panoramaUrl: data.imageUrl, isGenerating: false }
            : s
        )
      );

      toast({
        title: "Panorama generated",
        description: `360° view of "${space.name}" is ready.`,
      });
    } catch (err) {
      setSpaces((prev) =>
        prev.map((s) => (s.id === spaceId ? { ...s, isGenerating: false } : s))
      );
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Generate all panoramas sequentially
  const generateAll = async () => {
    for (const space of spaces) {
      if (!space.panoramaUrl) {
        await generatePanorama(space.id);
      }
    }
  };

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  const hotspots: Hotspot[] = useMemo(() => {
    if (!activeSpace) return [];
    return activeSpace.connections
      .filter((c) => {
        const target = spaces.find((s) => s.id === c.targetId);
        return target?.panoramaUrl;
      })
      .map((c) => ({
        id: c.targetId,
        label: c.label,
        yaw: c.yaw,
        pitch: c.pitch,
        targetPanoramaId: c.targetId,
      }));
  }, [activeSpace, spaces]);

  const handleHotspotClick = (hotspot: Hotspot) => {
    setActiveSpaceId(hotspot.targetPanoramaId);
  };

  // No spaces set up yet
  if (spaces.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            360° Booth Explorer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Generate immersive 360° panoramic views of your booth spaces. Walk
            through the main interior and navigate between zones using
            interactive hotspots.
          </p>
          {!heroImage && (
            <p className="text-sm text-amber-600 mb-4">
              Tip: Generate a hero render first on the Prompts page — it will be
              used as a visual reference for consistency.
            </p>
          )}
          <Button onClick={initializeSpaces}>
            <Plus className="h-4 w-4 mr-2" />
            Set Up Spaces
            {spatialZones.length > 0 &&
              ` (${spatialZones.length} zones detected)`}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Space selector strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {spaces.map((space) => (
          <Button
            key={space.id}
            variant={activeSpaceId === space.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSpaceId(space.id)}
            disabled={!space.panoramaUrl && !space.isGenerating}
          >
            {space.isGenerating && (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            )}
            {space.name}
            {space.panoramaUrl && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                360°
              </Badge>
            )}
          </Button>
        ))}

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={generateAll}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Generate All
          </Button>
        </div>
      </div>

      {/* Main viewer */}
      {activeSpace?.panoramaUrl ? (
        <div
          className={`relative rounded-lg overflow-hidden border bg-black ${
            isFullscreen
              ? "fixed inset-0 z-50 rounded-none"
              : "aspect-video"
          }`}
        >
          <PanoramaViewer
            imageUrl={activeSpace.panoramaUrl}
            hotspots={hotspots}
            onHotspotClick={handleHotspotClick}
            className="w-full h-full"
          />

          {/* Space label */}
          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-white text-sm font-medium">
            {activeSpace.name}
          </div>

          {/* Fullscreen toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

          {/* ESC hint in fullscreen */}
          {isFullscreen && (
            <div className="absolute top-4 right-16 text-xs text-white/50">
              Press ESC to exit
            </div>
          )}
        </div>
      ) : activeSpace?.isGenerating ? (
        <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Generating 360° panorama for "{activeSpace.name}"...
          </p>
        </div>
      ) : (
        <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-3">
          <Compass className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No panorama generated yet for "{activeSpace?.name}"
          </p>
        </div>
      )}

      {/* Space cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {spaces.map((space) => (
          <Card
            key={space.id}
            className={`cursor-pointer transition-all ${
              activeSpaceId === space.id
                ? "ring-2 ring-primary"
                : "hover:border-primary/50"
            }`}
            onClick={() => {
              if (space.panoramaUrl) setActiveSpaceId(space.id);
            }}
          >
            <CardContent className="p-3">
              <div className="aspect-video bg-muted rounded-md mb-2 overflow-hidden">
                {space.panoramaUrl ? (
                  <img
                    src={space.panoramaUrl}
                    alt={space.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Compass className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <p className="text-xs font-medium truncate">{space.name}</p>
              <div className="flex items-center gap-1 mt-1">
                {space.panoramaUrl ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Ready
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    disabled={space.isGenerating}
                    onClick={(e) => {
                      e.stopPropagation();
                      generatePanorama(space.id);
                    }}
                  >
                    {space.isGenerating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Generate"
                    )}
                  </Button>
                )}
                {space.connections.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {space.connections.length} links
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Build a descriptive prompt for a specific space
function buildPromptForSpace(
  space: PanoramaSpace,
  project: { name?: string | null; rawBrief?: string | null; parsedBrief?: unknown }
): string {
  const brief = project.parsedBrief as {
    eventName?: string;
    brandDescription?: string;
    objectives?: string[];
    spatial?: { footprints?: Array<{ size?: string }> };
  } | null;

  const parts: string[] = [];

  if (space.id === "main-interior") {
    parts.push(
      `The main interior of the ${project.name ?? "booth"} experience.`
    );
    if (brief?.brandDescription)
      parts.push(`Brand: ${brief.brandDescription}`);
    if (brief?.eventName)
      parts.push(`Event: ${brief.eventName}`);
    parts.push(
      "Show the primary experience space with all key zones visible. Include the hero installation as the central focal point. Show branded walls, ceiling treatment, lighting, and floor design. The space should feel immersive and welcoming."
    );
  } else {
    parts.push(`The "${space.name}" zone within the ${project.name ?? "booth"}.`);
    parts.push(
      `This is a dedicated area focused on: ${space.name}. Show zone-specific furniture, fixtures, screens, and branding. The space should feel purpose-built for its function.`
    );
  }

  if (brief?.objectives?.length) {
    parts.push(`Key objectives: ${brief.objectives.slice(0, 3).join(", ")}`);
  }

  return parts.join("\n");
}
