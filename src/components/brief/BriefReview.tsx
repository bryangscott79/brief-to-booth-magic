import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { cn } from "@/lib/utils";
import { Check, Edit2, ChevronRight, X, Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectNavigate } from "@/hooks/useProjectNavigate";
import { OriginalBrief } from "./OriginalBrief";
import { BriefHangingCard } from "./BriefHangingCard";
import { BriefExistingSpace } from "./BriefExistingSpace";
import { useProject } from "@/hooks/useProjects";
import { saveProjectField } from "@/hooks/useProjectSync";
import { useAgency } from "@/hooks/useAgency";
import { BUILTIN_INDUSTRIES } from "@/lib/builtinIndustries";
import type { ParsedBrief, ParsedBriefExistingSpace } from "@/types/brief";
import { BriefClarification } from "@/components/prompts/BriefClarification";
import {
  validateParsedBriefForReview,
  applyGapAnswer,
  type NormalizedHangingElement,
  type HangingShape,
} from "@/lib/normalizedBrief";

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  multiline = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  return multiline ? (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("min-h-[60px] text-sm", className)}
    />
  ) : (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 text-sm", className)}
    />
  );
}

function TagList({
  tags,
  onChange,
  variant = "outline",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  variant?: "outline" | "destructive" | "success";
}) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  const badgeClass =
    variant === "destructive"
      ? "bg-destructive/5 text-destructive border-destructive/20"
      : variant === "success"
      ? "bg-emerald-500/5 text-emerald-700 border-emerald-500/20"
      : "";

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag, i) => (
        <Badge key={i} variant="outline" className={cn("text-xs pr-1 gap-1", badgeClass)}>
          {tag}
          <button
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
            className="hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTag.trim()) {
                onChange([...tags, newTag.trim()]);
                setNewTag("");
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            className="h-6 text-xs w-28"
          />
          <button onClick={() => setAdding(false)}>
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          <Plus className="h-3 w-3" /> add
        </button>
      )}
    </div>
  );
}

// ─── hanging-element derivation ───────────────────────────────────────────────
// The parser stores hanging entries with a small authoring subset
// (name / physicalForm / shape / materials / surfaces / lighting /
// printed). The BriefHangingCard wants the full NormalizedHangingElement
// shape so the same record can flow back through the normalizer
// untouched. Position / dimensions / id / suspensionDropFt are filled
// with reasonable defaults — Task 5's canvas layer is the source of
// truth for those, not parsedBrief.

const HANGING_SHAPES = ["rect", "circle", "oval", "ring", "custom"] as const;

function deriveHangingElements(brief: ParsedBrief): NormalizedHangingElement[] {
  const raw = brief.hangingElements;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, idx) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const shape: HangingShape = (HANGING_SHAPES as readonly string[]).includes(
      e.shape as string,
    )
      ? (e.shape as HangingShape)
      : "ring";
    // Preserve incoming id when present (same contract as
    // normalizeHangingElement); otherwise generate a uuid so React
    // keys stay collision-free across delete-then-add cycles.
    const id =
      typeof e.id === "string" && e.id.trim().length > 0
        ? e.id
        : crypto.randomUUID();
    return {
      id,
      name:
        typeof e.name === "string" && e.name.trim().length > 0
          ? e.name
          : `Hanging element ${idx + 1}`,
      physicalForm: typeof e.physicalForm === "string" ? e.physicalForm : "",
      shape,
      dimensions: { width: 3, depth: 3, thicknessFt: 1 },
      suspensionDropFt: 3,
      // position is a placeholder here — the user positions hanging
      // elements on the spatial canvas in Task 5. The normalizer's
      // default of booth-center is what matters at render time; this
      // synthesized value is just to satisfy the NormalizedHangingElement
      // type contract for the authoring UI.
      position: { x: 0, y: 0 },
      materials: Array.isArray(e.materials) ? (e.materials as unknown[]).map(String) : [],
      surfaces: Array.isArray(e.surfaces) ? (e.surfaces as unknown[]).map(String) : [],
      lighting: Array.isArray(e.lighting) ? (e.lighting as unknown[]).map(String) : [],
      printed: Array.isArray(e.printed) ? (e.printed as unknown[]).map(String) : [],
    };
  });
}

// ─── section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  confidence,
  children,
  editContent,
  onSave,
}: {
  title: string;
  confidence: "high" | "medium";
  children: React.ReactNode;
  editContent: React.ReactNode;
  onSave: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
    setEditing(false);
  };

  return (
    <Card className="element-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {confidence === "high" ? (
              <Check className="h-4 w-4 text-status-complete" />
            ) : (
              <span className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <span className="text-xs text-amber-600">!</span>
              </span>
            )}
            {title}
          </CardTitle>
          {editing ? (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={() => setEditing(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                className="h-8 px-2 gap-1 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                <Save className="h-3 w-3" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setEditing(true)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>{editing ? editContent : children}</CardContent>
    </Card>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function BriefReview({ projectId }: { projectId: string | null }) {
  const { currentProject, setActiveStep, setParsedBrief } = useProjectStore();
  const { navigate } = useProjectNavigate();
  const { data: dbProject } = useProject(projectId ?? undefined);

  // Defensive fallback: read parsedBrief from EITHER the store OR the DB row.
  // The store is the source of truth during editing, but on a fresh navigation
  // (e.g. Continue to Review just fired) the store may be a tick behind the
  // DB. Falling back to dbProject.parsed_brief keeps us from rendering the
  // "No brief data to review" empty state when the data clearly exists.
  const dbBrief = (dbProject as any)?.parsed_brief as ParsedBrief | null | undefined;
  const brief = currentProject?.parsedBrief ?? dbBrief ?? null;

  // If the store is empty but the DB has a brief, hydrate the store so
  // subsequent reads from anywhere in the app see consistent state.
  useEffect(() => {
    if (!currentProject?.parsedBrief && dbBrief) {
      setParsedBrief(dbBrief);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbBrief, currentProject?.parsedBrief]);

  // local draft state — only mutated while editing a section
  const [draft, setDraft] = useState<ParsedBrief | null>(null);

  // ── Hanging-element commit path ──────────────────────────────────────
  // BriefHangingCard fires onChange on every keystroke inside its text
  // inputs (physicalForm Textarea, name Input, etc.). Routing those
  // through commitSection would (a) clobber any other section's
  // in-progress edit draft via setDraft(null), and (b) hit Supabase
  // per keystroke. So we debounce ~400ms here and write through a
  // sibling path that updates the store + DB but never touches
  // `draft`. The debounced timer is flushed on unmount so navigating
  // away doesn't lose in-progress edits.
  //
  // NOTE: these hooks must be declared above the `if (!brief)` early
  // return so they run unconditionally on every render (Rules of Hooks).
  const hangingCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hangingLatestRef = useRef<ParsedBrief | null>(null);

  /**
   * Sibling of commitSection that updates the store + DB but does NOT
   * touch the `draft` state. This is the only safe path while another
   * section may be in the middle of an edit (e.g. user is editing Brand
   * in the inline-edit form and types into a hanging element — the
   * hanging commit must not null out the Brand draft).
   */
  const commitHangingSection = useCallback(
    async (partialDraft: ParsedBrief) => {
      setParsedBrief(partialDraft);
      if (projectId) {
        await saveProjectField(projectId, "parsed_brief", partialDraft);
      }
    },
    [projectId, setParsedBrief],
  );

  const flushHangingCommit = useCallback(() => {
    if (hangingCommitTimerRef.current) {
      clearTimeout(hangingCommitTimerRef.current);
      hangingCommitTimerRef.current = null;
    }
    if (hangingLatestRef.current) {
      const pending = hangingLatestRef.current;
      hangingLatestRef.current = null;
      void commitHangingSection(pending);
    }
  }, [commitHangingSection]);

  useEffect(() => {
    // Flush any pending commit on unmount so the user doesn't lose
    // in-progress edits when navigating away.
    return () => flushHangingCommit();
  }, [flushHangingCommit]);

  // ── Existing-space commit path ───────────────────────────────────────
  // Same shape as the hanging-elements path: debounce ~400ms and write
  // through commitExistingSpaceSection (which does NOT clear `draft`).
  // The user is typing into numeric / textarea inputs inside the
  // BriefExistingSpace card and we don't want every keystroke to hit
  // Supabase or clobber other in-progress edits.
  const existingSpaceCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingSpaceLatestRef = useRef<ParsedBrief | null>(null);

  const commitExistingSpaceSection = useCallback(
    async (partialDraft: ParsedBrief) => {
      setParsedBrief(partialDraft);
      if (projectId) {
        await saveProjectField(projectId, "parsed_brief", partialDraft);
      }
    },
    [projectId, setParsedBrief],
  );

  const flushExistingSpaceCommit = useCallback(() => {
    if (existingSpaceCommitTimerRef.current) {
      clearTimeout(existingSpaceCommitTimerRef.current);
      existingSpaceCommitTimerRef.current = null;
    }
    if (existingSpaceLatestRef.current) {
      const pending = existingSpaceLatestRef.current;
      existingSpaceLatestRef.current = null;
      void commitExistingSpaceSection(pending);
    }
  }, [commitExistingSpaceSection]);

  useEffect(() => {
    return () => flushExistingSpaceCommit();
  }, [flushExistingSpaceCommit]);

  const handleExistingSpaceChange = useCallback(
    (next: ParsedBriefExistingSpace | null) => {
      if (!brief) return;
      // Capture the most-recent in-flight hanging-elements draft (if
      // any) BEFORE flushing — flushHangingCommit clears the ref. We
      // need the hanging edits to be present in the snapshot we spread
      // below, otherwise the immediate replace-photo commit would
      // overwrite still-debounced hanging edits with their pre-edit
      // values. The hanging-section's own flush updates the store +
      // DB; we then re-base our updated brief on the latest hanging
      // edits so they don't get lost in our merge.
      const pendingHanging = hangingLatestRef.current;
      // When the user clicks "Replace photo" we commit immediately so
      // the empty state appears without a 400ms delay. Flush sibling
      // sections first so their debounced edits land before ours.
      if (next === null) {
        flushHangingCommit();
      }
      const baseBrief = pendingHanging ?? brief;
      const updated: ParsedBrief = {
        ...baseBrief,
        existingSpace: next ?? undefined,
      };
      existingSpaceLatestRef.current = updated;
      if (existingSpaceCommitTimerRef.current) {
        clearTimeout(existingSpaceCommitTimerRef.current);
      }
      if (next === null) {
        existingSpaceCommitTimerRef.current = null;
        existingSpaceLatestRef.current = null;
        void commitExistingSpaceSection(updated);
        return;
      }
      existingSpaceCommitTimerRef.current = setTimeout(flushExistingSpaceCommit, 400);
    },
    [brief, commitExistingSpaceSection, flushExistingSpaceCommit, flushHangingCommit],
  );

  // ── Industry input-mode resolution ──────────────────────────────────
  // The Project type doesn't carry industry yet; we resolve via the
  // agency's primary_industry (matches the existing pattern in
  // useActivationTypes). Future: when projects get their own
  // industry_slug, prefer that over the agency-level value.
  const { agency } = useAgency();
  const industryInputMode = useMemo(() => {
    // Project type doesn't carry industry yet; resolve via the agency's
    // primary_industry — same pattern as useActivationTypes. The column
    // is in the generated Supabase types (Tables<"agencies">) so no
    // cast is needed; useAgency already returns the typed row.
    const slug = agency?.primary_industry ?? undefined;
    if (!slug) return undefined;
    return BUILTIN_INDUSTRIES.find((i) => i.slug === slug)?.inputMode;
  }, [agency]);

  const handleHangingChange = useCallback(
    (next: NormalizedHangingElement[]) => {
      if (!brief) return;
      // Authoring fields round-trip to parsedBrief. We also persist
      // `id` so the same element keeps a stable handle across
      // normalize/derive cycles — without it, deriveHangingElements
      // would generate a fresh uuid on every read and break React
      // keys mid-edit.
      // Position / dimensions / suspensionDropFt remain
      // normalize-time-only — Task 5's canvas layer edits those via
      // BoothGeometry, not via parsedBrief.
      const updated: ParsedBrief = {
        ...brief,
        hangingElements: next.map((el) => ({
          id: el.id,
          name: el.name,
          physicalForm: el.physicalForm,
          shape: el.shape,
          materials: el.materials,
          surfaces: el.surfaces,
          lighting: el.lighting,
          printed: el.printed,
        })),
      };
      hangingLatestRef.current = updated;
      if (hangingCommitTimerRef.current) clearTimeout(hangingCommitTimerRef.current);
      hangingCommitTimerRef.current = setTimeout(flushHangingCommit, 400);
    },
    [brief, flushHangingCommit],
  );

  const getDraft = () => draft ?? brief!;
  const patchDraft = (patch: Partial<ParsedBrief>) =>
    setDraft((prev) => ({ ...(prev ?? brief!), ...patch }));

  if (!brief) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No brief data to review</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/upload")}>
          Upload a Brief
        </Button>
      </div>
    );
  }

  const handleConfirm = () => {
    setActiveStep("generate");
    navigate(projectId ? `/generate?project=${projectId}` : "/generate");
  };

  /** commit draft → store + DB */
  const commitSection = async (partialDraft: ParsedBrief) => {
    setParsedBrief(partialDraft);
    setDraft(null);
    if (projectId) {
      await saveProjectField(projectId, "parsed_brief", partialDraft);
    }
  };

  // ── Brand ──
  const brandView = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-lg">{brief.brand.name}</span>
        <Badge variant="secondary">{brief.brand.category}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{brief.brand.pov}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {brief.brand.personality.map((trait) => (
          <Badge key={trait} variant="outline" className="text-xs">
            {trait}
          </Badge>
        ))}
      </div>
    </div>
  );
  const brandEdit = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Brand Name</label>
          <EditableText
            value={getDraft().brand.name}
            onChange={(v) => patchDraft({ brand: { ...getDraft().brand, name: v } })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Category</label>
          <EditableText
            value={getDraft().brand.category}
            onChange={(v) => patchDraft({ brand: { ...getDraft().brand, category: v } })}
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Brand POV / Tagline</label>
        <EditableText
          value={getDraft().brand.pov}
          onChange={(v) => patchDraft({ brand: { ...getDraft().brand, pov: v } })}
          multiline
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Personality Traits</label>
        <TagList
          tags={getDraft().brand.personality}
          onChange={(tags) => patchDraft({ brand: { ...getDraft().brand, personality: tags } })}
        />
      </div>
    </div>
  );

  // ── Objectives ──
  const objectivesView = (
    <div className="space-y-2">
      <p className="font-medium">{brief.objectives.primary}</p>
      <ul className="text-sm text-muted-foreground space-y-1">
        {brief.objectives.secondary.map((obj, i) => (
          <li key={i} className="flex items-start gap-2">
            <ChevronRight className="h-4 w-4 mt-0.5 text-primary" />
            {obj}
          </li>
        ))}
      </ul>
    </div>
  );
  const objectivesEdit = (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Primary Objective</label>
        <EditableText
          value={getDraft().objectives.primary}
          onChange={(v) =>
            patchDraft({ objectives: { ...getDraft().objectives, primary: v } })
          }
          multiline
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Secondary Objectives</label>
        <div className="space-y-1">
          {getDraft().objectives.secondary.map((obj, i) => (
            <div key={i} className="flex gap-1">
              <Input
                value={obj}
                onChange={(e) => {
                  const updated = [...getDraft().objectives.secondary];
                  updated[i] = e.target.value;
                  patchDraft({ objectives: { ...getDraft().objectives, secondary: updated } });
                }}
                className="h-7 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const updated = getDraft().objectives.secondary.filter((_, idx) => idx !== i);
                  patchDraft({ objectives: { ...getDraft().objectives, secondary: updated } });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={() =>
              patchDraft({
                objectives: {
                  ...getDraft().objectives,
                  secondary: [...getDraft().objectives.secondary, ""],
                },
              })
            }
          >
            <Plus className="h-3 w-3" /> Add objective
          </Button>
        </div>
      </div>
    </div>
  );

  // ── Events ──
  const eventsView = (
    <div className="space-y-2">
      {brief.events.shows.map((show, i) => (
        <div key={i} className="flex items-center justify-between">
          <div>
            <span className="font-medium">{show.name}</span>
            <span className="text-sm text-muted-foreground ml-2">{show.location}</span>
          </div>
          {brief.events.primaryShow === show.name && (
            <Badge className="bg-primary/10 text-primary border-0">Primary</Badge>
          )}
        </div>
      ))}
    </div>
  );
  const eventsEdit = (
    <div className="space-y-2">
      {getDraft().events.shows.map((show, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 items-start border rounded-md p-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Show Name</label>
            <Input
              value={show.name}
              onChange={(e) => {
                const shows = [...getDraft().events.shows];
                shows[i] = { ...shows[i], name: e.target.value };
                patchDraft({ events: { ...getDraft().events, shows } });
              }}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Location</label>
            <div className="flex gap-1">
              <Input
                value={show.location}
                onChange={(e) => {
                  const shows = [...getDraft().events.shows];
                  shows[i] = { ...shows[i], location: e.target.value };
                  patchDraft({ events: { ...getDraft().events, shows } });
                }}
                className="h-7 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const shows = getDraft().events.shows.filter((_, idx) => idx !== i);
                  patchDraft({ events: { ...getDraft().events, shows } });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground"
        onClick={() =>
          patchDraft({
            events: {
              ...getDraft().events,
              shows: [...getDraft().events.shows, { name: "", location: "" }],
            },
          })
        }
      >
        <Plus className="h-3 w-3" /> Add show
      </Button>
    </div>
  );

  // ── Footprints ──
  const footprintsView = (
    <div className="flex gap-3 flex-wrap">
      {brief.spatial.footprints.map((fp, i) => (
        <div
          key={i}
          className={cn(
            "px-4 py-3 rounded-lg border",
            fp.priority === "primary" ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          <span className="font-semibold">{fp.size}</span>
          <span className="text-sm text-muted-foreground ml-2">({fp.sqft} sq ft)</span>
        </div>
      ))}
    </div>
  );
  const footprintsEdit = (
    <div className="space-y-2">
      {getDraft().spatial.footprints.map((fp, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 items-center border rounded-md p-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Size (e.g. 20'x20')</label>
            <Input
              value={fp.size}
              onChange={(e) => {
                const fps = [...getDraft().spatial.footprints];
                fps[i] = { ...fps[i], size: e.target.value };
                patchDraft({ spatial: { ...getDraft().spatial, footprints: fps } });
              }}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sq Ft</label>
            <Input
              type="number"
              value={fp.sqft}
              onChange={(e) => {
                const fps = [...getDraft().spatial.footprints];
                fps[i] = { ...fps[i], sqft: Number(e.target.value) };
                patchDraft({ spatial: { ...getDraft().spatial, footprints: fps } });
              }}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
            <div className="flex gap-1">
              <select
                value={fp.priority}
                onChange={(e) => {
                  const fps = [...getDraft().spatial.footprints];
                  fps[i] = { ...fps[i], priority: e.target.value as any };
                  patchDraft({ spatial: { ...getDraft().spatial, footprints: fps } });
                }}
                className="h-7 text-xs border rounded px-1 bg-background flex-1"
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="tertiary">Tertiary</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const fps = getDraft().spatial.footprints.filter((_, idx) => idx !== i);
                  patchDraft({ spatial: { ...getDraft().spatial, footprints: fps } });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground"
        onClick={() =>
          patchDraft({
            spatial: {
              ...getDraft().spatial,
              footprints: [
                ...getDraft().spatial.footprints,
                { size: "", sqft: 0, priority: "secondary" },
              ],
            },
          })
        }
      >
        <Plus className="h-3 w-3" /> Add footprint
      </Button>
    </div>
  );

  // ── Audiences ──
  const audiencesView = (
    <div className="space-y-2">
      {brief.audiences.map((aud, i) => (
        <div key={i} className="flex items-start justify-between">
          <div>
            <span className="font-medium">{aud.name}</span>
            <p className="text-sm text-muted-foreground">{aud.description}</p>
          </div>
          <Badge variant="outline" className="text-xs">
            P{aud.priority}
          </Badge>
        </div>
      ))}
    </div>
  );
  const audiencesEdit = (
    <div className="space-y-2">
      {getDraft().audiences.map((aud, i) => (
        <div key={i} className="border rounded-md p-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Audience Name</label>
              <Input
                value={aud.name}
                onChange={(e) => {
                  const auds = [...getDraft().audiences];
                  auds[i] = { ...auds[i], name: e.target.value };
                  patchDraft({ audiences: auds });
                }}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={1}
                  value={aud.priority}
                  onChange={(e) => {
                    const auds = [...getDraft().audiences];
                    auds[i] = { ...auds[i], priority: Number(e.target.value) };
                    patchDraft({ audiences: auds });
                  }}
                  className="h-7 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    patchDraft({ audiences: getDraft().audiences.filter((_, idx) => idx !== i) })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <Textarea
              value={aud.description}
              onChange={(e) => {
                const auds = [...getDraft().audiences];
                auds[i] = { ...auds[i], description: e.target.value };
                patchDraft({ audiences: auds });
              }}
              className="min-h-[50px] text-xs"
            />
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground"
        onClick={() =>
          patchDraft({
            audiences: [
              ...getDraft().audiences,
              { name: "", description: "", priority: getDraft().audiences.length + 1, characteristics: [], engagementNeeds: "" },
            ],
          })
        }
      >
        <Plus className="h-3 w-3" /> Add audience
      </Button>
    </div>
  );

  // ── Budget ──
  const budgetView = (
    <div className="space-y-2">
      {brief.budget?.range?.min || brief.budget?.range?.max ? (
        <div className="text-2xl font-semibold">
          ${brief.budget.range!.min!.toLocaleString()}
          <span className="text-muted-foreground font-normal mx-2">–</span>
          ${brief.budget.range!.max!.toLocaleString()}
          <span className="text-sm font-normal text-muted-foreground ml-2">total budget</span>
        </div>
      ) : brief.budget?.perShow ? (
        <div className="text-2xl font-semibold">
          ${brief.budget.perShow.toLocaleString()}
          <span className="text-sm font-normal text-muted-foreground ml-2">per show</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No budget specified in brief</p>
      )}
      {brief.budget?.efficiencyNotes && (
        <p className="text-sm text-muted-foreground">{brief.budget.efficiencyNotes}</p>
      )}
    </div>
  );
  const budgetEdit = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Budget Min ($)</label>
          <Input
            type="number"
            value={getDraft().budget?.range?.min ?? ""}
            onChange={(e) =>
              patchDraft({
                budget: {
                  ...getDraft().budget,
                  range: { min: Number(e.target.value), max: getDraft().budget?.range?.max ?? 0 },
                },
              })
            }
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Budget Max ($)</label>
          <Input
            type="number"
            value={getDraft().budget?.range?.max ?? ""}
            onChange={(e) =>
              patchDraft({
                budget: {
                  ...getDraft().budget,
                  range: { min: getDraft().budget?.range?.min ?? 0, max: Number(e.target.value) },
                },
              })
            }
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Per Show Budget ($)</label>
        <Input
          type="number"
          value={getDraft().budget?.perShow ?? ""}
          onChange={(e) =>
            patchDraft({ budget: { ...getDraft().budget, perShow: Number(e.target.value) || undefined } })
          }
          className="h-7 text-xs"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Efficiency Notes</label>
        <Textarea
          value={getDraft().budget?.efficiencyNotes ?? ""}
          onChange={(e) =>
            patchDraft({ budget: { ...getDraft().budget, efficiencyNotes: e.target.value } })
          }
          className="min-h-[50px] text-xs"
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Review Parsed Brief</h2>
          <p className="text-muted-foreground">
            Verify the extracted data before generating elements
          </p>
        </div>
        <Button onClick={handleConfirm} className="btn-glow">
          Confirm & Generate Elements
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <BriefClarificationContainer brief={brief} projectId={projectId} />

      {/* Sections Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Brand Information"
          confidence="high"
          editContent={brandEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {brandView}
        </Section>
        <Section
          title="Business Objectives"
          confidence="high"
          editContent={objectivesEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {objectivesView}
        </Section>
        <Section
          title="Events & Shows"
          confidence="high"
          editContent={eventsEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {eventsView}
        </Section>
        <Section
          title="Footprints"
          confidence="high"
          editContent={footprintsEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {footprintsView}
        </Section>
        <Section
          title="Target Audiences"
          confidence="high"
          editContent={audiencesEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {audiencesView}
        </Section>
        <Section
          title="Budget"
          confidence={brief.budget?.range?.min || brief.budget?.range?.max || brief.budget?.perShow ? "high" : "medium"}
          editContent={budgetEdit}
          onSave={() => commitSection({ ...brief, ...(draft ?? {}) })}
        >
          {budgetView}
        </Section>
      </div>

      {/* Existing-space card — only for industries whose inputMode is
          "existing-space-photo" (interior_design today; hybrid
          industries may also surface it once Task 5 ships the picker).
          Uses the same debounce+sibling-commit pattern as
          BriefHangingCard so typing edits don't clobber other-section
          drafts or hit Supabase per keystroke. */}
      {industryInputMode === "existing-space-photo" && projectId && (
        <BriefExistingSpace
          value={brief.existingSpace ?? null}
          onChange={handleExistingSpaceChange}
          projectId={projectId}
        />
      )}

      {/* Hanging Elements
          NOTE: handleHangingChange debounces ~400ms and writes through
          commitHangingSection (which does NOT clear `draft`). See the
          rationale block above next to the hook declarations. */}
      <BriefHangingCard
        elements={deriveHangingElements(brief)}
        onChange={handleHangingChange}
      />

      {/* Creative Direction */}
      <Card className="element-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="h-4 w-4 text-status-complete" />
              Creative Direction
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2">Embrace</h4>
              <TagList
                tags={brief.creative.embrace}
                variant="success"
                onChange={async (tags) => {
                  const updated = { ...brief, creative: { ...brief.creative, embrace: tags } };
                  await commitSection(updated);
                }}
              />
            </div>
            <div>
              <h4 className="text-sm font-medium text-destructive mb-2">Avoid</h4>
              <TagList
                tags={brief.creative.avoid}
                variant="destructive"
                onChange={async (tags) => {
                  const updated = { ...brief, creative: { ...brief.creative, avoid: tags } };
                  await commitSection(updated);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Deliverables */}
      {brief.requiredDeliverables?.length > 0 && (
        <Card className="element-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="h-4 w-4 text-status-complete" />
              Required Deliverables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid md:grid-cols-2 gap-x-6 gap-y-1">
              {brief.requiredDeliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Timeline & Contacts */}
      {((brief as any).timeline?.proposalDue || (brief as any).contacts?.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {(brief as any).timeline?.proposalDue && (
            <Card className="element-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-complete" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1 text-sm">
                  {(brief as any).timeline.proposalDue && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Proposal Due</dt>
                      <dd className="font-medium">{(brief as any).timeline.proposalDue}</dd>
                    </div>
                  )}
                  {(brief as any).timeline.deliveryDate && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Delivery</dt>
                      <dd className="font-medium">{(brief as any).timeline.deliveryDate}</dd>
                    </div>
                  )}
                  {(brief as any).timeline.notes && (
                    <p className="text-muted-foreground pt-1">{(brief as any).timeline.notes}</p>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {(brief as any).contacts?.length > 0 && (
            <Card className="element-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="h-4 w-4 text-status-complete" />
                  Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(brief as any).contacts.map((c: any, i: number) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium">{c.name}</span>
                      {c.title && <span className="text-muted-foreground ml-2">{c.title}</span>}
                      {c.email && <p className="text-muted-foreground text-xs">{c.email}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Original Brief */}
      <OriginalBrief
        briefText={currentProject?.rawBrief ?? dbProject?.brief_text ?? null}
        briefFileName={dbProject?.brief_file_name ?? null}
        briefFileUrl={(dbProject as any)?.brief_file_url ?? null}
      />
    </div>
  );
}

// ── BriefClarificationContainer ──────────────────────────────────────
// Surfaces validator-detected gaps as inline Q&A cards. On answer,
// writes back to parsedBrief via setParsedBrief + persists to DB.
// Re-validates on every brief change so the gap list shrinks as the
// user fills it in.
function BriefClarificationContainer({
  brief,
  projectId,
}: {
  brief: ParsedBrief;
  projectId: string | null;
}) {
  const { setParsedBrief } = useProjectStore();
  const { gaps } = useMemo(() => {
    // Defense-in-depth: validateParsedBriefForReview already calls
    // safeBrief internally, but a try/catch here means an unexpected
    // exception (e.g. a future schema change) can't trip the app-level
    // error boundary and blank the review page.
    try {
      return validateParsedBriefForReview(brief);
    } catch (e) {
      console.warn("[BriefClarificationContainer] validate failed:", e);
      return { gaps: [], failures: [] };
    }
  }, [brief]);

  const writeBack = async (next: ParsedBrief) => {
    setParsedBrief(next);
    if (projectId) {
      try {
        await saveProjectField(projectId, "parsed_brief", next);
      } catch (e) {
        console.warn("[BriefClarificationContainer] persist failed:", e);
      }
    }
  };

  const handleAnswer = (field: string, value: unknown) => {
    try {
      applyGapAnswer(brief, field, value, writeBack);
    } catch (e) {
      console.warn(`[BriefClarificationContainer] applyGapAnswer(${field}) failed:`, e);
    }
  };

  const handleSkip = (field: string) => {
    const gap = gaps.find((g) => g.field === field);
    if (gap) {
      try {
        applyGapAnswer(brief, field, gap.fallback, writeBack);
      } catch (e) {
        console.warn(`[BriefClarificationContainer] applyGapAnswer skip(${field}) failed:`, e);
      }
    }
  };

  if (gaps.length === 0) return null;

  return (
    <BriefClarification
      gaps={gaps}
      onAnswer={handleAnswer}
      onSkip={handleSkip}
    />
  );
}
