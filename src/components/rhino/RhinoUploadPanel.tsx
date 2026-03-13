import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, ImagePlus, Loader2, X } from "lucide-react";
import { useUploadRhino } from "@/hooks/useRhinoRenders";

const VIEW_NAME_PRESETS = [
  "Hero 3/4 View",
  "Front Elevation",
  "Rear Elevation",
  "Left Side",
  "Right Side",
  "Interior View",
  "Aerial / Bird's Eye",
  "Detail Close-up",
];

interface RhinoUploadPanelProps {
  projectId: string;
}

interface PendingFile {
  file: File;
  viewName: string;
  preview: string;
}

export function RhinoUploadPanel({ projectId }: RhinoUploadPanelProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploadRhino = useUploadRhino();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPending = acceptedFiles.map((file) => ({
      file,
      viewName: "",
      preview: URL.createObjectURL(file),
    }));
    setPendingFiles((prev) => [...prev, ...newPending]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"] },
    multiple: true,
  });

  const updateViewName = (index: number, viewName: string) => {
    setPendingFiles((prev) =>
      prev.map((p, i) => (i === index ? { ...p, viewName } : p))
    );
  };

  const removePending = (index: number) => {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUploadAll = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);

    for (const pf of pendingFiles) {
      try {
        await uploadRhino.mutateAsync({
          projectId,
          file: pf.file,
          viewName: pf.viewName || undefined,
        });
      } catch {
        // toast already shown by hook
      }
    }

    // Revoke all URLs
    pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.preview));
    setPendingFiles([]);
    setIsUploading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Upload Rhino Renders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
          `}
        >
          <input {...getInputProps()} />
          <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isDragActive
              ? "Drop Rhino screenshots here..."
              : "Drag & drop Rhino screenshots, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            PNG, JPG, TIFF, WebP supported
          </p>
        </div>

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {pendingFiles.length} file{pendingFiles.length !== 1 ? "s" : ""} ready
              </span>
              <Button
                size="sm"
                onClick={handleUploadAll}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-3 w-3" />
                )}
                Upload All
              </Button>
            </div>

            {pendingFiles.map((pf, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
              >
                <img
                  src={pf.preview}
                  alt={pf.file.name}
                  className="w-20 h-14 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs text-muted-foreground truncate">{pf.file.name}</p>
                  <div>
                    <Label className="text-xs">View Name</Label>
                    <Input
                      value={pf.viewName}
                      onChange={(e) => updateViewName(i, e.target.value)}
                      placeholder="e.g. Hero 3/4 View"
                      className="h-7 text-xs"
                    />
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {VIEW_NAME_PRESETS.map((preset) => (
                        <Badge
                          key={preset}
                          variant="outline"
                          className="text-[10px] cursor-pointer hover:bg-primary/10"
                          onClick={() => updateViewName(i, preset)}
                        >
                          {preset}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => removePending(i)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
