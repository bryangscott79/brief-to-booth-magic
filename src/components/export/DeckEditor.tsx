// DeckEditor — inline preview + per-slide content edits for proposal
// presentations. Replaces the old "pick template, hit export" flow with
// "pick template, see every slide, edit anything you want, then export."
//
// Edits are persisted as a sparse override map keyed by section id (see
// lib/deckOverrides). Untouched slides render verbatim from the generated
// proposal data; touched slides have the user's overrides merged in. The
// auto-built deck stays the source of truth — overrides ride on top.
//
// Coverage today (intentional MVP):
//   - Toggle visibility per slide
//   - Reorder slides (move up / down)
//   - Edit title, headline, subheadline, narrative
//   - Edit any string[] bullet array on the slide (one bullet per line)
//   - Swap the featured image on image slides
//   - Caption edit on image slides
//
// Out of scope for now (route through /generate instead): nested object
// edits like spatial zone breakdowns, budget tables, etc. Those still
// reflect upstream data.

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Edit3,
  Image as ImageIcon,
  Lock,
  RotateCcw,
  Save,
  X,
  FileText,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  PRESENTATION_TEMPLATES,
  getActiveSlides,
  type PresentationTemplate,
} from "@/lib/presentationTemplates";
import {
  buildProposalSections,
  type ProposalData,
  type ProposalSection,
} from "@/lib/proposalGenerator";
import {
  loadDeckOverrides,
  saveDeckOverrides,
  applyDeckOverrides,
  extractEditableBullets,
  fieldLabel,
  type DeckOverrides,
  type DeckSlideOverride,
} from "@/lib/deckOverrides";

// ─── Props ─────────────────────────────────────────────────────────────────

interface DeckEditorProps {
  projectId: string | null | undefined;
  /** Already-built proposal data (brief + elements + images + config). */
  proposalData: ProposalData;
  /** Available render image angles for image-slide swapping. */
  images: Array<{ angle_id: string; angle_name: string; public_url: string }>;
  /** Called when user finalizes — receives the merged sections + active section ids. */
  onExport: (params: {
    template: PresentationTemplate;
    sectionsForRender: ProposalSection[];
    activeSectionIds: string[];
  }) => void;
  /** Called when user backs out without exporting. */
  onCancel: () => void;
  /** Fired on every override change, in case the parent wants to react. */
  onOverridesChange?: (overrides: DeckOverrides) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bulletsToString(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}
function stringToBullets(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function emptyOverrides(): DeckOverrides {
  return { bySection: {}, updatedAt: new Date().toISOString() };
}

// ─── Component ─────────────────────────────────────────────────────────────

export function DeckEditor({
  projectId,
  proposalData,
  images,
  onExport,
  onCancel,
  onOverridesChange,
}: DeckEditorProps) {
  const { toast } = useToast();

  const [templateId, setTemplateId] = useState<string>("full-proposal");
  const [overrides, setOverrides] = useState<DeckOverrides>(() => emptyOverrides());
  const [expandedSlideId, setExpandedSlideId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved overrides on mount.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      const loaded = await loadDeckOverrides(projectId);
      if (cancelled) return;
      if (loaded) setOverrides(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Build raw sections, then apply overrides for the preview.
  const allSections = useMemo(() => buildProposalSections(proposalData), [proposalData]);
  const previewSections = useMemo(
    () => applyDeckOverrides(allSections, overrides),
    [allSections, overrides],
  );

  // Filter to template's sections — same logic as exporter.
  const template = useMemo(
    () => PRESENTATION_TEMPLATES.find((t) => t.id === templateId) ?? PRESENTATION_TEMPLATES[0]!,
    [templateId],
  );
  const activeSectionIds = useMemo(
    () => new Set(getActiveSlides(template).map((s) => s.sectionId)),
    [template],
  );

  // Slides actually shown — template includes + section exists in the build + not user-hidden.
  const visibleSections = useMemo(() => {
    return previewSections.filter((s) => activeSectionIds.has(s.id));
  }, [previewSections, activeSectionIds]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const updateSection = (sectionId: string, patch: Partial<DeckSlideOverride>) => {
    setOverrides((prev) => {
      const existing = prev.bySection[sectionId] ?? { sectionId };
      const merged: DeckSlideOverride = { ...existing, ...patch };
      const next: DeckOverrides = {
        ...prev,
        bySection: { ...prev.bySection, [sectionId]: merged },
      };
      onOverridesChange?.(next);
      return next;
    });
  };

  const resetSection = (sectionId: string) => {
    setOverrides((prev) => {
      const { [sectionId]: _drop, ...rest } = prev.bySection;
      void _drop;
      const next: DeckOverrides = { ...prev, bySection: rest };
      onOverridesChange?.(next);
      return next;
    });
  };

  const moveSection = (sectionId: string, direction: "up" | "down") => {
    setOverrides((prev) => {
      const existingOrder = prev.order ?? visibleSections.map((s) => s.id);
      const idx = existingOrder.indexOf(sectionId);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= existingOrder.length) return prev;
      const nextOrder = [...existingOrder];
      [nextOrder[idx], nextOrder[targetIdx]] = [nextOrder[targetIdx]!, nextOrder[idx]!];
      const next: DeckOverrides = { ...prev, order: nextOrder };
      onOverridesChange?.(next);
      return next;
    });
  };

  const handleSaveAndExport = async () => {
    if (!projectId) {
      toast({ title: "No project", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      await saveDeckOverrides(projectId, overrides);
      const sectionsForRender = applyDeckOverrides(allSections, overrides);
      const visibleIds = sectionsForRender
        .filter((s) => activeSectionIds.has(s.id))
        .map((s) => s.id);
      onExport({ template, sectionsForRender, activeSectionIds: visibleIds });
    } catch (e) {
      toast({
        title: "Couldn't save edits",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await saveDeckOverrides(projectId, overrides);
      toast({ title: "Edits saved", description: "Your changes will apply on the next export." });
    } finally {
      setIsSaving(false);
    }
  };

  const editedCount = Object.keys(overrides.bySection).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header: template picker + summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" />
            Inline deck editor
          </CardTitle>
          <CardDescription className="text-xs">
            Pick a template, then edit any slide directly. Edits are saved per project — no need
            to export, open, edit, and re-import.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESENTATION_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icon} {t.name}{" "}
                    <span className="text-muted-foreground">
                      ({t.slideRange.min}–{t.slideRange.max} slides)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs">
              {visibleSections.length} slides in deck
            </Badge>
            {editedCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {editedCount} customised
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{template.description}</p>
        </CardContent>
      </Card>

      {/* Slide list */}
      <div className="space-y-2">
        {visibleSections.map((section, idx) => {
          const ovr = overrides.bySection[section.id];
          const isExpanded = expandedSlideId === section.id;
          const isHidden = ovr?.hidden === true;
          const isCustomised = !!ovr && Object.keys(ovr).filter((k) => k !== "sectionId").length > 0;

          return (
            <Card
              key={section.id}
              className={cn(
                "transition-colors",
                isHidden && "opacity-50",
                isCustomised && !isHidden && "border-primary/40",
              )}
            >
              <CardContent className="p-3 space-y-3">
                {/* Header row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-6 text-center shrink-0">
                    {idx + 1}
                  </span>
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">
                    {section.title}
                    {ovr?.title && ovr.title !== section.title && (
                      <span className="ml-2 text-[10px] text-primary uppercase">edited</span>
                    )}
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {section.type}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveSection(section.id, "up")}
                    disabled={idx === 0}
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => moveSection(section.id, "down")}
                    disabled={idx === visibleSections.length - 1}
                    title="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>

                  {section.type === "cover" ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => updateSection(section.id, { hidden: !isHidden })}
                      title={isHidden ? "Show in deck" : "Hide from deck"}
                    >
                      {isHidden ? (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-primary" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setExpandedSlideId(isExpanded ? null : section.id)}
                    title="Edit content"
                  >
                    <Edit3
                      className={cn("h-3.5 w-3.5", isExpanded && "text-primary")}
                    />
                  </Button>
                </div>

                {isExpanded && (
                  <SlideContentEditor
                    section={section}
                    override={ovr}
                    images={images}
                    onChange={(patch) => updateSection(section.id, patch)}
                    onReset={() => resetSection(section.id)}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-background/95 backdrop-blur border-t border-border py-3">
        <Button variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSaveOnly} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save edits
          </Button>
          <Button onClick={handleSaveAndExport} disabled={isSaving} className="btn-glow">
            {isSaving ? "Saving…" : "Save & export"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Per-slide content editor ──────────────────────────────────────────────

function SlideContentEditor({
  section,
  override,
  images,
  onChange,
  onReset,
}: {
  section: ProposalSection;
  override: DeckSlideOverride | undefined;
  images: Array<{ angle_id: string; angle_name: string; public_url: string }>;
  onChange: (patch: Partial<DeckSlideOverride>) => void;
  onReset: () => void;
}) {
  const content = section.content ?? {};
  const hasHeadline = typeof content.headline === "string";
  const hasSubheadline = typeof content.subheadline === "string";
  const hasNarrative =
    typeof content.narrative === "string" ||
    typeof content.conceptDescription === "string" ||
    typeof content.philosophy === "string";
  const narrativeValue =
    override?.narrative ??
    (typeof content.narrative === "string"
      ? content.narrative
      : typeof content.conceptDescription === "string"
        ? content.conceptDescription
        : typeof content.philosophy === "string"
          ? content.philosophy
          : "");

  // Bullet arrays — pick fields where the source is string[] AND user can
  // sensibly edit them (skip e.g. tags, slug arrays).
  const bulletFields = useMemo(() => extractEditableBullets(content), [content]);

  // Image angle for image slides.
  const isImageSlide = section.type === "image" || !!content.imageUrl || !!content.imageAngleId;

  return (
    <div className="space-y-3 pt-2 border-t border-border/60">
      {/* Title */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Slide title
        </label>
        <Input
          value={override?.title ?? section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="text-sm"
        />
      </div>

      {hasHeadline && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Headline
          </label>
          <Input
            value={override?.headline ?? content.headline ?? ""}
            onChange={(e) => onChange({ headline: e.target.value })}
            className="text-sm"
          />
        </div>
      )}

      {hasSubheadline && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Subheadline
          </label>
          <Input
            value={override?.subheadline ?? content.subheadline ?? ""}
            onChange={(e) => onChange({ subheadline: e.target.value })}
            className="text-sm"
          />
        </div>
      )}

      {hasNarrative && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Narrative
          </label>
          <Textarea
            rows={4}
            value={narrativeValue}
            onChange={(e) => onChange({ narrative: e.target.value })}
            className="text-sm"
          />
        </div>
      )}

      {Object.entries(bulletFields).length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Bullet lists
          </p>
          {Object.entries(bulletFields).map(([field, items]) => {
            const overrideItems = override?.bullets?.[field];
            const value = bulletsToString(overrideItems ?? items);
            return (
              <div key={field} className="space-y-1">
                <label className="text-[11px] font-medium text-foreground/80">
                  {fieldLabel(field)}
                  <span className="text-muted-foreground ml-1.5 font-normal">
                    ({(overrideItems ?? items).length}) • one per line
                  </span>
                </label>
                <Textarea
                  rows={Math.min(8, Math.max(3, (overrideItems ?? items).length + 1))}
                  value={value}
                  onChange={(e) =>
                    onChange({
                      bullets: {
                        ...(override?.bullets ?? {}),
                        [field]: stringToBullets(e.target.value),
                      },
                    })
                  }
                  className="text-xs font-mono"
                />
              </div>
            );
          })}
        </div>
      )}

      {isImageSlide && images.length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            Featured render
          </label>
          <Select
            value={override?.imageAngleId ?? content.imageAngleId ?? ""}
            onValueChange={(v) => onChange({ imageAngleId: v })}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Auto (default)" />
            </SelectTrigger>
            <SelectContent>
              {images.map((img) => (
                <SelectItem key={img.angle_id} value={img.angle_id}>
                  {img.angle_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(content.caption !== undefined || isImageSlide) && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Caption
          </label>
          <Input
            value={override?.caption ?? content.caption ?? ""}
            onChange={(e) => onChange({ caption: e.target.value })}
            className="text-sm"
          />
        </div>
      )}

      {/* Reset */}
      {override && (
        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset slide
          </Button>
        </div>
      )}
    </div>
  );
}

export { X };
