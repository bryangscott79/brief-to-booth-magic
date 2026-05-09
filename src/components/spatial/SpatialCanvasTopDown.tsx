// SpatialCanvasTopDown — interactive top-down booth editor.
//
// Konva-based 2D canvas. Each zone is a draggable, corner-resizable
// rectangle in REAL units (ft for imperial, m for metric). The canvas
// pixel scale is derived from the booth's longest side so big and small
// booths render at the same visual size on screen — only the GRID and
// dimension labels reveal the difference.
//
// Why Konva over plain SVG: Konva ships a Transformer that handles
// corner resize, rotation snap, and bounding-box constraints out of the
// box; rolling those by hand on SVG is ~200 lines of math we don't need
// to own. ~50KB gzip is the only cost.
//
// This component is presentation-only — it accepts geometry + onChange
// and emits updates. State persistence lives in the parent (which can
// throttle, undo/redo, or persist to the project).

import { useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useState } from "react";
import { Stage, Layer, Rect, Text, Line, Group, Ellipse } from "react-konva";
import type Konva from "konva";
import { Transformer } from "react-konva";
import {
  type AbsoluteZone,
  type BoothGeometry,
  unitSnap,
  snapToGrid,
  clampZoneToBooth,
  formatZoneFootprint,
  formatZoneArea,
  zonesOverlap,
  effectiveShape,
  resolveLNotch,
} from "@/lib/geometryModel";

const CANVAS_PADDING = 32; // px on each side, leaves room for dimension rulers
const DEFAULT_MAX_CANVAS_SIZE = 460; // px — fits inside a half-width grid cell on
                                     // mid-size laptops without overflowing.
                                     // Override via the `maxCanvasSize` prop for
                                     // the fullscreen expanded view.

export interface SpatialCanvasTopDownProps {
  geometry: BoothGeometry;
  /** Currently-selected zone id, if any. */
  selectedZoneId: string | null;
  /** Called when the user clicks a zone or the booth (deselect = null). */
  onSelectZone: (id: string | null) => void;
  /** Called whenever a zone is dragged or resized. Receives the FULL updated zones array. */
  onZonesChange: (zones: AbsoluteZone[]) => void;
  /**
   * Read-only mode disables interaction. Used in preflight previews and
   * exports. Defaults to false (editable).
   */
  readonly?: boolean;
  /**
   * Max pixels for the longest side of the canvas. Default 460 (fits in
   * a half-width grid cell on a typical laptop). Pass ~900–1100 in the
   * fullscreen expanded view.
   */
  maxCanvasSize?: number;
  /**
   * Render visitor-flow arrows on top of the canvas. Arrows fan out
   * from a single entry point at the front-center of the booth (the
   * primary aisle) toward each zone, weighted by zone area.
   */
  showFlow?: boolean;
  /**
   * Render a translucent dwell-time heatmap (one fading ellipse per
   * zone). Independent from showFlow — either or both can be on.
   */
  showHeatmap?: boolean;
}

export interface SpatialCanvasTopDownHandle {
  /**
   * Capture the entire stage as a PNG data URL. Must use Konva's
   * Stage.toDataURL() rather than a DOM query — Konva renders one
   * <canvas> per Layer, so querySelector("canvas") would only return
   * the background layer and miss every zone. Stage.toDataURL composites
   * all layers into a single image.
   */
  capturePng: () => string | null;
}

/**
 * Compute pixels-per-unit so the booth fits inside the available canvas
 * size. The longest side of the booth maps to (maxCanvasSize - padding)
 * pixels; the shorter side scales to preserve aspect ratio.
 */
function computeScale(
  geometry: BoothGeometry,
  maxCanvasSize: number,
): {
  pxPerUnit: number;
  canvasW: number;
  canvasH: number;
} {
  const longest = Math.max(geometry.width, geometry.depth);
  const usable = maxCanvasSize - CANVAS_PADDING * 2;
  const pxPerUnit = usable / longest;
  return {
    pxPerUnit,
    canvasW: geometry.width * pxPerUnit + CANVAS_PADDING * 2,
    canvasH: geometry.depth * pxPerUnit + CANVAS_PADDING * 2,
  };
}

export const SpatialCanvasTopDown = forwardRef<
  SpatialCanvasTopDownHandle,
  SpatialCanvasTopDownProps
>(function SpatialCanvasTopDown(
  {
    geometry,
    selectedZoneId,
    onSelectZone,
    onZonesChange,
    readonly = false,
    maxCanvasSize = DEFAULT_MAX_CANVAS_SIZE,
    showFlow = false,
    showHeatmap = false,
  },
  ref,
) {
  // Track the actual width available to us so the Konva Stage can size
  // dynamically. ResizeObserver fires whenever the wrapper dimensions
  // change (window resize, sidebar toggle, parent grid breakpoint).
  // Without this, the Stage stays at MAX_CANVAS_SIZE and overflows
  // narrower parents — producing the horizontal scrollbar + cropped
  // labels users were seeing.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [observedWidth, setObservedWidth] = useState<number | null>(null);
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && w > 0) {
        setObservedWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Effective max size: respect the prop ceiling, but never exceed the
  // actual container width. Floor at 240px so the canvas stays usable
  // even on very narrow viewports (it'll just scroll internally rather
  // than overflow the parent and crop the booth outline).
  const effectiveMaxSize = useMemo(() => {
    if (observedWidth == null) return maxCanvasSize;
    return Math.max(240, Math.min(maxCanvasSize, observedWidth));
  }, [observedWidth, maxCanvasSize]);

  const { pxPerUnit, canvasW, canvasH } = useMemo(
    () => computeScale(geometry, effectiveMaxSize),
    [geometry.width, geometry.depth, effectiveMaxSize],
  );
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const zoneNodesRef = useRef<Map<string, Konva.Group>>(new Map());

  // Expose Stage.toDataURL() so the parent can capture the floor plan
  // PNG without DOM-querying canvases (which only returns the first
  // layer and would miss every zone).
  useImperativeHandle(
    ref,
    () => ({
      capturePng() {
        if (!stageRef.current) return null;
        // Briefly hide the transformer handles so they don't appear in
        // the captured image. Konva nodes have a `visible()` setter that
        // takes effect on next draw.
        const tf = transformerRef.current;
        const wasVisible = tf?.visible();
        if (tf && wasVisible) tf.visible(false);
        stageRef.current.batchDraw();
        const url = stageRef.current.toDataURL({
          pixelRatio: 2,
          mimeType: "image/png",
        });
        if (tf && wasVisible) {
          tf.visible(true);
          stageRef.current.batchDraw();
        }
        return url;
      },
    }),
    [],
  );

  // ─── Coordinate helpers (real units ↔ canvas pixels) ────────────────
  // Y-axis is FLIPPED: in the data model y=0 is the booth's FRONT (primary
  // aisle) and y=depth is the back. Visually we want FRONT at the BOTTOM
  // of the canvas — matches how a viewer reads the floor plan ("you're
  // standing in the aisle, looking into the booth"). So booth y=0 maps
  // to canvas y=bottom, and booth y=depth maps to canvas y=top.
  const toPxX = (units: number) => CANVAS_PADDING + units * pxPerUnit;
  const toPxY = (units: number) =>
    CANVAS_PADDING + (geometry.depth - units) * pxPerUnit;
  const toUnitsX = (px: number) => (px - CANVAS_PADDING) / pxPerUnit;
  const toUnitsY = (px: number) =>
    geometry.depth - (px - CANVAS_PADDING) / pxPerUnit;

  // Attach the transformer to the currently-selected zone so the user
  // sees corner resize handles. Re-runs whenever selection changes.
  useEffect(() => {
    if (!transformerRef.current) return;
    const node = selectedZoneId ? zoneNodesRef.current.get(selectedZoneId) : null;
    if (node) {
      transformerRef.current.nodes([node]);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedZoneId, geometry.zones.length]);

  // ─── Update one zone, broadcast to parent ───────────────────────────
  const updateZone = (id: string, patch: Partial<AbsoluteZone>) => {
    const next = geometry.zones.map((z) => {
      if (z.id !== id) return z;
      return clampZoneToBooth({ ...z, ...patch }, geometry);
    });
    onZonesChange(next);
  };

  // Detect which zones overlap (rendered with red outline).
  const overlapIds = useMemo(() => {
    const overlapping = new Set<string>();
    for (let i = 0; i < geometry.zones.length; i++) {
      for (let j = i + 1; j < geometry.zones.length; j++) {
        if (zonesOverlap(geometry.zones[i], geometry.zones[j])) {
          overlapping.add(geometry.zones[i].id);
          overlapping.add(geometry.zones[j].id);
        }
      }
    }
    return overlapping;
  }, [geometry.zones]);

  // ─── Render the unit grid (1' or 0.5m increments) ───────────────────
  const gridLines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    const step = unitSnap(geometry.measurementSystem);
    // Vertical grid lines: every step along x.
    for (let x = 0; x <= geometry.width + 1e-6; x += step) {
      const isMajor = Math.abs(x % (step * 5)) < 1e-6;
      lines.push({
        x1: toPxX(x), y1: toPxY(0),
        x2: toPxX(x), y2: toPxY(geometry.depth),
        major: isMajor,
      });
    }
    for (let y = 0; y <= geometry.depth + 1e-6; y += step) {
      const isMajor = Math.abs(y % (step * 5)) < 1e-6;
      lines.push({
        x1: toPxX(0), y1: toPxY(y),
        x2: toPxX(geometry.width), y2: toPxY(y),
        major: isMajor,
      });
    }
    return lines;
  }, [geometry.width, geometry.depth, geometry.measurementSystem, pxPerUnit]);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapperRef}
      className="relative w-full rounded-lg border border-border bg-muted/20 select-none flex items-center justify-center"
    >
      <Stage
        ref={stageRef}
        width={canvasW}
        height={canvasH}
        onMouseDown={(e) => {
          // Click on empty stage → deselect.
          if (e.target === e.target.getStage()) onSelectZone(null);
        }}
      >
        {/* Background + booth outline + grid */}
        <Layer listening={false}>
          {/* Outer dark backdrop */}
          <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(15,18,28,1)" />
          {/* Booth floor — note we use toPxY(geometry.depth) for the
              top-left corner because the y-axis is flipped (back of booth
              maps to canvas top, front maps to canvas bottom). */}
          <Rect
            x={toPxX(0)}
            y={toPxY(geometry.depth)}
            width={geometry.width * pxPerUnit}
            height={geometry.depth * pxPerUnit}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={2}
          />
          {/* Grid */}
          {gridLines.map((g, i) => (
            <Line
              key={i}
              points={[g.x1, g.y1, g.x2, g.y2]}
              stroke={g.major ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
              strokeWidth={g.major ? 1 : 0.5}
            />
          ))}
          {/* "BACK" label at the top of the canvas (which is the back of
              the booth in our flipped layout). */}
          <Text
            x={toPxX(0)}
            y={toPxY(geometry.depth) - 18}
            width={geometry.width * pxPerUnit}
            align="center"
            text="BACK"
            fontSize={10}
            fill="rgba(255,255,255,0.4)"
          />
          {/* "FRONT (primary aisle)" label at the bottom of the canvas
              — the booth's front edge faces the viewer. */}
          <Text
            x={toPxX(0)}
            y={toPxY(0) + 4}
            width={geometry.width * pxPerUnit}
            align="center"
            text="▲ FRONT (primary aisle) ▲"
            fontSize={11}
            fontStyle="bold"
            fill="rgba(255,255,255,0.65)"
          />
          {/* Booth dimensions on outside */}
          <Text
            x={0}
            y={canvasH / 2 - 10}
            width={CANVAS_PADDING}
            align="center"
            text={
              geometry.measurementSystem === "metric"
                ? `${geometry.depth}m`
                : `${geometry.depth}'`
            }
            fontSize={12}
            fontStyle="bold"
            fill="rgba(255,255,255,0.7)"
          />
          <Text
            x={CANVAS_PADDING}
            y={canvasH - 22}
            width={geometry.width * pxPerUnit}
            align="center"
            text={
              geometry.measurementSystem === "metric"
                ? `${geometry.width}m`
                : `${geometry.width}'`
            }
            fontSize={12}
            fontStyle="bold"
            fill="rgba(255,255,255,0.7)"
          />
        </Layer>

        {/* Zones */}
        <Layer>
          {geometry.zones.map((zone) => {
            const isSelected = zone.id === selectedZoneId;
            const isOverlapping = overlapIds.has(zone.id);
            return (
              <Group
                key={zone.id}
                ref={(node) => {
                  if (node) zoneNodesRef.current.set(zone.id, node);
                  else zoneNodesRef.current.delete(zone.id);
                }}
                // Canvas top-left of the Group corresponds to the BACK-LEFT
                // of the zone in booth coordinates (y is flipped: front
                // at canvas-bottom). zone.y is the FRONT edge in booth
                // units — the back edge is zone.y + zone.depth, mapped
                // via toPxY back to canvas y at the top of the zone rect.
                x={toPxX(zone.x)}
                y={toPxY(zone.y + zone.depth)}
                // CRITICAL: explicit width/height. Konva groups default
                // to 0×0 unless set, which made onTransformEnd read
                // newW = 0 × scaleX = 0 — collapsing every resize to 1×1.
                width={zone.width * pxPerUnit}
                height={zone.depth * pxPerUnit}
                draggable={!readonly}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onSelectZone(zone.id);
                }}
                onDragMove={(e) => {
                  // Snap on each frame for visual feedback. Note y math
                  // converts the dragged top-left (= zone back-edge in
                  // booth units) into the front-edge zone.y.
                  const node = e.target;
                  const xUnits = snapToGrid(
                    toUnitsX(node.x()),
                    geometry.measurementSystem,
                  );
                  const backEdgeUnits = toUnitsY(node.y());
                  const frontEdgeUnits = snapToGrid(
                    backEdgeUnits - zone.depth,
                    geometry.measurementSystem,
                  );
                  // Clamp to booth bounds.
                  const maxX = Math.max(0, geometry.width - zone.width);
                  const maxY = Math.max(0, geometry.depth - zone.depth);
                  const clampedX = Math.max(0, Math.min(xUnits, maxX));
                  const clampedY = Math.max(0, Math.min(frontEdgeUnits, maxY));
                  node.x(toPxX(clampedX));
                  node.y(toPxY(clampedY + zone.depth));
                }}
                onDragEnd={(e) => {
                  const node = e.target;
                  const backEdgeUnits = toUnitsY(node.y());
                  updateZone(zone.id, {
                    x: snapToGrid(toUnitsX(node.x()), geometry.measurementSystem),
                    y: snapToGrid(
                      backEdgeUnits - zone.depth,
                      geometry.measurementSystem,
                    ),
                  });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  // Konva tracks scale on transformer; we convert back
                  // to width/depth in units. After resize, the top-left
                  // of the Group in canvas = the new back-left corner
                  // in booth coords, so front-edge = top-left's booth y
                  // minus the new depth.
                  const newW = (node.width() * node.scaleX()) / pxPerUnit;
                  const newD = (node.height() * node.scaleY()) / pxPerUnit;
                  node.scaleX(1);
                  node.scaleY(1);
                  const backEdgeUnits = toUnitsY(node.y());
                  updateZone(zone.id, {
                    x: snapToGrid(toUnitsX(node.x()), geometry.measurementSystem),
                    y: snapToGrid(
                      backEdgeUnits - newD,
                      geometry.measurementSystem,
                    ),
                    width: snapToGrid(newW, geometry.measurementSystem),
                    depth: snapToGrid(newD, geometry.measurementSystem),
                  });
                }}
              >
                {(() => {
                  // Shape-aware rendering: rect (default), L, or circle.
                  // Selection + overlap colors are shared; the shape
                  // picker on the selected-zone toolbar controls which
                  // primitive is drawn.
                  const shape = effectiveShape(zone);
                  const fill = zone.colorHex + "55"; // 33% alpha
                  const stroke = isOverlapping
                    ? "#ef4444"
                    : isSelected
                    ? "#ffffff"
                    : zone.colorHex;
                  const strokeWidth = isSelected ? 2.5 : isOverlapping ? 2 : 1.5;
                  const pw = zone.width * pxPerUnit;
                  const pd = zone.depth * pxPerUnit;

                  if (shape === "circle") {
                    return (
                      <Ellipse
                        x={pw / 2}
                        y={pd / 2}
                        radiusX={pw / 2}
                        radiusY={pd / 2}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                      />
                    );
                  }

                  if (shape === "diamond") {
                    // Rotated rectangle inscribed in the bounding box —
                    // four points at the midpoints of each edge. Looks
                    // square only when width === depth; otherwise it
                    // gracefully becomes a rhombus that fills the box.
                    return (
                      <Line
                        points={[
                          pw / 2, 0,
                          pw, pd / 2,
                          pw / 2, pd,
                          0, pd / 2,
                        ]}
                        closed
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                      />
                    );
                  }

                  if (shape === "L") {
                    // Build the L-shape polygon points by walking the
                    // bounding box and cutting in/out at the notched
                    // corner. Local coords: (0,0) = top-left of group.
                    // Points order is clockwise starting at top-left.
                    const { corner, notchWidth, notchDepth } = resolveLNotch(zone);
                    const nw = notchWidth * pxPerUnit;
                    const nd = notchDepth * pxPerUnit;
                    let points: number[];
                    switch (corner) {
                      case "NE":
                        // Notch removed from top-right corner.
                        points = [
                          0, 0,
                          pw - nw, 0,
                          pw - nw, nd,
                          pw, nd,
                          pw, pd,
                          0, pd,
                        ];
                        break;
                      case "NW":
                        // Notch removed from top-left corner.
                        points = [
                          nw, 0,
                          pw, 0,
                          pw, pd,
                          0, pd,
                          0, nd,
                          nw, nd,
                        ];
                        break;
                      case "SE":
                        // Notch removed from bottom-right corner.
                        points = [
                          0, 0,
                          pw, 0,
                          pw, pd - nd,
                          pw - nw, pd - nd,
                          pw - nw, pd,
                          0, pd,
                        ];
                        break;
                      case "SW":
                      default:
                        // Notch removed from bottom-left corner.
                        points = [
                          0, 0,
                          pw, 0,
                          pw, pd,
                          nw, pd,
                          nw, pd - nd,
                          0, pd - nd,
                        ];
                        break;
                    }
                    return (
                      <Line
                        points={points}
                        closed
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                      />
                    );
                  }

                  // Default: rectangle.
                  return (
                    <Rect
                      width={pw}
                      height={pd}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      cornerRadius={2}
                    />
                  );
                })()}
                {/* Zone name + dimensions label inside the rect */}
                <Text
                  x={6}
                  y={6}
                  text={zone.name}
                  fontSize={12}
                  fontStyle="bold"
                  fill="rgba(255,255,255,0.95)"
                  width={zone.width * pxPerUnit - 12}
                  ellipsis
                  wrap="none"
                />
                <Text
                  x={6}
                  y={22}
                  text={formatZoneFootprint(zone, geometry.measurementSystem)}
                  fontSize={10}
                  fill="rgba(255,255,255,0.85)"
                />
                <Text
                  x={6}
                  y={36}
                  text={formatZoneArea(zone, geometry)}
                  fontSize={10}
                  fill="rgba(255,255,255,0.7)"
                />
              </Group>
            );
          })}

          {/* Transformer = corner-resize handles for the selected zone. */}
          {!readonly && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={false}
              borderStroke="#ffffff"
              anchorStroke="#ffffff"
              anchorFill="#0f172a"
              anchorSize={8}
              boundBoxFunc={(oldBox, newBox) => {
                // Don't allow zero/negative sizes.
                const minPx = unitSnap(geometry.measurementSystem) * pxPerUnit;
                if (newBox.width < minPx || newBox.height < minPx) return oldBox;
                return newBox;
              }}
            />
          )}
        </Layer>

        {/* Flow + heatmap overlay layer.
            Heatmap = soft ellipses behind each zone (read as dwell
            density). Flow = arrowed lines from a single entry point
            at the front-center of the booth fanning out to each zone
            center, weighted by area. We keep the math in canvas
            coords so toPxX/toPxY's y-flip lands paths in the right
            place (entry below front-center, arrows pointing UP into
            the booth — visitor's perspective). The layer is listening
            ={false} so it never intercepts a drag/select. */}
        {(showFlow || showHeatmap) && (
          <Layer listening={false}>
            {/* Heatmap — translucent ellipses sized to the zone
                footprint with a fixed 35% opacity so the underlying
                zone color and label still show through. */}
            {showHeatmap &&
              geometry.zones.map((zone) => {
                const cx = toPxX(zone.x + zone.width / 2);
                const cy = toPxY(zone.y + zone.depth / 2);
                const rx = (zone.width * pxPerUnit) * 0.55;
                const ry = (zone.depth * pxPerUnit) * 0.55;
                return (
                  <Ellipse
                    key={`heat-${zone.id}`}
                    x={cx}
                    y={cy}
                    radiusX={rx}
                    radiusY={ry}
                    fill={zone.colorHex}
                    opacity={0.35}
                  />
                );
              })}

            {/* Flow — arrowed lines from entry to each zone. Entry
                is a fixed point at the front-center of the booth,
                just inside the aisle (y = small). We draw a
                straight-ish line per zone with intensity scaled by
                zone area so the dominant zones get the boldest
                arrows. */}
            {showFlow && (() => {
              const entry = {
                x: toPxX(geometry.width / 2),
                y: toPxY(0.5), // 0.5 ft inside the front edge
              };
              const totalArea = geometry.zones.reduce(
                (s, z) => s + z.width * z.depth,
                0,
              );
              return (
                <>
                  {/* Entry marker — small filled circle so the user
                      can see where flow originates. */}
                  <Ellipse
                    x={entry.x}
                    y={entry.y}
                    radiusX={5}
                    radiusY={5}
                    fill="#a78bfa"
                    opacity={0.85}
                  />
                  <Text
                    x={entry.x - 30}
                    y={entry.y + 8}
                    width={60}
                    align="center"
                    text="ENTRY"
                    fontSize={9}
                    fontStyle="bold"
                    fill="rgba(167,139,250,0.9)"
                  />
                  {geometry.zones.map((zone) => {
                    const target = {
                      x: toPxX(zone.x + zone.width / 2),
                      y: toPxY(zone.y + zone.depth / 2),
                    };
                    const areaShare = totalArea
                      ? (zone.width * zone.depth) / totalArea
                      : 0;
                    const intensity = 0.4 + areaShare * 1.6; // 0.4–2.0 ish
                    return (
                      <Line
                        key={`flow-${zone.id}`}
                        points={[entry.x, entry.y, target.x, target.y]}
                        stroke="#a78bfa"
                        strokeWidth={Math.max(1, intensity * 1.4)}
                        opacity={0.55}
                        dash={[6, 4]}
                        lineCap="round"
                        // Arrowhead drawn as a separate small Line
                        // would be ideal; Konva doesn't ship a marker
                        // primitive so we settle for a dashed line —
                        // direction is read from the entry-to-zone
                        // gradient and the entry marker.
                      />
                    );
                  })}
                </>
              );
            })()}
          </Layer>
        )}
      </Stage>
    </div>
  );
});
