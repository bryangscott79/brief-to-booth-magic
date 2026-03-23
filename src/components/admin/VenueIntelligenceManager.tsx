import { useState } from "react";
import {
  useVenueIntelligence,
  useCreateVenueIntelligence,
  useUpdateVenueIntelligence,
  useDeleteVenueIntelligence,
} from "@/hooks/useVenueIntelligence";
import type { VenueIntelligence } from "@/types/brief";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  Search,
  MapPin,
  ChevronDown,
  ChevronRight,
  Building2,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Form ────────────────────────────────────────────────────────────────────

interface VenueFormState {
  showName: string;
  venue: string;
  city: string;
  industry: string;
  designTips: string;
  trafficPatterns: string;
  audienceNotes: string;
  logisticsNotes: string;
  boothPlacementTips: string;
  typicalBoothSizes: string;
  unionLaborRequired: boolean;
}

const EMPTY_FORM: VenueFormState = {
  showName: "",
  venue: "",
  city: "",
  industry: "",
  designTips: "",
  trafficPatterns: "",
  audienceNotes: "",
  logisticsNotes: "",
  boothPlacementTips: "",
  typicalBoothSizes: "",
  unionLaborRequired: false,
};

function venueToForm(v: VenueIntelligence): VenueFormState {
  return {
    showName: v.showName,
    venue: v.venue ?? "",
    city: v.city ?? "",
    industry: v.industry ?? "",
    designTips: v.designTips.join("\n"),
    trafficPatterns: v.trafficPatterns ?? "",
    audienceNotes: v.audienceNotes ?? "",
    logisticsNotes: v.logisticsNotes ?? "",
    boothPlacementTips: v.boothPlacementTips ?? "",
    typicalBoothSizes: v.typicalBoothSizes.join(", "),
    unionLaborRequired: v.unionLaborRequired ?? false,
  };
}

function VenueForm({
  venue,
  onClose,
}: {
  venue?: VenueIntelligence;
  onClose: () => void;
}) {
  const create = useCreateVenueIntelligence();
  const update = useUpdateVenueIntelligence();
  const { toast } = useToast();
  const isEditing = !!venue;

  const [form, setForm] = useState<VenueFormState>(
    venue ? venueToForm(venue) : EMPTY_FORM
  );

  const handleSave = async () => {
    try {
      const payload = {
        showName: form.showName.trim(),
        venue: form.venue.trim() || null,
        city: form.city.trim() || null,
        industry: form.industry.trim() || null,
        designTips: form.designTips
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        trafficPatterns: form.trafficPatterns.trim() || null,
        audienceNotes: form.audienceNotes.trim() || null,
        logisticsNotes: form.logisticsNotes.trim() || null,
        boothPlacementTips: form.boothPlacementTips.trim() || null,
        typicalBoothSizes: form.typicalBoothSizes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        unionLaborRequired: form.unionLaborRequired,
      };

      if (isEditing) {
        await update.mutateAsync({ id: venue.id, ...payload });
        toast({ title: "Venue updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Venue created" });
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
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Show Name *</Label>
          <Input
            value={form.showName}
            onChange={(e) =>
              setForm((f) => ({ ...f, showName: e.target.value }))
            }
            placeholder="e.g. CES 2026"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Venue</Label>
          <Input
            value={form.venue}
            onChange={(e) =>
              setForm((f) => ({ ...f, venue: e.target.value }))
            }
            placeholder="e.g. Las Vegas Convention Center"
          />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input
            value={form.city}
            onChange={(e) =>
              setForm((f) => ({ ...f, city: e.target.value }))
            }
            placeholder="e.g. Las Vegas, NV"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Input
            value={form.industry}
            onChange={(e) =>
              setForm((f) => ({ ...f, industry: e.target.value }))
            }
            placeholder="e.g. Consumer Electronics"
          />
        </div>
        <div className="space-y-1.5 flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.unionLaborRequired}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  unionLaborRequired: e.target.checked,
                }))
              }
              className="rounded border-border"
            />
            <span className="text-sm">Union labor required</span>
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Design Tips (one per line)</Label>
        <Textarea
          value={form.designTips}
          onChange={(e) =>
            setForm((f) => ({ ...f, designTips: e.target.value }))
          }
          rows={3}
          placeholder="High ceilings allow for tall structures&#10;Lighting is dim, plan for extra booth lighting..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Traffic Patterns</Label>
        <Textarea
          value={form.trafficPatterns}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              trafficPatterns: e.target.value,
            }))
          }
          rows={2}
          placeholder="Describe typical foot traffic flow..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Audience Notes</Label>
        <Textarea
          value={form.audienceNotes}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              audienceNotes: e.target.value,
            }))
          }
          rows={2}
          placeholder="Key demographics, decision makers, buyer types..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Logistics Notes</Label>
        <Textarea
          value={form.logisticsNotes}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              logisticsNotes: e.target.value,
            }))
          }
          rows={2}
          placeholder="Load-in/load-out schedules, restrictions, dock info..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Booth Placement Tips</Label>
        <Textarea
          value={form.boothPlacementTips}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              boothPlacementTips: e.target.value,
            }))
          }
          rows={2}
          placeholder="Best halls, corner vs. inline, proximity to entrances..."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Typical Booth Sizes (comma-separated)</Label>
        <Input
          value={form.typicalBoothSizes}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              typicalBoothSizes: e.target.value,
            }))
          }
          placeholder="10x10, 20x20, 30x30, 50x50"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isPending || !form.showName.trim()}
        >
          {isPending && (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          )}
          {isEditing ? "Update Venue" : "Create Venue"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Venue Row ───────────────────────────────────────────────────────────────

function VenueRow({
  venue,
  onEdit,
  onDelete,
}: {
  venue: VenueIntelligence;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="hover:border-primary/40 transition-colors group">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {venue.showName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    {venue.venue && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {venue.venue}
                      </span>
                    )}
                    {venue.city && <span>{venue.city}</span>}
                    {venue.industry && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-4 px-1.5"
                      >
                        {venue.industry}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete "{venue.showName}"?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this venue
                        intelligence entry.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onDelete}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {venue.designTips.length > 0 && (
              <DetailSection title="Design Tips">
                <ul className="list-disc list-inside space-y-0.5">
                  {venue.designTips.map((tip, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {tip}
                    </li>
                  ))}
                </ul>
              </DetailSection>
            )}
            {venue.trafficPatterns && (
              <DetailSection title="Traffic Patterns">
                <p className="text-xs text-muted-foreground">
                  {venue.trafficPatterns}
                </p>
              </DetailSection>
            )}
            {venue.audienceNotes && (
              <DetailSection title="Audience Notes">
                <p className="text-xs text-muted-foreground">
                  {venue.audienceNotes}
                </p>
              </DetailSection>
            )}
            {venue.logisticsNotes && (
              <DetailSection title="Logistics Notes">
                <p className="text-xs text-muted-foreground">
                  {venue.logisticsNotes}
                </p>
              </DetailSection>
            )}
            {venue.boothPlacementTips && (
              <DetailSection title="Booth Placement Tips">
                <p className="text-xs text-muted-foreground">
                  {venue.boothPlacementTips}
                </p>
              </DetailSection>
            )}
            {venue.typicalBoothSizes.length > 0 && (
              <DetailSection title="Typical Booth Sizes">
                <div className="flex gap-1.5 flex-wrap">
                  {venue.typicalBoothSizes.map((size, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {size}
                    </Badge>
                  ))}
                </div>
              </DetailSection>
            )}
            {venue.unionLaborRequired && (
              <DetailSection title="Union Labor">
                <Badge
                  variant="outline"
                  className="text-[10px] text-amber-600 border-amber-500/30"
                >
                  Union labor required
                </Badge>
              </DetailSection>
            )}
            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground border-t border-border/50">
              <Info className="h-3 w-3" />
              See Show Costs for pricing data
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function VenueIntelligenceManager() {
  const { data: venues = [], isLoading } = useVenueIntelligence();
  const deleteVenue = useDeleteVenueIntelligence();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingVenue, setEditingVenue] =
    useState<VenueIntelligence | null>(null);

  const filtered = venues.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.showName.toLowerCase().includes(q) ||
      (v.venue ?? "").toLowerCase().includes(q) ||
      (v.city ?? "").toLowerCase().includes(q) ||
      (v.industry ?? "").toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string) => {
    try {
      await deleteVenue.mutateAsync(id);
      toast({ title: "Venue deleted" });
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
          <h2 className="text-lg font-semibold">Venue Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Show and venue knowledge that informs booth design and
            logistics
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Venue
        </Button>
      </div>

      {/* Search */}
      {venues.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by show name, venue, city, or industry..."
            className="pl-9"
          />
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">
              {venues.length === 0
                ? "No venue intelligence yet"
                : "No venues match your search"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Add show and venue information to help the AI generate
              contextually-aware booth designs
            </p>
            {venues.length === 0 && (
              <Button
                className="mt-4"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add first venue
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {filtered.length} venue
            {filtered.length !== 1 ? "s" : ""}
          </p>
          {filtered.map((venue) => (
            <VenueRow
              key={venue.id}
              venue={venue}
              onEdit={() => setEditingVenue(venue)}
              onDelete={() => handleDelete(venue.id)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog
        open={showAddDialog || !!editingVenue}
        onOpenChange={(v) => {
          if (!v) {
            setShowAddDialog(false);
            setEditingVenue(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingVenue
                ? `Edit ${editingVenue.showName}`
                : "New Venue Intelligence"}
            </DialogTitle>
          </DialogHeader>
          <VenueForm
            venue={editingVenue ?? undefined}
            onClose={() => {
              setShowAddDialog(false);
              setEditingVenue(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
