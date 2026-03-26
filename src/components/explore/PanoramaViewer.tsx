import { useRef, useEffect, useCallback, useState } from "react";
import * as pc from "playcanvas";

export interface Hotspot {
  /** Unique ID for this hotspot */
  id: string;
  /** Display label */
  label: string;
  /** Spherical position: yaw in degrees (0 = front, 90 = right) */
  yaw: number;
  /** Spherical position: pitch in degrees (0 = horizon, +90 = up) */
  pitch: number;
  /** ID of the panorama to navigate to */
  targetPanoramaId: string;
}

interface PanoramaViewerProps {
  /** URL of the equirectangular panorama image */
  imageUrl: string;
  /** Hotspots for navigating to other panoramas */
  hotspots?: Hotspot[];
  /** Called when a hotspot is clicked */
  onHotspotClick?: (hotspot: Hotspot) => void;
  /** CSS class for the container */
  className?: string;
}

export function PanoramaViewer({
  imageUrl,
  hotspots = [],
  onHotspotClick,
  className = "",
}: PanoramaViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const cameraEntityRef = useRef<pc.Entity | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const angles = useRef({ yaw: 0, pitch: 0 });
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);

  // Create PlayCanvas app and skybox sphere
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new pc.Application(canvas, {
      graphicsDeviceOptions: { alpha: false, antialias: true },
    });
    appRef.current = app;

    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // Camera at center of sphere
    const camera = new pc.Entity("camera");
    camera.addComponent("camera", {
      clearColor: new pc.Color(0.1, 0.1, 0.1),
      fov: 75,
      nearClip: 0.01,
      farClip: 1000,
    });
    app.root.addChild(camera);
    cameraEntityRef.current = camera;

    // Ambient light
    const light = new pc.Entity("light");
    light.addComponent("light", {
      type: "directional",
      intensity: 0.3,
    });
    app.root.addChild(light);

    app.start();

    // Handle resize
    const onResize = () => {
      app.resizeCanvas(canvas.width, canvas.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      app.destroy();
      appRef.current = null;
      cameraEntityRef.current = null;
    };
  }, []);

  // Load panorama texture onto an inverted sphere
  useEffect(() => {
    const app = appRef.current;
    if (!app || !imageUrl) return;

    // Remove previous sky sphere if any
    const existing = app.root.findByName("skySphere");
    if (existing) existing.destroy();

    const asset = new pc.Asset("panorama", "texture", { url: imageUrl });

    asset.on("load", () => {
      // Create an inverted sphere (normals face inward)
      const sphere = new pc.Entity("skySphere");

      sphere.addComponent("render", {
        type: "sphere",
      });

      // Scale large so camera is inside
      sphere.setLocalScale(100, 100, 100);

      // Create material with the panorama texture, emissive so no lighting needed
      const material = new pc.StandardMaterial();
      material.emissive = new pc.Color(1, 1, 1);
      material.emissiveMap = asset.resource as pc.Texture;
      material.useLighting = false;
      material.cull = pc.CULLFACE_FRONT; // Render inside of sphere
      material.update();

      const meshInstances = sphere.render?.meshInstances;
      if (meshInstances) {
        for (const mi of meshInstances) {
          mi.material = material;
        }
      }

      app.root.addChild(sphere);
    });

    app.assets.add(asset);
    app.assets.load(asset);
  }, [imageUrl]);

  // Camera orbit controls
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !cameraEntityRef.current) return;

    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };

    angles.current.yaw -= dx * 0.3;
    angles.current.pitch = Math.max(
      -85,
      Math.min(85, angles.current.pitch - dy * 0.3)
    );

    cameraEntityRef.current.setEulerAngles(
      angles.current.pitch,
      angles.current.yaw,
      0
    );
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Mouse wheel zoom (FOV)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const camera = cameraEntityRef.current;
    if (!camera?.camera) return;

    const fov = camera.camera.fov + e.deltaY * 0.05;
    camera.camera.fov = Math.max(30, Math.min(110, fov));
  }, []);

  // Convert spherical hotspot position to screen position
  const getHotspotScreenPos = useCallback(
    (hotspot: Hotspot) => {
      const camera = cameraEntityRef.current;
      const app = appRef.current;
      if (!camera?.camera || !app) return null;

      // Convert yaw/pitch to 3D position on sphere
      const yawRad = (hotspot.yaw * Math.PI) / 180;
      const pitchRad = (hotspot.pitch * Math.PI) / 180;
      const dist = 10;
      const x = dist * Math.cos(pitchRad) * Math.sin(yawRad);
      const y = dist * Math.sin(pitchRad);
      const z = dist * Math.cos(pitchRad) * Math.cos(yawRad);

      const worldPos = new pc.Vec3(x, y, -z);
      const screenPos = new pc.Vec3();
      camera.camera.worldToScreen(worldPos, screenPos);

      // Check if behind camera
      const camForward = camera.forward;
      const toHotspot = new pc.Vec3().sub2(worldPos, camera.getPosition());
      if (camForward.dot(toHotspot) < 0) return null;

      const canvas = app.graphicsDevice.canvas;
      if (
        screenPos.x < 0 ||
        screenPos.x > canvas.clientWidth ||
        screenPos.y < 0 ||
        screenPos.y > canvas.clientHeight
      ) {
        return null;
      }

      return { x: screenPos.x, y: screenPos.y };
    },
    []
  );

  // Render hotspot overlays using animation frame
  const [hotspotPositions, setHotspotPositions] = useState<
    Record<string, { x: number; y: number } | null>
  >({});

  useEffect(() => {
    if (hotspots.length === 0) return;

    let animFrame: number;
    const update = () => {
      const positions: Record<string, { x: number; y: number } | null> = {};
      for (const hs of hotspots) {
        positions[hs.id] = getHotspotScreenPos(hs);
      }
      setHotspotPositions(positions);
      animFrame = requestAnimationFrame(update);
    };
    animFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrame);
  }, [hotspots, getHotspotScreenPos]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
      />

      {/* Hotspot overlays */}
      {hotspots.map((hs) => {
        const pos = hotspotPositions[hs.id];
        if (!pos) return null;
        return (
          <button
            key={hs.id}
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-10"
            style={{ left: pos.x, top: pos.y }}
            onClick={() => onHotspotClick?.(hs)}
            onMouseEnter={() => setHoveredHotspot(hs.id)}
            onMouseLeave={() => setHoveredHotspot(null)}
          >
            <div
              className={`w-10 h-10 rounded-full border-2 border-white bg-white/20 backdrop-blur-sm flex items-center justify-center transition-all ${
                hoveredHotspot === hs.id ? "scale-125 bg-white/40" : ""
              }`}
            >
              <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
            </div>
            {hoveredHotspot === hs.id && (
              <span className="px-2 py-1 text-xs font-medium text-white bg-black/70 rounded whitespace-nowrap">
                {hs.label}
              </span>
            )}
          </button>
        );
      })}

      {/* Controls hint */}
      <div className="absolute bottom-4 left-4 text-xs text-white/60 bg-black/40 backdrop-blur-sm rounded px-2 py-1">
        Drag to look around &middot; Scroll to zoom
      </div>
    </div>
  );
}
