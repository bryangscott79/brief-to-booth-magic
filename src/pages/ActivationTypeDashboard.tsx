// ActivationTypeDashboard — detail page for one activation type.
// Route: /agency/activation-types/:typeId
//
// Built-in types can be customized per-agency via the activation_type_overrides
// table. Custom types remain editable directly. "Restore defaults" deletes the
// override and brings the built-in defaults back.

import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Plus, X, Star, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useActivationTypes,
  useUpdateActivationType,
  useUpsertActivationTypeOverride,
  useDeleteActivationTypeOverride,
} from "@/hooks/useActivationTypes";
import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

interface TemplateShape {
  must_have?: string[];
  must_avoid?: string[];
  sqft_min?: number | null;
  sqft_max?: number | null;
  reference_images?: string[];
  notes?: string;
}

export default function ActivationTypeDashboard() {
  const { typeId } = useParams<{ typeId: string }>();
  const { data: types, isLoading } = useActivationTypes();
  const updateCustomType = useUpdateActivationType();
  const upsertOverride = useUpsertActivationTypeOverride();
  const deleteOverride = useDeleteActivationTypeOverride();
  const { toast } = useToast();

  const type = types?.find((t) => t.id === typeId);

  // Effective template = either override (when present) or built-in default.
  const initialTemplate: TemplateShape = useMemo(() => {
    if (!type) return {};
    return ((type.elementEmphasis as any)?.template as TemplateShape) || {};
  }, [type?.id, (type as any)?.hasOverride]);

  const [template, setTemplate] = useState<TemplateShape>(initialTemplate);
  const [description, setDescription] = useState<string>(type?.description ?? "");
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [mustAvoidInput, setMustAvoidInput] = useState("");
  const [dirty, setDirty] = useState(false);

  // Sync state when type loads or changes (e.g. after restoring defaults)
  useEffect(() => {
    if (type) {
      setTemplate(((type.elementEmphasis as any)?.template as TemplateShape) || {});
      setDescription(type.description ?? "");
      setDirty(false);
    }
  }, [type?.id, (type as any)?.hasOverride, (type as any)?.updatedAt]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!type) {
    return (
      <AppLayout>
        <Card className="p-6 max-w-3xl mx-auto mt-10">
          <p className="text-muted-foreground">Activation type not found.</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/agency/activation-types">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to activation types
            </Link>
          </Button>
        </Card>
      </AppLayout>
    );
  }

  const isBuiltin = type.isBuiltin;
  const hasOverride = (type as any).hasOverride === true;
  const isSaving = updateCustomType.isPending || upsertOverride.isPending;

  const updateTemplate = (patch: Partial<TemplateShape>) => {
    setTemplate((t) => ({ ...t, ...patch }));
    setDirty(true);
  };

  const handleDescriptionChange = (v: string) => {
    setDescription(v);
    setDirty(true);
  };

  const addMustHave = () => {
    if (!mustHaveInput.trim()) return;
    updateTemplate({ must_have: [...(template.must_have || []), mustHaveInput.trim()] });
    setMustHaveInput("");
  };
  const addMustAvoid = () => {
    if (!mustAvoidInput.trim()) return;
    updateTemplate({ must_avoid: [...(template.must_avoid || []), mustAvoidInput.trim()] });
    setMustAvoidInput("");
  };

  const removeMustHave = (i: number) => {
    updateTemplate({ must_have: (template.must_have || []).filter((_, idx) => idx !== i) });
  };
  const removeMustAvoid = (i: number) => {
    updateTemplate({ must_avoid: (template.must_avoid || []).filter((_, idx) => idx !== i) });
  };

  const handleSave = async () => {
    try {
      if (isBuiltin) {
        // Save as agency override
        await upsertOverride.mutateAsync({
          activationTypeId: type.id,
          description: description.trim() ? description : null,
          template: template as Record<string, unknown>,
        });
        toast({ title: "Saved", description: "Your customizations are now active for your agency." });
      } else {
        // Custom type: update the row directly
        const existing = (type.elementEmphasis as any) || {};
        await updateCustomType.mutateAsync({
          id: type.id,
          description: description.trim() ? description : null,
          elementEmphasis: { ...existing, template },
        });
        toast({ title: "Template saved" });
      }
      setDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      await deleteOverride.mutateAsync(type.id);
      toast({ title: "Defaults restored", description: "Your customizations were removed." });
    } catch (e) {
      toast({
        title: "Restore failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/agency/activation-types">
            <ArrowLeft className="h-4 w-4 mr-1" />
            All activation types
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{type.label}</h1>
              {isBuiltin && (
                <Badge variant="secondary" className="gap-1">
                  <Star className="h-3 w-3" />
                  Built-in
                </Badge>
              )}
              {hasOverride && (
                <Badge className="bg-primary/15 text-primary border border-primary/30">
                  Customized
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {type.description || "No description yet."}
            </p>
          </div>

          {isBuiltin && hasOverride && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={deleteOverride.isPending}>
                  {deleteOverride.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Restore defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restore built-in defaults?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes your agency's customizations for {type.label} and brings back the
                    original built-in description, must-haves, must-avoids, size range, and notes.
                    Knowledge base entries are not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRestoreDefaults}>
                    Restore defaults
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Tabs defaultValue="template">
          <TabsList>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          </TabsList>

          {/* TEMPLATE TAB */}
          <TabsContent value="template" className="space-y-6 mt-6">
            {isBuiltin && (
              <Card className="p-3 bg-primary/5 border-primary/20 text-xs text-muted-foreground">
                {hasOverride
                  ? "You've customized this built-in type for your agency. Your edits are active for everyone in your agency. Use 'Restore defaults' above to remove them."
                  : "This is a built-in type with sensible defaults. Edits you make here are saved as an override for your agency only — the original built-in is preserved and can be restored at any time."}
              </Card>
            )}

            {/* Description */}
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="font-semibold">Description</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Short summary of what this activation type is and when to use it.
                </p>
              </div>
              <Textarea
                rows={2}
                placeholder="e.g. Primary exhibition or trade show booth..."
                value={description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
              />
            </Card>

            {/* Must-have elements */}
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="font-semibold">Must-have elements</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Things every {type.label.toLowerCase()} must include.
                </p>
              </div>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="e.g. Prominent brand logo"
                  value={mustHaveInput}
                  onChange={(e) => setMustHaveInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMustHave())}
                />
                <Button onClick={addMustHave} disabled={!mustHaveInput.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(template.must_have || []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nothing listed yet.</span>
                ) : (
                  template.must_have!.map((item, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {item}
                      <button onClick={() => removeMustHave(i)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </Card>

            {/* Must-avoid */}
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="font-semibold">Must-avoid elements</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Things that should never appear in this activation type.
                </p>
              </div>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="e.g. Seated workspaces"
                  value={mustAvoidInput}
                  onChange={(e) => setMustAvoidInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMustAvoid())}
                />
                <Button onClick={addMustAvoid} disabled={!mustAvoidInput.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(template.must_avoid || []).length === 0 ? (
                  <span className="text-xs text-muted-foreground">Nothing listed yet.</span>
                ) : (
                  template.must_avoid!.map((item, i) => (
                    <Badge key={i} variant="destructive" className="gap-1 opacity-80">
                      {item}
                      <button onClick={() => removeMustAvoid(i)} className="ml-1 hover:text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </Card>

            {/* Size range */}
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="font-semibold">Typical size range</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Square footage bounds — used to validate briefs and suggest sizing.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sqft-min">Min sqft</Label>
                  <Input
                    id="sqft-min"
                    type="number"
                    min={0}
                    placeholder="100"
                    value={template.sqft_min ?? ""}
                    onChange={(e) =>
                      updateTemplate({
                        sqft_min: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sqft-max">Max sqft</Label>
                  <Input
                    id="sqft-max"
                    type="number"
                    min={0}
                    placeholder="400"
                    value={template.sqft_max ?? ""}
                    onChange={(e) =>
                      updateTemplate({
                        sqft_max: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
            </Card>

            {/* Notes */}
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="font-semibold">Template notes</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Anything else the AI should know when generating for this activation type.
                </p>
              </div>
              <Textarea
                rows={4}
                placeholder="Free-form notes that get injected into every prompt for this activation type…"
                value={template.notes || ""}
                onChange={(e) => updateTemplate({ notes: e.target.value })}
              />
            </Card>

            {/* Save */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isBuiltin ? "Save customization" : "Save template"}
              </Button>
            </div>
          </TabsContent>

          {/* KNOWLEDGE TAB */}
          <TabsContent value="knowledge" className="mt-6 space-y-6">
            <Card className="p-6">
              <KnowledgeBasePanel
                scope="activation_type_agency"
                scopeId={type.id}
                title={`${type.label} — Your agency's knowledge`}
                description="Reference materials specific to your agency: visual case studies, client-approved photos, brand-aligned examples. Only your agency sees and is grounded by these."
              />
            </Card>

            <Card className="p-6 border-dashed">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">System foundation</Badge>
                <span className="text-xs text-muted-foreground">Managed by platform admins</span>
              </div>
              <KnowledgeBasePanel
                scope="activation_type"
                scopeId={type.id}
                title={`${type.label} — Foundation`}
                description="Platform-wide standards, metrics, and quality benchmarks for this activation type. Used as baseline grounding across every agency."
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
