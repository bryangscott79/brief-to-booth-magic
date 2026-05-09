// SpatialCanvasIso — read-only isometric 3D preview of the booth + zones.
//
// Renders the same BoothGeometry as the top-down editor, projected via
// an orthographic camera at a fixed isometric angle (35° yaw, 30° pitch).
// Each zone is a translucent extruded box at its `heightFt`. A 5'8" stick
// figure stands in the front-left corner so the visual scale is calibrated.
//
// This view is the geometry reference the AI image model receives.
// Capturing it to PNG gives us a deterministic anchor: "the final image
// must depict a structure occupying THIS volume."
//
// Internally feet are the canonical unit. Metric geometries are converted
// (1 m = 3.28084 ft) before scene construction so the camera framing
// works consistently across systems.

import { useMemo, forwardRef, useImperativeHandle, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrthographicCamera, Edges, Text, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import type { BoothGeometry, AbsoluteZone } from "@/lib/geometryModel";
import { effectiveShape, resolveLNotch } from "@/lib/geometryModel";

/** 1 meter in feet. */
const M_TO_FT = 3.28084;

/** Convert a length to feet (canvas internal unit). */
function toFt(value: number, system: "imperial" | "metric"): number {
  return system === "metric" ? value * M_TO_FT : value;
}

/** Average human height in feet — the silhouette baseline. */
const HUMAN_HEIGHT_FT = 5.67; // 5'8"
const HUMAN_WIDTH_FT = 1.5;

export interface SpatialCanvasIsoHandle {
  /** Capture the current frame as a PNG data URL. Used by the export pipeline. */
  capturePng: () => Promise<string | null>;
}

export interface SpatialCanvasIsoProps {
  geometry: BoothGeometry;
  /** Optional: highlight a specific zone (matches selection in top-down). */
  highlightedZoneId?: string | null;
  /** CSS height for the canvas wrapper. Defaults to 360px. */
  height?: number;
  /** Show the human silhouette for scale. Default true. */
  showHuman?: boolean;
  /** Background color. Defaults to a dark slate that matches the top-down. */
  background?: string;
}

/**
 * One extruded zone box in the scene. Positioned with origin at the
 * booth's front-left corner; THREE's coords are (x: width, y: up, z: depth)
 * so we map zone.x → x, zone.y → z, heightFt → y.
 */
/**
 * Build a Three.js Shape for one zone in its LOCAL coords (origin at
 * the zone's bounding-box center on the floor plane). The shape is
 * drawn flat in 2D (x, y) and then extruded vertically (along world Y)
 * by the caller.
 *
 *   • rect   — half-w × half-d centered rectangle
 *   • L      — same rectangle minus a notch at the configured corner
 *   • circle — ellipse with rx = w/2, ry = d/2 (perfect circle when w==d)
 */
function buildZoneShape(zone: AbsoluteZone, w: number, d: number): THREE.Shape {
  const shape = new THREE.Shape();
  const halfW = w / 2;
  const halfD = d / 2;

  const kind = effectiveShape(zone);

  if (kind === "circle") {
    // Ellipse: 32 segments is plenty for visual smoothness without
    // bloating geometry. Center at origin, rx = w/2, ry = d/2.
    shape.absellipse(0, 0, halfW, halfD, 0, Math.PI * 2, false, 0);
    return shape;
  }

  if (kind === "diamond") {
    // 4-point rhombus inscribed in the bounding box. Same coord
    // convention as the rect branch (origin at center).
    shape.moveTo(0, halfD);
    shape.lineTo(halfW, 0);
    shape.lineTo(0, -halfD);
    shape.lineTo(-halfW, 0);
    shape.closePath();
    return shape;
  }

  if (kind === "L") {
    const { corner, notchWidth, notchDepth } = resolveLNotch(zone);
    // Walk the bounding box clockwise, cutting in/out at the notched
    // corner. Local coords: origin at center, +x right, +y "up" in
    // the 2D shape plane (which becomes the floor when extruded).
    // We want corner mapping consistent with the top-down renderer:
    //   NE = top-right of the 2D shape
    //   NW = top-left
    //   SE = bottom-right
    //   SW = bottom-left
    if (corner === "NE") {
      shape.moveTo(-halfW, halfD);
      shape.lineTo(halfW - notchWidth, halfD);
      shape.lineTo(halfW - notchWidth, halfD - notchDepth);
      shape.lineTo(halfW, halfD - notchDepth);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(-halfW, -halfD);
    } else if (corner === "NW") {
      shape.moveTo(-halfW + notchWidth, halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(-halfW, -halfD);
      shape.lineTo(-halfW, halfD - notchDepth);
      shape.lineTo(-halfW + notchWidth, halfD - notchDepth);
    } else if (corner === "SE") {
      shape.moveTo(-halfW, halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(halfW, -halfD + notchDepth);
      shape.lineTo(halfW - notchWidth, -halfD + notchDepth);
      shape.lineTo(halfW - notchWidth, -halfD);
      shape.lineTo(-halfW, -halfD);
    } else {
      // SW
      shape.moveTo(-halfW, halfD);
      shape.lineTo(halfW, halfD);
      shape.lineTo(halfW, -halfD);
      shape.lineTo(-halfW + notchWidth, -halfD);
      shape.lineTo(-halfW + notchWidth, -halfD + notchDepth);
      shape.lineTo(-halfW, -halfD + notchDepth);
    }
    shape.closePath();
    return shape;
  }

  // Default: rectangle.
  shape.moveTo(-halfW, halfD);
  shape.lineTo(halfW, halfD);
  shape.lineTo(halfW, -halfD);
  shape.lineTo(-halfW, -halfD);
  shape.closePath();
  return shape;
}

function ZoneBox({
  zone,
  system,
  highlighted,
}: {
  zone: AbsoluteZone;
  system: "imperial" | "metric";
  highlighted: boolean;
}) {
  const w = toFt(zone.width, system);
  const d = toFt(zone.depth, system);
  const h = zone.heightFt;
  const cx = toFt(zone.x, system) + w / 2;
  const cz = toFt(zone.y, system) + d / 2;
  const cy = h / 2;

  // Build the 2D footprint shape, then extrude it vertically so the
  // zone reads as a 3D volume. ExtrudeGeometry extrudes along +Z in
  // its local frame; we rotate -90° around X so the extrusion axis
  // aligns with world Y (up).
  const footprintShape = useMemo(() => buildZoneShape(zone, w, d), [zone, w, d]);

  return (
    <group position={[cx, cy, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[footprintShape, { depth: h, bevelEnabled: false }]} />
        <meshStandardMaterial
          color={zone.colorHex}
          transparent
          opacity={highlighted ? 0.55 : 0.32}
          metalness={0.1}
          roughness={0.85}
        />
        <Edges color={highlighted ? "#ffffff" : zone.colorHex} threshold={1} />
      </mesh>
      {/* Floor footprint shape — slightly darker fill so zones still
          read from above. Uses the same THREE.Shape extruded by 0.04
          (just the floor "tile") to avoid z-fighting with the booth
          floor plane underneath. */}
      <mesh position={[0, -h / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[footprintShape]} />
        <meshBasicMaterial color={zone.colorHex} opacity={0.6} transparent />
      </mesh>
      {/* Floating zone label above the box. Long names get truncated
          at ~14 chars + ellipsis to prevent the text from extending
          past the canvas bounds and bleeding into adjacent zones. */}
      <Text
        position={[0, h / 2 + 1.5, 0]}
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
        maxWidth={Math.max(w - 0.5, 4)}
      >
        {zone.name.length > 18 ? `${zone.name.slice(0, 16)}…` : zone.name}
      </Text>
    </group>
  );
}

/** A simple stick-figure silhouette for human-scale calibration. */
function HumanSilhouette({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, HUMAN_HEIGHT_FT / 2, z]}>
      {/* Body */}
      <mesh>
        <boxGeometry args={[HUMAN_WIDTH_FT * 0.6, HUMAN_HEIGHT_FT * 0.6, HUMAN_WIDTH_FT * 0.4]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      {/* Head */}
      <mesh position={[0, HUMAN_HEIGHT_FT * 0.42, 0]}>
        <sphereGeometry args={[HUMAN_WIDTH_FT * 0.32, 12, 12]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      <Text
        position={[0, -HUMAN_HEIGHT_FT / 2 - 0.6, 0]}
        fontSize={0.7}
        color="#cbd5e1"
        anchorX="center"
        outlineWidth={0.03}
        outlineColor="#000000"
      >
        5'8"
      </Text>
    </group>
  );
}

export const SpatialCanvasIso = forwardRef<SpatialCanvasIsoHandle, SpatialCanvasIsoProps>(
  function SpatialCanvasIso(
    { geometry, highlightedZoneId = null, height = 360, showHuman = true, background = "#0b1020" },
    ref,
  ) {
    const glRef = useRef<THREE.WebGLRenderer | null>(null);

    // Booth in feet (canvas canonical).
    const wFt = useMemo(() => toFt(geometry.width, geometry.measurementSystem), [geometry]);
    const dFt = useMemo(() => toFt(geometry.depth, geometry.measurementSystem), [geometry]);
    const ceiling = geometry.ceilingHeightFt;

    // Camera framing: orthographic, sized to fit the booth's longest side
    // plus headroom for the ceiling. Using ortho gives us clean isometric
    // proportions that match what the AI model will reason about.
    const longestSide = Math.max(wFt, dFt);
    const orthoExtent = longestSide * 0.85;
    // Iso-style angle. CRITICAL: the booth's FRONT (primary aisle) is
    // at z=0 and the BACK is at z=dFt. To put the front in the
    // foreground (matches the canvas's front-at-bottom convention and
    // matches a visitor's perspective walking up to the booth), the
    // camera sits at NEGATIVE z — in front of the booth, looking back
    // into it. The +x and +y position keep the standard right-side
    // top-down isometric tilt; only z flips. Without this flip the
    // back wall obscured the front and the iso looked "backwards" to
    // the user.
    const camPos: [number, number, number] = [
      wFt + longestSide * 0.4,
      longestSide * 1.1,
      -longestSide * 0.4,
    ];

    // Stash the latest scene + camera handles so the PNG capture path
    // can force a fresh frame. WebGLRenderer.userData isn't typed, so
    // we keep our own little registry.
    const sceneRegistryRef = useRef<{ scene: THREE.Scene | null; camera: THREE.Camera | null }>({
      scene: null,
      camera: null,
    });

    useImperativeHandle(ref, () => ({
      async capturePng() {
        const gl = glRef.current;
        const reg = sceneRegistryRef.current;
        if (!gl || !reg.scene || !reg.camera) return null;
        // Force a synchronous render so the PNG matches the latest state.
        gl.render(reg.scene, reg.camera);
        return gl.domElement.toDataURL("image/png");
      },
    }));

    return (
      <div
        className="rounded-lg border border-border overflow-hidden w-full min-w-0"
        style={{ height, background }}
      >
        <Canvas
          orthographic
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          onCreated={({ gl, scene, camera }) => {
            glRef.current = gl;
            // Stash scene/camera so capturePng can force a synchronous render.
            sceneRegistryRef.current = { scene, camera };
            gl.setClearColor(background);
          }}
          shadows={false}
        >
          <OrthographicCamera
            makeDefault
            position={camPos}
            zoom={Math.min(360 / orthoExtent, 600 / orthoExtent)}
            near={-1000}
            far={1000}
            up={[0, 1, 0]}
            // Look at booth center, slightly above floor so the whole
            // volume frames nicely.
            onUpdate={(cam) => cam.lookAt(wFt / 2, ceiling / 2, dFt / 2)}
          />

          {/* Lighting — soft, even illumination so geometry reads clearly. */}
          <ambientLight intensity={0.7} />
          <directionalLight position={[longestSide, longestSide * 1.5, longestSide]} intensity={0.6} />
          <directionalLight position={[-longestSide, longestSide, -longestSide]} intensity={0.25} />

          {/* Booth floor outline */}
          <mesh position={[wFt / 2, 0, dFt / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[wFt, dFt]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          {/* Floor edge lines for clean orthographic reading */}
          <mesh position={[wFt / 2, 0.01, dFt / 2]}>
            <boxGeometry args={[wFt, 0.05, dFt]} />
            <meshBasicMaterial color="#0f172a" />
            <Edges color="#94a3b8" threshold={1} />
          </mesh>

          {/* Ceiling wireframe — shows max height envelope. */}
          <mesh position={[wFt / 2, ceiling, dFt / 2]}>
            <boxGeometry args={[wFt, 0.02, dFt]} />
            <meshBasicMaterial color="#0f172a" transparent opacity={0.5} />
            <Edges color="#475569" threshold={1} />
          </mesh>

          {/* Each zone as an extruded box. */}
          {geometry.zones.map((z) => (
            <ZoneBox
              key={z.id}
              zone={z}
              system={geometry.measurementSystem}
              highlighted={z.id === highlightedZoneId}
            />
          ))}

          {/* 5'8" silhouette in the front-left corner — visual scale anchor. */}
          {showHuman && <HumanSilhouette x={1.5} z={1.5} />}

          {/* Compass gizmo (top-right) so the viewer can read N/E/S/W axes */}
          <GizmoHelper alignment="top-right" margin={[60, 60]}>
            <GizmoViewport
              axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
              labelColor="#ffffff"
            />
          </GizmoHelper>
        </Canvas>
      </div>
    );
  },
);
