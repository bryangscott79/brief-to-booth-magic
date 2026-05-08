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

import { useMemo, useRef, useEffect } from "react";
import { Stage, Layer, Rect, Text, Line, Group } from "react-konva";
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
} from "@/lib/geometryModel";

const CANVAS_PADDING = 40; // px on each side, leaves room for dimension rulers
const MAX_CANVAS_SIZE = 640; // px — keep the canvas reasonable on laptops

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
}

/**
 * Compute pixels-per-unit so the booth fits inside the available canvas
 * size. The longest side of the booth maps to (MAX_CANVAS_SIZE - padding)
 * pixels; the shorter side scales to preserve aspect ratio.
 */
function computeScale(geometry: BoothGeometry): {
  pxPerUnit: number;
  canvasW: number;
  canvasH: number;
} {
  const longest = Math.max(geometry.width, geometry.depth);
  const usable = MAX_CANVAS_SIZE - CANVAS_PADDING * 2;
  const pxPerUnit = usable / longest;
  return {
    pxPerUnit,
    canvasW: geometry.width * pxPerUnit + CANVAS_PADDING * 2,
    canvasH: geometry.depth * pxPerUnit + CANVAS_PADDING * 2,
  };
}

export function SpatialCanvasTopDown({
  geometry,
  selectedZoneId,
  onSelectZone,
  onZonesChange,
  readonly = false,
}: SpatialCanvasTopDownProps) {
  const { pxPerUnit, canvasW, canvasH } = useMemo(
    () => computeScale(geometry),
    [geometry.width, geometry.depth],
  );
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const zoneNodesRef = useRef<Map<string, Konva.Group>>(new Map());

  // ─── Coordinate helpers (real units ↔ canvas pixels) ────────────────
  const toPxX = (units: number) => CANVAS_PADDING + units * pxPerUnit;
  const toPxY = (units: number) => CANVAS_PADDING + units * pxPerUnit;
  const toUnitsX = (px: number) => (px - CANVAS_PADDING) / pxPerUnit;
  const toUnitsY = (px: number) => (px - CANVAS_PADDING) / pxPerUnit;

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
    <div className="relative inline-block rounded-lg border border-border bg-muted/20 select-none">
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
          {/* Booth floor */}
          <Rect
            x={toPxX(0)}
            y={toPxY(0)}
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
          {/* Top edge label = "FRONT (aisle)" */}
          <Text
            x={toPxX(0)}
            y={toPxY(0) - 18}
            width={geometry.width * pxPerUnit}
            align="center"
            text="FRONT (primary aisle)"
            fontSize={11}
            fill="rgba(255,255,255,0.5)"
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
                x={toPxX(zone.x)}
                y={toPxY(zone.y)}
                draggable={!readonly}
                onMouseDown={(e) => {
                  e.cancelBubble = true;
                  onSelectZone(zone.id);
                }}
                onDragMove={(e) => {
                  // Snap on each frame for visual feedback.
                  const node = e.target;
                  const xUnits = snapToGrid(toUnitsX(node.x()), geometry.measurementSystem);
                  const yUnits = snapToGrid(toUnitsY(node.y()), geometry.measurementSystem);
                  // Clamp to booth bounds.
                  const maxX = Math.max(0, geometry.width - zone.width);
                  const maxY = Math.max(0, geometry.depth - zone.depth);
                  const clampedX = Math.max(0, Math.min(xUnits, maxX));
                  const clampedY = Math.max(0, Math.min(yUnits, maxY));
                  node.x(toPxX(clampedX));
                  node.y(toPxY(clampedY));
                }}
                onDragEnd={(e) => {
                  const node = e.target;
                  updateZone(zone.id, {
                    x: snapToGrid(toUnitsX(node.x()), geometry.measurementSystem),
                    y: snapToGrid(toUnitsY(node.y()), geometry.measurementSystem),
                  });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  // Konva tracks scale on transformer; we convert back to width/depth in units.
                  const newW = (node.width() * node.scaleX()) / pxPerUnit;
                  const newD = (node.height() * node.scaleY()) / pxPerUnit;
                  // Reset scale, push real width/height back to the rect.
                  node.scaleX(1);
                  node.scaleY(1);
                  updateZone(zone.id, {
                    x: snapToGrid(toUnitsX(node.x()), geometry.measurementSystem),
                    y: snapToGrid(toUnitsY(node.y()), geometry.measurementSystem),
                    width: snapToGrid(newW, geometry.measurementSystem),
                    depth: snapToGrid(newD, geometry.measurementSystem),
                  });
                }}
              >
                <Rect
                  width={zone.width * pxPerUnit}
                  height={zone.depth * pxPerUnit}
                  fill={zone.colorHex + "55"} // 33% alpha
                  stroke={
                    isOverlapping ? "#ef4444"
                      : isSelected ? "#ffffff"
                      : zone.colorHex
                  }
                  strokeWidth={isSelected ? 2.5 : isOverlapping ? 2 : 1.5}
                  cornerRadius={2}
                />
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
      </Stage>
    </div>
  );
}
