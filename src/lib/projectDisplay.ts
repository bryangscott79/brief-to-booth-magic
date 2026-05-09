/**
 * Project display helpers — small pure functions used by the projects
 * list cards and table view. Centralized so the visual language is
 * consistent everywhere a project gets summarized.
 */

import type { DBProject } from "@/hooks/useProjects";
import type { Client } from "@/hooks/useClients";

/**
 * Color-coded status palette. Distinct hues so users can scan the
 * grid and see at a glance what's in flight vs ready vs blocked.
 *
 * Tailwind classes are returned as a bundle so callers don't have to
 * remember which combo of bg/text/border maps to each state.
 */
export interface StatusPalette {
  label: string;
  /** Solid badge classes — bg + text + border. */
  badgeClass: string;
  /** Dot-only marker for the table view. */
  dotClass: string;
}

export const PROJECT_STATUS_PALETTE: Record<string, StatusPalette> = {
  // Yellow/amber — needs a brief uploaded; user action required.
  draft: {
    label: "Draft",
    badgeClass:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
    dotClass: "bg-amber-500",
  },
  // Sky blue — actively being parsed (in flight).
  parsing: {
    label: "Parsing",
    badgeClass:
      "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
    dotClass: "bg-sky-500",
  },
  // Indigo — brief reviewed, mid-pipeline (in progress).
  reviewed: {
    label: "Reviewed",
    badgeClass:
      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40",
    dotClass: "bg-indigo-500",
  },
  // Violet — actively generating renders.
  generating: {
    label: "Generating",
    badgeClass:
      "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
    dotClass: "bg-violet-500",
  },
  // Green — delivered/exported. Reserved for the finish line.
  completed: {
    label: "Delivered",
    badgeClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    dotClass: "bg-emerald-500",
  },
};

const FALLBACK_PALETTE: StatusPalette = {
  label: "Unknown",
  badgeClass:
    "bg-muted text-muted-foreground border-border",
  dotClass: "bg-muted-foreground",
};

export function statusPalette(status: string | null | undefined): StatusPalette {
  if (!status) return FALLBACK_PALETTE;
  return PROJECT_STATUS_PALETTE[status] ?? FALLBACK_PALETTE;
}

/**
 * Resolve the project's display CLIENT name (top line of the card).
 *
 *   1. Linked client record (clients.name)
 *   2. parsed_brief.brand.name (when no client linked)
 *   3. null — caller should fall back to project.name
 */
export function resolveClientDisplayName(
  project: DBProject,
  clientById: Map<string, Client>,
): string | null {
  if (project.client_id) {
    const c = clientById.get(project.client_id);
    if (c?.name) return c.name;
  }
  const brand = (project.parsed_brief as any)?.brand?.name;
  if (typeof brand === "string" && brand.trim().length > 0) return brand.trim();
  return null;
}

/**
 * Strip filename junk and derive a human-friendly "activation" name
 * from the project.name + brief metadata.
 *
 * Heuristics, in order:
 *   1. parsed_brief.events.shows[0]?.name + parsed_brief.events.year — if both present
 *   2. parsed_brief.activation?.name (some briefs have a top-level activation)
 *   3. The project.name with brand/extension stripped + Title Case
 *   4. project.name as-is (last resort)
 *
 * Returns null when the result is identical to the resolved client name
 * (so the card shows the client just once, not duplicated).
 */
export function resolveActivationDisplayName(
  project: DBProject,
  clientName: string | null,
): string | null {
  const pb = project.parsed_brief as any | null;

  // 1. Show + year is the most informative subtitle when present.
  const showName: string | undefined = pb?.events?.shows?.[0]?.name
    ?? pb?.events?.primaryShow;
  const year: string | number | undefined = pb?.events?.year ?? pb?.events?.shows?.[0]?.year;
  if (typeof showName === "string" && showName.trim().length > 0) {
    const yearStr = year ? ` ${year}` : "";
    return `${showName.trim()}${yearStr}`;
  }

  // 2. Explicit activation name on the brief.
  const activationName: string | undefined = pb?.activation?.name;
  if (typeof activationName === "string" && activationName.trim().length > 0) {
    return activationName.trim();
  }

  // 3. Clean the raw project name.
  const cleaned = cleanProjectName(project.name);
  // Don't echo the client back as the subtitle.
  if (clientName && cleaned.toLowerCase() === clientName.toLowerCase()) {
    return null;
  }
  return cleaned || null;
}

/**
 * Clean a typical messy project filename like
 *   "Brief_LiveBrandActivation_RedBull_Coachella (1).pdf"
 * into a readable activation name like
 *   "Live Brand Activation Coachella"
 *
 * Removes leading "Brief_" / "RFP_" prefixes, file extensions, common
 * brand suffixes, parenthesized version markers, and converts
 * snake/PascalCase to spaces.
 */
export function cleanProjectName(raw: string): string {
  if (!raw) return "";
  let s = raw;

  // Strip file extension if present.
  s = s.replace(/\.[a-z0-9]{2,5}$/i, "");
  // Strip "(1)", "(v2)", " - copy", etc.
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/i, "");
  s = s.replace(/\s*\(\s*v?\d+\s*\)\s*$/i, "");
  s = s.replace(/\s*-\s*copy\s*$/i, "");
  // Strip leading common prefixes ("Brief_", "RFP_", "Proposal_").
  s = s.replace(/^(?:brief|rfp|proposal|deck)[_\s-]+/i, "");
  // Replace underscores / dashes between camel-case with spaces.
  s = s.replace(/[_]+/g, " ");
  // Insert space between camelCase words: "LiveBrand" → "Live Brand".
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Collapse multiple spaces.
  s = s.replace(/\s{2,}/g, " ").trim();
  // Title-case ONLY all-caps acronyms left intact, don't lowercase them.
  // For simplicity keep the cleaned version as-is; user-friendly enough.
  return s;
}
