// PhotoAnnotationCanvas — SVG overlay over an <img>. Lets the user
// draw closed polygons in two colors:
//   - "keep" (green): regions to preserve in the redesign
//   - "change" (red): regions the redesign should transform
//
// Polygons stored in NORMALIZED 0..1 coords so the same data renders
// correctly at any display size. Click adds a vertex; double-click
// closes the polygon. Esc cancels the in-progress polygon. Click an
// existing polygon while erase is active to delete it.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Brush, Eraser, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Polygon } from "@/types/brief";

export interface PhotoAnnotationCanvasProps {
  photoUrl: string;
  keep: Polygon[];
  change: Polygon[];
  onChange: (keep: Polygon[], change: Polygon[]) => void;
}

type Tool = "keep" | "change" | "erase";

export function PhotoAnnotationCanvas({
  photoUrl,
  keep,
  change,
  onChange,
}: PhotoAnnotationCanvasProps) {
  const [tool, setTool] = useState<Tool>("keep");
  const [drawing, setDrawing] = useState<Array<{ x: number; y: number }>>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute the normalized coords of a mouse event relative to the SVG.
  const toNorm = useCallback((e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (tool === "erase") return;
    const pt = toNorm(e);
    if (!pt) return;
    setDrawing((d) => [...d, pt]);
  };

  const handleCanvasDoubleClick = () => {
    if (drawing.length < 3) {
      setDrawing([]);
      return;
    }
    const next: Polygon = { points: [...drawing, drawing[0]] };
    if (tool === "keep") onChange([...keep, next], change);
    if (tool === "change") onChange(keep, [...change, next]);
    setDrawing([]);
  };

  const handlePolygonClick = (kind: "keep" | "change", idx: number) => {
    if (tool !== "erase") return;
    if (kind === "keep") onChange(keep.filter((_, i) => i !== idx), change);
    if (kind === "change") onChange(keep, change.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawing([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant={tool === "keep" ? "default" : "outline"}
          onClick={() => setTool("keep")}
        >
          <Brush className="h-3 w-3 mr-1" />
          Keep
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "change" ? "default" : "outline"}
          onClick={() => setTool("change")}
        >
          <Brush className="h-3 w-3 mr-1" />
          Change
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "erase" ? "default" : "outline"}
          onClick={() => setTool("erase")}
        >
          <Eraser className="h-3 w-3 mr-1" />
          Erase
        </Button>
        {drawing.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setDrawing([])}>
            <Undo2 className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {tool === "erase"
            ? "Click a polygon to delete"
            : drawing.length === 0
              ? "Click to start drawing; double-click to close"
              : `${drawing.length} points — double-click to close`}
        </span>
      </div>
      <div className="relative inline-block w-full">
        <img
          src={photoUrl}
          alt="Existing space"
          className="w-full rounded-lg border border-border block"
          draggable={false}
        />
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 w-full h-full",
            tool === "erase" ? "cursor-pointer" : "cursor-crosshair",
          )}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          {keep.map((p, i) => (
            <polygon
              key={`k-${i}`}
              points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="rgba(34, 197, 94, 0.30)"
              stroke="rgb(34, 197, 94)"
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                e.stopPropagation();
                handlePolygonClick("keep", i);
              }}
              style={{ cursor: tool === "erase" ? "pointer" : "default" }}
            />
          ))}
          {change.map((p, i) => (
            <polygon
              key={`c-${i}`}
              points={p.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="rgba(239, 68, 68, 0.30)"
              stroke="rgb(239, 68, 68)"
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                e.stopPropagation();
                handlePolygonClick("change", i);
              }}
              style={{ cursor: tool === "erase" ? "pointer" : "default" }}
            />
          ))}
          {drawing.length > 0 && (
            <polyline
              points={drawing.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="none"
              stroke={tool === "keep" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="0.01 0.005"
            />
          )}
        </svg>
        {/* Vertex markers rendered as absolutely-positioned HTML
            elements rather than <circle> inside the SVG. The SVG uses
            preserveAspectRatio="none" so any <circle> would stretch
            into an ellipse on non-square photos. Positioning HTML
            divs by normalized (x, y) instead keeps the marker
            perfectly circular at any photo aspect ratio. pointer-
            events: none so clicks pass through to the SVG underneath. */}
        {drawing.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {drawing.map((pt, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${pt.x * 100}%`,
                  top: `${pt.y * 100}%`,
                  width: 8,
                  height: 8,
                  transform: "translate(-50%, -50%)",
                  background:
                    tool === "keep" ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
