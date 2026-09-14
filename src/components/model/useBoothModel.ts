// useBoothModel — derives the 3D model payloads for the Model step from the
// project's spatial geometry.
//
// The geometry is assembled exactly the way SpatialPlanner assembles it for
// the canvas (boothGeometryFromLegacy over the ACTIVE footprint config, with
// features / hanging elements / materials read from the spatial_strategy
// root), so the model is the same booth the user zoned — never a re-derived
// approximation.
//
// The Blender script is cheap and is memoised for the preview. The glTF is
// built on demand at download time: it embeds a base64 buffer and there is no
// reason to pay for that on every render.

import { useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useActiveSpatialConfig } from "@/hooks/useActiveSpatialConfig";
import { useMeasurementSystem } from "@/hooks/useMeasurementSystem";
import { calculateBoothDimensions, normalizeZones } from "@/lib/spatialUtils";
import { boothGeometryFromLegacy, type BoothGeometry } from "@/lib/geometryModel";
import type {
  AbsoluteHangingElement,
  BoothFeature,
  MaterialEntry,
} from "@/lib/geometryModel";
import { buildBoothModelPlan } from "@/lib/boothSolids";
import { buildBlenderScript, blenderScriptFilename } from "@/lib/blenderScript";
import { buildGltfFile, gltfFilename } from "@/lib/gltfExport";

/** Fallback ceiling when the project never set one — matches SpatialPlanner. */
const DEFAULT_CEILING_FT = 12;

export interface BoothModelState {
  /** null when the project has no footprint config / zones yet. */
  geometry: BoothGeometry | null;
  /** The Blender program — null when there is no geometry. */
  script: string | null;
  scriptFilename: string;
  gltfFilename: string;
  /** Build the .gltf text on demand (embeds a base64 buffer). */
  buildGltf: () => string | null;
  stats: {
    zones: number;
    features: number;
    hangingElements: number;
    objects: number;
    materials: number;
  };
  /** Footprint label for the active config ("20x40"), null when none. */
  configLabel: string | null;
  projectName: string;
  /** Bumped by rebuild() — shown as "regenerated" feedback in the UI. */
  generatedAt: Date;
  /** Recompute from whatever the spatial step holds right now. */
  rebuild: () => void;
}

export function useBoothModel(projectId: string | null | undefined): BoothModelState {
  const currentProject = useProjectStore((s) => s.currentProject);
  const brief = currentProject?.parsedBrief;
  const spatialData = currentProject?.elements.spatialStrategy.data as
    | Record<string, unknown>
    | null
    | undefined;
  const { activeConfig, activeConfigLabel } = useActiveSpatialConfig(projectId);
  const { system } = useMeasurementSystem(projectId, brief);

  // Manual rebuild: the memo below already tracks the store, so this exists to
  // give the user an explicit "pick up my latest layout edit" action and a
  // visible timestamp for what they are about to download.
  const [nonce, setNonce] = useState(0);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const rebuild = useCallback(() => {
    setNonce((n) => n + 1);
    setGeneratedAt(new Date());
  }, []);

  const geometry = useMemo<BoothGeometry | null>(() => {
    void nonce;
    const footprint = activeConfig?.footprintSize ? String(activeConfig.footprintSize) : null;
    const rawZones = Array.isArray(activeConfig?.zones) ? activeConfig.zones : [];
    if (!footprint || rawZones.length === 0) return null;

    const dims = calculateBoothDimensions(footprint, system);
    const zones = normalizeZones(rawZones, dims.totalSqft);

    const features = Array.isArray(spatialData?.features)
      ? (spatialData.features as BoothFeature[])
      : [];
    const hangingElements = Array.isArray(spatialData?.hangingElements)
      ? (spatialData.hangingElements as AbsoluteHangingElement[])
      : [];
    const rawMaterials = Array.isArray(spatialData?.materialsAndMood)
      ? (spatialData.materialsAndMood as Array<Record<string, string | undefined>>)
      : [];
    const materialsCatalog: MaterialEntry[] = rawMaterials.map((m, i) => ({
      id: m.id ?? `mat_${i}`,
      name: m.name ?? m.material ?? `Material ${i + 1}`,
      description: m.description ?? m.feel ?? "",
    }));

    const ceilingHeightFt =
      typeof spatialData?.ceilingHeightFt === "number"
        ? spatialData.ceilingHeightFt
        : DEFAULT_CEILING_FT;

    return boothGeometryFromLegacy({ ...dims, measurementSystem: system }, zones, ceilingHeightFt, {
      features,
      materialsCatalog,
      hangingElements,
    });
  }, [activeConfig, spatialData, system, nonce]);

  const projectName = currentProject?.name ?? "Booth";
  const fileOptions = { projectName, configLabel: activeConfigLabel ?? undefined };

  const script = useMemo(
    () => (geometry ? buildBlenderScript(geometry, fileOptions) : null),
    // fileOptions is derived from these two values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry, projectName, activeConfigLabel],
  );

  const stats = useMemo(() => {
    if (!geometry) {
      return { zones: 0, features: 0, hangingElements: 0, objects: 0, materials: 0 };
    }
    const plan = buildBoothModelPlan(geometry);
    return {
      zones: plan.stats.zones,
      features: plan.stats.features,
      hangingElements: plan.stats.hangingElements,
      objects: plan.stats.solids,
      materials: plan.materials.length,
    };
  }, [geometry]);

  const buildGltf = useCallback(
    () => (geometry ? buildGltfFile(geometry, fileOptions) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometry, projectName, activeConfigLabel],
  );

  return {
    geometry,
    script,
    scriptFilename: blenderScriptFilename(fileOptions),
    gltfFilename: gltfFilename(fileOptions),
    buildGltf,
    stats,
    configLabel: activeConfigLabel,
    projectName,
    generatedAt,
    rebuild,
  };
}
