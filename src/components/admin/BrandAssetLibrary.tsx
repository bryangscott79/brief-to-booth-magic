import { useState, useCallback } from "react";
import {
  useBrandAssets,
  useUploadBrandAsset,
  useDeleteBrandAsset,
} from "@/hooks/useBrandAssets";
import type { BrandAsset } from "@/types/brief";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  Trash2,
  Loader2,
  Image as ImageIcon,
  FileText,
  File,
  Package,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

// ─── Constants ───────────────────────────────────────────────────────────────

const ASSET_TYPES: {
  value: BrandAsset["assetType"];
  label: string;
}[] = [
  { value: "logo", label: "Logo" },
  { value: "font", label: "Font" },
  { value: "approved_image", label: "Approved Image" },
  { value: "brand_guide_pdf", label: "Brand Guide PDF" },
  { value: "icon_set", label: "Icon Set" },
  { value: "texture", label: "Texture" },
  { value: "pattern", label: "Pattern" },
];

const ASSET_TYPE_COLORS: Record<BrandAsset["assetType"], string> = {
  logo: "bg-blue-500/10 text-blue-600",
  font: "bg-purple-500/10 text-purple-600",
  approved_image: "bg-green-500/10 text-green-600",
  brand_guide_pdf: "bg-red-500/10 text-red-600",
  icon_set: "bg-amber-500/10 text-amber-600",
  texture: "bg-emerald-500/10 text-emerald-600",
  pattern: "bg-rose-500/10 text-rose-600",
};

function isImageType(fileType: string | null): boolean {
  return !!fileType && fileType.startsWith("image/");
}

function getAssetIcon(fileType: string | null) {
  if (isImageType(fileType))
    return <ImageIcon className="h-5 w-5 text-primary" />;
  if (fileType?.includes("pdf"))
    return <FileText className="h-5 w-5 text-foreground/60" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

// ─── Upload Dialog ───────────────────────────────────────────────────────────

function UploadDialog({
  open,
  onClose,
  file,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  file: File | null;
  clientId: string;
}) {
  const upload = useUploadBrandAsset();
  const [label, setLabel] = useState("");
  const [assetType, setAssetType] =
    useState<BrandAsset["assetType"]>("logo");

  const handleUpload = async () => {
    if (!file || !label.trim()) return;
    try {
      await upload.mutateAsync({
        clientId,
        file,
        assetType,
        label: label.trim(),
      });
      setLabel("");
      setAssetType("logo");
      onClose();
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Brand Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {file && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              {getAssetIcon(file.type)}
              <span className="truncate">{file.name}</span>
              <span className="text-xs shrink-0">
                ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Label *</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Primary Logo (RGB)"
              onKeyDown={(e) =>
                e.key === "Enter" && handleUpload()
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asset Type</Label>
            <Select
              value={assetType}
              onValueChange={(v) =>
                setAssetType(v as BrandAsset["assetType"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value}>
                    {at.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={upload.isPending || !label.trim() || !file}
          >
            {upload.isPending && (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function BrandAssetLibrary({
  clientId,
}: {
  clientId: string;
}) {
  const { data: assets = [], isLoading } = useBrandAssets(clientId);
  const deleteAsset = useDeleteBrandAsset();

  const [filterType, setFilterType] = useState<string>("all");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setPendingFile(acceptedFiles[0]);
      setShowUploadDialog(true);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 20 * 1024 * 1024,
  });

  const filtered =
    filterType === "all"
      ? assets
      : assets.filter((a) => a.assetType === filterType);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Brand Asset Library</h3>
          <p className="text-xs text-muted-foreground">
            Upload logos, fonts, approved images, and brand files
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`upload-zone rounded-xl p-6 text-center cursor-pointer transition-colors border-2 border-dashed ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragActive
            ? "Drop files here..."
            : "Drag & drop files, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Logos, fonts, images, PDFs, textures - up to 20MB each
        </p>
      </div>

      {/* Filter by asset type */}
      {assets.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterType("all")}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filterType === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted text-muted-foreground"
            }`}
          >
            All ({assets.length})
          </button>
          {ASSET_TYPES.map((at) => {
            const count = assets.filter(
              (a) => a.assetType === at.value
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={at.value}
                onClick={() => setFilterType(at.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterType === at.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted text-muted-foreground"
                }`}
              >
                {at.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Asset grid */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">
              {assets.length === 0
                ? "No brand assets yet"
                : "No assets match this filter"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload logos, fonts, and brand files to build the asset
              library
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((asset) => (
            <Card
              key={asset.id}
              className="group hover:border-primary/40 transition-colors overflow-hidden"
            >
              <CardContent className="p-0">
                {/* Thumbnail */}
                {isImageType(asset.fileType) ? (
                  <div className="aspect-video bg-muted/30 flex items-center justify-center overflow-hidden">
                    <img
                      src={asset.publicUrl}
                      alt={asset.label}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted/30 flex items-center justify-center">
                    {getAssetIcon(asset.fileType)}
                  </div>
                )}

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {asset.label}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            ASSET_TYPE_COLORS[asset.assetType]
                          }`}
                        >
                          {ASSET_TYPES.find(
                            (t) => t.value === asset.assetType
                          )?.label ?? asset.assetType}
                        </Badge>
                        {asset.fileType && (
                          <span className="text-[10px] text-muted-foreground">
                            {asset.fileType.split("/").pop()}
                          </span>
                        )}
                      </div>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete "{asset.label}"?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove this asset from
                            the brand library.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              deleteAsset.mutate({
                                id: asset.id,
                                clientId: asset.clientId,
                                storagePath: "", // Storage path not on BrandAsset type; hook handles gracefully
                              })
                            }
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={showUploadDialog}
        onClose={() => {
          setShowUploadDialog(false);
          setPendingFile(null);
        }}
        file={pendingFile}
        clientId={clientId}
      />
    </div>
  );
}
