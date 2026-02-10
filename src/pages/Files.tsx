import { AppLayout } from "@/components/layout/AppLayout";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useProjectImages } from "@/hooks/useProjectImages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, ImageIcon, Loader2, FolderOpen } from "lucide-react";

export default function FilesPage() {
  const { projectId, isLoading: syncLoading } = useProjectSync();
  const { data: savedImages = [], isLoading: imagesLoading } = useProjectImages(projectId);

  const isLoading = syncLoading || imagesLoading;

  // Group images by angle
  const grouped = savedImages.reduce((acc, img) => {
    const key = img.angle_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(img);
    return acc;
  }, {} as Record<string, typeof savedImages>);

  const currentImages = savedImages.filter((img) => img.is_current);

  return (
    <AppLayout>
      <div className="container py-12 max-w-6xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !projectId ? (
          <div className="text-center py-24">
            <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Select a project to view files</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Project Files</h1>
                <p className="text-muted-foreground">
                  {savedImages.length} image{savedImages.length !== 1 ? "s" : ""} saved across {Object.keys(grouped).length} angle{Object.keys(grouped).length !== 1 ? "s" : ""}
                </p>
              </div>
              {currentImages.length > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {currentImages.length} current render{currentImages.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            {savedImages.length === 0 ? (
              <Card className="element-card">
                <CardContent className="py-16 text-center">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                  <h3 className="text-lg font-medium mb-2">No images yet</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Generate renders on the Prompts page. All generated images will be automatically saved here for download and future reference.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {Object.entries(grouped).map(([angleName, images]) => (
                  <div key={angleName}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-lg font-semibold">{angleName}</h2>
                      <Badge variant="secondary">
                        {images.length} version{images.length > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {images.map((img) => (
                        <Card key={img.id} className="overflow-hidden group">
                          <div className="relative aspect-video bg-muted">
                            <img
                              src={img.public_url}
                              alt={img.angle_name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const link = document.createElement("a");
                                  link.href = img.public_url;
                                  link.download = `${img.angle_name.replace(/\s+/g, "_")}_${new Date(img.created_at).getTime()}.png`;
                                  link.target = "_blank";
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          </div>
                          <CardContent className="p-3 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(img.created_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {img.is_current && (
                              <Badge className="bg-primary/20 text-primary text-xs">Current</Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
