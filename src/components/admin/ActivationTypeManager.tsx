import { useState } from "react";
import {
  useActivationTypes,
  useCreateActivationType,
  useUpdateActivationType,
  useDeleteActivationType,
} from "@/hooks/useActivationTypes";
import type { ActivationType, ActivationCategory } from "@/types/brief";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  Zap,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES: { value: ActivationCategory; label: string }[] = [
  { value: "engagement", label: "Engagement" },
  { value: "hospitality", label: "Hospitality" },
  { value: "support", label: "Support" },
  { value: "outdoor", label: "Outdoor" },
  { value: "digital", label: "Digital" },
];

const CATEGORY_COLORS: Record<ActivationCategory, string> = {
  engagement: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  hospitality: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  support: "bg-green-500/10 text-green-600 border-green-500/30",
  outdoor: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  digital: "bg-purple-500/10 text-purple-600 border-purple-500/30",
};

const SCALE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

const PARENT_TYPES = [
  { value: "trade_show_booth", label: "Trade Show Booth" },
  { value: "live_brand_activation", label: "Brand Activation" },
  { value: "permanent_installation", label: "Permanent Installation" },
  { value: "pop_up_retail", label: "Pop-Up Retail" },
  { value: "corporate_environment", label: "Corporate Environment" },
  { value: "museum_exhibit", label: "Museum Exhibit" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Form ────────────────────────────────────────────────────────────────────

interface FormState {
  label: string;
  slug: string;
  icon: string;
  category: ActivationCategory;
  description: string;
  defaultScale: string;
  defaultSqft: string;
  renderContextOverride: string;
  parentTypeAffinity: string[];
}

const EMPTY_FORM: FormState = {
  label: "",
  slug: "",
  icon: "",
  category: "engagement",
  description: "",
  defaultScale: "medium",
  defaultSqft: "",
  renderContextOverride: "",
  parentTypeAffinity: [],
};

function ActivationTypeForm({
  activationType,
  onClose,
}: {
  activationType?: ActivationType;
  onClose: () => void;
}) {
  const create = useCreateActivationType();
  const update = useUpdateActivationType();
  const { toast } = useToast();
  const isEditing = !!activationType;

  const [form, setForm] = useState<FormState>(
    activationType
      ? {
          label: activationType.label,
          slug: activationType.slug,
          icon: activationType.icon ?? "",
          category: activationType.category,
          description: activationType.description ?? "",
          defaultScale: activationType.defaultScale ?? "medium",
          defaultSqft: activationType.defaultSqft?.toString() ?? "",
          renderContextOverride: activationType.renderContextOverride ?? "",
          parentTypeAffinity: activationType.parentTypeAffinity,
        }
      : EMPTY_FORM
  );

  const handleLabelChange = (value: string) => {
    setForm((f) => ({
      ...f,
      label: value,
      slug: isEditing ? f.slug : slugify(value),
    }));
  };

  const toggleAffinity = (value: string) => {
    setForm((f) => ({
      ...f,
      parentTypeAffinity: f.parentTypeAffinity.includes(value)
        ? f.parentTypeAffinity.filter((v) => v !== value)
        : [...f.parentTypeAffinity, value],
    }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        label: form.label,
        slug: form.slug,
        icon: form.icon || null,
        category: form.category,
        description: form.description || null,
        defaultScale: form.defaultScale || null,
        defaultSqft: form.defaultSqft ? parseInt(form.defaultSqft, 10) : null,
        renderContextOverride: form.renderContextOverride || null,
        parentTypeAffinity: form.parentTypeAffinity,
      };

      if (isEditing) {
        await update.mutateAsync({ id: activationType.id, ...payload });
        toast({ title: "Activation type updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Activation type created" });
      }
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Label *</Label>
          <Input
            value={form.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Product Demo Station"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input
            value={form.slug}
            onChange={(e) =>
              setForm((f) => ({ ...f, slug: e.target.value }))
            }
            placeholder="product_demo_station"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Icon (Lucide name)</Label>
          <Input
            value={form.icon}
            onChange={(e) =>
              setForm((f) => ({ ...f, icon: e.target.value }))
            }
            placeholder="e.g. Monitor, Coffee, Gamepad2"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={form.category}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                category: v as ActivationCategory,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Default Scale</Label>
          <Select
            value={form.defaultScale}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, defaultScale: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Default Sq Ft</Label>
          <Input
            type="number"
            value={form.defaultSqft}
            onChange={(e) =>
              setForm((f) => ({ ...f, defaultSqft: e.target.value }))
            }
            placeholder="100"
          />
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={2}
            placeholder="Describe what this activation type involves..."
          />
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>Render Context Override</Label>
          <Textarea
            value={form.renderContextOverride}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                renderContextOverride: e.target.value,
              }))
            }
            rows={2}
            placeholder="Optional AI prompt context override for rendering this type..."
          />
        </div>

        <div className="space-y-2 col-span-2">
          <Label>Parent Type Affinity</Label>
          <div className="flex flex-wrap gap-2">
            {PARENT_TYPES.map((pt) => {
              const active = form.parentTypeAffinity.includes(pt.value);
              return (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => toggleAffinity(pt.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {pt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending || !form.label || !form.slug}
        >
          {isPending && (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          )}
          {isEditing ? "Update Type" : "Create Type"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ActivationTypeManager() {
  const { data: types = [], isLoading } = useActivationTypes();
  const deleteType = useDeleteActivationType();
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingType, setEditingType] = useState<ActivationType | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const grouped = CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat.value] = types.filter((t) => t.category === cat.value);
      return acc;
    },
    {} as Record<string, ActivationType[]>
  );

  const filteredCategories =
    filterCategory === "all"
      ? CATEGORIES
      : CATEGORIES.filter((c) => c.value === filterCategory);

  const handleDelete = async (id: string) => {
    try {
      await deleteType.mutateAsync(id);
      toast({ title: "Activation type deleted" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Delete failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activation Types</h2>
          <p className="text-sm text-muted-foreground">
            Manage the taxonomy of activation types used within project
            hierarchies
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Custom Type
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory("all")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            filterCategory === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted text-muted-foreground"
          }`}
        >
          All ({types.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = grouped[cat.value]?.length ?? 0;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filterCategory === cat.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted text-muted-foreground"
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grouped cards */}
      {types.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No activation types</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first custom activation type to extend the taxonomy
            </p>
            <Button
              className="mt-4"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add first type
            </Button>
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((cat) => {
          const catTypes = grouped[cat.value] ?? [];
          if (catTypes.length === 0) return null;
          return (
            <div key={cat.value} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={CATEGORY_COLORS[cat.value]}
                >
                  {cat.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {catTypes.length} type
                  {catTypes.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {catTypes.map((at) => (
                  <Card
                    key={at.id}
                    className="group hover:border-primary/40 transition-colors"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {at.icon && (
                            <span className="text-sm" title={at.icon}>
                              {at.icon}
                            </span>
                          )}
                          <CardTitle className="text-sm truncate">
                            {at.label}
                          </CardTitle>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={at.isBuiltin}
                            title={
                              at.isBuiltin
                                ? "Built-in types are read-only"
                                : "Edit"
                            }
                            onClick={() => setEditingType(at)}
                          >
                            {at.isBuiltin ? (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Edit className="h-3 w-3" />
                            )}
                          </Button>
                          {!at.isBuiltin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete "{at.label}"?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove this custom
                                    activation type.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(at.id)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {at.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {at.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={CATEGORY_COLORS[at.category]}
                        >
                          {at.category}
                        </Badge>
                        {at.defaultScale && (
                          <Badge variant="secondary" className="text-[10px]">
                            {at.defaultScale}
                          </Badge>
                        )}
                        {at.isBuiltin && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            Built-in
                          </Badge>
                        )}
                      </div>
                      {at.parentTypeAffinity.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground font-medium">
                            Affinity
                          </p>
                          <div className="flex gap-1 flex-wrap">
                            {at.parentTypeAffinity.map((p) => {
                              const ptLabel =
                                PARENT_TYPES.find(
                                  (pt) => pt.value === p
                                )?.label ?? p;
                              return (
                                <span
                                  key={p}
                                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded"
                                >
                                  {ptLabel}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Add/Edit dialog */}
      <Dialog
        open={showAddDialog || !!editingType}
        onOpenChange={(v) => {
          if (!v) {
            setShowAddDialog(false);
            setEditingType(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingType
                ? `Edit ${editingType.label}`
                : "New Custom Activation Type"}
            </DialogTitle>
          </DialogHeader>
          <ActivationTypeForm
            activationType={editingType ?? undefined}
            onClose={() => {
              setShowAddDialog(false);
              setEditingType(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
