import { useState, useCallback } from "react";
import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  MessageSquare
} from "lucide-react";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ANGLE_CONFIG = [
  { id: "hero_34", name: "3/4 Hero View", priority: 1, aspectRatio: "16:9", description: "Primary marketing shot — 45° front-left perspective" },
  { id: "top", name: "Top-Down View", priority: 2, aspectRatio: "1:1", description: "Floor plan validation — directly overhead" },
  { id: "front", name: "Front Elevation", priority: 3, aspectRatio: "16:9", description: "Primary aisle view — eye-level, centered on entry" },
  { id: "left", name: "Left Side", priority: 4, aspectRatio: "16:9", description: "Side aisle view — eye-level, 90° left" },
  { id: "right", name: "Right Side", priority: 5, aspectRatio: "16:9", description: "Opposite side view — eye-level, 90° right" },
  { id: "back", name: "Back View", priority: 6, aspectRatio: "16:9", description: "Service/structure view — eye-level, behind booth" },
  { id: "detail_hero", name: "Hero Detail", priority: 7, aspectRatio: "4:3", description: "Medium shot focused on hero installation" },
  { id: "detail_lounge", name: "Lounge Detail", priority: 8, aspectRatio: "4:3", description: "Medium shot focused on human connection zone" },
];

interface GeneratedImage {
  url: string;
  status: "pending" | "generating" | "complete" | "error";
  error?: string;
}

type WorkflowPhase = "prompt" | "hero-generation" | "hero-review" | "all-views";

export function PromptGenerator() {
  const { currentProject, setActiveStep } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [heroPrompt, setHeroPrompt] = useState<string>("");
  const [phase, setPhase] = useState<WorkflowPhase>("prompt");
  const [generatedPrompts, setGeneratedPrompts] = useState<Record<string, string>>({});
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [heroFeedback, setHeroFeedback] = useState<string>("");
  const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
  const [isGeneratingHero, setIsGeneratingHero] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentlyGenerating, setCurrentlyGenerating] = useState<string | null>(null);
  const [heroIterations, setHeroIterations] = useState<string[]>([]);

  const brief = currentProject?.parsedBrief;
  const spatialData = currentProject?.elements.spatialStrategy.data;
  const bigIdea = currentProject?.elements.bigIdea.data;

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
    if (!heroPrompt) setHeroPrompt(prompt);
    
    setPhase("hero-generation");
    setIsGeneratingHero(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-hero', {
        body: {
          prompt,
          feedback: heroFeedback || undefined,
          previousImageUrl: heroImage || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setHeroImage(data.imageUrl);
      setHeroIterations(prev => [...prev, data.imageUrl]);
      setPhase("hero-review");
      setHeroFeedback("");
      
      toast({
        title: "Hero image generated",
        description: "Review the image and provide feedback or proceed to generate all views",
      });
    } catch (error) {
      console.error("Error generating hero:", error);
      setPhase("prompt");
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingHero(false);
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

  const generateSingleView = async (angleId: string, prompt: string, aspectRatio: string): Promise<string | null> => {
    if (!heroImage) return null;

    const angle = ANGLE_CONFIG.find(a => a.id === angleId);
    if (!angle) return null;

    try {
      const { data, error } = await supabase.functions.invoke('generate-view', {
        body: {
          referenceImageUrl: heroImage,
          viewPrompt: prompt,
          viewName: angle.name,
          aspectRatio: aspectRatio,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data.imageUrl;
    } catch (error) {
      console.error(`Error generating ${angleId}:`, error);
      throw error;
    }
  };

  const handleGenerateAllViews = async () => {
    setPhase("all-views");
    
    // Generate all prompts first
    const prompts: Record<string, string> = {};
    const viewsToGenerate = ANGLE_CONFIG.filter(a => a.id !== "hero_34");
    viewsToGenerate.forEach(angle => {
      prompts[angle.id] = generatePrompt(angle.id);
    });
    setGeneratedPrompts(prompts);

    // Set hero image as already complete
    setGeneratedImages({
      hero_34: { url: heroImage!, status: "complete" },
    });

    // Start generating images
    setIsGenerating(true);
    setGenerationProgress(0);

    // Initialize all views as pending
    const initialImages: Record<string, GeneratedImage> = {
      hero_34: { url: heroImage!, status: "complete" },
    };
    viewsToGenerate.forEach(angle => {
      initialImages[angle.id] = { url: "", status: "pending" };
    });
    setGeneratedImages(initialImages);

    // Generate each view sequentially to avoid rate limits
    for (let i = 0; i < viewsToGenerate.length; i++) {
      const angle = viewsToGenerate[i];
      setCurrentlyGenerating(angle.id);
      setGeneratedImages(prev => ({
        ...prev,
        [angle.id]: { url: "", status: "generating" },
      }));

      try {
        const imageUrl = await generateSingleView(angle.id, prompts[angle.id], angle.aspectRatio);
        
        setGeneratedImages(prev => ({
          ...prev,
          [angle.id]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
        }));

        setGenerationProgress(((i + 1) / viewsToGenerate.length) * 100);
        
        toast({
          title: `${angle.name} generated`,
          description: `${i + 1} of ${viewsToGenerate.length} views complete`,
        });
      } catch (error) {
        setGeneratedImages(prev => ({
          ...prev,
          [angle.id]: { 
            url: "", 
            status: "error", 
            error: error instanceof Error ? error.message : "Failed to generate" 
          },
        }));
        
        toast({
          title: `Error generating ${angle.name}`,
          description: error instanceof Error ? error.message : "Please try again",
          variant: "destructive",
        });
      }
    }

    setIsGenerating(false);
    setCurrentlyGenerating(null);
    
    toast({
      title: "All views generated!",
      description: "Your coordinated booth renders are ready",
    });
  };

  const regenerateView = async (angleId: string) => {
    const angle = ANGLE_CONFIG.find(a => a.id === angleId);
    if (!angle || !heroImage) return;

    setGeneratedImages(prev => ({
      ...prev,
      [angleId]: { url: "", status: "generating" },
    }));

    try {
      const prompt = generatedPrompts[angleId] || generatePrompt(angleId);
      const imageUrl = await generateSingleView(angleId, prompt, angle.aspectRatio);
      
      setGeneratedImages(prev => ({
        ...prev,
        [angleId]: { url: imageUrl || "", status: imageUrl ? "complete" : "error" },
      }));

      toast({
        title: `${angle.name} regenerated`,
        description: "New view generated successfully",
      });
    } catch (error) {
      setGeneratedImages(prev => ({
        ...prev,
        [angleId]: { 
          url: "", 
          status: "error", 
          error: error instanceof Error ? error.message : "Failed to generate" 
        },
      }));
      
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
  const totalViews = ANGLE_CONFIG.length;

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
                      onClick={() => setHeroImage(img)}
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
                onChange={(e) => setHeroFeedback(e.target.value)}
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
                    setHeroFeedback("");
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
        <Button onClick={handleContinue} className="btn-glow" disabled={isGenerating}>
          Export Package
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Progress Bar */}
      {isGenerating && (
        <Card className="element-card border-primary/30">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Generating {currentlyGenerating && ANGLE_CONFIG.find(a => a.id === currentlyGenerating)?.name}...
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
                <Button variant="outline" size="sm" onClick={() => setPhase("hero-review")}>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refine Hero
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generated Views Grid */}
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
                      onClick={() => regenerateView(angle.id)}
                      disabled={isGenerating}
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
    </div>
  );
}
