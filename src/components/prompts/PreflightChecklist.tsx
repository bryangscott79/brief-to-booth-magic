// PreflightChecklist — last-stop "everything you've given the AI" panel
// shown before the user kicks off hero generation.
//
// User's mental model: "I uploaded my brand stuff, briefed the project,
// laid out the spatial. Did Canopy actually pick it up? What does the
// model see?" This card answers that question concretely — it lists
// every input that's about to flow into the image gen call (brand
// identity, brief, spatial, visual references, dimensions / units) and
// gives a one-click route to fix anything that looks wrong.
//
// Each section reports either ✓ ready (with a summary) or ⚠ missing
// (with a deep link to the page that fills it in). Designed to be
// folded by default; the header shows a status pill ("4 of 5 ready",
// "Looks good", "1 issue") so the user can decide whether to expand.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  FileText,
  Grid3X3,
  Palette,
  Ruler,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MeasurementSystem } from "@/lib/measurementSystem";
import type { BrandLogo } from "@/hooks/useBrandLogo";
import type { VisualReference } from "@/hooks/useProjectVisualReferences";

interface PreflightChecklistProps {
  projectId: string | null | undefined;
  /** ParsedBrief — read-only for the panel; user edits via /upload or /review. */
  brief: any;
  /** Generated elements payload (bigIdea, spatialStrategy, etc.). */
  elements: any;
  /** Resolved booth dimensions including measurement system + native area. */
  boothDimensions: {
    footprintLabel: string;
    totalAreaNative: number;
    measurementSystem: MeasurementSystem;
    width: number;
    depth: number;
  };
  /** Active brand logo (or null). */
  brandLogo: BrandLogo | null;
  /** All non-logo visual references that will be sent to the model. */
  visualReferences: VisualReference[];
  /**
   * Client-level brand colors (from the brand book on the Client →
   * Brand page). The project's parsedBrief.brand.visualIdentity.colors
   * is brief-derived and is often empty when the brief PDF doesn't
   * mention colors. We fall back to these so a brand whose colors
   * were extracted from the brand-book PDF still counts as "ready"
   * here. Pair: `clientId` is required for the Edit deep link below.
   */
  clientId?: string | null;
  clientBrandColors?: string[];
}

interface SectionStatus {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "ok" | "warn" | "info";
  summary: string;
  /** Editing route + label, e.g. { path: '/review?project=xx', label: 'Edit brief' }. */
  edit?: { path: string; label: string };
}

export function PreflightChecklist({
  projectId,
  brief,
  elements,
  boothDimensions,
  brandLogo,
  visualReferences,
  clientId,
  clientBrandColors,
}: PreflightChecklistProps) {
  const [open, setOpen] = useState(false);
  const projectQuery = projectId ? `?project=${projectId}` : "";

  const sections = useMemo<SectionStatus[]>(() => {
    const out: SectionStatus[] = [];

    // ── Brand identity ────────────────────────────────────────────────
    // Colors come from two sources: the project's parsed brief
    // (visualIdentity.colors — often empty when the brief PDF didn't
    // mention colors) and the client's brand record (primary/secondary
    // extracted from the brand book on the Clients → Brand page).
    // Either source counts as "ready" — otherwise the user sees a
    // false "No brand colors" warning after they uploaded a brand book.
    const brand = brief?.brand ?? {};
    const briefColors: string[] = brand?.visualIdentity?.colors ?? [];
    const clientColors: string[] = clientBrandColors ?? [];
    const colors = [...briefColors, ...clientColors];
    const personality: string[] = brand?.personality ?? [];
    const colorSourceLabel =
      briefColors.length > 0 ? "" : clientColors.length > 0 ? " (from brand book)" : "";
    const brandComplete = !!brand?.name && !!brand?.category && colors.length > 0;
    // Deep-link to the place the user can actually fix the gap:
    // missing colors → Client → Brand tab; everything else → brief
    // review (which has the brand-name / category editor).
    const brandEditPath =
      colors.length === 0 && clientId
        ? `/clients/${clientId}?tab=brand`
        : `/review${projectQuery}`;
    out.push({
      id: "brand",
      label: "Brand identity",
      icon: Palette,
      status: brandComplete ? "ok" : "warn",
      summary: brandComplete
        ? `${brand.name} · ${brand.category} · ${colors.length} color${colors.length === 1 ? "" : "s"}${colorSourceLabel}${personality.length ? ` · ${personality.length} personality trait${personality.length === 1 ? "" : "s"}` : ""}`
        : !brand?.name
          ? "Brand name missing"
          : colors.length === 0
            ? "No brand colors set — upload a brand book on the client page"
            : "Brand category missing",
      edit: { path: brandEditPath, label: "Edit brand" },
    });

    // ── Brief / objectives ────────────────────────────────────────────
    const objectives = brief?.objectives ?? {};
    const audiences = brief?.audiences ?? [];
    const briefComplete = !!objectives?.primary && audiences.length > 0;
    out.push({
      id: "brief",
      label: "Brief & objectives",
      icon: FileText,
      status: briefComplete ? "ok" : "warn",
      summary: briefComplete
        ? `${objectives.primary?.slice(0, 60)}${(objectives.primary?.length ?? 0) > 60 ? "…" : ""} · ${audiences.length} audience${audiences.length === 1 ? "" : "s"}`
        : !objectives?.primary
          ? "Primary objective missing"
          : "No audiences defined",
      edit: { path: `/review${projectQuery}`, label: "Edit brief" },
    });

    // ── Dimensions + units ────────────────────────────────────────────
    out.push({
      id: "dimensions",
      label: "Dimensions & units",
      icon: Ruler,
      status: "ok",
      summary: `${boothDimensions.footprintLabel} · ${boothDimensions.totalAreaNative.toLocaleString()} ${
        boothDimensions.measurementSystem === "metric" ? "sqm" : "sqft"
      } · ${boothDimensions.measurementSystem === "metric" ? "metric units" : "imperial units"}`,
      edit: { path: `/spatial${projectQuery}`, label: "Edit spatial" },
    });

    // ── Spatial strategy ──────────────────────────────────────────────
    const spatialData = elements?.spatialStrategy?.data;
    const zones = spatialData?.configs?.[0]?.zones ?? [];
    const materials = spatialData?.materialsAndMood ?? [];
    const spatialComplete = zones.length >= 2;
    out.push({
      id: "spatial",
      label: "Spatial strategy",
      icon: Grid3X3,
      status: spatialComplete ? "ok" : "warn",
      summary: spatialComplete
        ? `${zones.length} zones · ${materials.length} material${materials.length === 1 ? "" : "s"} defined`
        : zones.length === 0
          ? "No zones defined yet"
          : `Only ${zones.length} zone — usually want 3+`,
      edit: { path: `/spatial${projectQuery}`, label: "Edit spatial" },
    });

    // ── Brand logo ────────────────────────────────────────────────────
    out.push({
      id: "logo",
      label: "Brand logo",
      icon: ImageIcon,
      status: brandLogo ? "ok" : "warn",
      summary: brandLogo
        ? `${brandLogo.filename} — used as a literal mark on signage and fascia`
        : "No logo uploaded — signage will use approximated brand marks",
      edit: { path: `/upload${projectQuery}`, label: brandLogo ? "Replace" : "Upload" },
    });

    // ── Visual references ─────────────────────────────────────────────
    const refCount = visualReferences.length;
    out.push({
      id: "references",
      label: "Visual references",
      icon: Sparkles,
      status: refCount > 0 ? "ok" : "info",
      summary: refCount > 0
        ? `${refCount} reference${refCount === 1 ? "" : "s"} attached — used as mood / material / composition guidance`
        : "No inspiration images — model will use brand voice + colors only",
      edit: { path: `/upload${projectQuery}`, label: refCount > 0 ? "Manage" : "Add" },
    });

    return out;
  }, [brief, elements, boothDimensions, brandLogo, visualReferences, projectQuery]);

  const okCount = sections.filter((s) => s.status === "ok").length;
  const warnCount = sections.filter((s) => s.status === "warn").length;

  return (
    <Card>
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Pre-flight check</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                warnCount === 0 ? "border-green-500/40 text-green-700" : "border-amber-500/40 text-amber-700",
              )}
            >
              {warnCount === 0 ? "Looks good" : `${warnCount} thing${warnCount === 1 ? "" : "s"} to review`}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            What the AI will see on this generation — {okCount} of {sections.length} ready
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <CardContent className="border-t border-border pt-3 pb-4 space-y-2">
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
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

          {/* Visual reference thumbnails */}
          {(brandLogo || visualReferences.length > 0) && (
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                References sent to the model
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {brandLogo && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-12 w-12 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden">
                      <img
                        src={brandLogo.publicUrl}
                        alt={brandLogo.filename}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-primary font-medium">Logo</span>
                  </div>
                )}
                {visualReferences.slice(0, 6).map((ref) => (
                  <div key={ref.documentId} className="flex flex-col items-center gap-1">
                    <div className="h-12 w-12 rounded-md bg-muted border border-border overflow-hidden">
                      <img
                        src={ref.url}
                        alt={ref.filename}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground capitalize truncate max-w-[48px]">
                      {ref.role.replace("-", " ")}
                    </span>
                  </div>
                ))}
                {visualReferences.length > 6 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{visualReferences.length - 6} more
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
