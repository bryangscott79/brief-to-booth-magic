import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useActivationTypes } from "@/hooks/useActivationTypes";
import { useProjects } from "@/hooks/useProjects";
import { useToast } from "@/hooks/use-toast";
import type { ActivationType, ScaleClassification } from "@/types/brief";

interface AddActivationPanelProps {
  parentId: string;
  parentProjectType: string;
  onCreated: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCALE_OPTIONS: { value: ScaleClassification; label: string }[] = [
  { value: "tabletop", label: "Tabletop" },
  { value: "inline", label: "Inline (10x10 - 10x20)" },
  { value: "peninsula", label: "Peninsula (20x20 - 20x30)" },
  { value: "island", label: "Island (20x20 - 30x30)" },
  { value: "large_island", label: "Large Island (30x30 - 50x50)" },
  { value: "mega", label: "Mega (50x50+)" },
  { value: "custom", label: "Custom" },
];

export function AddActivationPanel({
  parentId,
  parentProjectType,
  onCreated,
  open,
  onOpenChange,
}: AddActivationPanelProps) {
  const { data: allTypes = [], isLoading: typesLoading } = useActivationTypes();
  const { createProject } = useProjects();
  const { toast } = useToast();

  // Filter by parent type affinity
  const filteredTypes = allTypes.filter(
    (t) =>
      t.parentTypeAffinity.length === 0 ||
      t.parentTypeAffinity.includes(parentProjectType)
  );

  const [selectedTypeSlug, setSelectedTypeSlug] = useState<string>("");
  const [name, setName] = useState("");
  const [scale, setScale] = useState<ScaleClassification>("inline");
  const [sqft, setSqft] = useState<number>(100);
  const [inheritBrief, setInheritBrief] = useState(true);
  const [inheritBrand, setInheritBrand] = useState(true);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType: ActivationType | undefined = filteredTypes.find(
    (t) => t.slug === selectedTypeSlug
  );

  // Auto-populate from selected type
  useEffect(() => {
    if (selectedType) {
      setName(selectedType.label);
      if (selectedType.defaultScale) {
        setScale(selectedType.defaultScale as ScaleClassification);
      }
      if (selectedType.defaultSqft) {
        setSqft(selectedType.defaultSqft);
      }
    }
  }, [selectedType]);

  // Reset form when panel closes
  useEffect(() => {
    if (!open) {
      setSelectedTypeSlug("");
      setName("");
      setScale("inline");
      setSqft(100);
      setInheritBrief(true);
      setInheritBrand(true);
      setNotes("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim() || !selectedTypeSlug) return;

    setIsSubmitting(true);
    try {
      const result = await createProject.mutateAsync(name.trim());
      // Now update the created project with suite-specific fields
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase
        .from("projects")
        .update({
          parent_id: parentId,
          activation_type: selectedTypeSlug,
          scale_classification: scale,
          footprint_sqft: sqft,
          inherits_brief: inheritBrief,
          inherits_brand: inheritBrand,
          suite_notes: notes || null,
          project_type: parentProjectType,
        } as any)
        .eq("id", result.id);

      if (error) {
        toast({
          title: "Error configuring activation",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Activation created",
        description: `${name} has been added to the suite.`,
      });
      onCreated(result.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Error creating activation",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Activation</SheetTitle>
          <SheetDescription>
            Create a child activation within this suite.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          {/* Activation Type */}
          <div className="space-y-2">
            <Label>Activation Type</Label>
            {typesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading types...
              </div>
            ) : (
              <Select value={selectedTypeSlug} onValueChange={setSelectedTypeSlug}>
                <SelectTrigger>
                  <SelectValue placeholder="Select activation type..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredTypes.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      <div className="flex items-center gap-2">
                        {t.icon && <span className="text-base">{t.icon}</span>}
                        <div>
                          <span className="font-medium">{t.label}</span>
                          {t.description && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                  {filteredTypes.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      No activation types available for this project type.
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="activation-name">Name</Label>
            <Input
              id="activation-name"
              placeholder="e.g., VIP Lounge"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Scale */}
          <div className="space-y-2">
            <Label>Scale</Label>
            <Select value={scale} onValueChange={(v) => setScale(v as ScaleClassification)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Square Footage */}
          <div className="space-y-2">
            <Label htmlFor="activation-sqft">Square Footage</Label>
            <Input
              id="activation-sqft"
              type="number"
              min={0}
              value={sqft}
              onChange={(e) => setSqft(Number(e.target.value))}
            />
          </div>

          {/* Inherit checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="inherit-brief"
                checked={inheritBrief}
                onCheckedChange={(v) => setInheritBrief(!!v)}
              />
              <Label htmlFor="inherit-brief" className="text-sm font-normal cursor-pointer">
                Use parent project's brief
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="inherit-brand"
                checked={inheritBrand}
                onCheckedChange={(v) => setInheritBrand(!!v)}
              />
              <Label htmlFor="inherit-brand" className="text-sm font-normal cursor-pointer">
                Use parent's client and brand data
              </Label>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="activation-notes">Notes (optional)</Label>
            <Textarea
              id="activation-notes"
              placeholder="Special requirements or context for this activation..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !selectedTypeSlug || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Activation
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
