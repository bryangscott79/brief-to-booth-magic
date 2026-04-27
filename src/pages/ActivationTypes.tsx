// Activation Types admin page
// Route: /agency/activation-types
//
// Lists all activation types (builtins + this agency's custom types),
// grouped by category. Each links to a dashboard with a Template editor
// and a Knowledge tab (scope='activation_type').

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, ChevronRight, Sparkles, Star, Filter } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import {
  useActivationTypes,
  useCreateActivationType,
} from "@/hooks/useActivationTypes";
import { useAgency } from "@/hooks/useAgency";
import { useIndustries, useVocabulary } from "@/hooks/useIndustries";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "engagement",   label: "Engagement" },
  { value: "hospitality",  label: "Hospitality" },
  { value: "support",      label: "Support" },
  { value: "outdoor",      label: "Outdoor" },
  { value: "digital",      label: "Digital" },
  { value: "residential",  label: "Residential" },
  { value: "commercial",   label: "Commercial" },
  { value: "civic",        label: "Civic / public" },
  { value: "film",         label: "Film & TV" },
  { value: "live",         label: "Live & touring" },
  { value: "themed",       label: "Themed" },
];

export default function ActivationTypes() {
  const { data: types, isLoading } = useActivationTypes();
  const { data: industries = [] } = useIndustries();
  const { agency } = useAgency();
  const vocab = useVocabulary();
  const createType = useCreateActivationType();
  const { toast } = useToast();

  const agencyIndustries = ((agency as any)?.industries as string[] | undefined) ?? ["experiential"];
  // 'all' means: show every type the agency's industries cover. Otherwise filter to a single industry.
  const [industryFilter, setIndustryFilter] = useState<string>("all");

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<string>("engagement");
  const [newDescription, setNewDescription] = useState("");

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Filter types by the agency's industries. A type matches if any of its
  // industries[] tags overlaps the agency's industries list.
  // Custom (non-builtin) types always show — they're agency-owned.
  const visibleTypes = useMemo(() => {
    return (types || []).filter((t) => {
      if (!t.isBuiltin) return true;
      const typeIndustries = (((t as any).industries as string[] | undefined) ?? ["experiential"]);
      const candidates = industryFilter === "all" ? agencyIndustries : [industryFilter];
      return typeIndustries.some((slug) => candidates.includes(slug));
    });
  }, [types, agencyIndustries, industryFilter]);

  const grouped = visibleTypes.reduce<Record<string, typeof visibleTypes>>((acc, t) => {
    const cat = t.category || "other";
    if (!acc[cat]) acc[cat] = [] as any;
    acc[cat]!.push(t);
    return acc;
  }, {});

  const handleCreate = async () => {
    if (!newLabel.trim()) {
      toast({ title: "Label required", variant: "destructive" });
      return;
    }
    const slug = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    try {
      await createType.mutateAsync({
        slug,
        label: newLabel.trim(),
        description: newDescription.trim() || null,
        category: newCategory as any,
      });
      toast({ title: "Activation type created" });
      setShowCreate(false);
      setNewLabel("");
      setNewDescription("");
      setNewCategory("engagement");
    } catch (e) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  // Filter to industries the agency belongs to (plus "all")
  const filterableIndustries = industries.filter((i) => agencyIndustries.includes(i.slug));

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{vocab.project_types}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define what kinds of {vocab.projects.toLowerCase()} your agency works on, and upload
              reference material so the AI understands each format.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New {vocab.project_type.toLowerCase()}
          </Button>
        </div>

        {/* Industry filter — only show when agency works in 2+ industries */}
        {filterableIndustries.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => setIndustryFilter("all")}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                industryFilter === "all"
                  ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-foreground"
                  : "border-white/10 bg-white/[0.02] text-foreground/65 hover:text-foreground",
              )}
            >
              All industries
            </button>
            {filterableIndustries.map((ind) => (
              <button
                key={ind.slug}
                onClick={() => setIndustryFilter(ind.slug)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  industryFilter === ind.slug
                    ? "border-[#A78BFA]/50 bg-[#A78BFA]/15 text-foreground"
                    : "border-white/10 bg-white/[0.02] text-foreground/65 hover:text-foreground",
                )}
              >
                {ind.label}
              </button>
            ))}
          </div>
        )}

        {Object.keys(grouped).length === 0 ? (
          <Card className="p-10 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">No {vocab.project_types.toLowerCase()} yet.</p>
          </Card>
        ) : (
          Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {CATEGORIES.find((c) => c.value === category)?.label || category}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list!.map((type) => (
                  <Link
                    key={type.id}
                    to={`/agency/activation-types/${type.id}`}
                    className="group"
                  >
                    <Card className="p-4 hover:border-primary/50 transition-colors cursor-pointer h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{type.label}</div>
                            {type.isBuiltin && (
                              <Star className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {type.slug}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      {type.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {type.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {type.defaultSqft && (
                          <Badge variant="secondary" className="text-xs">
                            ~{type.defaultSqft} sqft
                          </Badge>
                        )}
                        {type.defaultScale && (
                          <Badge variant="outline" className="text-xs">
                            {type.defaultScale}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {vocab.project_type.toLowerCase()}</DialogTitle>
              <DialogDescription>
                Add a new format your agency creates. You'll be able to add a template and
                upload reference documents after creating it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="label">Name</Label>
                <Input
                  id="label"
                  placeholder="e.g. Branded photo booth"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger id="category">
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
              <div className="space-y-2">
                <Label htmlFor="desc">Description (optional)</Label>
                <Textarea
                  id="desc"
                  placeholder="One-liner explaining what this activation type is for."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createType.isPending}>
                {createType.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
