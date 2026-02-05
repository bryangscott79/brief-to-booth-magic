import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Copy, 
  Check, 
  ChevronRight,
  Camera,
  Sparkles,
  Download,
  Eye
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

  const handleGenerateAll = () => {
    const prompts: Record<string, string> = {};
    ANGLE_CONFIG.forEach(angle => {
      prompts[angle.id] = generatePrompt(angle.id);
    });
    setGeneratedPrompts(prompts);
    toast({
      title: "All prompts generated",
      description: "8 render prompts ready for AI image generation",
    });
  };

  const handleCopy = async (angleId: string) => {
    const prompt = generatedPrompts[angleId] || generatePrompt(angleId);
    await navigator.clipboard.writeText(prompt);
    setCopiedId(angleId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({
      title: "Copied to clipboard",
      description: "Paste into Nano Banana or your preferred AI image generator",
    });
  };

  const handleContinue = () => {
    setActiveStep("export");
    navigate("/export");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Render Prompts</h2>
          <p className="text-muted-foreground">
            8 coordinated prompts for AI image generation
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleGenerateAll} variant="outline">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate All Prompts
          </Button>
          <Button onClick={handleContinue} className="btn-glow">
            Export Package
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
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

      {/* Prompt Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {ANGLE_CONFIG.map((angle) => (
          <Card key={angle.id} className="prompt-card">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" />
                    {angle.name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {angle.description}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Badge variant="secondary" className="text-xs">
                    {angle.aspectRatio}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    P{angle.priority}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {generatedPrompts[angle.id] ? (
                <div className="space-y-3">
                  <Textarea
                    value={generatedPrompts[angle.id]}
                    readOnly
                    className="min-h-[120px] text-xs font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(angle.id)}
                      className="flex-1"
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
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="w-full h-24 border-2 border-dashed border-border"
                  onClick={() => {
                    setGeneratedPrompts(prev => ({
                      ...prev,
                      [angle.id]: generatePrompt(angle.id)
                    }));
                  }}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Generate Prompt
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
