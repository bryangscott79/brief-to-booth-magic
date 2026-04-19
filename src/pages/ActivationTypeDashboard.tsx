// ActivationTypeDashboard — detail page for one activation type.
// Route: /agency/activation-types/:typeId
//
// Two tabs:
//   - Template: structured must-have / must-avoid / typical sqft / reference images
//   - Knowledge: KB panel with scope='activation_type'

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Plus, X, Star } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useActivationTypes,
  useUpdateActivationType,
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
  const updateType = useUpdateActivationType();
  const { toast } = useToast();

  const type = types?.find((t) => t.id === typeId);

  // Parse template out of element_emphasis JSONB
  const initialTemplate: TemplateShape = (type?.elementEmphasis as any)?.template || {};
  const [template, setTemplate] = useState<TemplateShape>(initialTemplate);
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [mustAvoidInput, setMustAvoidInput] = useState("");
  const [dirty, setDirty] = useState(false);

  // Sync template when type loads
  useEffect(() => {
    if (type) {
      const existing = (type.elementEmphasis as any)?.template || {};
      setTemplate(existing);
      setDirty(false);
    }
  }, [type?.id]);

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

  const updateTemplate = (patch: Partial<TemplateShape>) => {
    setTemplate((t) => ({ ...t, ...patch }));
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
    if (type.isBuiltin) {
      toast({
        title: "Read-only",
        description: "Built-in activation types can't be modified. Duplicate it first.",
        variant: "destructive",
      });
      return;
    }
    try {
      // Preserve any non-template keys already in element_emphasis
      const existing = (type.elementEmphasis as any) || {};
      await updateType.mutateAsync({
        id: type.id,
        elementEmphasis: { ...existing, template },
      });
      toast({ title: "Template saved" });
      setDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
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

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{type.label}</h1>
            {type.isBuiltin && (
              <Badge variant="secondary" className="gap-1">
                <Star className="h-3 w-3" />
                Built-in
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {type.description || "No description yet."}
          </p>
        </div>

        <Tabs defaultValue="template">
          <TabsList>
            <TabsTrigger value="template">Template</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          </TabsList>

          {/* TEMPLATE TAB */}
          <TabsContent value="template" className="space-y-6 mt-6">
            {type.isBuiltin && (
              <Card className="p-3 bg-muted/50 border-dashed text-xs text-muted-foreground">
                This is a built-in type and is read-only. To customize, create a new type.
              </Card>
            )}

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
                  disabled={type.isBuiltin}
                />
                <Button onClick={addMustHave} disabled={type.isBuiltin || !mustHaveInput.trim()}>
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
                      {!type.isBuiltin && (
                        <button onClick={() => removeMustHave(i)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      )}
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
                  disabled={type.isBuiltin}
                />
                <Button onClick={addMustAvoid} disabled={type.isBuiltin || !mustAvoidInput.trim()}>
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
                      {!type.isBuiltin && (
                        <button onClick={() => removeMustAvoid(i)} className="ml-1 hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      )}
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
                    disabled={type.isBuiltin}
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
                    disabled={type.isBuiltin}
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
                disabled={type.isBuiltin}
              />
            </Card>

            {/* Save */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || type.isBuiltin || updateType.isPending}>
                {updateType.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save template
              </Button>
            </div>
          </TabsContent>

          {/* KNOWLEDGE TAB */}
          <TabsContent value="knowledge" className="mt-6">
            <Card className="p-6">
              <KnowledgeBasePanel
                scope="activation_type"
                scopeId={type.id}
                title={`${type.label} — Knowledge`}
                description="Upload reference PDFs, briefs, photos, or markdown notes that describe this activation type. The AI uses these as grounding when generating."
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
