// measurementSystem — central source of truth for whether a project displays
// imperial (ft / sqft) or metric (m / sqm) dimensions.
//
// Background: parse-brief preserves the original size string ("6m × 6m" or
// "30x30") and a numeric sqft fallback. parseFootprint() in spatialUtils
// used to throw the unit away and force everything into feet downstream —
// so a 6m × 6m booth would render as 6' × 6'. This module fixes that by
// extracting the unit at parse time and persisting a per-project preference
// the rest of the pipeline reads from.

export type MeasurementSystem = "imperial" | "metric";

const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;

const LS_PREFIX = "canopy:project-measurement-system:";

// ─── Detection ─────────────────────────────────────────────────────────────

/**
 * Inspect a footprint string and return the unit it was authored in.
 * Returns null when no unit signal is present (e.g. just "30x30").
 */
export function detectUnitFromString(input: string | null | undefined): MeasurementSystem | null {
  if (!input) return null;
  const s = String(input).toLowerCase();
  // Metric signals — most explicit first.
  if (/\b(?:m|meter|metre|metres|meters|sqm|sq m|m²|m2|cm)\b/.test(s)) return "metric";
  // The single-letter "m" rule above is intentionally bounded by \b so it
  // matches "6m" but not "modular" / "minimum".
  if (/(?<![a-z])m(?![a-z])/.test(s) && /\d\s*m/.test(s)) return "metric";
  // Imperial signals.
  if (/\b(?:ft|feet|foot|sqft|sq ft|ft²|ft2)\b/.test(s)) return "imperial";
  if (/['′"]/.test(s)) return "imperial";
  return null;
}

/**
 * Walk a parsedBrief object looking for unit hints across the most likely
 * fields (footprint sizes, spatial notes, free text). Returns the first
 * confident match; null if nothing reads as either system.
 */
export function detectSystemFromBrief(brief: any): MeasurementSystem | null {
  if (!brief || typeof brief !== "object") return null;
  const candidates: Array<string | null | undefined> = [
    brief?.spatial?.footprints?.[0]?.size,
    ...((brief?.spatial?.footprints ?? []) as Array<{ size?: string }>).map((f) => f?.size),
    brief?.spatial?.indoorOutdoor,
    brief?.spatial?.trafficRequirements,
    brief?.spatial?.reuseRequirement,
    brief?.events?.shows?.[0]?.location,
    brief?.brand?.category,
  ];
  for (const c of candidates) {
    const u = detectUnitFromString(c);
    if (u) return u;
  }
  return null;
}

// ─── Persistence ───────────────────────────────────────────────────────────

function localKey(projectId: string) {
  return `${LS_PREFIX}${projectId}`;
}

export function loadProjectMeasurementSystem(projectId: string): MeasurementSystem | null {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    if (raw === "imperial" || raw === "metric") return raw;
    return null;
  } catch {
    return null;
  }
}

export function saveProjectMeasurementSystem(
  projectId: string,
  system: MeasurementSystem,
): void {
  try {
    localStorage.setItem(localKey(projectId), system);
  } catch {
    /* quota / private mode — ignore */
  }
}

// ─── Resolution ────────────────────────────────────────────────────────────

/**
 * Resolve the measurement system for a project, in priority order:
 *   1. explicit user preference saved on the project (localStorage)
 *   2. detected from brief content (parsedBrief.spatial.footprints etc.)
 *   3. fallback to imperial (matches existing app default)
 */
export function resolveMeasurementSystem(
  projectId: string | null | undefined,
  brief: any,
): MeasurementSystem {
  if (projectId) {
    const saved = loadProjectMeasurementSystem(projectId);
    if (saved) return saved;
  }
  const detected = detectSystemFromBrief(brief);
  if (detected) return detected;
  return "imperial";
}

// ─── Formatting + conversion ───────────────────────────────────────────────

/** Short label for the linear unit (ft / m). */
export function linearUnit(system: MeasurementSystem): "ft" | "m" {
  return system === "metric" ? "m" : "ft";
}

/** Short label for the area unit (sqft / sqm). */
export function areaUnit(system: MeasurementSystem): "sqft" | "sqm" {
  return system === "metric" ? "sqm" : "sqft";
}

/** Display symbol for linear ("'" for imperial, "m" for metric — used inline like "6m"). */
export function linearSymbol(system: MeasurementSystem): "'" | "m" {
  return system === "metric" ? "m" : "'";
}

/**
 * Format a width × depth pair using the right unit. Imperial keeps the
 * existing prime-mark style ("30' × 30'"); metric uses the unit suffix
 * ("6m × 6m") which is the convention exhibitors use globally.
 */
export function formatFootprintLabel(
  width: number,
  depth: number,
  system: MeasurementSystem,
): string {
  if (system === "metric") return `${width}m × ${depth}m`;
  return `${width}' × ${depth}'`;
}

/** Format an area number with unit ("450 sqft" / "42 sqm"). */
export function formatArea(value: number, system: MeasurementSystem): string {
  return `${Math.round(value).toLocaleString()} ${areaUnit(system)}`;
}

/**
 * Convert a linear value between systems. Used by the sqft↔sqm bridge so
 * downstream consumers that only deal in one unit (e.g. the cost engine
 * which assumes sqft) can normalize when needed.
 */
export function convertLinear(
  value: number,
  from: MeasurementSystem,
  to: MeasurementSystem,
): number {
  if (from === to) return value;
  if (from === "metric" && to === "imperial") return value * M_TO_FT;
  return value * FT_TO_M;
}

export function convertArea(
  value: number,
  from: MeasurementSystem,
  to: MeasurementSystem,
): number {
  if (from === to) return value;
  // sqft ↔ sqm
  if (from === "metric" && to === "imperial") return value * (M_TO_FT * M_TO_FT);
  return value * (FT_TO_M * FT_TO_M);
}
