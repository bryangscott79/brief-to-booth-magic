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
  Upload,
  ImageIcon,
  X,
  Loader2,
  Download,
  RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";
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

export function PromptGenerator() {
  const { currentProject, setActiveStep } = useProjectStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [heroPrompt, setHeroPrompt] = useState<string>("");
  const [styleConfirmed, setStyleConfirmed] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<Record<string, string>>({});
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImageName, setReferenceImageName] = useState<string>("");
  const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentlyGenerating, setCurrentlyGenerating] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setReferenceImage(reader.result as string);
        setReferenceImageName(file.name);
      };
      reader.readAsDataURL(file);
      toast({
        title: "Image uploaded",
        description: "Your reference image has been added",
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxFiles: 1,
  });

  const removeReferenceImage = () => {
    setReferenceImage(null);
    setReferenceImageName("");
  };

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

  const handleGenerateHeroPrompt = () => {
    const prompt = generatePrompt("hero_34");
    setHeroPrompt(prompt);
    toast({
      title: "Hero prompt generated",
      description: "Copy this prompt to Nano Banana and generate your style",
    });
  };

  const handleCopy = async (angleId: string) => {
    const prompt = angleId === "hero_34" ? heroPrompt : (generatedPrompts[angleId] || generatePrompt(angleId));
    await navigator.clipboard.writeText(prompt);
    setCopiedId(angleId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Paste into Nano Banana or your preferred AI image generator",
    });
  };

  const generateSingleView = async (angleId: string, prompt: string, aspectRatio: string): Promise<string | null> => {
    if (!referenceImage) return null;

    const angle = ANGLE_CONFIG.find(a => a.id === angleId);
    if (!angle) return null;

    try {
      const { data, error } = await supabase.functions.invoke('generate-view', {
        body: {
          referenceImageUrl: referenceImage,
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

  const handleConfirmAndGenerate = async () => {
    setStyleConfirmed(true);
    
    // Generate all prompts first
    const prompts: Record<string, string> = {};
    const viewsToGenerate = ANGLE_CONFIG.filter(a => a.id !== "hero_34");
    viewsToGenerate.forEach(angle => {
      prompts[angle.id] = generatePrompt(angle.id);
    });
    setGeneratedPrompts(prompts);

    // Set hero image as already complete
    setGeneratedImages({
      hero_34: { url: referenceImage!, status: "complete" },
    });

    // Start generating images
    setIsGenerating(true);
    setGenerationProgress(0);

    // Initialize all views as pending
    const initialImages: Record<string, GeneratedImage> = {
      hero_34: { url: referenceImage!, status: "complete" },
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
    if (!angle || !referenceImage) return;

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

  // Phase 1: Hero Prompt Generation
  if (!styleConfirmed) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Generate Render Prompts</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Create a hero image in Nano Banana, upload it as your style reference, 
            then we'll automatically generate all 7 additional views.
          </p>
        </div>

        {/* Step 1: Hero Card */}
        <Card className="element-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
                  3/4 Hero View
                </CardTitle>
                <CardDescription>
                  Generate the hero prompt, then use it in Nano Banana to create your reference image
                </CardDescription>
              </div>
              <Badge variant="secondary">16:9</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!heroPrompt ? (
              <Button onClick={handleGenerateHeroPrompt} className="w-full btn-glow">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Hero Prompt
              </Button>
            ) : (
              <>
                <Textarea
                  value={heroPrompt}
                  readOnly
                  className="min-h-[300px] text-sm font-mono"
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => handleCopy("hero_34")}
                    className="flex-1"
                  >
                    {copiedId === "hero_34" ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Prompt
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Instructions & Image Upload */}
        {heroPrompt && (
          <>
            {/* Step 2: Upload Reference Image */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">2</span>
                  Upload Your Reference Image
                </CardTitle>
                <CardDescription>
                  After generating your hero image in Nano Banana, upload it here. This will be used to generate consistent views of the same scene.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!referenceImage ? (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                      isDragActive 
                        ? "border-primary bg-primary/10" 
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    {isDragActive ? (
                      <p className="text-primary font-medium">Drop your image here...</p>
                    ) : (
                      <>
                        <p className="font-medium">Drag & drop your Nano Banana image</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          or click to browse • PNG, JPG, WebP
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden border bg-muted">
                      <img 
                        src={referenceImage} 
                        alt="Reference" 
                        className="w-full h-auto max-h-[300px] object-contain"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={removeReferenceImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      <span className="truncate">{referenceImageName}</span>
                      <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Generate All Views */}
            <Card className={cn(
              "border-primary/20 transition-opacity",
              referenceImage ? "opacity-100" : "opacity-50"
            )}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">3</span>
                  Generate All Views with AI
                </CardTitle>
                <CardDescription>
                  {referenceImage 
                    ? "Ready! Nano Banana will generate 7 additional views matching your reference image style."
                    : "Upload your reference image first to enable this step."
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleConfirmAndGenerate} 
                  className="w-full btn-glow"
                  disabled={!referenceImage}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate All 7 Views Automatically
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  This will use AI to create consistent renders for each angle
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // Phase 2: All Views Generated / Generating
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Generated Renders</h2>
          <p className="text-muted-foreground">
            {isGenerating 
              ? `Generating views... ${completedCount} of ${totalViews} complete`
              : `${completedCount} coordinated renders based on your reference`
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
                src={referenceImage!} 
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
                <Button variant="outline" size="sm" onClick={() => downloadImage(referenceImage!, "hero_view")}>
                  <Download className="h-3 w-3 mr-2" />
                  Download
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
