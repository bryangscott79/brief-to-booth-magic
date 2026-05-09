// ProjectVisualThumb — quick visual ID for a project in the list.
//
// Picks the best available signal in priority order:
//   1. Latest hero render (most recognizable)
//   2. Client logo
//   3. Brand color swatch (primary + secondary if both present)
//   4. Generic folder icon (last-resort placeholder)
//
// Used in both the grid view (card top) and the table view (cell).

import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client } from "@/hooks/useClients";

export interface ProjectVisualThumbProps {
  /** Hero render URL — best signal when present. */
  heroUrl?: string | null;
  /** Resolved client record (for logo + brand colors). */
  client?: Client | null;
  /**
   * Project name — used for the alt text on the hero image and as a
   * fallback initial-letter when no other signal is available.
   */
  projectName: string;
  /** Square size (px). Default 56. */
  size?: number;
  /** Additional class names for the wrapper. */
  className?: string;
}

export function ProjectVisualThumb({
  heroUrl,
  client,
  projectName,
  size = 56,
  className,
}: ProjectVisualThumbProps) {
  const wrapperStyle = { width: size, height: size };

  // 1. Hero render
  if (heroUrl) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-md overflow-hidden border border-border bg-muted",
          className,
        )}
        style={wrapperStyle}
      >
        <img
          src={heroUrl}
          alt={projectName}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 2. Client logo
  if (client?.logo_url) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-md overflow-hidden border border-border bg-card flex items-center justify-center",
          className,
        )}
        style={wrapperStyle}
      >
        <img
          src={client.logo_url}
          alt={client.name}
          loading="lazy"
          className="w-full h-full object-contain p-1.5"
        />
      </div>
    );
  }

  // 3. Brand color swatch — primary + optional secondary diagonal
  if (client?.primary_color) {
    const primary = client.primary_color;
    const secondary = client.secondary_color ?? primary;
    return (
      <div
        className={cn(
          "shrink-0 rounded-md overflow-hidden border border-border relative flex items-center justify-center",
          className,
        )}
        style={{
          ...wrapperStyle,
          background: `linear-gradient(135deg, ${primary} 0% 50%, ${secondary} 50% 100%)`,
        }}
        title={`Brand colors: ${primary}${client.secondary_color ? ` / ${client.secondary_color}` : ""}`}
      >
        {/* Initials over the gradient for readability — single letter
            from the project so two color blocks don't cover meaning. */}
        <span className="text-white font-bold text-base drop-shadow [text-shadow:_0_1px_2px_rgba(0,0,0,0.5)]">
          {projectName.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  // 4. Generic folder icon
  return (
    <div
      className={cn(
        "shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center",
        className,
      )}
      style={wrapperStyle}
    >
      <FolderOpen className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
