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

// Import spatial utilities
import {
  normalizeZones,
  calculateBoothDimensions,
  generateZoneDescriptionsForPrompt,
  generateScaleContext,
  generateCameraScaleHints,
  type NormalizedZone,
} from "@/lib/spatialUtils";

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
function getZoneInteriorAngles(normalizedZones: NormalizedZone[]) {
  return normalizedZones.map((zone, index) => ({
    id: `zone_interior_${zone.id}`,
    name: `${zone.name} Interior`,
    priority: 9 + index,
    aspectRatio: "16:9",
    description: `Interior perspective inside the ${zone.name} zone — showing featured content and visitor experience`,
    isZoneInterior: true,
    zoneData: zone,
  }));
}

/** Build a zone-specific interior prompt using content strategy data */
function generateZoneInteriorPrompt(
  zone: NormalizedZone, 
  brief: any, 
  bigIdea: any, 
  boothDimensions: any,
  elements: any,
  materialsAndMood: any[]
): string {
  const zoneName = (zone.name || "").toLowerCase();
  const parts: string[] = [];

  // Get hero installation details for visual consistency
  const heroInstallation = elements?.interactiveMechanics?.data?.hero;
  const heroPhysicalForm = heroInstallation?.physicalForm;
  
  // Extract brand colors
  const brandColors = brief.brand?.visualIdentity?.colors || [];
  const primaryColor = brandColors[0] || "brand blue";
  const secondaryColor = brandColors[1] || "white";
  
  // Build visual style description from hero
  const heroVisualStyle = heroInstallation ? `
The booth features a central "${heroInstallation.name}" installation:
- Structure: ${heroPhysicalForm?.structure || heroInstallation.concept}
- Materials: ${heroPhysicalForm?.materials?.join(", ") || "premium materials"}
- Lighting: ${heroPhysicalForm?.lighting || "dramatic accent lighting in brand colors"}
- Scale: ${heroPhysicalForm?.dimensions || "prominent central feature"}` : "";

  parts.push(`Generate a photorealistic INTERIOR perspective from INSIDE the "${zone.name}" zone of a ${boothDimensions.footprintLabel} (${boothDimensions.totalSqft} sq ft) trade show booth for ${brief.brand.name}.

THIS IS CRITICAL: This zone is part of the SAME booth as the hero image reference. You must maintain EXACT visual consistency.`);

  parts.push("");
  parts.push("═══════════════════════════════════════");
  parts.push("VISUAL CONSISTENCY REQUIREMENTS (MANDATORY)");
  parts.push("═══════════════════════════════════════");
  parts.push("");
  parts.push("This zone interior MUST match the hero reference image exactly:");
  parts.push("");
  parts.push(`BRAND: ${brief.brand.name}`);
  parts.push(`PRIMARY COLOR: ${primaryColor}`);
  parts.push(`SECONDARY COLOR: ${secondaryColor}`);
  parts.push("");
  parts.push("ARCHITECTURAL ELEMENTS TO MATCH:");
  parts.push("- Wall panel style (same material, color, finish)");
  parts.push("- Ceiling/fascia design (same structure, lighting style)");
  parts.push("- Floor material and color");
  parts.push("- Lighting fixtures and color temperature");
  parts.push("- Screen bezels and display styles");
  parts.push("- Furniture design language");
  parts.push("");
  
  if (heroVisualStyle) {
    parts.push("HERO INSTALLATION (visible or referenced in background):");
    parts.push(heroVisualStyle);
    parts.push("");
  }

  parts.push("DESIGN DIRECTION:");
  parts.push(`"${bigIdea.headline}"`);
  if (bigIdea.narrative) {
    parts.push(bigIdea.narrative.substring(0, 400));
  }
  parts.push("");

  parts.push("═══════════════════════════════════════");
  parts.push(`ZONE: ${zone.name}`);
  parts.push("═══════════════════════════════════════");
  parts.push("");
  parts.push(`Size: ${zone.sqft} sq ft (${zone.percentage}% of booth)`);
  parts.push(`Position: ${Math.round(zone.position.x)}% from left, ${Math.round(zone.position.y)}% from front`);
  parts.push("");

  // Zone-specific content details
  if (zoneName.includes("hero") || zoneName.includes("experience") || zoneName.includes("apex") || zoneName.includes("digital") || zoneName.includes("core")) {
    const im = elements.interactiveMechanics?.data;
    if (im?.hero) {
      parts.push("ZONE FOCUS: Hero Installation Close-Up");
      parts.push(`Show the "${im.hero.name}" from an interior perspective.`);
      parts.push(`Concept: ${im.hero.concept}`);
      if (im.hero.physicalForm) {
        parts.push(`Structure: ${im.hero.physicalForm.structure}`);
        parts.push(`Materials: ${im.hero.physicalForm.materials?.join(", ")}`);
        parts.push(`Lighting: ${im.hero.physicalForm.lighting || "accent lighting"}`);
      }
      parts.push("Show 3-4 visitors actively engaging with the installation.");
    }
  } else if (zoneName.includes("lounge") || zoneName.includes("hub") || zoneName.includes("casual")) {
    parts.push("ZONE FOCUS: Casual Lounge Area");
    parts.push("Modern lounge seating in brand style visible from hero image.");
    parts.push("Same furniture design language as the main booth.");
    parts.push("Subtle brand signage. Warm, inviting atmosphere.");
    parts.push("Show 3-4 visitors in relaxed conversation.");
    
    const hc = elements.humanConnection?.data;
    if (hc?.hospitalityDetails) {
      parts.push(`Hospitality: ${hc.hospitalityDetails}`);
    }
  } else if (zoneName.includes("horizon") || zoneName.includes("future") || zoneName.includes("preview") || zoneName.includes("storytelling")) {
    parts.push("ZONE FOCUS: Future Vision / Storytelling");
    parts.push("Large display screens showing content. Same screen style as main booth.");
    parts.push("Theatrical lighting consistent with hero image.");
    parts.push("Show 2-4 visitors viewing content.");
    
    const ds = elements.digitalStorytelling?.data;
    if (ds?.audienceTracks?.length) {
      parts.push("Content tracks:");
      ds.audienceTracks.slice(0, 2).forEach((t: any) => {
        parts.push(`- ${t.trackName}: ${t.contentFocus}`);
      });
    }
  } else if (zoneName.includes("suite") || zoneName.includes("meeting") || zoneName.includes("bd")) {
    parts.push("ZONE FOCUS: Private Meeting Suite");
    parts.push("Semi-enclosed meeting space with glass or frosted panels.");
    parts.push("SAME architectural style as main booth - not a generic conference room.");
    parts.push("Brand colors and materials visible. Executive-level finishing.");
    parts.push("Conference table with 6-10 chairs. Display screen on wall.");
    parts.push("Show 4-6 professionals in business meeting.");
    
    // Extract meeting zone details
    const hc = elements.humanConnection?.data;
    if (hc?.configs?.[0]?.zones) {
      const matchingZone = hc.configs[0].zones.find((mz: any) => 
        zone.name.toLowerCase().includes(mz.name?.toLowerCase()) ||
        mz.name?.toLowerCase().includes("suite") ||
        mz.name?.toLowerCase().includes("meeting")
      );
      if (matchingZone) {
        parts.push(`Capacity: ${matchingZone.capacity}`);
        parts.push(`Style: ${matchingZone.description || "executive meeting space"}`);
      }
    }
  } else if (zoneName.includes("reception") || zoneName.includes("welcome")) {
    parts.push("ZONE FOCUS: Welcome/Reception");
    parts.push("Branded reception desk matching booth style.");
    parts.push("Digital check-in screens. Same design as hero image displays.");
    parts.push("Staff in professional attire. Clean, welcoming atmosphere.");
    parts.push("Show 1-2 staff greeting 2-3 visitors.");
  } else if (zoneName.includes("demo") || zoneName.includes("product")) {
    parts.push("ZONE FOCUS: Product Demo Station");
    parts.push("Interactive displays and product samples.");
    parts.push("Same counter/display style as main booth.");
    parts.push("Show staff demonstrating to 2-3 engaged visitors.");
  } else if (zoneName.includes("command") || zoneName.includes("storage") || zoneName.includes("service")) {
    parts.push("ZONE FOCUS: Command Center / Service Area");
    parts.push("Functional workspace with same finishes as main booth.");
    parts.push("Monitors, storage, and operational equipment.");
    parts.push("Clean and organized. 1-2 staff working.");
  } else {
    // Generic zone
    parts.push("ZONE FOCUS: Supporting Space");
    parts.push("Functional area matching overall booth aesthetic.");
    parts.push("Same materials and design language as hero image.");
  }

  parts.push("");
  parts.push("MATERIALS (from hero image):");
  if (materialsAndMood?.length > 0) {
    materialsAndMood.forEach((m: any) => {
      parts.push(`- ${m.material}: ${m.feel}`);
    });
  } else {
    parts.push("- Premium materials matching hero image");
    parts.push("- Consistent lighting color temperature");
    parts.push("- Same flooring throughout");
  }

  parts.push("");
  parts.push("CAMERA:");
  parts.push("Eye level (5.5 feet), positioned INSIDE this zone looking inward.");
  parts.push("Show the space's depth and connection to the larger booth.");
  parts.push("Parts of the hero installation or main booth visible in background/periphery.");

  parts.push("");
  parts.push("STYLE:");
  parts.push("Architectural visualization quality. Photorealistic materials.");
  parts.push("Same lighting style and color temperature as hero image.");
  parts.push("Professional trade show environment.");

  parts.push("");
  parts.push("NEGATIVE PROMPT:");
  parts.push(`${brief.brand.visualIdentity?.avoidImagery?.join(", ") || "generic stock photo"}, cartoon style, different color scheme than hero, different lighting than hero, generic conference room, hotel meeting room, different architectural style, inconsistent materials, different floor, different walls, mismatched design`);

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

  // Global render store
  const renderStore = useRenderStore();
  const {
    phase, heroPrompt, heroImage, heroFeedback, heroIterations,
    generatedPrompts, generatedImages, isGeneratingHero, isGenerating,
    generationProgress, currentlyGenerating, hydratedFromDb,
  } = renderStore;

  const effectiveProjectId = projectId || renderStore.projectId;
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(effectiveProjectId);
  const saveImage = useSaveRenderImage(effectiveProjectId);

  useEffect(() => {
    renderStore.setProjectId(projectId);
  }, [projectId]);

  const brief = currentProject?.parsedBrief;
  const spatialData = currentProject?.elements.spatialStrategy.data;
  const bigIdea = currentProject?.elements.bigIdea.data;
  const elements = currentProject?.elements;

  // Calculate booth dimensions
  const boothDimensions = useMemo(() => {
    const footprintStr = spatialData?.configs?.[0]?.footprintSize || 
      brief?.spatial?.footprints?.[0]?.size || 
      "30x30";
    return calculateBoothDimensions(footprintStr);
  }, [spatialData, brief]);

  // Normalize zones
  const normalizedZones = useMemo(() => {
    if (!spatialData?.configs?.[0]?.zones) return [];
    return normalizeZones(spatialData.configs[0].zones, boothDimensions.totalSqft);
  }, [spatialData, boothDimensions.totalSqft]);

  // Build combined angle list: standard + zone interiors
  const zoneInteriorAngles = useMemo(() => {
    return getZoneInteriorAngles(normalizedZones);
  }, [normalizedZones]);

  const allAngles = useMemo(() => [...ANGLE_CONFIG, ...zoneInteriorAngles], [zoneInteriorAngles]);

  // Hydrate from saved images
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

  /** Generate camera instructions for each angle */
  const getCameraInstructions = (angleId: string): string => {
    const instructions: Record<string, string> = {
      hero_34: `Camera positioned at 45 degrees front-left, eye level (5.5 feet), showing the full ${boothDimensions.width}' × ${boothDimensions.depth}' booth with hero installation as focal point`,
      top: `Camera directly overhead, looking straight down at the ${boothDimensions.width}' × ${boothDimensions.depth}' floor plan. Perfect orthographic bird's-eye view.`,
      front: `Camera at eye level (5.5 feet), centered on the main entry, capturing the full ${boothDimensions.width}-foot front facade`,
      left: `Camera at eye level, positioned at 90 degrees to the left side, showing the full ${boothDimensions.depth}-foot depth`,
      right: `Camera at eye level, positioned at 90 degrees to the right side, showing the full ${boothDimensions.depth}-foot depth`,
      back: `Camera at eye level, positioned behind the booth showing service areas and the back of the ${boothDimensions.width}-foot structure`,
      detail_hero: "Camera at medium distance (15-20 feet), focused on the central hero installation, showing interaction",
      detail_lounge: "Camera at medium distance (10-15 feet), focused on the lounge/meeting area, showing conversation",
    };
    return instructions[angleId] || "Eye-level perspective shot";
  };

  /** Generate prompt with validated spatial data */
  const generatePrompt = (angleId: string): string => {
    // Check for zone interior angles first
    const zoneAngle = zoneInteriorAngles.find((a: any) => a.id === angleId);
    if (zoneAngle?.isZoneInterior && zoneAngle.zoneData) {
      return generateZoneInteriorPrompt(
        zoneAngle.zoneData, 
        brief, 
        bigIdea, 
        boothDimensions,
        elements,
        spatialData.materialsAndMood || []
      );
    }

    const angle = ANGLE_CONFIG.find(a => a.id === angleId);
    if (!angle) return "";

    const scaleContext = generateScaleContext(boothDimensions.footprintLabel);
    const zoneDescriptions = generateZoneDescriptionsForPrompt(normalizedZones, boothDimensions.totalSqft, angleId);
    const cameraInstruction = getCameraInstructions(angleId);
    const cameraScaleHint = generateCameraScaleHints(boothDimensions.footprintLabel, angleId);

    const heroInstallation = elements?.interactiveMechanics?.data?.hero;
    const heroDescription = heroInstallation 
      ? `${heroInstallation.name} — ${heroInstallation.concept}${heroInstallation.physicalForm?.dimensions ? ` (${heroInstallation.physicalForm.dimensions})` : ''}`
      : "Central interactive installation";

    const materialsBlock = spatialData.materialsAndMood?.map((m: any) => `- ${m.material}: ${m.feel}`).join("\n") || "Clean modern finishes";

    // Floor plan annotations if any
    const annotationsBlock = spatialData.floorPlanAnnotations?.length > 0
      ? `\nFLOOR PLAN DESIGN NOTES (apply these spatial decisions):\n${spatialData.floorPlanAnnotations.map((a: any, i: number) => `${i + 1}. ${a.comment}`).join("\n")}`
      : "";

    return `Generate a photorealistic ${angle.name.toLowerCase()} of a ${boothDimensions.footprintLabel} trade show booth for ${brief.brand.name}, a ${brief.brand.category} company.

${cameraInstruction}
${cameraScaleHint}

${scaleContext}

DESIGN DIRECTION:
${bigIdea.headline}
${bigIdea.narrative?.substring(0, 400) || ""}

CREATIVE CONSTRAINTS:
Avoid: ${brief.creative?.avoid?.join(", ") || "generic looks"}
Embrace: ${brief.creative?.embrace?.join(", ") || "innovative design"}

SPATIAL LAYOUT (validated zone positions):
${zoneDescriptions}

HERO INSTALLATION:
${heroDescription}

MATERIALS AND MOOD:
${materialsBlock}

BRANDING:
${brief.brand.name} signage visible. Brand colors: ${brief.brand.visualIdentity?.colors?.join(", ") || "brand colors"}. Sophisticated, intelligent aesthetic.

ATMOSPHERE:
8-12 people naturally distributed: some engaging with the hero installation, others in conversation in the lounge, staff at reception. Convention center environment visible in background.
${annotationsBlock}

CAMERA FRAMING:
${cameraInstruction}
${cameraScaleHint}

STYLE:
Architectural visualization quality (Gensler/Rockwell Group level). Photorealistic materials. Clean editorial lighting. Professional trade show environment.

NEGATIVE PROMPT:
${brief.brand.visualIdentity?.avoidImagery?.join(", ") || "generic"}, cartoon style, oversaturated colors, empty booth, unrealistic lighting, blurry, low quality, oversized booth, mega-exhibit scale, warehouse scale, too large, excessive empty space

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
        boothSize: boothDimensions.footprintLabel,
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
      boothSize: boothDimensions.footprintLabel,
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
        boothSize: boothDimensions.footprintLabel,
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

  /** Regenerate ALL views including hero */
  const handleRegenerateAll = async () => {
    // First regenerate the hero image
    const heroPromptText = heroPrompt || generatePrompt("hero_34");
    if (!heroPrompt) renderStore.setHeroPrompt(heroPromptText);

    try {
      toast({
        title: "Regenerating all renders",
        description: "Starting with hero image, then all views...",
      });

      // Generate new hero
      await renderStore.generateHeroImage({
        prompt: heroPromptText,
        feedback: undefined, // Fresh generation
        previousImageUrl: undefined, // Don't use previous as reference
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        onSave: doSave,
      });

      // Small delay to ensure hero is ready
      await new Promise(resolve => setTimeout(resolve, 500));

      // Now generate all other views using the new hero
      const prompts: Record<string, string> = {};
      allAngles.forEach(angle => {
        if (angle.id !== "hero_34") {
          prompts[angle.id] = generatePrompt(angle.id);
        }
      });

      const newHeroImage = renderStore.heroImage;
      if (!newHeroImage) {
        throw new Error("Hero image generation failed");
      }

      await renderStore.generateAllViews({
        angles: allAngles,
        prompts,
        heroImageUrl: newHeroImage,
        projectId: projectId!,
        boothSize: boothDimensions.footprintLabel,
        onSave: doSave,
      });

      toast({
        title: "All renders regenerated!",
        description: "Fresh set of coordinated booth views ready",
      });
    } catch (error) {
      console.error("Error regenerating all:", error);
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
            Generating renders for {boothDimensions.footprintLabel} ({boothDimensions.totalSqft} sqft) booth with {normalizedZones.length} zones
          </p>
        </div>

        {/* Booth Info Card */}
        <Card className="element-card bg-muted/30">
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{boothDimensions.footprintLabel}</div>
                <div className="text-xs text-muted-foreground">Dimensions</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{boothDimensions.totalSqft}</div>
                <div className="text-xs text-muted-foreground">Square Feet</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{normalizedZones.length}</div>
                <div className="text-xs text-muted-foreground">Zones</div>
              </div>
            </div>
          </CardContent>
        </Card>

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
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Review Hero Image</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Review the generated {boothDimensions.footprintLabel} booth. Provide feedback to refine it, or approve to generate all views.
          </p>
        </div>

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
            <div className="rounded-lg overflow-hidden border bg-muted">
              <img 
                src={heroImage!} 
                alt="Generated Hero" 
                className="w-full h-auto"
              />
            </div>

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Generated Renders</h2>
          <p className="text-muted-foreground">
            {isGenerating 
              ? `Generating views... ${completedCount} of ${totalViews} complete`
              : `${completedCount} coordinated renders for ${boothDimensions.footprintLabel} booth`
            }
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRegenerateAll}
            disabled={isGenerating || isGeneratingHero}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerate All
          </Button>
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
                  <p className="text-center text-muted-foreground py-8">No images saved yet.</p>
                ) : (
                  <div className="space-y-6">
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
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => downloadImage(img.public_url, img.angle_name)}
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  Download
                                </Button>
                              </div>
                              {img.is_current && (
                                <Badge className="absolute bottom-2 right-2 bg-primary/80 text-xs">Current</Badge>
                              )}
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
                <h4 className="text-sm font-medium mb-2">Booth Specifications</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Size:</span> {boothDimensions.footprintLabel}
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Area:</span> {boothDimensions.totalSqft} sqft
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Type:</span> {boothDimensions.scaleDescription}
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Zones:</span> {normalizedZones.length}
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Zone Allocation</h4>
                <div className="space-y-1">
                  {normalizedZones.slice(0, 5).map((zone, i) => (
                    <div key={zone.id} className="flex items-center justify-between text-xs">
                      <span>{zone.name}</span>
                      <span className="text-muted-foreground">{zone.percentage}% ({zone.sqft} sqft)</span>
                    </div>
                  ))}
                  {normalizedZones.length > 5 && (
                    <div className="text-xs text-muted-foreground">+{normalizedZones.length - 5} more zones</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Standard Views */}
      <h3 className="text-lg font-semibold">Standard Views</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                      <Camera className="h-4 w-4 text-primary" />
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

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(angle.id)}
                    className="flex-1"
                    disabled={!prompt}
                  >
                    {copiedId === angle.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
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
                          {angle.zoneData?.sqft} sqft • {angle.zoneData?.percentage}% of booth
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
                      {(!imageData || imageData?.status === "pending") && (
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
