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
import { Layers, Wand2, Maximize2, Eye, EyeOff, FileText, RotateCcw, Expand, Minimize, Image as ImageIcon } from "lucide-react";
import { SpatialCanvasTopDown, type SpatialCanvasTopDownHandle } from "./SpatialCanvasTopDown";
import { SpatialCanvasIso, type SpatialCanvasIsoHandle } from "./SpatialCanvasIso";
import { renderFloorPlanForExport } from "@/lib/renderFloorPlanForExport";
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
}

export const SpatialCanvas = forwardRef<SpatialCanvasHandle, SpatialCanvasProps>(
  function SpatialCanvas(
    { geometry, onGeometryChange, readonly = false, getZoneDefaultPrompt },
    ref,
  ) {
    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [showIso, setShowIso] = useState(true);
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
            onSelectZone={setSelectedZoneId}
            onZonesChange={handleZonesChange}
            readonly={readonly}
            maxCanvasSize={opts.maxCanvasSize}
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

