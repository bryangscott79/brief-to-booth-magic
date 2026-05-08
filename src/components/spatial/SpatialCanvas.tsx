// SpatialCanvas — composite component combining the top-down editor
// (interactive) with the isometric preview (read-only). This is the
// single integration point the rest of the app uses for booth geometry
// editing + reference image capture.
//
// Layout: side-by-side on wide screens, stacked on narrow. The canvases
// share state via the `geometry` prop + `onGeometryChange` callback;
// the parent owns persistence (Zustand store, project save, etc.).
//
// Capture handles: the parent grabs a ref and calls `captureRefs()` to
// get a fresh pair of PNG data URLs ready for upload (via the
// `useGeometryReferences` hook).

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Wand2, Maximize2, Eye, EyeOff } from "lucide-react";
import { SpatialCanvasTopDown } from "./SpatialCanvasTopDown";
import { SpatialCanvasIso, type SpatialCanvasIsoHandle } from "./SpatialCanvasIso";
import {
  type BoothGeometry,
  type AbsoluteZone,
  autoLayoutZones,
  boothArea,
  totalZoneArea,
  zonesOverlap,
} from "@/lib/geometryModel";

export interface CapturedRefs {
  floorplan: string | null;
  isometric: string | null;
}

export interface SpatialCanvasHandle {
  /** Capture a fresh pair of PNG data URLs from both views. */
  captureRefs: () => Promise<CapturedRefs>;
}

export interface SpatialCanvasProps {
  geometry: BoothGeometry;
  /** Push a new geometry up — usually after drag/resize/auto-layout. */
  onGeometryChange: (next: BoothGeometry) => void;
  /** Hide controls (auto-layout, ceiling height, etc.) when used as a viewer. */
  readonly?: boolean;
}

export const SpatialCanvas = forwardRef<SpatialCanvasHandle, SpatialCanvasProps>(
  function SpatialCanvas({ geometry, onGeometryChange, readonly = false }, ref) {
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [showIso, setShowIso] = useState(true);
    const isoRef = useRef<SpatialCanvasIsoHandle>(null);
    // The top-down canvas's underlying Stage is tracked by Konva via
    // refs on its inner component; we wrap by giving the top-down a
    // ref-forwarded prop. For v1 we capture by querying the rendered
    // <canvas> element directly via the wrapping div.
    const topDownContainerRef = useRef<HTMLDivElement>(null);

    // Imperative capture for the parent (used by the geometry-references hook).
    useImperativeHandle(
      ref,
      () => ({
        async captureRefs() {
          // Find the Konva canvas inside the top-down container. Konva
          // mounts a real <canvas> with class "konvajs-content" wrapping
          // the actual canvas elements. The first canvas inside is what
          // we want — the bg + zones layers are merged at draw time.
          const container = topDownContainerRef.current;
          let floorplan: string | null = null;
          if (container) {
            // The Konva Stage is the first .konvajs-content > canvas.
            // toDataURL on the canvas element gives us the composited PNG.
            const canvasEl = container.querySelector("canvas") as HTMLCanvasElement | null;
            floorplan = canvasEl?.toDataURL("image/png") ?? null;
          }
          const isometric = isoRef.current ? await isoRef.current.capturePng() : null;
          return { floorplan, isometric };
        },
      }),
      [],
    );

    const handleZonesChange = useCallback(
      (zones: AbsoluteZone[]) => {
        onGeometryChange({ ...geometry, zones });
      },
      [geometry, onGeometryChange],
    );

    const handleAutoArrange = useCallback(() => {
      const zones = autoLayoutZones({ geometry, zones: geometry.zones });
      onGeometryChange({ ...geometry, zones });
    }, [geometry, onGeometryChange]);

    // Live stats: allocation %, overlap warnings.
    const stats = useMemo(() => {
      const total = boothArea(geometry);
      const allocated = totalZoneArea(geometry);
      const pct = total > 0 ? Math.round((allocated / total) * 100) : 0;
      const overlapPairs: Array<[string, string]> = [];
      for (let i = 0; i < geometry.zones.length; i++) {
        for (let j = i + 1; j < geometry.zones.length; j++) {
          if (zonesOverlap(geometry.zones[i], geometry.zones[j])) {
            overlapPairs.push([geometry.zones[i].name, geometry.zones[j].name]);
          }
        }
      }
      const unit = geometry.measurementSystem === "metric" ? "sqm" : "sq ft";
      return {
        allocatedPct: pct,
        allocatedLabel: `${
          geometry.measurementSystem === "metric"
            ? allocated.toFixed(1)
            : Math.round(allocated)
        } / ${
          geometry.measurementSystem === "metric"
            ? total.toFixed(1)
            : Math.round(total)
        } ${unit}`,
        overlapPairs,
      };
    }, [geometry]);

    const selectedZone = selectedZoneId
      ? geometry.zones.find((z) => z.id === selectedZoneId)
      : null;

    return (
      <Card className="border-border bg-muted/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Spatial canvas
              <Badge variant="outline" className="text-[10px] font-mono">
                {geometry.measurementSystem === "metric"
                  ? `${geometry.width}m × ${geometry.depth}m`
                  : `${geometry.width}' × ${geometry.depth}'`}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {stats.allocatedPct}% allocated · {stats.allocatedLabel}
              </Badge>
              {stats.overlapPairs.length > 0 && (
                <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                  Overlap: {stats.overlapPairs.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1">
              {!readonly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleAutoArrange}
                  title="Auto-arrange zones using a heuristic placement (heroes front, lounges in corners, service at back)."
                >
                  <Wand2 className="h-3 w-3" />
                  Auto-arrange
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowIso((v) => !v)}
                title="Toggle the 3D isometric preview"
              >
                {showIso ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                3D
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className={
              showIso
                ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
                : "grid grid-cols-1 gap-3"
            }
          >
            <div ref={topDownContainerRef} className="flex items-center justify-center">
              <SpatialCanvasTopDown
                geometry={geometry}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                onZonesChange={handleZonesChange}
                readonly={readonly}
              />
            </div>
            {showIso && (
              <SpatialCanvasIso
                ref={isoRef}
                geometry={geometry}
                highlightedZoneId={selectedZoneId}
                height={420}
              />
            )}
          </div>

          {selectedZone && !readonly && (
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs flex-wrap">
              <span className="font-medium">{selectedZone.name}</span>
              <span className="text-muted-foreground">
                {geometry.measurementSystem === "metric"
                  ? `${selectedZone.width.toFixed(1)}m × ${selectedZone.depth.toFixed(1)}m`
                  : `${Math.round(selectedZone.width)}' × ${Math.round(selectedZone.depth)}'`}
              </span>
              <span className="text-muted-foreground">·</span>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                Height:
                <input
                  type="number"
                  className="w-14 h-6 px-1.5 rounded border border-border bg-background text-xs text-foreground"
                  value={selectedZone.heightFt}
                  min={6}
                  max={geometry.ceilingHeightFt}
                  step={1}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    if (!Number.isFinite(next)) return;
                    onGeometryChange({
                      ...geometry,
                      zones: geometry.zones.map((z) =>
                        z.id === selectedZone.id
                          ? { ...z, heightFt: Math.max(6, Math.min(geometry.ceilingHeightFt, next)) }
                          : z,
                      ),
                    });
                  }}
                />
                ft
              </label>
              <span className="text-muted-foreground">·</span>
              <Maximize2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">drag to move, corner handles to resize</span>
            </div>
          )}

          {stats.overlapPairs.length > 0 && (
            <div className="text-[11px] text-destructive/90">
              Overlapping zones: {stats.overlapPairs.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);

