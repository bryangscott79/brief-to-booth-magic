// BriefExistingSpace — authoring UI for interior-design / hybrid
// projects whose industry.inputMode is "existing-space-photo". Lets
// the user upload a single photo of the existing space, runs the
// analyze-existing-space edge function on upload, and surfaces the
// vision-model output as editable fields.
//
// Composes three pieces:
//   1. Empty state: react-dropzone upload affordance.
//   2. Populated state header: photo badge + Replace photo button.
//   3. PhotoAnnotationCanvas for keep/change polygon authoring +
//      editable analysis fields (dimensions, summary, materials).
//
// The component is controlled — it owns no brief state itself.
// Persistence (debounce + Supabase write) happens in BriefReview.

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PhotoAnnotationCanvas } from "./PhotoAnnotationCanvas";
import type { ParsedBriefExistingSpace, Polygon } from "@/types/brief";

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export interface BriefExistingSpaceProps {
  value: ParsedBriefExistingSpace | null;
  onChange: (next: ParsedBriefExistingSpace | null) => void;
  projectId: string;
}

/** Minimal empty-block scaffold the optimistic upload path commits
 *  before the analyze function returns. Keeps the canvas mountable
 *  immediately so the user sees the photo right away. */
function emptyBlock(photoUrl: string): ParsedBriefExistingSpace {
  return {
    photoUrl,
    annotations: { keep: [], change: [] },
    analysis: {
      features: [],
      existingMaterials: {},
      lighting: {},
    },
  };
}

export function BriefExistingSpace({ value, onChange, projectId }: BriefExistingSpaceProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // The analyze-existing-space invoke is async (~5s). During that
  // window the user can keep editing — drawing polygons, typing into
  // the analysis fields — which lands on the parent's `value` via
  // onChange. If we then spread the stale `baseline` snapshot when
  // the analyze response returns, we silently overwrite that work.
  // Tracking the latest `value` in a ref lets the analyze callback
  // merge `analysis` into the most recent state instead.
  const latestValueRef = useRef<ParsedBriefExistingSpace | null>(value);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast({
          title: "Photo too large",
          description: "Max 25 MB. Please compress and try again.",
          variant: "destructive",
        });
        return;
      }
      setIsUploading(true);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        // Path layout: <projectId>/existing-space/<timestamp>.<ext>.
        // The project-id MUST be the first folder segment — the
        // project-images RLS policy keys ownership off
        // `(storage.foldername(name))[1]` (see migration
        // 20260512190216). With the project-id second the INSERT
        // policy rejects the upload and the user sees a silent fail.
        const path = `${projectId}/existing-space/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("project-images")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage
          .from("project-images")
          .getPublicUrl(path);
        const photoUrl = urlData.publicUrl;

        // Optimistic commit so the user sees the photo immediately.
        const baseline = emptyBlock(photoUrl);
        onChange(baseline);
        setIsUploading(false);

        // Async-call analyze. Failure here doesn't block authoring —
        // the user can hand-type the analysis fields below.
        setIsAnalyzing(true);
        try {
          const { data, error } = await supabase.functions.invoke("analyze-existing-space", {
            body: { photoUrl },
          });
          if (error) throw error;
          if (!data?.success) {
            throw new Error(
              typeof data?.error === "string" ? data.error : "Analysis failed",
            );
          }
          const analysis = (data.analysis ?? {}) as ParsedBriefExistingSpace["analysis"];
          // Merge into the LATEST value so any polygons / typed-edits
          // the user made while analyze was in flight survive. Falling
          // back to `baseline` defends against the (impossible-in-
          // practice) case where the parent set value to null mid-
          // analyze; in that case re-seeding from baseline is fine
          // because the photoUrl still exists in storage.
          const current = latestValueRef.current ?? baseline;
          onChange({
            ...current,
            analysis: {
              estimatedDimensions: analysis.estimatedDimensions,
              features: analysis.features ?? [],
              existingMaterials: analysis.existingMaterials ?? {},
              lighting: analysis.lighting ?? {},
              summary: analysis.summary,
            },
          });
        } catch (err) {
          toast({
            title: "Couldn't analyze photo",
            description:
              err instanceof Error
                ? err.message
                : "You can still fill in the fields by hand.",
            variant: "destructive",
          });
        } finally {
          setIsAnalyzing(false);
        }
      } catch (err) {
        setIsUploading(false);
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    },
    [onChange, projectId, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_BYTES,
  });

  // ── Empty state ─────────────────────────────────────────────────
  if (!value) {
    return (
      <Card className="element-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Existing space
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`upload-zone rounded-xl p-8 text-center cursor-pointer transition-colors border-2 border-dashed ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input {...getInputProps()} />
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {isDragActive
                    ? "Drop the photo here"
                    : "Drop a photo of the existing space, or click to upload"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, or WebP — up to 25 MB
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Populated state ─────────────────────────────────────────────
  const patchAnalysis = (patch: Partial<ParsedBriefExistingSpace["analysis"]>) =>
    onChange({
      ...value,
      analysis: { ...value.analysis, ...patch },
    });
  const patchMaterials = (
    patch: Partial<ParsedBriefExistingSpace["analysis"]["existingMaterials"]>,
  ) =>
    onChange({
      ...value,
      analysis: {
        ...value.analysis,
        existingMaterials: { ...value.analysis.existingMaterials, ...patch },
      },
    });
  const patchDimensions = (
    patch: Partial<NonNullable<ParsedBriefExistingSpace["analysis"]["estimatedDimensions"]>>,
  ) => {
    const prior = value.analysis.estimatedDimensions ?? {
      width: 0,
      depth: 0,
      ceilingHeightFt: 0,
    };
    patchAnalysis({ estimatedDimensions: { ...prior, ...patch } });
  };

  const handleAnnotations = (keep: Polygon[], change: Polygon[]) =>
    onChange({ ...value, annotations: { keep, change } });

  const dims = value.analysis.estimatedDimensions;

  return (
    <Card className="element-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Existing space
            {isAnalyzing && (
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing…
              </Badge>
            )}
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(null)}
          >
            <RefreshCcw className="h-3 w-3 mr-1" />
            Replace photo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <PhotoAnnotationCanvas
          photoUrl={value.photoUrl}
          keep={value.annotations.keep}
          change={value.annotations.change}
          onChange={handleAnnotations}
        />

        {/* Dimensions */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Estimated dimensions</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Width (ft)</Label>
              <Input
                type="number"
                value={dims?.width ?? ""}
                onChange={(e) =>
                  patchDimensions({ width: Number(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Depth (ft)</Label>
              <Input
                type="number"
                value={dims?.depth ?? ""}
                onChange={(e) =>
                  patchDimensions({ depth: Number(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Ceiling (ft)</Label>
              <Input
                type="number"
                value={dims?.ceilingHeightFt ?? ""}
                onChange={(e) =>
                  patchDimensions({ ceilingHeightFt: Number(e.target.value) || 0 })
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Summary</Label>
          <Textarea
            value={value.analysis.summary ?? ""}
            onChange={(e) => patchAnalysis({ summary: e.target.value })}
            className="min-h-[60px] text-sm"
            placeholder="One- or two-sentence description of the space."
          />
        </div>

        {/* Materials — floors / walls */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Existing materials</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Floors</Label>
              <Input
                value={value.analysis.existingMaterials.floors ?? ""}
                onChange={(e) => patchMaterials({ floors: e.target.value })}
                className="h-8 text-sm"
                placeholder="e.g. oak hardwood"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Walls</Label>
              <Input
                value={value.analysis.existingMaterials.walls ?? ""}
                onChange={(e) => patchMaterials({ walls: e.target.value })}
                className="h-8 text-sm"
                placeholder="e.g. painted drywall, eggshell white"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
