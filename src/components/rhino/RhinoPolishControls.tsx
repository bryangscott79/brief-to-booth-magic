import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RhinoRender } from "@/hooks/useRhinoRenders";

const STYLE_PRESETS = [
  { id: "photorealistic", label: "Photorealistic", description: "Ultra-realistic materials and lighting" },
  { id: "sketch", label: "Sketch", description: "Hand-drawn architectural style" },
  { id: "watercolor", label: "Watercolor", description: "Artistic watercolor illustration" },
] as const;

type StylePreset = typeof STYLE_PRESETS[number]["id"];

interface RhinoPolishControlsProps {
  render: RhinoRender;
  onPolish: (instructions: string, stylePreset: StylePreset) => void;
  isPolishing: boolean;
}

export function RhinoPolishControls({ render, onPolish, isPolishing }: RhinoPolishControlsProps) {
  const [instructions, setInstructions] = useState("");
  const [stylePreset, setStylePreset] = useState<StylePreset>("photorealistic");

  const isProcessing = render.polish_status === "processing" || isPolishing;

  return (
    <div className="space-y-3">
      {/* Style presets */}
      <div>
        <Label className="text-xs">Style</Label>
        <div className="flex gap-2 mt-1">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setStylePreset(preset.id)}
              className={cn(
                "flex-1 p-2 rounded-md border text-xs text-left transition-colors",
                stylePreset === preset.id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/40"
              )}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-muted-foreground text-[10px] mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom instructions */}
      <div>
        <Label className="text-xs">Custom Instructions (optional)</Label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Add warmer lighting, more people near the entrance, emphasize the LED wall..."
          className="text-xs min-h-[60px] mt-1"
          disabled={isProcessing}
        />
      </div>

      {/* Polish button */}
      <Button
        onClick={() => onPolish(instructions, stylePreset)}
        disabled={isProcessing}
        className="w-full"
        size="sm"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            Polishing...
          </>
        ) : render.polish_status === "complete" ? (
          <>
            <Wand2 className="mr-1.5 h-3 w-3" />
            Re-polish
          </>
        ) : (
          <>
            <Sparkles className="mr-1.5 h-3 w-3" />
            Polish with AI
          </>
        )}
      </Button>

      {/* Error state */}
      {render.polish_status === "error" && render.polish_feedback && (
        <Badge variant="destructive" className="text-xs">
          Error: {render.polish_feedback}
        </Badge>
      )}
    </div>
  );
}
