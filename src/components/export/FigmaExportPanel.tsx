/**
 * FigmaExportPanel — UI for exporting project data as a Figma-importable JSON spec
 *
 * Generates a structured JSON that maps to Figma frames: text nodes, image references,
 * color tokens, and typography scale. Downloads as a .json file.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Figma, Download, Loader2, FileJson, Layers } from "lucide-react";
import {
  generateFigmaSpec,
  downloadFigmaSpec,
  type FigmaSpec,
} from "@/lib/figmaExporter";
import type {
  ProposalData,
  ProposalConfig,
  RhinoRenderEntry,
  BrandIntelEntry,
} from "@/lib/proposalGenerator";

interface FigmaExportPanelProps {
  brief: any;
  elements: any;
  images: Array<{ angle_name: string; public_url: string; angle_id: string; is_current: boolean }>;
  projectName: string;
  config: ProposalConfig;
  rhinoRenders?: RhinoRenderEntry[];
  brandIntelligence?: BrandIntelEntry[];
}

export function FigmaExportPanel({
  brief,
  elements,
  images,
  projectName,
  config,
  rhinoRenders,
  brandIntelligence,
}: FigmaExportPanelProps) {
  const [spec, setSpec] = useState<FigmaSpec | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    try {
      const currentImages = images.filter((img) => img.is_current);
      const proposalData: ProposalData = {
        brief,
        elements,
        images: currentImages,
        config,
        rhinoRenders,
        brandIntelligence,
      };

      const figmaSpec = generateFigmaSpec(proposalData);
      setSpec(figmaSpec);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!spec) return;
    downloadFigmaSpec(spec, projectName);
  };

  return (
    <Card className="element-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Figma className="h-4 w-4 text-primary" />
              Figma Export
            </CardTitle>
            <CardDescription className="mt-1">
              Generate a structured JSON spec for import into Figma
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {spec && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1 h-3 w-3" /> Download .json
              </Button>
            )}
            <Button size="sm" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <FileJson className="mr-1 h-3 w-3" />
              )}
              {spec ? "Regenerate" : "Generate Spec"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!spec && !isGenerating && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generates a JSON spec with frames, text nodes, image references, color tokens,
              and typography — ready for import into Figma via plugin or REST API.
            </p>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" /> 1920×1080 frames
              </span>
              <span className="flex items-center gap-1">
                <FileJson className="h-3 w-3" /> Structured JSON
              </span>
            </div>
          </div>
        )}

        {spec && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="secondary">{spec.frames.length} frames</Badge>
              <Badge variant="outline">{Object.keys(spec.colorTokens).length} color tokens</Badge>
            </div>

            {/* Frame preview */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {spec.frames.map((frame, i) => (
                <div
                  key={i}
                  className="p-2 rounded-lg bg-muted/50 text-center border border-transparent hover:border-primary/20 transition-colors"
                >
                  <div className="text-xs font-medium truncate">{frame.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {frame.nodes.length} nodes
                  </div>
                </div>
              ))}
            </div>

            {/* Import instructions */}
            <div className="p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How to import into Figma:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Download the JSON spec file</li>
                <li>Open your Figma project</li>
                <li>Use the BriefEngine plugin or Figma REST API to import frames</li>
                <li>Polish layouts, swap placeholder images, and refine typography</li>
              </ol>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
