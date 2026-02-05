import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Copy, 
  Check, 
  ChevronRight,
  Camera,
  Sparkles,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

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

export function PromptGenerator() {
  const { currentProject, setActiveStep } = useProjectStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [heroPrompt, setHeroPrompt] = useState<string>("");
  const [styleConfirmed, setStyleConfirmed] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<Record<string, string>>({});

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

  const handleConfirmStyle = () => {
    setStyleConfirmed(true);
    // Generate all remaining prompts
    const prompts: Record<string, string> = {};
    ANGLE_CONFIG.filter(a => a.id !== "hero_34").forEach(angle => {
      prompts[angle.id] = generatePrompt(angle.id);
    });
    setGeneratedPrompts(prompts);
    toast({
      title: "Style confirmed!",
      description: "All 7 additional angle prompts have been generated",
    });
  };

  const handleContinue = () => {
    setActiveStep("export");
    navigate("/export");
  };

  // Phase 1: Hero Prompt Generation
  if (!styleConfirmed) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">Step 1: Generate Hero Style</h2>
          <p className="text-muted-foreground">
            First, we'll create the hero prompt for Nano Banana. Once you're happy with the style, 
            we'll generate the remaining 7 coordinated views.
          </p>
        </div>

        {/* Hero Card */}
        <Card className="element-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-primary" />
                  3/4 Hero View
                </CardTitle>
                <CardDescription>
                  Primary marketing shot — 45° front-left perspective
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

        {/* Instructions */}
        {heroPrompt && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h3 className="font-semibold">Next Steps:</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Copy the prompt above</li>
                  <li>Paste into Nano Banana (or your preferred AI image generator)</li>
                  <li>Generate images until you find a style you love</li>
                  <li>Once satisfied, click "Confirm Style" below</li>
                </ol>
                <Button onClick={handleConfirmStyle} className="w-full btn-glow">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  I'm Happy With My Style — Generate All Views
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Phase 2: All Views Generated
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">All Render Prompts</h2>
          <p className="text-muted-foreground">
            8 coordinated prompts matching your chosen style
          </p>
        </div>
        <Button onClick={handleContinue} className="btn-glow">
          Export Package
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Consistency Tokens */}
      <Card className="element-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Consistency Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Colors</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {brief.brand.visualIdentity.colors.map((c: string) => (
                  <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Materials</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {spatialData.materialsAndMood?.slice(0, 3).map((m: any) => (
                  <Badge key={m.material} variant="outline" className="text-xs">{m.material}</Badge>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Lighting</span>
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="outline" className="text-xs">ambient</Badge>
                <Badge variant="outline" className="text-xs">editorial</Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Style</span>
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="outline" className="text-xs">photorealistic</Badge>
                <Badge variant="outline" className="text-xs">architectural</Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Avoid</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {brief.brand.visualIdentity.avoidImagery.slice(0, 2).map((a: string) => (
                  <Badge key={a} variant="outline" className="text-xs text-destructive">{a}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hero Card - Highlighted */}
      <Card className="prompt-card border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" />
                3/4 Hero View
                <Badge className="bg-primary/20 text-primary">Style Reference</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Primary marketing shot — 45° front-left perspective
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">16:9</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              value={heroPrompt}
              readOnly
              className="min-h-[120px] text-xs font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy("hero_34")}
              className="w-full"
            >
              {copiedId === "hero_34" ? (
                <>
                  <Check className="mr-2 h-3 w-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-3 w-3" />
                  Copy Prompt
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Other Prompt Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ANGLE_CONFIG.filter(a => a.id !== "hero_34").map((angle) => (
          <Card key={angle.id} className="prompt-card">
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
            <CardContent>
              <div className="space-y-3">
                <Textarea
                  value={generatedPrompts[angle.id] || ""}
                  readOnly
                  className="min-h-[100px] text-xs font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(angle.id)}
                  className="w-full"
                >
                  {copiedId === angle.id ? (
                    <>
                      <Check className="mr-2 h-3 w-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-3 w-3" />
                      Copy Prompt
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
