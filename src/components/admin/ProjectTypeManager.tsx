import { useState } from "react";
import { PROJECT_TYPE_REGISTRY, ALL_PROJECT_TYPES, type ProjectTypeDef, type ProjectTypeElementDef } from "@/lib/projectTypes";
import { useProjectTypeConfigs, useUpsertProjectTypeConfig, type ProjectTypeConfig } from "@/hooks/useClients";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ChevronRight, Save, RotateCcw, Settings2, Sparkles, Layers,
  Eye, EyeOff, GripVertical, Edit2, Check, X
} from "lucide-react";
import { cn } from "@/lib/utils";

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
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{typeDef.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <Input
                  value={editing.label}
                  onChange={e => update({ label: e.target.value })}
                  className="text-lg font-semibold h-8 border-transparent hover:border-border focus:border-border px-1 w-64"
                />
                <Badge variant={editing.isEnabled ? "default" : "secondary"}>
                  {editing.isEnabled ? "Active" : "Disabled"}
                </Badge>
              </div>
              <Input
                value={editing.tagline}
                onChange={e => update({ tagline: e.target.value })}
                className="text-sm text-muted-foreground h-7 border-transparent hover:border-border focus:border-border px-1 mt-1"
                placeholder="Tagline..."
              />
            </div>
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
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
        <Textarea
          value={editing.description}
          onChange={e => update({ description: e.target.value })}
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Render context */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Render Context</Label>
          <span className="text-xs text-muted-foreground">(injected into every AI image generation prompt)</span>
        </div>
        <Textarea
          value={editing.renderContext}
          onChange={e => update({ renderContext: e.target.value })}
          rows={3}
          className="resize-none text-sm font-mono"
          placeholder="Describe the physical environment and visual setting for renders..."
        />
      </div>

      <Separator />

      {/* Strategic elements */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <Label className="text-sm font-semibold">Strategic Elements</Label>
          <span className="text-xs text-muted-foreground">({editing.elements.length} elements — AI guidance controls generation quality)</span>
        </div>

        <div className="space-y-2">
          {editing.elements.map((el, idx) => (
            <div
              key={el.key}
              className={cn(
                "border rounded-lg transition-colors",
                editingEl === el.key ? "border-primary/50 bg-primary/5" : "border-border"
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
                  className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50 rounded-lg"
                  onClick={() => setEditingEl(el.key)}
                >
                  <span className="text-sm font-medium text-muted-foreground w-5 pt-0.5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{el.title}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground truncate">{el.description}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 italic">
                      {el.aiGuidance}
                    </p>
                  </div>
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
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
  const { data: configs = [], isLoading } = useProjectTypeConfigs();
  const [selectedType, setSelectedType] = useState<string>(ALL_PROJECT_TYPES[0].id);

  const getConfig = (typeId: string) => configs.find(c => c.project_type_id === typeId);
  const selectedTypeDef = PROJECT_TYPE_REGISTRY[selectedType as keyof typeof PROJECT_TYPE_REGISTRY];

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
      {/* Type list sidebar */}
      <Card className="sticky top-24">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Project Types</CardTitle>
          <CardDescription className="text-xs">Select a type to configure its AI instructions and element guidance</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-0.5 p-2">
            {ALL_PROJECT_TYPES.map((type) => {
              const config = getConfig(type.id);
              const isEnabled = config?.is_enabled !== false;
              const hasOverrides = !!config;

              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    selectedType === type.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <span className="text-lg shrink-0">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{config?.label ?? type.shortLabel}</span>
                      {hasOverrides && (
                        <span className="text-[10px] bg-primary/15 text-primary px-1 rounded">custom</span>
                      )}
                    </div>
                    {!isEnabled && (
                      <span className="text-xs text-muted-foreground">Disabled</span>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
