import { useState } from "react";
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
import { useProject } from "@/hooks/useProjects";
import { saveProjectField } from "@/hooks/useProjectSync";
import type { ParsedBrief } from "@/types/brief";

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
      ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
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
  const brief = currentProject?.parsedBrief;

  // local draft state — only mutated while editing a section
  const [draft, setDraft] = useState<ParsedBrief | null>(null);

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
