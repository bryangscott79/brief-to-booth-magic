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

  return (
    <group position={[cx, cy, cz]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={zone.colorHex}
          transparent
          opacity={highlighted ? 0.55 : 0.32}
          metalness={0.1}
          roughness={0.85}
        />
        <Edges color={highlighted ? "#ffffff" : zone.colorHex} threshold={1} />
      </mesh>
      {/* Floor footprint — slightly darker fill so zones still read from above. */}
      <mesh position={[0, -h / 2 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={zone.colorHex} opacity={0.6} transparent />
      </mesh>
      {/* Floating zone label above the box. */}
      <Text
        position={[0, h / 2 + 1.5, 0]}
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {zone.name}
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
    // Iso-style angle: equal x/z rotation, slight tilt down.
    const camPos: [number, number, number] = [
      longestSide * 1.4,
      longestSide * 1.1,
      longestSide * 1.4,
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
        className="rounded-lg border border-border overflow-hidden"
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
