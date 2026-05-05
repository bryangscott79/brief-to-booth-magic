// useMeasurementSystem — per-project source of truth for imperial vs metric.
//
// Resolution order:
//   1. user's explicit preference (localStorage key per projectId)
//   2. unit detected from the parsed brief (footprint string, etc.)
//   3. fallback: imperial
//
// Setting the system updates localStorage immediately so every consumer
// re-renders with the new unit. Render prompts, BOM/cost summaries, the
// spatial planner, and the export pipeline all read through this hook.

import { useCallback, useEffect, useState } from "react";
import {
  loadProjectMeasurementSystem,
  saveProjectMeasurementSystem,
  resolveMeasurementSystem,
  type MeasurementSystem,
} from "@/lib/measurementSystem";

export function useMeasurementSystem(
  projectId: string | null | undefined,
  brief: any,
): {
  system: MeasurementSystem;
  setSystem: (next: MeasurementSystem) => void;
  /** True when the value comes from a user preference (rather than auto-detect). */
  isExplicit: boolean;
} {
  const [system, setSystemState] = useState<MeasurementSystem>(() =>
    resolveMeasurementSystem(projectId ?? null, brief),
  );
  const [isExplicit, setIsExplicit] = useState<boolean>(() => {
    if (!projectId) return false;
    return loadProjectMeasurementSystem(projectId) !== null;
  });

  // Re-resolve whenever the project or brief changes.
  useEffect(() => {
    setSystemState(resolveMeasurementSystem(projectId ?? null, brief));
    setIsExplicit(projectId ? loadProjectMeasurementSystem(projectId) !== null : false);
  }, [projectId, brief]);

  const setSystem = useCallback(
    (next: MeasurementSystem) => {
      if (projectId) saveProjectMeasurementSystem(projectId, next);
      setSystemState(next);
      setIsExplicit(true);
    },
    [projectId],
  );

  return { system, setSystem, isExplicit };
}
