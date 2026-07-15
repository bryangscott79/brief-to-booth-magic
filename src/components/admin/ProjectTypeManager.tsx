import { useState } from "react";
import { PROJECT_TYPE_REGISTRY, ALL_PROJECT_TYPES, type ProjectTypeDef } from "@/lib/projectTypes";
import { useProjectTypeConfigs, useUpsertProjectTypeConfig, type ProjectTypeConfig } from "@/hooks/useClients";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  ChevronRight,
  Save,
  RotateCcw,
  Edit2,
  Check,
  // Registry icon identifiers (projectTypes.ts stores lucide names as strings)
  Landmark,
  Zap,
  Building2,
  Clapperboard,
  Gamepad2,
  Building,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { SectionLabel, StatusChip, IconWell } from "@/components/shell";
import { cn } from "@/lib/utils";

// The registry stores icons as lucide identifier strings ("Landmark",
// "Zap", …). Rendering that string directly showed the identifier as if
// it were the type's title — resolve it to the actual icon component.
const TYPE_ICONS: Record<string, LucideIcon> = {
  Landmark,
  Zap,
  Building2,
  Clapperboard,
  Gamepad2,
  Building,
};
const resolveTypeIcon = (name: string): LucideIcon => TYPE_ICONS[name] ?? Shapes;

interface EditingElement {
  key: string;
  title: string;
  description: string;
  aiGuidance: string;
}

interface EditingType {
  label: string;
  tagline: string;
  description: string;
  renderContext: string;
  isEnabled: boolean;
  elements: EditingElement[];
}

function mergeWithConfig(base: ProjectTypeDef, config?: ProjectTypeConfig): EditingType {
  const elements: EditingElement[] = base.elements.map((el) => {
    const override = config?.element_overrides?.find((o: any) => o.key === el.key);
    return {
      key: el.key,
      title: override?.title ?? el.title,
      description: override?.description ?? el.description,
      aiGuidance: override?.ai_guidance ?? el.aiGuidance,
    };
  });

  return {
    label: config?.label ?? base.label,
    tagline: config?.tagline ?? base.tagline,
    description: config?.description ?? base.description,
    renderContext: config?.render_context ?? base.renderContext,
    isEnabled: config?.is_enabled ?? true,
    elements,
  };
}

function ProjectTypeEditor({ typeDef, config }: { typeDef: ProjectTypeDef; config?: ProjectTypeConfig }) {
  const upsert = useUpsertProjectTypeConfig();
  const [editing, setEditing] = useState<EditingType>(() => mergeWithConfig(typeDef, config));
  const [dirty, setDirty] = useState(false);
  const [editingEl, setEditingEl] = useState<string | null>(null);

  const update = (patch: Partial<EditingType>) => {
    setEditing(prev => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const updateElement = (key: string, patch: Partial<EditingElement>) => {
    setEditing(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.key === key ? { ...el, ...patch } : el),
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    await upsert.mutateAsync({
      project_type_id: typeDef.id,
      label: editing.label !== typeDef.label ? editing.label : null,
      tagline: editing.tagline !== typeDef.tagline ? editing.tagline : null,
      description: editing.description !== typeDef.description ? editing.description : null,
      render_context: editing.renderContext !== typeDef.renderContext ? editing.renderContext : null,
      is_enabled: editing.isEnabled,
      element_overrides: editing.elements.map(el => ({
        key: el.key,
        title: el.title,
        description: el.description,
        ai_guidance: el.aiGuidance,
      })),
    });
    setDirty(false);
  };

  const handleReset = () => {
    setEditing(mergeWithConfig(typeDef, undefined));
    setDirty(false);
  };

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <IconWell icon={resolveTypeIcon(typeDef.icon)} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Input
                value={editing.label}
                onChange={e => update({ label: e.target.value })}
                className="text-lg font-semibold text-navy h-8 border-transparent hover:border-border focus:border-border px-1 w-64"
              />
              <StatusChip variant={editing.isEnabled ? "pass" : "neutral"}>
                {editing.isEnabled ? "Active" : "Disabled"}
              </StatusChip>
            </div>
            <Input
              value={editing.tagline}
              onChange={e => update({ tagline: e.target.value })}
              className="text-sm text-slate h-7 border-transparent hover:border-border focus:border-border px-1 mt-1"
              placeholder="Tagline..."
            />
            <p className="mt-0.5 px-1 font-mono text-[10px] text-slate-faint">{typeDef.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-2">
            <Switch
              checked={editing.isEnabled}
              onCheckedChange={v => update({ isEnabled: v })}
            />
            <span>{editing.isEnabled ? "Enabled" : "Disabled"}</span>
          </div>
          {dirty && (
            <>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
              <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-2">
        <SectionLabel accent="sky">Description</SectionLabel>
        <Textarea
          value={editing.description}
          onChange={e => update({ description: e.target.value })}
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Render context — mono code-well: this text is injected verbatim
          into every image-generation prompt, so it reads as code. */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SectionLabel accent="violet">Render Context</SectionLabel>
          <span className="text-xs text-slate-faint">injected into every AI image generation prompt</span>
        </div>
        <Textarea
          value={editing.renderContext}
          onChange={e => update({ renderContext: e.target.value })}
          rows={3}
          className="resize-none rounded-square border-cloud-line bg-cloud font-mono text-xs leading-[18px] text-navy"
          placeholder="Describe the physical environment and visual setting for renders..."
        />
      </div>

      <Separator />

      {/* Strategic elements */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SectionLabel accent="pink">Strategic Elements</SectionLabel>
          <span className="text-xs text-slate-faint">
            <span className="font-mono font-medium text-slate">{editing.elements.length}</span> elements — AI guidance controls generation quality
          </span>
        </div>

        <div className="space-y-2">
          {editing.elements.map((el, idx) => (
            <div
              key={el.key}
              className={cn(
                "border rounded-square transition-colors",
                editingEl === el.key ? "border-[#A78BFA] bg-violet-soft/40" : "border-cloud-line"
              )}
            >
              {editingEl === el.key ? (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground">{el.key}</span>
                    <Button size="sm" variant="ghost" onClick={() => setEditingEl(null)}>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Done
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Element Title</Label>
                      <Input
                        value={el.title}
                        onChange={e => updateElement(el.key, { title: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Short Description</Label>
                      <Input
                        value={el.description}
                        onChange={e => updateElement(el.key, { description: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      AI Guidance
                      <span className="ml-1 font-normal text-muted-foreground">(system prompt for this element's generation)</span>
                    </Label>
                    <Textarea
                      value={el.aiGuidance}
                      onChange={e => updateElement(el.key, { aiGuidance: e.target.value })}
                      rows={4}
                      className="resize-none text-sm"
                      placeholder="Give the AI specific instructions for how to approach this element for this project type..."
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-cloud/60 rounded-square"
                  onClick={() => setEditingEl(el.key)}
                >
                  {/* Navy number chip — the Flow C step/element index */}
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-navy font-mono text-[10px] font-semibold text-white">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-navy">{el.title}</span>
                      <span className="text-xs text-slate-faint">·</span>
                      <span className="text-xs text-slate truncate">{el.description}</span>
                    </div>
                    <p className="text-xs italic text-slate mt-0.5 line-clamp-1">
                      {el.aiGuidance}
                    </p>
                  </div>
                  <Edit2 className="h-3.5 w-3.5 text-slate-faint shrink-0 mt-0.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset to defaults
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" />
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

export function ProjectTypeManager() {
  const { data: configs = [] } = useProjectTypeConfigs();
  const [selectedType, setSelectedType] = useState<string>(ALL_PROJECT_TYPES[0].id);

  const getConfig = (typeId: string) => configs.find(c => c.project_type_id === typeId);
  const selectedTypeDef = PROJECT_TYPE_REGISTRY[selectedType as keyof typeof PROJECT_TYPE_REGISTRY];

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
      {/* Type list sidebar */}
      <Card className="sticky top-24">
        <CardHeader className="pb-3">
          <SectionLabel accent="blue">Project Types</SectionLabel>
          <CardDescription className="text-xs">Select a type to configure its AI instructions and element guidance</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-0.5 p-2">
            {ALL_PROJECT_TYPES.map((type) => {
              const config = getConfig(type.id);
              const isEnabled = config?.is_enabled !== false;
              const hasOverrides = !!config;
              const selected = selectedType === type.id;
              const TypeIcon = resolveTypeIcon(type.icon);

              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    "w-full flex items-center gap-3 border-l-2 px-3 py-2.5 rounded-r-btn text-left transition-colors",
                    selected
                      ? "border-navy bg-cloud text-navy"
                      : "border-transparent text-slate hover:bg-cloud/70 hover:text-navy"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-square",
                      selected ? "bg-navy text-white" : "bg-cloud text-navy"
                    )}
                  >
                    <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.3} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-sm truncate", selected ? "font-semibold text-navy" : "font-medium")}>
                        {config?.label ?? type.shortLabel}
                      </span>
                      {hasOverrides && (
                        <span className="rounded-full bg-violet-soft px-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[#6D4BC7]">
                          custom
                        </span>
                      )}
                    </div>
                    {!isEnabled && (
                      <span className="text-xs text-slate-faint">Disabled</span>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-faint" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Editor panel */}
      <Card>
        <CardContent className="pt-6">
          {selectedTypeDef ? (
            <ProjectTypeEditor
              key={selectedType}
              typeDef={selectedTypeDef}
              config={getConfig(selectedType)}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Select a project type to configure
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
