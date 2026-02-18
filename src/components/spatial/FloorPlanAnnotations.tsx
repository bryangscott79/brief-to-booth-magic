import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageSquare, X, Send, Trash2 } from "lucide-react";

export interface FloorPlanAnnotation {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  comment: string;
  createdAt: string;
}

interface FloorPlanAnnotationsProps {
  imageUrl: string;
  annotations: FloorPlanAnnotation[];
  onAddAnnotation: (annotation: FloorPlanAnnotation) => void;
  onRemoveAnnotation: (id: string) => void;
  isRegenerating?: boolean;
}

export function FloorPlanAnnotations({
  imageUrl,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  isRegenerating,
}: FloorPlanAnnotationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isRegenerating) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setPendingPin({ x, y });
      setCommentText("");
      setSelectedAnnotation(null);
    },
    [isRegenerating]
  );

  const handleSubmitComment = useCallback(() => {
    if (!pendingPin || !commentText.trim()) return;
    onAddAnnotation({
      id: crypto.randomUUID(),
      x: pendingPin.x,
      y: pendingPin.y,
      comment: commentText.trim(),
      createdAt: new Date().toISOString(),
    });
    setPendingPin(null);
    setCommentText("");
  }, [pendingPin, commentText, onAddAnnotation]);

  return (
    <div className="space-y-3">
      {/* Image with pins */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden cursor-crosshair group"
        onClick={handleImageClick}
      >
        <img
          src={imageUrl}
          alt="AI-generated 2D floor plan"
          className={cn(
            "w-full h-auto rounded-lg border border-border",
            isRegenerating && "opacity-40"
          )}
        />

        {/* Existing annotation pins */}
        {annotations.map((ann, i) => (
          <div
            key={ann.id}
            className="absolute z-10"
            style={{ left: `${ann.x}%`, top: `${ann.y}%`, transform: "translate(-50%, -50%)" }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAnnotation(selectedAnnotation === ann.id ? null : ann.id);
              setPendingPin(null);
            }}
          >
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md border-2 transition-all cursor-pointer",
                selectedAnnotation === ann.id
                  ? "bg-primary text-primary-foreground border-primary scale-125"
                  : "bg-background text-foreground border-primary/60 hover:scale-110"
              )}
            >
              {i + 1}
            </div>
            {/* Tooltip */}
            {selectedAnnotation === ann.id && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg p-3 shadow-lg z-20 w-56">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-medium">Note #{i + 1}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveAnnotation(ann.id);
                      setSelectedAnnotation(null);
                    }}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{ann.comment}</p>
              </div>
            )}
          </div>
        ))}

        {/* Pending pin */}
        {pendingPin && (
          <div
            className="absolute z-10"
            style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%`, transform: "translate(-50%, -50%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center animate-pulse border-2 border-primary shadow-lg">
              <MessageSquare className="h-3 w-3" />
            </div>
            {/* Comment input */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg p-3 shadow-lg z-20 w-64">
              <Textarea
                autoFocus
                placeholder="What should change here?"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="text-xs min-h-[60px] mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <div className="flex gap-1.5 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingPin(null);
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!commentText.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSubmitComment();
                  }}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Hint overlay */}
        {!pendingPin && annotations.length === 0 && !isRegenerating && (
          <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <Badge variant="secondary" className="text-xs bg-background/80 backdrop-blur-sm">
              <MessageSquare className="h-3 w-3 mr-1" />
              Click anywhere to add feedback
            </Badge>
          </div>
        )}
      </div>

      {/* Annotation list summary */}
      {annotations.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {annotations.length} annotation{annotations.length > 1 ? "s" : ""} — will be applied on regenerate
            </span>
          </div>
          <div className="space-y-1">
            {annotations.map((ann, i) => (
              <div key={ann.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-bold text-foreground">{i + 1}.</span>
                <span className="flex-1">{ann.comment}</span>
                <button
                  onClick={() => onRemoveAnnotation(ann.id)}
                  className="text-destructive/60 hover:text-destructive shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
