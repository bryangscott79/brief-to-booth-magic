import { useState, useCallback, useMemo, useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useRenderStore } from "@/store/renderStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Copy, 
  Check, 
  ChevronRight,
  Camera,
  Sparkles,
  CheckCircle2,
  ImageIcon,
  X,
  Loader2,
  Download,
  RefreshCw,
  MessageSquare,
  Layers,
  FolderOpen
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useToast } from "@/hooks/use-toast";
import { useProjectImages, useSaveRenderImage } from "@/hooks/useProjectImages";
import { useSearchParams } from "react-router-dom";

const ANGLE_CONFIG = [
  { id: "hero_34", name: "3/4 Hero View", priority: 1, aspectRatio: "16:9", description: "Primary marketing shot — 45° front-left perspective", isZoneInterior: false },
  { id: "top", name: "Top-Down View", priority: 2, aspectRatio: "1:1", description: "Floor plan validation — directly overhead", isZoneInterior: false },
  { id: "front", name: "Front Elevation", priority: 3, aspectRatio: "16:9", description: "Primary aisle view — eye-level, centered on entry", isZoneInterior: false },
  { id: "left", name: "Left Side", priority: 4, aspectRatio: "16:9", description: "Side aisle view — eye-level, 90° left", isZoneInterior: false },
  { id: "right", name: "Right Side", priority: 5, aspectRatio: "16:9", description: "Opposite side view — eye-level, 90° right", isZoneInterior: false },
  { id: "back", name: "Back View", priority: 6, aspectRatio: "16:9", description: "Rear entry/exit — fully finished, visitor-facing", isZoneInterior: false },
  { id: "detail_hero", name: "Hero Detail", priority: 7, aspectRatio: "4:3", description: "Medium shot focused on hero installation", isZoneInterior: false },
  { id: "detail_lounge", name: "Lounge Detail", priority: 8, aspectRatio: "4:3", description: "Medium shot focused on human connection zone", isZoneInterior: false },
];

/** Dynamically generate zone interior angle configs from spatial data */
function getZoneInteriorAngles(spatialData: any, elements: any) {
  if (!spatialData?.configs?.[0]?.zones) return [];
  
  return spatialData.configs[0].zones.map((zone: any, index: number) => ({
    id: `zone_interior_${zone.id || index}`,
    name: `${zone.name} Interior`,
    priority: 9 + index,
    aspectRatio: "16:9",
    description: `Interior perspective inside the ${zone.name} zone — showing featured content and visitor experience`,
    isZoneInterior: true,
    zoneData: zone,
  }));
}

/** Build a zone-specific interior prompt using content strategy data */
function generateZoneInteriorPrompt(zone: any, brief: any, bigIdea: any, spatialData: any, elements: any): string {
  const zoneName = (zone.name || "").toLowerCase();
  const parts: string[] = [];

  parts.push(`Generate a photorealistic INTERIOR close-up perspective from INSIDE the "${zone.name}" zone of a ${brief.spatial.footprints[0]?.size || ""} trade show booth for ${brief.brand.name}.`);
  parts.push("");
  parts.push("CRITICAL — VISUAL CONSISTENCY:");
  parts.push("Look at the reference image. Find the exact zone labeled or positioned as the \"" + zone.name + "\" area.");
  parts.push("The interior view MUST replicate the exact appearance of this zone from the reference:");
  parts.push("- Same wall panels, colors, and surface materials");
  parts.push("- Same screen sizes, shapes, and content style");
  parts.push("- Same furniture types, seating arrangement, and fixtures");
  parts.push("- Same lighting fixtures and ambient lighting color");
  parts.push("- Same flooring material and edge details");
  parts.push("Do NOT redesign or reimagine the zone. Show what's already visible, just from inside.");
  parts.push("");
  parts.push("CAMERA: Eye level (5.5 feet), positioned INSIDE this zone, facing into it. Show depth and the zone's spatial quality. Other booth areas may be partially visible in the background.");
  parts.push("");
  parts.push("DESIGN DIRECTION:");
  parts.push(`${bigIdea.headline}`);
  parts.push(`${bigIdea.narrative}`);

  // Zone-specific content details
  if (zoneName.includes("hero") || zoneName.includes("experience zone")) {
    const im = elements.interactiveMechanics?.data;
    if (im?.hero) {
      parts.push("");
      parts.push("HERO INSTALLATION (match reference exactly):");
      parts.push(`${im.hero.name} — ${im.hero.concept}`);
      if (im.hero.physicalForm) {
        parts.push(`Structure: ${im.hero.physicalForm.structure}`);
        parts.push(`Materials: ${im.hero.physicalForm.materials?.join(", ")}`);
      }
      parts.push("Show 3-4 visitors actively engaging with the installation.");
    }
  }

  if (zoneName.includes("storytelling") || zoneName.includes("theatre") || zoneName.includes("theater")) {
    const ds = elements.digitalStorytelling?.data;
    if (ds) {
      parts.push("");
      parts.push("STORYTELLING ZONE (match reference exactly):");
      parts.push("This zone has tiered/stepped seating and a large curved or flat display screen.");
      parts.push("Maintain the exact screen shape, seating layout, and content display style from the reference image.");
      if (ds.audienceTracks?.length) {
        ds.audienceTracks.slice(0, 3).forEach((t: any) => {
          parts.push(`- ${t.trackName}: ${t.format} display showing ${t.contentFocus}`);
        });
      }
      parts.push("Show 2-4 visitors seated watching content, intimate theatre atmosphere.");
    }
  }

  if (zoneName.includes("meeting") || zoneName.includes("pod")) {
    const hc = elements.humanConnection?.data;
    if (hc?.configs?.[0]?.zones) {
      parts.push("");
      parts.push("MEETING CONFIGURATION (FEATURED):");
      hc.configs[0].zones.forEach((mz: any) => {
        parts.push(`- ${mz.name} (${mz.capacity}): ${mz.description}`);
        if (mz.designFeatures?.length) parts.push(`  Features: ${mz.designFeatures.join(", ")}`);
      });
      parts.push("Show a small group in a focused conversation, professional setting.");
    }
  }

  if (zoneName.includes("adjacent") || zoneName.includes("vip") || zoneName.includes("lounge")) {
    const aa = elements.adjacentActivations?.data;
    if (aa?.activations?.length) {
      const primary = aa.activations[0];
      parts.push("");
      parts.push("VIP/ACTIVATION SPACE (FEATURED):");
      parts.push(`${primary.name} — ${primary.format}`);
      parts.push(`Atmosphere: ${primary.atmosphere}`);
      parts.push("Show exclusive, intimate setting with premium finishes, 2-3 VIP guests.");
    }
  }

  if (zoneName.includes("engagement") || zoneName.includes("open")) {
    const ef = elements.experienceFramework?.data;
    if (ef?.visitorJourney?.length) {
      parts.push("");
      parts.push("VISITOR JOURNEY TOUCHPOINTS (FEATURED):");
      ef.visitorJourney.forEach((s: any) => {
        parts.push(`- ${s.stage}: ${s.touchpoints?.join(", ")}`);
      });
      parts.push("Show an open, welcoming space with visitors flowing through naturally.");
    }
  }

  if (zoneName.includes("welcome") || zoneName.includes("desk") || zoneName.includes("info")) {
    parts.push("");
    parts.push("WELCOME AREA (FEATURED):");
    parts.push("Branded reception desk with digital check-in, staff welcoming visitors.");
    parts.push("Show 1-2 staff members greeting visitors, clean branded signage visible.");
  }

  // Common finishing
  parts.push("");
  parts.push("MATERIALS AND MOOD:");
  parts.push(spatialData.materialsAndMood?.map((m: any) => `- ${m.material}: ${m.feel}`).join("\n") || "");
  parts.push("");
  parts.push(`BRANDING: ${brief.brand.name} signage subtly visible. Brand colors: ${brief.brand.visualIdentity.colors.join(", ")}.`);
  parts.push("");
  parts.push("STYLE: Architectural visualization quality. Photorealistic materials. Warm, inviting lighting. Eye-level interior perspective showing depth and spatial quality.");
  parts.push("");
  parts.push(`NEGATIVE PROMPT: ${brief.brand.visualIdentity.avoidImagery.join(", ")}, cartoon style, oversaturated, empty space, unrealistic, blurry, low quality`);
  parts.push("");
  parts.push("Aspect ratio: 16:9");

  return parts.join("\n");
}

import type { GeneratedImage, WorkflowPhase } from "@/store/renderStore";

export function PromptGenerator() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Global render store — persists across navigation
  const renderStore = useRenderStore();
  const {
    phase, heroPrompt, heroImage, heroFeedback, heroIterations,
    generatedPrompts, generatedImages, isGeneratingHero, isGenerating,
    generationProgress, currentlyGenerating, hydratedFromDb,
  } = renderStore;

  // Use URL projectId, falling back to render store's projectId (persists across navigation)
  const effectiveProjectId = projectId || renderStore.projectId;
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(effectiveProjectId);
  const saveImage = useSaveRenderImage(effectiveProjectId);

  // Sync project ID to render store
  useEffect(() => {
    renderStore.setProjectId(projectId);
  }, [projectId]);

  const brief = currentProject?.parsedBrief;
  const spatialData = currentProject?.elements.spatialStrategy.data;
  const bigIdea = currentProject?.elements.bigIdea.data;
  const elements = currentProject?.elements;

  // Build combined angle list: standard + zone interiors
  const zoneInteriorAngles = useMemo(() => {
    if (!spatialData || !elements) return [];
    return getZoneInteriorAngles(spatialData, elements);
  }, [spatialData, elements]);

  const allAngles = useMemo(() => [...ANGLE_CONFIG, ...zoneInteriorAngles], [zoneInteriorAngles]);

  // Hydrate from saved images when returning to the page (only if store is empty)
  useEffect(() => {
    if (savedImages.length > 0 && !heroImage && phase === "prompt" && !hydratedFromDb && !isGeneratingHero && !isGenerating) {
      const savedHero = savedImages.find(img => img.angle_id === "hero_34" && img.is_current);
      if (savedHero) {
        renderStore.setHeroImage(savedHero.public_url);
        savedImages
          .filter(img => img.angle_id === "hero_34")
          .forEach(img => renderStore.addHeroIteration(img.public_url));

        const restoredImages: Record<string, { url: string; status: "complete" }> = {};
        savedImages
          .filter(img => img.is_current)
          .forEach(img => {
            restoredImages[img.angle_id] = { url: img.public_url, status: "complete" };
          });
        renderStore.setGeneratedImages(restoredImages);

        const hasOtherViews = savedImages.some(img => img.angle_id !== "hero_34" && img.is_current);
        renderStore.setPhase(hasOtherViews ? "all-views" : "hero-review");
        renderStore.setHydratedFromDb(true);
      }
    }
  }, [savedImages, heroImage, phase, hydratedFromDb, isGeneratingHero, isGenerating]);

  const doSave = useCallback((angleId: string, angleName: string, imageDataUrl: string) => {
    saveImage.mutate(
      { angleId, angleName, imageDataUrl },
      { onError: (err) => console.error(`Failed to save ${angleName}:`, err) }
    );
  }, [saveImage]);

  if (!brief || !spatialData || !bigIdea) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Generate all elements first</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/generate")}>
          Go to Generation
        </Button>
      </div>
    );
  }

  const generatePrompt = (angleId: string): string => {
    // Check for zone interior angles first
    const zoneAngle = zoneInteriorAngles.find((a: any) => a.id === angleId);
    if (zoneAngle?.isZoneInterior && zoneAngle.zoneData) {
      return generateZoneInteriorPrompt(zoneAngle.zoneData, brief, bigIdea, spatialData, elements);
    }

    const angle = ANGLE_CONFIG.find(a => a.id === angleId);
    if (!angle) return "";

    const footprint = brief.spatial.footprints[0];
    const config = spatialData.configs[0];

    const cameraInstructions: Record<string, string> = {
      hero_34: "Camera positioned at 45 degrees front-left, eye level, showing the full booth with hero installation as focal point",
      top: "Camera directly overhead, looking straight down at the floor plan",
      front: "Camera at eye level, centered on the main entry point, capturing the full front facade",
      left: "Camera at eye level, positioned at 90 degrees left of the main entry",
      right: "Camera at eye level, positioned at 90 degrees right of the main entry",
      back: "Camera at eye level, positioned behind the booth showing service areas and structure",
      detail_hero: "Camera at medium distance, focused on the central hero installation",
      detail_lounge: "Camera at medium distance, focused on the lounge/meeting area",
    };

    return `Generate a photorealistic ${angle.name.toLowerCase()} of a ${footprint.size} trade show booth for ${brief.brand.name}, a ${brief.brand.category} company. ${cameraInstructions[angleId]}.

DESIGN DIRECTION:
${bigIdea.headline}
${bigIdea.narrative}

CREATIVE CONSTRAINTS:
Avoid: ${brief.creative.avoid.join(", ")}
Embrace: ${brief.creative.embrace.join(", ")}

SPATIAL LAYOUT:
${config.zones.map((z: any) => `- ${z.name}: ${z.percentage}% of space (${z.sqft} sq ft) — ${z.notes}`).join("\n")}

HERO INSTALLATION:
${currentProject?.elements.interactiveMechanics.data?.hero?.name || "Central interactive installation"} — ${currentProject?.elements.interactiveMechanics.data?.hero?.concept || "A luminous data visualization centerpiece"}

MATERIALS AND MOOD:
${spatialData.materialsAndMood?.map((m: any) => `- ${m.material}: ${m.feel}`).join("\n")}

BRANDING:
${brief.brand.name} signage visible. Brand colors: ${brief.brand.visualIdentity.colors.join(", ")}. Sophisticated, intelligent aesthetic.

ATMOSPHERE:
8-12 people naturally distributed throughout the space: some engaging with the hero installation, others in conversation in the lounge area, staff at reception welcoming visitors. Convention center environment visible in background.

CAMERA:
${cameraInstructions[angleId]}

STYLE:
Architectural visualization quality. Photorealistic materials. Clean, editorial lighting. Professional trade show environment.

NEGATIVE PROMPT:
${brief.brand.visualIdentity.avoidImagery.join(", ")}, cartoon style, oversaturated colors, empty booth, unrealistic lighting, blurry, low quality

Aspect ratio: ${angle.aspectRatio}`;
  };


  const handleGenerateHeroImage = async () => {
    const prompt = heroPrompt || generatePrompt("hero_34");
    if (!heroPrompt) renderStore.setHeroPrompt(prompt);

    try {
      await renderStore.generateHeroImage({
        prompt,
        feedback: heroFeedback || undefined,
        previousImageUrl: heroImage || undefined,
        projectId: projectId!,
        onSave: doSave,
      });

      toast({
        title: "Hero image generated",
        description: "Review the image and provide feedback or proceed to generate all views",
      });
    } catch (error) {
      console.error("Error generating hero:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateWithFeedback = async () => {
    if (!heroFeedback.trim()) {
      toast({
        title: "Feedback required",
        description: "Please enter feedback to refine the image",
        variant: "destructive",
      });
      return;
    }
    await handleGenerateHeroImage();
  };

  const handleCopy = async (angleId: string) => {
    const prompt = angleId === "hero_34" ? heroPrompt : (generatedPrompts[angleId] || generatePrompt(angleId));
    await navigator.clipboard.writeText(prompt);
    setCopiedId(angleId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Prompt copied successfully",
    });
  };

  const handleGenerateAllViews = async () => {
    const prompts: Record<string, string> = {};
    allAngles.forEach(angle => {
      if (angle.id !== "hero_34") {
        prompts[angle.id] = generatePrompt(angle.id);
      }
    });

    renderStore.generateAllViews({
      angles: allAngles,
      prompts,
      heroImageUrl: heroImage!,
      projectId: projectId!,
      onSave: doSave,
    }).then(() => {
      toast({
        title: "All views generated!",
        description: "Your coordinated booth renders are ready",
      });
    });
  };

  const handleRegenerateView = async (angleId: string) => {
    const angle = allAngles.find(a => a.id === angleId);
    if (!angle || !heroImage) return;

    try {
      await renderStore.regenerateView({
        angle: { id: angle.id, name: angle.name, aspectRatio: angle.aspectRatio, isZoneInterior: !!(angle as any).isZoneInterior },
        prompt: generatedPrompts[angleId] || generatePrompt(angleId),
        heroImageUrl: heroImage,
        projectId: projectId!,
        onSave: doSave,
      });

      toast({
        title: `${angle.name} regenerated`,
        description: "New view generated successfully",
      });
    } catch (error) {
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const downloadImage = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleContinue = () => {
    setActiveStep("export");
    navigate("/export");
  };

  const completedCount = Object.values(generatedImages).filter(img => img.status === "complete").length;
  const totalViews = allAngles.length;

  // Phase 1: Generate Hero Image
  if (phase === "prompt" || phase === "hero-generation") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Generate Booth Renders</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            We'll generate a hero image first, then you can refine it with feedback 
            before we create all coordinated views.
          </p>
        </div>

        {/* Step 1: Generate Hero */}
        <Card className="element-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
                  Generate 3/4 Hero View
                </CardTitle>
                <CardDescription>
                  Click to generate the primary hero image for your booth
                </CardDescription>
              </div>
              <Badge variant="secondary">16:9</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {heroPrompt && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Prompt Preview</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy("hero_34")}
                  >
                    {copiedId === "hero_34" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <Textarea
                  value={heroPrompt}
                  readOnly
                  className="min-h-[200px] text-xs font-mono bg-muted/50"
                />
              </div>
            )}
            
            <Button 
              onClick={handleGenerateHeroImage} 
              className="w-full btn-glow"
              disabled={isGeneratingHero}
            >
              {isGeneratingHero ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Hero Image...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {heroPrompt ? "Generate Hero Image" : "Generate Hero Prompt & Image"}
                </>
              )}
            </Button>

            {isGeneratingHero && (
              <p className="text-xs text-muted-foreground text-center">
                This may take 30-60 seconds...
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 2: Review Hero & Provide Feedback
  if (phase === "hero-review") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Review Hero Image</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Review the generated image. Provide feedback to refine it, or approve to generate all views.
          </p>
        </div>

        {/* Hero Image Card */}
        <Card className="element-card border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                3/4 Hero View
              </CardTitle>
              <Badge className="bg-primary/20 text-primary">Generated</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Main Image */}
            <div className="rounded-lg overflow-hidden border bg-muted">
              <img 
                src={heroImage!} 
                alt="Generated Hero" 
                className="w-full h-auto"
              />
            </div>

            {/* Previous Iterations */}
            {heroIterations.length > 1 && (
              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">Previous Iterations</span>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {heroIterations.slice(0, -1).map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => renderStore.setHeroImage(img)}
                      className={cn(
                        "flex-shrink-0 w-24 h-16 rounded border overflow-hidden transition-all",
                        heroImage === img ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={img} alt={`Iteration ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Refinement Feedback</span>
              </div>
              <Textarea
                value={heroFeedback}
                onChange={(e) => renderStore.setHeroFeedback(e.target.value)}
                placeholder="Enter feedback to refine the image... (e.g., 'Make the booth more open', 'Add more blue lighting', 'Show more people interacting')"
                className="min-h-[100px]"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleRegenerateWithFeedback}
                  disabled={isGeneratingHero || !heroFeedback.trim()}
                  className="flex-1"
                >
                  {isGeneratingHero ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate with Feedback
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    renderStore.setHeroFeedback("");
                    handleGenerateHeroImage();
                  }}
                  disabled={isGeneratingHero}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => downloadImage(heroImage!, "hero_view")}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                onClick={handleGenerateAllViews}
                className="flex-1 btn-glow"
                disabled={isGeneratingHero}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Approve & Generate All Views
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 3: All Views Generated / Generating
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Generated Renders</h2>
          <p className="text-muted-foreground">
            {isGenerating 
              ? `Generating views... ${completedCount} of ${totalViews} complete`
              : `${completedCount} coordinated renders based on your hero image`
            }
          </p>
        </div>
        <div className="flex gap-3">
          <Dialog open={showGallery} onOpenChange={setShowGallery}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="mr-2 h-4 w-4" />
                All Images ({savedImages.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Project Image Gallery</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-[60vh] pr-4">
                {savedImages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No images saved yet. Generate renders to populate the gallery.</p>
                ) : (
                  <div className="space-y-6">
                    {/* Group by angle */}
                    {Object.entries(
                      savedImages.reduce((acc, img) => {
                        const key = img.angle_name;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(img);
                        return acc;
                      }, {} as Record<string, typeof savedImages>)
                    ).map(([angleName, images]) => (
                      <div key={angleName}>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-semibold">{angleName}</h4>
                          <Badge variant="secondary" className="text-xs">{images.length} version{images.length > 1 ? "s" : ""}</Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {images.map((img) => (
                            <div key={img.id} className="group relative rounded-lg overflow-hidden border bg-muted">
                              <img src={img.public_url} alt={img.angle_name} className="w-full aspect-video object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const link = document.createElement("a");
                                    link.href = img.public_url;
                                    link.download = `${img.angle_name.replace(/\s+/g, "_")}_${new Date(img.created_at).getTime()}.png`;
                                    link.target = "_blank";
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-white text-xs">
                                    {new Date(img.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  {img.is_current && <Badge className="bg-primary/80 text-xs">Current</Badge>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Button onClick={handleContinue} className="btn-glow" disabled={isGenerating}>
            Export Package
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {isGenerating && (
        <Card className="element-card border-primary/30">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Generating {currentlyGenerating && allAngles.find(a => a.id === currentlyGenerating)?.name}...
                </span>
                <span className="text-muted-foreground">{Math.round(generationProgress)}%</span>
              </div>
              <Progress value={generationProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reference Image */}
      <Card className="element-card border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Style Reference (3/4 Hero View)
            <Badge className="bg-primary/20 text-primary ml-2">Source</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-[400px,1fr] gap-4">
            <div className="rounded-lg overflow-hidden border">
              <img 
                src={heroImage!} 
                alt="Reference" 
                className="w-full h-auto object-contain"
              />
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Consistency Tokens</h4>
                <div className="flex flex-wrap gap-2">
                  {brief.brand.visualIdentity.colors.map((c: string) => (
                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                  {spatialData.materialsAndMood?.slice(0, 3).map((m: any) => (
                    <Badge key={m.material} variant="secondary" className="text-xs">{m.material}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy("hero_34")}>
                  <Copy className="h-3 w-3 mr-2" />
                  Copy Prompt
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadImage(heroImage!, "hero_view")}>
                  <Download className="h-3 w-3 mr-2" />
                  Download
                </Button>
                <Button variant="outline" size="sm" onClick={() => renderStore.setPhase("hero-review")}>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refine Hero
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standard Views */}
      <h3 className="text-lg font-semibold mt-2">Exterior Views</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ANGLE_CONFIG.filter(a => a.id !== "hero_34").map((angle) => {
          const imageData = generatedImages[angle.id];
          const prompt = generatedPrompts[angle.id] || "";
          
          return (
            <Card key={angle.id} className={cn(
              "prompt-card overflow-hidden transition-all",
              imageData?.status === "generating" && "ring-2 ring-primary/50",
              imageData?.status === "complete" && "ring-1 ring-primary/20"
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                      {angle.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {angle.description}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {angle.aspectRatio}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Image Display */}
                <div className={cn(
                  "aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center",
                  imageData?.status === "generating" && "animate-pulse"
                )}>
                  {imageData?.status === "pending" && (
                    <div className="text-center text-muted-foreground">
                      <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Waiting...</p>
                    </div>
                  )}
                  {imageData?.status === "generating" && (
                    <div className="text-center text-primary">
                      <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Generating...</p>
                    </div>
                  )}
                  {imageData?.status === "complete" && imageData.url && (
                    <img 
                      src={imageData.url} 
                      alt={angle.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {imageData?.status === "error" && (
                    <div className="text-center text-destructive">
                      <X className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-xs">{imageData.error || "Failed"}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(angle.id)}
                    className="flex-1"
                    disabled={!prompt}
                  >
                    {copiedId === angle.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  {imageData?.status === "complete" && imageData.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadImage(imageData.url, angle.name)}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  )}
                  {(imageData?.status === "error" || imageData?.status === "complete") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRegenerateView(angle.id)}
                      disabled={currentlyGenerating === angle.id}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Zone Interior Views */}
      {zoneInteriorAngles.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-6">Zone Interior Views</h3>
          <p className="text-sm text-muted-foreground -mt-4">
            Interior perspectives of each zone, featuring content strategy items
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {zoneInteriorAngles.map((angle: any) => {
              const imageData = generatedImages[angle.id];
              const prompt = generatedPrompts[angle.id] || "";
              
              return (
                <Card key={angle.id} className={cn(
                  "prompt-card overflow-hidden transition-all border-primary/10",
                  imageData?.status === "generating" && "ring-2 ring-primary/50",
                  imageData?.status === "complete" && "ring-1 ring-primary/20"
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          {angle.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {angle.description}
                        </p>
                      </div>
                      <Badge className="bg-primary/10 text-primary text-xs">Interior</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className={cn(
                      "aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center",
                      imageData?.status === "generating" && "animate-pulse"
                    )}>
                      {imageData?.status === "pending" && (
                        <div className="text-center text-muted-foreground">
                          <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Waiting...</p>
                        </div>
                      )}
                      {imageData?.status === "generating" && (
                        <div className="text-center text-primary">
                          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                          <p className="text-xs">Generating...</p>
                        </div>
                      )}
                      {imageData?.status === "complete" && imageData.url && (
                        <img src={imageData.url} alt={angle.name} className="w-full h-full object-cover" />
                      )}
                      {imageData?.status === "error" && (
                        <div className="text-center text-destructive">
                          <X className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-xs">{imageData.error || "Failed"}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleCopy(angle.id)} className="flex-1" disabled={!prompt}>
                        {copiedId === angle.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      {imageData?.status === "complete" && imageData.url && (
                        <Button variant="outline" size="sm" onClick={() => downloadImage(imageData.url, angle.name)}>
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      {(imageData?.status === "error" || imageData?.status === "complete") && (
                        <Button variant="outline" size="sm" onClick={() => handleRegenerateView(angle.id)} disabled={currentlyGenerating === angle.id}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
