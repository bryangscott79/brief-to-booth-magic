// DeckPreflightChecklist — verify-before-design panel for the AI-designed
// deck flow. Mirrors the PreflightChecklist on the Prompts page but
// centered on what actually shows up IN the exported deck:
//
//   - Agency logo (header lockup, footer sign-off)
//   - Brand / client logo (cover, signage callouts)
//   - Brand colors (background, accent, headline color)
//   - Typography (which font family Claude will pick from)
//   - Project / event context (cover details)
//   - Render images (used as featured slides)
//
// User mental model: "Claude is about to design 12+ slides. Did it get
// my brand stuff? Will it pick the right fonts? Are my colors set?" The
// checklist surfaces all of that at a glance, with one-click edit links
// to the page that owns each piece.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Palette,
  Type,
  FileText,
  Building2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BrandLogo } from "@/hooks/useBrandLogo";
import type { VisualReference } from "@/hooks/useProjectVisualReferences";

interface DeckPreflightChecklistProps {
  projectId: string | null | undefined;
  brief: any;
  /** Brand logo (project-scoped) */
  brandLogo: BrandLogo | null;
  /** Agency identity from company profile */
  agencyName?: string;
  agencyLogoUrl?: string | null;
  /** Brand color the deck will use (resolved hex). */
  brandColor?: string;
  secondaryColor?: string;
  /** All non-logo visual references that will be sent to the model. */
  visualReferences: VisualReference[];
  /** Style preset selected on the empty state (Pitch, Executive, etc.). */
  stylePreset: string;
}

interface SectionStatus {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "ok" | "warn" | "info";
  summary: string;
  detail?: React.ReactNode;
  edit?: { path: string; label: string };
}

// Curated font families the deck designer is allowed to use. Mirrors the
// list in the system prompt. Surfaced here so users can confirm what
// the AI is choosing from.
const ALLOWED_FONT_FAMILIES = [
  { kind: "Display", names: "Inter, Manrope, Fraunces, Playfair Display, DM Serif Display, Archivo Black, Space Grotesk, Plus Jakarta Sans" },
  { kind: "Body", names: "Inter, Manrope, DM Sans, IBM Plex Sans, Source Sans 3, Plus Jakarta Sans" },
];

function isValidHex(c?: string): boolean {
  if (!c) return false;
  return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c.trim());
}

function normalizeHex(c?: string): string | null {
  if (!isValidHex(c)) return null;
  const v = c!.trim();
  return v.startsWith("#") ? v.toUpperCase() : `#${v.toUpperCase()}`;
}

export function DeckPreflightChecklist({
  projectId,
  brief,
  brandLogo,
  agencyName,
  agencyLogoUrl,
  brandColor,
  secondaryColor,
  visualReferences,
  stylePreset,
}: DeckPreflightChecklistProps) {
  const [open, setOpen] = useState(true);
  const projectQuery = projectId ? `?project=${projectId}` : "";

  const brand = brief?.brand ?? {};
  const briefColors: string[] = brand?.visualIdentity?.colors ?? [];
  const resolvedBrandColor = normalizeHex(brandColor) ?? normalizeHex(briefColors[0]);
  const resolvedSecondary = normalizeHex(secondaryColor);

  const sections: SectionStatus[] = [
    // ── Agency identity ────────────────────────────────────────────────
    {
      id: "agency",
      label: "Your agency",
      icon: Building2,
      status: agencyName && agencyLogoUrl ? "ok" : agencyName ? "warn" : "warn",
      summary: agencyName
        ? agencyLogoUrl
          ? `${agencyName} — logo + name will appear on header and sign-off slides.`
          : `${agencyName} — name will appear; no logo uploaded yet.`
        : "Agency name not set.",
      detail:
        agencyName && agencyLogoUrl ? (
          <div className="flex items-center gap-2 mt-2">
            <div className="h-8 w-8 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
              <img
                src={agencyLogoUrl}
                alt={agencyName}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <span className="text-xs text-muted-foreground">{agencyName}</span>
          </div>
        ) : null,
      edit: { path: `/company`, label: "Company profile" },
    },

    // ── Brand / client identity ────────────────────────────────────────
    {
      id: "brand",
      label: "Brand / client",
      icon: ImageIcon,
      status: brandLogo && brand?.name ? "ok" : brand?.name ? "warn" : "warn",
      summary: brand?.name
        ? brandLogo
          ? `${brand.name} — logo will render on cover + signage slides.`
          : `${brand.name} — no logo uploaded; signage will use approximated marks.`
        : "Brand name missing from brief.",
      detail: brandLogo ? (
        <div className="flex items-center gap-2 mt-2">
          <div className="h-8 w-8 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
            <img
              src={brandLogo.publicUrl}
              alt={brandLogo.filename}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <span className="text-xs text-muted-foreground truncate">{brandLogo.filename}</span>
        </div>
      ) : null,
      edit: { path: `/upload${projectQuery}`, label: brandLogo ? "Replace" : "Upload" },
    },

    // ── Brand colors ───────────────────────────────────────────────────
    {
      id: "colors",
      label: "Brand colors",
      icon: Palette,
      status: resolvedBrandColor ? "ok" : "warn",
      summary: resolvedBrandColor
        ? resolvedSecondary
          ? `Primary ${resolvedBrandColor} · secondary ${resolvedSecondary}. Used as background fields, accent, and headline color.`
          : `Primary ${resolvedBrandColor}. Used as background fields, accent, and headline color.`
        : "No brand color set — deck will use default neutrals.",
      detail: resolvedBrandColor ? (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
            <div
              className="h-4 w-4 rounded-sm border border-border/40"
              style={{ backgroundColor: resolvedBrandColor }}
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              {resolvedBrandColor}
            </span>
          </div>
          {resolvedSecondary && (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
              <div
                className="h-4 w-4 rounded-sm border border-border/40"
                style={{ backgroundColor: resolvedSecondary }}
              />
              <span className="text-[10px] font-mono text-muted-foreground">
                {resolvedSecondary}
              </span>
            </div>
          )}
          {briefColors.slice(0, 4).map((c) => {
            const norm = normalizeHex(c);
            if (!norm || norm === resolvedBrandColor || norm === resolvedSecondary) return null;
            return (
              <div
                key={norm}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
                title={`From brief: ${norm}`}
              >
                <div
                  className="h-4 w-4 rounded-sm border border-border/40"
                  style={{ backgroundColor: norm }}
                />
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  {norm}
                </span>
              </div>
            );
          })}
        </div>
      ) : null,
      edit: { path: `/company`, label: "Set agency brand" },
    },

    // ── Typography ─────────────────────────────────────────────────────
    {
      id: "fonts",
      label: "Typography",
      icon: Type,
      status: "info",
      summary: "Claude will pick one display + one body font from a curated set the export pipeline can render reliably.",
      detail: (
        <div className="text-[11px] text-muted-foreground space-y-1 mt-1.5">
          {ALLOWED_FONT_FAMILIES.map((g) => (
            <div key={g.kind}>
              <span className="font-medium text-foreground">{g.kind}: </span>
              <span>{g.names}</span>
            </div>
          ))}
          <p className="mt-1 text-amber-700 leading-snug">
            Custom font families outside this list cause spaces to collapse during
            PDF export — the model is restricted to this set on purpose.
          </p>
        </div>
      ),
    },

    // ── Style preset / voice ───────────────────────────────────────────
    {
      id: "style",
      label: "Design language",
      icon: Sparkles,
      status: "ok",
      summary: `${stylePreset} — informs the visual tone and density of the deck.`,
    },

    // ── Project / cover context ────────────────────────────────────────
    {
      id: "project",
      label: "Cover & context",
      icon: FileText,
      status: brand?.name && brief?.events?.shows?.[0]?.name ? "ok" : "warn",
      summary: (() => {
        const showName = brief?.events?.shows?.[0]?.name ?? brief?.events?.primaryShow;
        const footprint = brief?.spatial?.footprints?.[0]?.size;
        const parts: string[] = [];
        if (brand?.name) parts.push(brand.name);
        if (showName) parts.push(showName);
        if (footprint) parts.push(footprint);
        return parts.length > 0
          ? parts.join(" · ")
          : "Brief data missing — cover slide may use placeholders.";
      })(),
      edit: { path: `/review${projectQuery}`, label: "Edit brief" },
    },

    // ── Render references ──────────────────────────────────────────────
    {
      id: "renders",
      label: "Featured renders",
      icon: ImageIcon,
      status: visualReferences.length > 0 ? "ok" : "info",
      summary:
        visualReferences.length > 0
          ? `${visualReferences.length} reference${visualReferences.length === 1 ? "" : "s"} will appear on hero / image-feature slides.`
          : "No render images yet. Image-feature slides will fall back to typography-driven layouts.",
      detail:
        visualReferences.length > 0 ? (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {visualReferences.slice(0, 6).map((ref) => (
              <div key={ref.documentId} className="h-12 w-16 rounded-md bg-muted border border-border overflow-hidden">
                <img
                  src={ref.url}
                  alt={ref.filename}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {visualReferences.length > 6 && (
              <span className="text-[10px] text-muted-foreground">
                +{visualReferences.length - 6} more
              </span>
            )}
          </div>
        ) : null,
      edit: { path: `/prompts${projectQuery}`, label: "Generate renders" },
    },
  ];

  const okCount = sections.filter((s) => s.status === "ok").length;
  const warnCount = sections.filter((s) => s.status === "warn").length;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            warnCount === 0
              ? "bg-green-500/15 text-green-600"
              : "bg-amber-500/15 text-amber-600",
          )}
        >
          {warnCount === 0 ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Deck pre-flight</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                warnCount === 0
                  ? "border-green-500/40 text-green-700"
                  : "border-amber-500/40 text-amber-700",
              )}
            >
              {warnCount === 0
                ? "Looks good"
                : `${warnCount} thing${warnCount === 1 ? "" : "s"} to review`}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verify what's about to flow into the design — {okCount} of {sections.length} ready
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3 space-y-2">
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-card px-3 py-2.5"
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  section.status === "ok"
                    ? "bg-green-500/15 text-green-600"
                    : section.status === "warn"
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-muted text-muted-foreground",
                )}
              >
                <section.icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{section.label}</span>
                  {section.status === "ok" && (
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                  )}
                  {section.status === "warn" && (
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {section.summary}
                </p>
                {section.detail}
              </div>
              {section.edit && (
                <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] shrink-0">
                  <Link to={section.edit.path}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {section.edit.label}
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
