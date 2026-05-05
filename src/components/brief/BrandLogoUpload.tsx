// BrandLogoUpload — small, focused control for setting the project's brand
// logo. Lives on the Upload page (sibling of InspirationIntake) so it's
// captured as early as possible. Image generation reads this URL on every
// hero / view / regen call and includes it as a reference.

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { ImagePlus, Trash2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useBrandLogo } from "@/hooks/useBrandLogo";
import { cn } from "@/lib/utils";

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/svg+xml": [".svg"],
  "image/webp": [".webp"],
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

interface BrandLogoUploadProps {
  projectId: string;
  /** Compact rendering — used inline next to other intake widgets. */
  compact?: boolean;
}

export function BrandLogoUpload({ projectId, compact = false }: BrandLogoUploadProps) {
  const { toast } = useToast();
  const { activeLogo, isLoading, upload, isUploading, remove, isRemoving } =
    useBrandLogo(projectId);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        toast({
          title: "Logo too large",
          description: "Max 5 MB. Please resize and try again.",
          variant: "destructive",
        });
        return;
      }
      try {
        await upload(file);
        toast({
          title: "Brand logo set",
          description: "The AI will reference this in every render going forward.",
        });
      } catch (e) {
        toast({
          title: "Upload failed",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
      }
    },
    [upload, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
  });

  const handleRemove = async () => {
    try {
      await remove();
      toast({ title: "Brand logo removed" });
    } catch (e) {
      toast({
        title: "Couldn't remove logo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Card className={cn(compact && "shadow-none")}>
      {!compact && (
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold">
                Brand logo
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                Drop in the brand's logo (PNG with transparency works best). The image generator
                uses this as a visual reference on every render — hero, views, and regenerations —
                so signage, fascia, and brand marks read correctly.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : activeLogo ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="h-16 w-16 shrink-0 rounded-md bg-white flex items-center justify-center overflow-hidden">
              {/* White background so transparent PNGs read against any
                * page surface. Object-contain so the logo isn't cropped. */}
              <img
                src={activeLogo.publicUrl}
                alt={activeLogo.filename}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <Check className="h-3 w-3 text-green-600" />
                <span className="font-medium">Active in renders</span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {activeLogo.filename}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={cn(
              "relative cursor-pointer rounded-lg border-2 border-dashed transition-colors px-4 py-5 text-center",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40",
              isUploading && "opacity-60 pointer-events-none",
            )}
          >
            <input {...getInputProps()} />
            {isUploading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlus className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {isUploading
                ? "Uploading…"
                : isDragActive
                  ? "Drop your logo"
                  : "Drop or click to add a brand logo"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              PNG, JPG, SVG, WEBP — up to 5 MB. Transparent backgrounds work best.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
