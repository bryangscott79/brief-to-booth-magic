// useActiveSpatialConfig — shared "which booth size (footprint config) is
// active" selection for the Spatial and Prompts steps.
//
// The selection persists as `activeConfigKey` (a sanitized footprintSize
// string, e.g. "20x40") on the ROOT of the spatial_strategy JSON blob —
// no new DB columns; it rides the existing saveProjectField path exactly
// like zones/features/hangingElements edits do. Persisting the KEY rather
// than the index keeps the selection stable if configs get reordered.
//
// Reads resolve: local click (instant) > persisted activeConfigKey >
// configs[0] (the largest — matches the old hardcoded behavior).

import { useCallback, useMemo, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { saveProjectField } from "@/hooks/useProjectSync";
import { sanitizeConfigKey } from "@/lib/promptVersions";

export interface SpatialFootprintConfig {
  footprintSize?: string;
  totalSqft?: number;
  zones?: unknown[];
  [key: string]: unknown;
}

interface UseActiveSpatialConfigResult {
  /** All footprint configs on the project's spatial strategy ([] when none). */
  configs: SpatialFootprintConfig[];
  /** Resolved active config index (always valid when configs exist). */
  activeIndex: number;
  /** The active config object, or undefined when the project has no configs. */
  activeConfig: SpatialFootprintConfig | undefined;
  /** Sanitized key for the active config ("20x40"), null when no configs. */
  activeConfigKey: string | null;
  /** Human label for the active config (raw footprintSize), null when none. */
  activeConfigLabel: string | null;
  /** Sanitized key of configs[0] — legacy/untagged renders belong to it. */
  defaultConfigKey: string | null;
  /** Switch the active config and persist the selection to spatial_strategy. */
  setActiveIndex: (index: number) => void;
}

export function useActiveSpatialConfig(
  projectId: string | null | undefined,
): UseActiveSpatialConfigResult {
  const currentProject = useProjectStore((s) => s.currentProject);
  const spatialData = currentProject?.elements.spatialStrategy.data;

  const configs = useMemo<SpatialFootprintConfig[]>(() => {
    const raw = spatialData?.configs;
    return Array.isArray(raw) ? raw : [];
  }, [spatialData]);

  // Local override so chip clicks feel instant even while the DB write is
  // in flight. Reset naturally on remount (page navigation) — the persisted
  // key takes over then.
  const [localIndex, setLocalIndex] = useState<number | null>(null);

  const persistedKey =
    typeof spatialData?.activeConfigKey === "string" ? spatialData.activeConfigKey : null;

  const activeIndex = useMemo(() => {
    if (localIndex !== null && localIndex >= 0 && localIndex < configs.length) {
      return localIndex;
    }
    if (persistedKey) {
      const idx = configs.findIndex(
        (c) => sanitizeConfigKey(String(c?.footprintSize ?? "")) === persistedKey,
      );
      if (idx >= 0) return idx;
    }
    return 0;
  }, [localIndex, persistedKey, configs]);

  const activeConfig = configs[activeIndex];
  const activeConfigLabel = activeConfig?.footprintSize
    ? String(activeConfig.footprintSize)
    : null;
  const activeConfigKey = activeConfigLabel ? sanitizeConfigKey(activeConfigLabel) : null;
  const defaultConfigKey = configs[0]?.footprintSize
    ? sanitizeConfigKey(String(configs[0].footprintSize))
    : null;

  const setActiveIndex = useCallback(
    (index: number) => {
      setLocalIndex(index);
      const cfg = configs[index];
      if (!cfg?.footprintSize || !spatialData) return;
      const key = sanitizeConfigKey(String(cfg.footprintSize));
      if (spatialData.activeConfigKey === key) return;
      const updatedSpatial = { ...spatialData, activeConfigKey: key };
      // Optimistic local update via project store + persist to DB — same
      // pattern as zone edits in SpatialPlanner.handleCanvasGeometryChange.
      useProjectStore.getState().setElementData("spatialStrategy", updatedSpatial);
      if (projectId) {
        saveProjectField(projectId, "spatial_strategy", updatedSpatial);
      }
    },
    [configs, spatialData, projectId],
  );

  return {
    configs,
    activeIndex,
    activeConfig,
    activeConfigKey,
    activeConfigLabel,
    defaultConfigKey,
    setActiveIndex,
  };
}
