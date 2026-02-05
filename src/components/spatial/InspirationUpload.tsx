import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Upload, X, ImageIcon, Sparkles, Plus } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";

export interface InspirationImage {
  id: string;
  url: string;
  name: string;
  tags?: string[];
}

interface InspirationUploadProps {
  images: InspirationImage[];
  onImagesChange: (images: InspirationImage[]) => void;
  maxImages?: number;
}

export function InspirationUpload({ 
  images, 
  onImagesChange, 
  maxImages = 4 
}: InspirationUploadProps) {
  const { toast } = useToast();
  
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const remaining = maxImages - images.length;
    const filesToAdd = acceptedFiles.slice(0, remaining);
    
    filesToAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newImage: InspirationImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: reader.result as string,
          name: file.name,
          tags: ["inspiration"],
        };
        onImagesChange([...images, newImage]);
      };
      reader.readAsDataURL(file);
    });
    
    if (acceptedFiles.length > remaining) {
      toast({
        title: "Limit reached",
        description: `Only ${maxImages} inspiration images allowed`,
        variant: "destructive",
      });
    }
  }, [images, maxImages, onImagesChange, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    disabled: images.length >= maxImages,
  });

  const removeImage = (id: string) => {
    onImagesChange(images.filter(img => img.id !== id));
  };

  return (
    <Card className="element-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Inspiration Images
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Upload reference images to influence the floor plan aesthetic
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {images.length}/{maxImages}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Image Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {images.map((image) => (
            <div 
              key={image.id}
              className="relative group rounded-lg overflow-hidden border bg-muted aspect-video"
            >
              <img 
                src={image.url} 
                alt={image.name}
                className="w-full h-full object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(image.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-2xs text-white truncate">{image.name}</p>
              </div>
            </div>
          ))}
          
          {/* Upload Zone */}
          {images.length < maxImages && (
            <div
              {...getRootProps()}
              className={cn(
                "aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors",
                isDragActive 
                  ? "border-primary bg-primary/10" 
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <input {...getInputProps()} />
              <Plus className="h-5 w-5 text-muted-foreground mb-1" />
              <span className="text-2xs text-muted-foreground">Add image</span>
            </div>
          )}
        </div>
        
        {images.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Drag images here to influence materials, colors, and spatial feel
          </p>
        )}
      </CardContent>
    </Card>
  );
}
