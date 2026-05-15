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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Layers, Wand2, Maximize2, Eye, EyeOff, FileText, RotateCcw, Expand, Minimize, Image as ImageIcon, Square, Circle as CircleIcon, Box as BoxIcon, Diamond as DiamondIcon, TrendingUp, Footprints, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SpatialCanvasTopDown, type SpatialCanvasTopDownHandle } from "./SpatialCanvasTopDown";
import { SpatialCanvasIso, type SpatialCanvasIsoHandle } from "./SpatialCanvasIso";
import { renderFloorPlanForExport } from "@/lib/renderFloorPlanForExport";
import {
  type BoothGeometry,
  type AbsoluteZone,
  type BoothFeature,
  type FeatureFormType,
  type StructuralForm,
  type ZoneShape,
  type LCorner,
  type AbsoluteHangingElement,
  autoLayoutZones,
  boothArea,
  totalZoneArea,
  zonesOverlap,
  effectiveShape,
} from "@/lib/geometryModel";

// Pure hanging-element drag math lives in geometryModel.ts (alongside
// the AbsoluteHangingElement type + the other pure geometric helpers).
// Re-exported here so any external caller that imports from
// `@/components/spatial/SpatialCanvas` keeps working.
export { hangingElementAtPoint, moveHangingElement } from "@/lib/geometryModel";

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
  /**
   * Optional callback that returns the system-generated zone-interior
   * prompt for a given zone id. When provided, the canvas surfaces an
   * "Edit prompt" affordance per zone — users can view the default
   * prompt + override it. The override is stored on the zone via
   * `customPromptOverride` and rendered at generation time.
   *
   * Pass undefined to hide the prompt-edit feature (e.g. read-only
   * preview contexts where prompt editing doesn't apply).
   */
  getZoneDefaultPrompt?: (zoneId: string) => string;
  /**
   * Optional AI-enrichment callback. When wired, surfaces a "Suggest
   * layout" button that calls the enrich-spatial edge function to
   * auto-populate structural form / visual brief / intent / materials
   * per zone, plus 3–6 sculptural features. The parent owns the
   * network call and the merge; this prop just toggles the button on.
   */
  onEnrichSpatial?: () => void | Promise<void>;
  isEnriching?: boolean;
  /**
   * Controls visibility of the overhead hanging-element layer. Local
   * UI toggle owned by the parent (SpatialPlanner) so users can hide
   * overhead shapes while editing the floor. Defaults to true (visible).
   */
  showHanging?: boolean;
}

export const SpatialCanvas = forwardRef<SpatialCanvasHandle, SpatialCanvasProps>(
  function SpatialCanvas(
    {
      geometry,
      onGeometryChange,
      readonly = false,
      getZoneDefaultPrompt,
      onEnrichSpatial,
      isEnriching = false,
      showHanging = true,
    },
    ref,
  ) {
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    // Selecting a feature is a separate concern from selecting a zone;
    // both can be active independently and each has its own toolbar.
    const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
    const [showIso, setShowIso] = useState(true);
    // Flow + heatmap overlays. Live on the top-down canvas as a Konva
    // layer so the user can read visitor flow without leaving the
    // editor. Independent toggles — either or both can be on.
    const [showFlow, setShowFlow] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    // Zone whose prompt is currently being edited. Null = dialog closed.
    const [promptEditZoneId, setPromptEditZoneId] = useState<string | null>(null);
    // Local draft of the prompt while the dialog is open. Committed on Save.
    const [promptDraft, setPromptDraft] = useState("");
    // Fullscreen expanded mode — opens the canvas in a large dialog so
    // the user can edit at a comfortable size. Same state, larger
    // render targets.
    const [isExpanded, setIsExpanded] = useState(false);
    // AI export preview — shows the high-contrast floor plan PNG that
    // actually gets sent to the image model so the user can verify the
    // dimensions / zones / labels are legible before generating.
    const [showAiPreview, setShowAiPreview] = useState(false);
    const aiPreviewDataUrl = useMemo(
      () => (showAiPreview ? renderFloorPlanForExport(geometry) : null),
      [geometry, showAiPreview],
    );
    const isoRef = useRef<SpatialCanvasIsoHandle>(null);
    const topDownRef = useRef<SpatialCanvasTopDownHandle>(null);
    const topDownContainerRef = useRef<HTMLDivElement>(null);

    // Imperative capture for the parent (used by the geometry-references hook).
    //
    // Floor plan: rendered via renderFloorPlanForExport — a purpose-built
    // offscreen canvas with WHITE background, BOLD perimeter dimension
    // labels ("30 FT WIDE"), per-zone name + footprint + height labels,
    // a 1' grid, and a scale bar in the corner. ~1400px on the long side
    // (vs ~920px from on-screen capture). Image models read dimension
    // text on the reference much more reliably at this scale + contrast.
    //
    // Isometric: still captured from the live R3F canvas — preserves the
    // accurate 3D extrusion + 5'8" silhouette + axis gizmo for 3D
    // calibration.
    useImperativeHandle(
      ref,
      () => ({
        async captureRefs() {
          const floorplan = renderFloorPlanForExport(geometry);
          const isometric = isoRef.current ? await isoRef.current.capturePng() : null;
          return { floorplan, isometric };
        },
      }),
      [geometry],
    );

    const handleZonesChange = useCallback(
      (zones: AbsoluteZone[]) => {
        onGeometryChange({ ...geometry, zones });
      },
      [geometry, onGeometryChange],
    );

    const handleFeaturesChange = useCallback(
      (features: BoothFeature[]) => {
        onGeometryChange({ ...geometry, features });
      },
      [geometry, onGeometryChange],
    );

    const handleHangingElementsChange = useCallback(
      (hangingElements: AbsoluteHangingElement[]) => {
        onGeometryChange({ ...geometry, hangingElements });
      },
      [geometry, onGeometryChange],
    );

    const handleAutoArrange = useCallback(() => {
      const zones = autoLayoutZones({ geometry, zones: geometry.zones });
      onGeometryChange({ ...geometry, zones });
    }, [geometry, onGeometryChange]);

    // Add a new feature, defaulted by formType. Each form gets a
    // sensible starting shape + dimensions so the user gets visible
    // geometry on first add — they can drag/resize from there.
    const handleAddFeature = useCallback(
      (formType: FeatureFormType) => {
        const id = `feat_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const cx = geometry.width / 2;
        const cy = geometry.depth / 2;
        const palette = ["#a78bfa", "#f59e0b", "#22d3ee", "#f472b6", "#34d399"];
        const colorHex =
          palette[(geometry.features?.length ?? 0) % palette.length];
        // Default shape per formType. Tower/totem → small circle.
        // Ribbon → 3-point wave path. Canopy → ellipse. Archway →
        // wide thin rect. Sculpture → hexagonal polygon.
        const defaults: Record<
          FeatureFormType,
          { shape: BoothFeature["shape"]; baseHt: number; topHt: number }
        > = {
          tower: { shape: { kind: "circle", radius: 1.5 }, baseHt: 0, topHt: 14 },
          totem: { shape: { kind: "circle", radius: 1 }, baseHt: 0, topHt: 10 },
          canopy: {
            shape: { kind: "ellipse", radiusX: 5, radiusY: 4 },
            baseHt: 8,
            topHt: 11,
          },
          archway: {
            shape: { kind: "rect", width: 6, depth: 0.5 },
            baseHt: 0,
            topHt: 12,
          },
          sculpture: {
            shape: {
              kind: "polygon",
              points: [
                { x: 0, y: 2 },
                { x: 1.7, y: 1 },
                { x: 1.7, y: -1 },
                { x: 0, y: -2 },
                { x: -1.7, y: -1 },
                { x: -1.7, y: 1 },
              ],
            },
            baseHt: 0,
            topHt: 12,
          },
          screen: {
            shape: { kind: "rect", width: 8, depth: 0.5 },
            baseHt: 0,
            topHt: 10,
          },
          ribbon: {
            shape: {
              kind: "ribbon",
              path: [
                { x: 0, y: 0 },
                { x: 4, y: 1 },
                { x: 8, y: -1 },
                { x: 12, y: 0 },
              ],
              thickness: 1.5,
            },
            baseHt: 6,
            topHt: 11,
          },
          platform: {
            shape: { kind: "rect", width: 6, depth: 4 },
            baseHt: 0,
            topHt: 1.5,
          },
          bar: {
            shape: { kind: "rect", width: 8, depth: 1.5 },
            baseHt: 0,
            topHt: 3.5,
          },
          kiosk: {
            shape: { kind: "rect", width: 3, depth: 3 },
            baseHt: 0,
            topHt: 8,
          },
        };
        const d = defaults[formType];
        const newFeature: BoothFeature = {
          id,
          name: formType.charAt(0).toUpperCase() + formType.slice(1),
          x: cx,
          y: cy,
          shape: d.shape,
          baseHeightFt: d.baseHt,
          topHeightFt: d.topHt,
          formType,
          colorHex,
        };
        onGeometryChange({
          ...geometry,
          features: [...(geometry.features ?? []), newFeature],
        });
        setSelectedFeatureId(id);
        setSelectedZoneId(null);
      },
      [geometry, onGeometryChange],
    );

    const handleDeleteFeature = useCallback(
      (id: string) => {
        onGeometryChange({
          ...geometry,
          features: (geometry.features ?? []).filter((f) => f.id !== id),
        });
        setSelectedFeatureId(null);
      },
      [geometry, onGeometryChange],
    );

    const updateFeature = useCallback(
      (id: string, patch: Partial<BoothFeature>) => {
        onGeometryChange({
          ...geometry,
          features: (geometry.features ?? []).map((f) =>
            f.id === id ? { ...f, ...patch } : f,
          ),
        });
      },
      [geometry, onGeometryChange],
    );

    const updateZone = useCallback(
      (id: string, patch: Partial<AbsoluteZone>) => {
        onGeometryChange({
          ...geometry,
          zones: geometry.zones.map((z) =>
            z.id === id ? { ...z, ...patch } : z,
          ),
        });
      },
      [geometry, onGeometryChange],
    );

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

    /**
     * The canvas grid (top-down + iso). Reused for both the inline view
     * (small) and the expanded dialog (large) by parameterizing the size
     * limits. Refs mount/unmount on mode toggle — captureRefs() runs at
     * generate time, not during toggle, so the brief ref-jump is safe.
     */
    const renderCanvasGrid = (opts: { maxCanvasSize: number; isoHeight: number }) => (
      <div
        className={
          showIso
            ? "grid grid-cols-1 xl:grid-cols-2 gap-3 items-start"
            : "grid grid-cols-1 gap-3"
        }
      >
        <div
          ref={topDownContainerRef}
          className="min-w-0"
        >
          <SpatialCanvasTopDown
            ref={topDownRef}
            geometry={geometry}
            selectedZoneId={selectedZoneId}
            onSelectZone={(id) => {
              setSelectedZoneId(id);
              if (id) setSelectedFeatureId(null);
            }}
            onZonesChange={handleZonesChange}
            readonly={readonly}
            maxCanvasSize={opts.maxCanvasSize}
            showFlow={showFlow}
            showHeatmap={showHeatmap}
            features={geometry.features ?? []}
            selectedFeatureId={selectedFeatureId}
            onSelectFeature={(id) => {
              setSelectedFeatureId(id);
              if (id) setSelectedZoneId(null);
            }}
            onFeaturesChange={handleFeaturesChange}
            hangingElements={geometry.hangingElements ?? []}
            showHanging={showHanging}
            onHangingElementsChange={handleHangingElementsChange}
          />
        </div>
        {showIso && (
          <div className="min-w-0">
            <SpatialCanvasIso
              ref={isoRef}
              geometry={geometry}
              highlightedZoneId={selectedZoneId}
              height={opts.isoHeight}
            />
          </div>
        )}
      </div>
    );

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
            <div className="flex items-center gap-1 flex-wrap">
              {!readonly && onEnrichSpatial && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onEnrichSpatial()}
                  disabled={isEnriching}
                  title="Use AI to suggest structural form, visual brief, intent, materials, and sculptural features anchored to your zones. Built from the brief + hero installation."
                >
                  {isEnriching ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {isEnriching ? "Enriching…" : "Suggest layout"}
                </Button>
              )}
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
              {!readonly && (
                <FeatureAddMenu onAdd={handleAddFeature} />
              )}
              <Button
                type="button"
                variant={showFlow ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowFlow((v) => !v)}
                title="Overlay visitor-flow arrows from the front-aisle entry to each zone, weighted by area."
              >
                <Footprints className="h-3 w-3" />
                Flow
              </Button>
              <Button
                type="button"
                variant={showHeatmap ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowHeatmap((v) => !v)}
                title="Overlay a translucent dwell-time heatmap on each zone."
              >
                <TrendingUp className="h-3 w-3" />
                Heatmap
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowAiPreview((v) => !v)}
                title="Show the high-contrast floor plan PNG that actually gets sent to the image model. Useful for verifying dimensions, zone labels, and grid are legible."
              >
                <ImageIcon className="h-3 w-3" />
                {showAiPreview ? "Hide AI input" : "Show AI input"}
              </Button>
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
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setIsExpanded(true)}
                title="Open the spatial canvas in a fullscreen editor"
              >
                <Expand className="h-3 w-3" />
                Expand
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Inline canvas — hidden when the expanded dialog is open
              (which mounts its own copy of the grid at larger sizes).
              Only one mount is active at a time so refs and capture
              behavior stay deterministic. The top-down auto-sizes via
              ResizeObserver up to a generous 720px ceiling. */}
          {!isExpanded && renderCanvasGrid({ maxCanvasSize: 720, isoHeight: 520 })}

          {/* AI export preview — shows the literal floor plan PNG that
              gets passed to the image model so the user can verify what
              the model is actually seeing. Updates live as the user
              edits the canvas. */}
          {showAiPreview && aiPreviewDataUrl && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                  AI input preview
                </Badge>
                <span className="text-muted-foreground">
                  This is the floor-plan image attached to every render call. The
                  image model also receives the isometric view (above) and the
                  brand logo. All zone prompts (default or custom) are included
                  in the text portion of the prompt.
                </span>
              </div>
              <img
                src={aiPreviewDataUrl}
                alt="Floor plan reference sent to the image model"
                className="w-full rounded border border-border bg-white"
              />
            </div>
          )}

          {selectedZone && !readonly && (
            <ZoneMetadataPanel
              zone={selectedZone}
              materialsCatalog={geometry.materialsCatalog ?? []}
              onChange={(patch) => updateZone(selectedZone.id, patch)}
            />
          )}

          {/* Selected feature toolbar — mirrors the zone toolbar but
              for sculptural objects. */}
          {selectedFeatureId && !readonly && (() => {
            const f = (geometry.features ?? []).find((x) => x.id === selectedFeatureId);
            if (!f) return null;
            return (
              <FeatureMetadataPanel
                feature={f}
                materialsCatalog={geometry.materialsCatalog ?? []}
                ceilingFt={geometry.ceilingHeightFt}
                onChange={(patch) => updateFeature(f.id, patch)}
                onDelete={() => handleDeleteFeature(f.id)}
              />
            );
          })()}

          {selectedZone && !readonly && (
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs flex-wrap">
              <span className="font-medium">{selectedZone.name}</span>
              <span className="text-muted-foreground">
                {geometry.measurementSystem === "metric"
                  ? `${selectedZone.width.toFixed(1)}m × ${selectedZone.depth.toFixed(1)}m`
                  : `${Math.round(selectedZone.width)}' × ${Math.round(selectedZone.depth)}'`}
              </span>
              <span className="text-muted-foreground">·</span>
              {/* Shape picker — rect / L / circle. Rect is the default;
                  L is for corner counters (notch out one corner); circle
                  draws an ellipse inside the bounding box (perfect circle
                  when width === depth). */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Shape:</span>
                <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5">
                  {(
                    [
                      { id: "rect", icon: Square, title: "Rectangle" },
                      { id: "diamond", icon: DiamondIcon, title: "Diamond / rotated square" },
                      { id: "L", icon: BoxIcon, title: "L-shape (corner counter)" },
                      { id: "circle", icon: CircleIcon, title: "Circle / ellipse" },
                    ] as Array<{ id: ZoneShape; icon: typeof Square; title: string }>
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = effectiveShape(selectedZone) === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        title={opt.title}
                        onClick={() => {
                          onGeometryChange({
                            ...geometry,
                            zones: geometry.zones.map((z) =>
                              z.id === selectedZone.id ? { ...z, shape: opt.id } : z,
                            ),
                          });
                        }}
                        className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* L-corner picker — only meaningful when shape === "L".
                  4 buttons in a 2×2 grid representing which corner is
                  notched out of the zone's bounding box. */}
              {effectiveShape(selectedZone) === "L" && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Corner:</span>
                  <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md border border-border bg-muted/30">
                    {(["NW", "NE", "SW", "SE"] as LCorner[]).map((c) => {
                      const active = (selectedZone.shapeParams?.lCorner ?? "NE") === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          title={`Notch the ${c} corner`}
                          onClick={() => {
                            onGeometryChange({
                              ...geometry,
                              zones: geometry.zones.map((z) =>
                                z.id === selectedZone.id
                                  ? {
                                      ...z,
                                      shape: "L",
                                      shapeParams: { ...(z.shapeParams ?? {}), lCorner: c },
                                    }
                                  : z,
                              ),
                            });
                          }}
                          className={`h-3.5 w-4 rounded-sm flex items-center justify-center text-[8px] font-mono font-bold transition-colors ${
                            active
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <span className="text-muted-foreground">·</span>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                Height:
                <input
                  type="number"
                  className="w-16 h-6 px-1.5 rounded border border-border bg-background text-xs text-foreground"
                  value={selectedZone.heightFt}
                  // Allow low elements: floor decals, counters (3'),
                  // bar tops (3.5'), display plinths, etc. Min is 0.5
                  // so a flat zone is still legal (decal-only).
                  min={0.5}
                  max={geometry.ceilingHeightFt}
                  step={0.5}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    if (!Number.isFinite(next)) return;
                    onGeometryChange({
                      ...geometry,
                      zones: geometry.zones.map((z) =>
                        z.id === selectedZone.id
                          ? { ...z, heightFt: Math.max(0.5, Math.min(geometry.ceilingHeightFt, next)) }
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
              {/* Per-zone prompt edit. Hidden when no callback was
                  provided (e.g. read-only preview contexts). */}
              {getZoneDefaultPrompt && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2"
                    onClick={() => {
                      const draft =
                        selectedZone.customPromptOverride ??
                        getZoneDefaultPrompt(selectedZone.id);
                      setPromptDraft(draft);
                      setPromptEditZoneId(selectedZone.id);
                    }}
                    title="View / edit the prompt used to render this zone's interior"
                  >
                    <FileText className="h-3 w-3" />
                    {selectedZone.customPromptOverride ? "Edit prompt (custom)" : "Edit prompt"}
                  </Button>
                </>
              )}
            </div>
          )}

          {stats.overlapPairs.length > 0 && (
            <div className="text-[11px] text-destructive/90">
              Overlapping zones: {stats.overlapPairs.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}
            </div>
          )}
        </CardContent>

        {/* Per-zone prompt edit dialog. Shows the system-generated
            default + lets the user override verbatim. The override is
            stored on the zone (`customPromptOverride`) and replaces the
            auto-generated zone-interior prompt at render time. */}
        <Dialog
          open={promptEditZoneId !== null}
          onOpenChange={(open) => !open && setPromptEditZoneId(null)}
        >
          <DialogContent className="max-w-3xl">
            {(() => {
              const zone = promptEditZoneId
                ? geometry.zones.find((z) => z.id === promptEditZoneId)
                : null;
              if (!zone) return null;
              const defaultPrompt = getZoneDefaultPrompt
                ? getZoneDefaultPrompt(zone.id)
                : "";
              const isOverride = zone.customPromptOverride !== undefined;
              const isDirty = promptDraft !== (zone.customPromptOverride ?? defaultPrompt);
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      {zone.name} — render prompt
                    </DialogTitle>
                    <DialogDescription>
                      This is the prompt sent to the image model when rendering this zone's
                      interior view. Edit to customize the rendering for this zone only —
                      hero and exterior views are unaffected. Use{" "}
                      <span className="text-foreground font-medium">Reset</span> to return to
                      the system-generated default.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      {isOverride ? (
                        <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                          Custom override active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Default (system-generated)
                        </Badge>
                      )}
                      <span className="text-muted-foreground">
                        {promptDraft.length.toLocaleString()} chars
                      </span>
                    </div>
                    <Textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      rows={20}
                      className="font-mono text-xs leading-relaxed"
                    />
                  </div>
                  <DialogFooter className="gap-2 sm:gap-2">
                    {isOverride && (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          // Strip the override; future renders use the default.
                          onGeometryChange({
                            ...geometry,
                            zones: geometry.zones.map((z) =>
                              z.id === zone.id
                                ? { ...z, customPromptOverride: undefined }
                                : z,
                            ),
                          });
                          setPromptEditZoneId(null);
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPromptEditZoneId(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={!isDirty}
                      onClick={() => {
                        const trimmed = promptDraft.trim();
                        // If the user blanked the textarea, treat it
                        // as a reset rather than saving an empty override.
                        const override = trimmed.length > 0 ? promptDraft : undefined;
                        onGeometryChange({
                          ...geometry,
                          zones: geometry.zones.map((z) =>
                            z.id === zone.id
                              ? { ...z, customPromptOverride: override }
                              : z,
                          ),
                        });
                        setPromptEditZoneId(null);
                      }}
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Fullscreen expanded editor — same canvas, larger render
            targets. Active state lives in the SAME component instance,
            so geometry edits in the dialog flow through to the inline
            view and out via onGeometryChange identically. */}
        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] flex flex-col gap-3 p-4">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
                <Layers className="h-4 w-4 text-primary" />
                Spatial canvas — expanded
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
                <span className="ml-auto flex items-center gap-1">
                  {!readonly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleAutoArrange}
                    >
                      <Wand2 className="h-3 w-3" />
                      Auto-arrange
                    </Button>
                  )}
                  {!readonly && onEnrichSpatial && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => onEnrichSpatial()}
                      disabled={isEnriching}
                    >
                      {isEnriching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {isEnriching ? "Enriching…" : "Suggest layout"}
                    </Button>
                  )}
                  {!readonly && <FeatureAddMenu onAdd={handleAddFeature} />}
                  <Button
                    type="button"
                    variant={showFlow ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowFlow((v) => !v)}
                    title="Overlay visitor-flow arrows on the canvas"
                  >
                    <Footprints className="h-3 w-3" />
                    Flow
                  </Button>
                  <Button
                    type="button"
                    variant={showHeatmap ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowHeatmap((v) => !v)}
                    title="Overlay a dwell-time heatmap on each zone"
                  >
                    <TrendingUp className="h-3 w-3" />
                    Heatmap
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowIso((v) => !v)}
                  >
                    {showIso ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    3D
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setIsExpanded(false)}
                  >
                    <Minimize className="h-3 w-3" />
                    Collapse
                  </Button>
                </span>
              </DialogTitle>
            </DialogHeader>

            {/* Body fills the remaining vertical space; canvas inside
                scales to fit. min-h-0 lets the flex child shrink so the
                grid doesn't blow past the dialog height. */}
            <div className="flex-1 min-h-0 overflow-auto pr-1">
              {isExpanded && renderCanvasGrid({ maxCanvasSize: 1100, isoHeight: 720 })}
              {/* AI export preview, also surfaces here so the user can
                  verify what's being sent without leaving the editor. */}
              {showAiPreview && aiPreviewDataUrl && (
                <div className="mt-3 rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                      AI input preview
                    </Badge>
                    <span className="text-muted-foreground">
                      This is the floor plan PNG passed to the image model on
                      every render.
                    </span>
                  </div>
                  <img
                    src={aiPreviewDataUrl}
                    alt="Floor plan reference"
                    className="w-full rounded border border-border bg-white"
                  />
                </div>
              )}
            </div>

            {/* Selected-zone toolbar mirrors the inline one but pinned
                to the dialog footer so it's always visible while editing. */}
            {selectedZone && !readonly && (
              <div className="shrink-0">
                <ZoneMetadataPanel
                  zone={selectedZone}
                  materialsCatalog={geometry.materialsCatalog ?? []}
                  onChange={(patch) => updateZone(selectedZone.id, patch)}
                />
              </div>
            )}
            {selectedFeatureId && !readonly && (() => {
              const f = (geometry.features ?? []).find((x) => x.id === selectedFeatureId);
              if (!f) return null;
              return (
                <div className="shrink-0">
                  <FeatureMetadataPanel
                    feature={f}
                    materialsCatalog={geometry.materialsCatalog ?? []}
                    ceilingFt={geometry.ceilingHeightFt}
                    onChange={(patch) => updateFeature(f.id, patch)}
                    onDelete={() => handleDeleteFeature(f.id)}
                  />
                </div>
              );
            })()}
            {selectedZone && !readonly && (
              <div className="shrink-0 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs flex-wrap">
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
                    className="w-16 h-6 px-1.5 rounded border border-border bg-background text-xs text-foreground"
                    value={selectedZone.heightFt}
                    min={0.5}
                    max={geometry.ceilingHeightFt}
                    step={0.5}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value);
                      if (!Number.isFinite(next)) return;
                      onGeometryChange({
                        ...geometry,
                        zones: geometry.zones.map((z) =>
                          z.id === selectedZone.id
                            ? { ...z, heightFt: Math.max(0.5, Math.min(geometry.ceilingHeightFt, next)) }
                            : z,
                        ),
                      });
                    }}
                  />
                  ft
                </label>
                {getZoneDefaultPrompt && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] gap-1 px-2"
                      onClick={() => {
                        const draft =
                          selectedZone.customPromptOverride ??
                          getZoneDefaultPrompt(selectedZone.id);
                        setPromptDraft(draft);
                        setPromptEditZoneId(selectedZone.id);
                      }}
                    >
                      <FileText className="h-3 w-3" />
                      {selectedZone.customPromptOverride ? "Edit prompt (custom)" : "Edit prompt"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </Card>
    );
  },
);

// ─── Feature add menu ──────────────────────────────────────────────
// Dropdown that lets the user spawn a new sculptural object in the
// booth. Each form type has a sensible default shape + height so the
// new feature shows up in the canvas immediately and can be dragged
// or refined from there. Defined at module scope so the re-render
// isn't gated on the parent's render cycle.

const FEATURE_TYPES: Array<{
  id: FeatureFormType;
  label: string;
  hint: string;
}> = [
  { id: "tower", label: "Tower", hint: "Vertical brand marker / totem column" },
  { id: "ribbon", label: "Ribbon", hint: "Curving LED or fabric path" },
  { id: "archway", label: "Archway", hint: "Gateway between zones" },
  { id: "canopy", label: "Canopy", hint: "Overhead shade / ceiling element" },
  { id: "sculpture", label: "Sculpture", hint: "Freeform 3D feature" },
  { id: "screen", label: "Screen", hint: "LED wall or projection surface" },
  { id: "totem", label: "Totem", hint: "Branded signage column" },
  { id: "platform", label: "Platform", hint: "Raised stage / DJ deck" },
  { id: "bar", label: "Bar / Counter", hint: "Service or sampling counter" },
  { id: "kiosk", label: "Kiosk", hint: "Small enclosed booth" },
];

// ─── Zone metadata panel ───────────────────────────────────────────
// The "below the chips" row that captures every non-geometric thing
// about a zone: structural form (open/canopy/alcove/etc.), what it
// LOOKS like, what visitors DO there, and which materials it pulls
// from the brand's palette. All optional — this is meta on top of
// the geometry, not required for a zone to render.

const STRUCTURAL_FORMS: Array<{ id: StructuralForm; label: string; hint: string }> = [
  { id: "open", label: "Open", hint: "No walls (sampling, demos)" },
  { id: "enclosed", label: "Enclosed", hint: "4 walls + ceiling (chambers)" },
  { id: "canopy", label: "Canopy", hint: "Overhead structure, open sides" },
  { id: "alcove", label: "Alcove", hint: "3 walls open to aisle (kiosks)" },
  { id: "platform", label: "Platform", hint: "Raised floor, no walls (stages)" },
  { id: "tower", label: "Tower", hint: "Vertical, small footprint" },
];

function ZoneMetadataPanel({
  zone,
  materialsCatalog,
  onChange,
}: {
  zone: AbsoluteZone;
  materialsCatalog: { id: string; name: string }[];
  onChange: (patch: Partial<AbsoluteZone>) => void;
}) {
  const selectedMaterials = new Set(zone.materialIds ?? []);
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2 space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground font-medium">{zone.name}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Form:</span>
        <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5 flex-wrap">
          {STRUCTURAL_FORMS.map((f) => {
            const active = (zone.structuralForm ?? "open") === f.id;
            return (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => onChange({ structuralForm: f.id })}
                className={`h-6 px-2 rounded text-[11px] transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            Visual brief — what it looks like
          </span>
          <Input
            value={zone.featureDescription ?? ""}
            onChange={(e) => onChange({ featureDescription: e.target.value })}
            placeholder="e.g. Mirror-clad walkthrough chamber with iridescent LED interior"
            className="h-7 text-xs mt-0.5"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            Intent — what visitors do here
          </span>
          <Input
            value={zone.intent ?? ""}
            onChange={(e) => onChange({ intent: e.target.value })}
            placeholder="e.g. Step in, pose with the wings, get a branded photo"
            className="h-7 text-xs mt-0.5"
          />
        </label>
      </div>
      {materialsCatalog.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-muted-foreground pt-0.5">Materials:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {materialsCatalog.map((m) => {
              const active = selectedMaterials.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedMaterials);
                    if (active) next.delete(m.id);
                    else next.add(m.id);
                    onChange({ materialIds: Array.from(next) });
                  }}
                  className={`h-6 px-2 rounded-full border text-[10px] transition-colors ${
                    active
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={m.name}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Feature metadata panel ────────────────────────────────────────
// Form-type picker, dimensions, height range, description, materials.
// Reuses the same compact-row pattern as the zone toolbar so the two
// surfaces feel unified.

const FEATURE_FORMS: Array<{ id: FeatureFormType; label: string }> = [
  { id: "tower", label: "Tower" },
  { id: "ribbon", label: "Ribbon" },
  { id: "archway", label: "Arch" },
  { id: "canopy", label: "Canopy" },
  { id: "sculpture", label: "Sculpture" },
  { id: "screen", label: "Screen" },
  { id: "totem", label: "Totem" },
  { id: "platform", label: "Platform" },
  { id: "bar", label: "Bar" },
  { id: "kiosk", label: "Kiosk" },
];

function FeatureMetadataPanel({
  feature,
  materialsCatalog,
  ceilingFt,
  onChange,
  onDelete,
}: {
  feature: BoothFeature;
  materialsCatalog: { id: string; name: string }[];
  ceilingFt: number;
  onChange: (patch: Partial<BoothFeature>) => void;
  onDelete: () => void;
}) {
  const selectedMaterials = new Set(feature.materialIds ?? []);
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2 space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={feature.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="h-7 text-xs font-medium w-44"
        />
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Form:</span>
        <select
          value={feature.formType}
          onChange={(e) =>
            onChange({ formType: e.target.value as FeatureFormType })
          }
          className="h-7 px-2 rounded border border-border bg-background text-xs"
        >
          {FEATURE_FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">·</span>
        <label className="flex items-center gap-1 text-muted-foreground">
          Base
          <Input
            type="number"
            value={feature.baseHeightFt}
            min={0}
            max={ceilingFt}
            step={0.5}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange({ baseHeightFt: Math.max(0, Math.min(ceilingFt, v)) });
            }}
            className="h-6 w-14 text-xs"
          />
          ft
        </label>
        <label className="flex items-center gap-1 text-muted-foreground">
          Top
          <Input
            type="number"
            value={feature.topHeightFt}
            min={feature.baseHeightFt + 0.5}
            max={ceilingFt}
            step={0.5}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onChange({
                topHeightFt: Math.max(feature.baseHeightFt + 0.5, Math.min(ceilingFt, v)),
              });
            }}
            className="h-6 w-14 text-xs"
          />
          ft
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1 px-2 ml-auto text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </div>
      <label className="block">
        <span className="text-[11px] text-muted-foreground">
          Description — what this object looks like
        </span>
        <Input
          value={feature.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="e.g. Iridescent dichroic ribbon arching from welcome to photo chamber, embedded with LED neon"
          className="h-7 text-xs mt-0.5"
        />
      </label>
      {materialsCatalog.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-muted-foreground pt-0.5">Materials:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {materialsCatalog.map((m) => {
              const active = selectedMaterials.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedMaterials);
                    if (active) next.delete(m.id);
                    else next.add(m.id);
                    onChange({ materialIds: Array.from(next) });
                  }}
                  className={`h-6 px-2 rounded-full border text-[10px] transition-colors ${
                    active
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={m.name}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureAddMenu({
  onAdd,
}: {
  onAdd: (formType: FeatureFormType) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen((v) => !v)}
        title="Drop a sculptural object (tower, ribbon, sculpture, screen, etc.) into the booth"
      >
        <Plus className="h-3 w-3" />
        Add feature
      </Button>
      {open && (
        <>
          {/* Click-away — covers the rest of the page so the user
              doesn't have to find the trigger again to dismiss. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full mt-1 right-0 z-50 w-64 rounded-md border border-border bg-popover shadow-lg p-1">
            {FEATURE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onAdd(t.id);
                  setOpen(false);
                }}
                className="w-full text-left rounded px-2 py-1.5 hover:bg-accent text-xs"
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-[10px] text-muted-foreground">{t.hint}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

