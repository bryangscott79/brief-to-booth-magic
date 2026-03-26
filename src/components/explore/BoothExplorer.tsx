import { useState, useMemo, useEffect } from "react";
import { Loader2, Compass, RotateCcw, Maximize2, Image as ImageIcon } from "lucide-react";
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
  /** Existing rendered image URL for this space (used as reference + fallback preview) */
  referenceImageUrl: string | null;
  isGenerating: boolean;
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
  const [initialized, setInitialized] = useState(false);

  // Get hero image as reference for consistency
  const heroImage = useMemo(
    () => images?.find((i) => i.angle_id === "hero_34" && i.is_current),
    [images]
  );

  // Detect zones from rendered interior images (angle names ending in "Interior")
  const detectedZones = useMemo(() => {
    if (!images) return [];
    const interiorImages = images.filter(
      (i) => i.is_current && i.angle_name.endsWith("Interior")
    );
    return interiorImages.map((img) => ({
      id: img.angle_id,
      name: img.angle_name.replace(" Interior", "").replace(/ Interior$/, ""),
      imageUrl: img.public_url,
    }));
  }, [images]);

  // Also check spatial strategy zones from element data
  const spatialZones = useMemo(() => {
    const el = project?.elements?.spatialStrategy;
    if (!el) return [];
    const data = el as { configs?: Array<{ zones?: Array<{ id: string; name: string; percentage: number }> }> };
    return data?.configs?.[0]?.zones ?? [];
  }, [project]);

  // Auto-initialize spaces when images load and we haven't initialized yet
  useEffect(() => {
    if (initialized || !images || images.length === 0) return;

    const newSpaces: PanoramaSpace[] = [
      {
        id: "main-interior",
        name: "Main Booth Interior",
        panoramaUrl: null,
        referenceImageUrl: heroImage?.public_url ?? null,
        isGenerating: false,
        connections: [],
      },
    ];

    // Merge zones from rendered interiors and spatial strategy
    const zoneMap = new Map<string, { name: string; imageUrl: string | null }>();

    // From rendered interior images (higher priority — has actual images)
    for (const z of detectedZones) {
      zoneMap.set(z.id, { name: z.name, imageUrl: z.imageUrl });
    }

    // From spatial strategy (fill in any missing)
    for (const z of spatialZones) {
      const key = z.name.toLowerCase().replace(/\s+/g, "_") + "_interior";
      if (!zoneMap.has(key)) {
        zoneMap.set(key, { name: z.name, imageUrl: null });
      }
    }

    const zoneEntries = Array.from(zoneMap.entries());

    for (let idx = 0; idx < zoneEntries.length; idx++) {
      const [zoneId, zone] = zoneEntries[idx];
      newSpaces.push({
        id: `zone-${zoneId}`,
        name: zone.name,
        panoramaUrl: null,
        referenceImageUrl: zone.imageUrl,
        isGenerating: false,
        connections: [
          { targetId: "main-interior", label: "Back to Main", yaw: 180, pitch: -10 },
        ],
      });

      // Add hotspot from main to this zone
      const yaw = zoneEntries.length === 1
        ? 0
        : -90 + (180 / Math.max(zoneEntries.length - 1, 1)) * idx;
      newSpaces[0].connections.push({
        targetId: `zone-${zoneId}`,
        label: zone.name,
        yaw,
        pitch: -5,
      });
    }

    if (newSpaces.length > 0) {
      setSpaces(newSpaces);
      setActiveSpaceId("main-interior");
      setInitialized(true);
    }
  }, [images, detectedZones, spatialZones, heroImage, initialized]);

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

      // Use the zone's own rendered image as reference if available, else hero
      const referenceImageUrl = space.referenceImageUrl ?? heroImage?.public_url ?? undefined;

      const { data, error } = await supabase.functions.invoke(
        "generate-panorama",
        {
          body: {
            spaceName: space.name,
            prompt,
            referenceImageUrl,
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

  // Loading state — waiting for project images
  if (!images) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading project data...</p>
        </CardContent>
      </Card>
    );
  }

  // No rendered images yet
  if (images.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            360° Booth Explorer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Generate booth renders on the <strong>Prompts</strong> page first.
            The 360° Explorer uses your rendered images as references to create
            immersive panoramic walkthroughs.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Spaces not initialized (shouldn't happen if images exist, but safety)
  if (spaces.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Detecting spaces...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Compass className="h-5 w-5" />
            360° Explorer
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {spaces.length} spaces detected &middot;{" "}
            {spaces.filter((s) => s.panoramaUrl).length} panoramas generated
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={generateAll}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Generate All
        </Button>
      </div>

      {/* Space selector strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {spaces.map((space) => (
          <Button
            key={space.id}
            variant={activeSpaceId === space.id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveSpaceId(space.id)}
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

          <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-white text-sm font-medium">
            {activeSpace.name}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

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
        <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-4">
          {activeSpace?.referenceImageUrl ? (
            <>
              <img
                src={activeSpace.referenceImageUrl}
                alt={activeSpace.name}
                className="max-h-48 rounded-lg opacity-50"
              />
              <p className="text-sm text-muted-foreground">
                Reference image available — generate a 360° panorama
              </p>
            </>
          ) : (
            <>
              <Compass className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No panorama for "{activeSpace?.name}" yet
              </p>
            </>
          )}
          <Button
            size="sm"
            onClick={() => activeSpace && generatePanorama(activeSpace.id)}
          >
            Generate 360° Panorama
          </Button>
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
            onClick={() => setActiveSpaceId(space.id)}
          >
            <CardContent className="p-3">
              <div className="aspect-video bg-muted rounded-md mb-2 overflow-hidden">
                {space.panoramaUrl ? (
                  <img
                    src={space.panoramaUrl}
                    alt={space.name}
                    className="w-full h-full object-cover"
                  />
                ) : space.referenceImageUrl ? (
                  <div className="relative w-full h-full">
                    <img
                      src={space.referenceImageUrl}
                      alt={space.name}
                      className="w-full h-full object-cover opacity-40"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/70" />
                    </div>
                  </div>
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
                    360° Ready
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function buildPromptForSpace(
  space: PanoramaSpace,
  project: { name?: string | null; rawBrief?: string | null; parsedBrief?: unknown; projectType?: string | null }
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
