import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanyProfile, useShowCosts, type ShowCost } from "@/hooks/useCompanyProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Trash2,
  Edit,
  Loader2,
  Save,
  MapPin,
  DollarSign,
} from "lucide-react";

function formatCurrency(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

export default function CompanyProfilePage() {
  const { profile, isLoading: profileLoading, upsertProfile } = useCompanyProfile();
  const { costs, isLoading: costsLoading, addShowCost, updateShowCost, deleteShowCost } = useShowCosts();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [boothSizes, setBoothSizes] = useState("");
  const [notes, setNotes] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);

  const [showDialog, setShowDialog] = useState(false);
  const [editingCost, setEditingCost] = useState<ShowCost | null>(null);
  const [costForm, setCostForm] = useState({
    show_name: "",
    city: "",
    venue: "",
    industry: "",
    estimated_booth_cost_per_sqft: "",
    estimated_drayage_per_cwt: "",
    estimated_labor_rate_per_hr: "",
    estimated_electrical_per_outlet: "",
    estimated_internet_cost: "",
    estimated_lead_retrieval_cost: "",
    badge_scan_cost: "",
    union_labor_required: false,
    notes: "",
  });

  useEffect(() => {
    if (profile) {
      setCompanyName(profile.company_name || "");
      setIndustry(profile.industry || "");
      setBoothSizes(profile.default_booth_sizes?.join(", ") || "");
      setNotes(profile.notes || "");
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      await upsertProfile.mutateAsync({
        company_name: companyName || null,
        industry: industry || null,
        default_booth_sizes: boothSizes ? boothSizes.split(",").map(s => s.trim()) : null,
        notes: notes || null,
      });
      setProfileDirty(false);
      toast({ title: "Company profile saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openAddDialog = () => {
    setEditingCost(null);
    setCostForm({
      show_name: "", city: "", venue: "", industry: "",
      estimated_booth_cost_per_sqft: "", estimated_drayage_per_cwt: "",
      estimated_labor_rate_per_hr: "", estimated_electrical_per_outlet: "",
      estimated_internet_cost: "", estimated_lead_retrieval_cost: "",
      badge_scan_cost: "", union_labor_required: false, notes: "",
    });
    setShowDialog(true);
  };

  const openEditDialog = (cost: ShowCost) => {
    setEditingCost(cost);
    setCostForm({
      show_name: cost.show_name,
      city: cost.city,
      venue: cost.venue || "",
      industry: cost.industry || "",
      estimated_booth_cost_per_sqft: cost.estimated_booth_cost_per_sqft?.toString() || "",
      estimated_drayage_per_cwt: cost.estimated_drayage_per_cwt?.toString() || "",
      estimated_labor_rate_per_hr: cost.estimated_labor_rate_per_hr?.toString() || "",
      estimated_electrical_per_outlet: cost.estimated_electrical_per_outlet?.toString() || "",
      estimated_internet_cost: cost.estimated_internet_cost?.toString() || "",
      estimated_lead_retrieval_cost: cost.estimated_lead_retrieval_cost?.toString() || "",
      badge_scan_cost: cost.badge_scan_cost?.toString() || "",
      union_labor_required: cost.union_labor_required,
      notes: cost.notes || "",
    });
    setShowDialog(true);
  };

  const handleSaveCost = async () => {
    const numOrNull = (v: string) => v ? parseFloat(v) : null;
    const payload: any = {
      show_name: costForm.show_name,
      city: costForm.city,
      venue: costForm.venue || null,
      industry: costForm.industry || null,
      estimated_booth_cost_per_sqft: numOrNull(costForm.estimated_booth_cost_per_sqft),
      estimated_drayage_per_cwt: numOrNull(costForm.estimated_drayage_per_cwt),
      estimated_labor_rate_per_hr: numOrNull(costForm.estimated_labor_rate_per_hr),
      estimated_electrical_per_outlet: numOrNull(costForm.estimated_electrical_per_outlet),
      estimated_internet_cost: numOrNull(costForm.estimated_internet_cost),
      estimated_lead_retrieval_cost: numOrNull(costForm.estimated_lead_retrieval_cost),
      badge_scan_cost: numOrNull(costForm.badge_scan_cost),
      union_labor_required: costForm.union_labor_required,
      notes: costForm.notes || null,
    };

    try {
      if (editingCost && !editingCost.is_preset) {
        // Update existing user-owned entry
        await updateShowCost.mutateAsync({ id: editingCost.id, ...payload });
        toast({ title: "Show cost updated" });
      } else {
        // New entry or editing a preset → create user-owned copy
        await addShowCost.mutateAsync(payload);
        toast({ title: editingCost?.is_preset ? "Custom copy created from preset" : "Show cost added" });
      }
      setShowDialog(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const isLoading = profileLoading || costsLoading;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-12 max-w-5xl space-y-10">
        {/* Company Profile */}
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2 mb-1">
            <Building2 className="h-6 w-6" />
            Company Profile
          </h1>
          <p className="text-muted-foreground">
            Company-wide defaults that inform every project's AI generation.
          </p>
        </div>

        <Card className="element-card">
          <CardHeader>
            <CardTitle className="text-lg">Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); setProfileDirty(true); }}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <Label>Industry</Label>
                <Input
                  value={industry}
                  onChange={(e) => { setIndustry(e.target.value); setProfileDirty(true); }}
                  placeholder="e.g. Cybersecurity, Cloud, FinTech"
                />
              </div>
            </div>
            <div>
              <Label>Default Booth Sizes</Label>
              <Input
                value={boothSizes}
                onChange={(e) => { setBoothSizes(e.target.value); setProfileDirty(true); }}
                placeholder="e.g. 10x10, 20x20, 30x30, 40x40"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated list</p>
            </div>
            <div>
              <Label>General Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setProfileDirty(true); }}
                placeholder="Preferred vendors, brand guidelines, standard requirements..."
                rows={3}
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={!profileDirty || upsertProfile.isPending}>
              {upsertProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Profile
            </Button>
          </CardContent>
        </Card>

        {/* Show Costs Database */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Show & Venue Cost Database
              </h2>
              <p className="text-muted-foreground text-sm">
                Industry-standard costs per show and city. Preset data is shared; add your own custom entries.
              </p>
            </div>
            <Button onClick={openAddDialog} className="btn-glow">
              <Plus className="mr-2 h-4 w-4" />
              Add Show
            </Button>
          </div>

          {costs.length === 0 ? (
            <Card className="element-card">
              <CardContent className="py-12 text-center">
                <MapPin className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No show costs yet. Add your first show or wait for presets to load.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="element-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Show</TableHead>
                      <TableHead>City / Venue</TableHead>
                      <TableHead className="text-right">Booth $/sqft</TableHead>
                      <TableHead className="text-right">Labor $/hr</TableHead>
                      <TableHead className="text-right">Drayage $/cwt</TableHead>
                      <TableHead className="text-center">Union</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">
                          {cost.show_name}
                          {cost.is_preset && (
                            <Badge variant="secondary" className="ml-2 text-xs">Preset</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span>{cost.city}</span>
                          {cost.venue && <span className="text-muted-foreground text-xs block">{cost.venue}</span>}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(cost.estimated_booth_cost_per_sqft)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cost.estimated_labor_rate_per_hr)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cost.estimated_drayage_per_cwt)}</TableCell>
                        <TableCell className="text-center">{cost.union_labor_required ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(cost)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            {!cost.is_preset && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Show Cost?</AlertDialogTitle>
                                    <AlertDialogDescription>Remove "{cost.show_name}" from your cost database?</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteShowCost.mutate(cost.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCost ? "Edit Show Cost" : "Add Show Cost"}</DialogTitle>
              <DialogDescription>Enter cost data for this show and venue.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Show Name *</Label>
                  <Input value={costForm.show_name} onChange={(e) => setCostForm(p => ({ ...p, show_name: e.target.value }))} placeholder="RSA Conference" />
                </div>
                <div>
                  <Label>City *</Label>
                  <Input value={costForm.city} onChange={(e) => setCostForm(p => ({ ...p, city: e.target.value }))} placeholder="San Francisco" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Venue</Label>
                  <Input value={costForm.venue} onChange={(e) => setCostForm(p => ({ ...p, venue: e.target.value }))} placeholder="Moscone Center" />
                </div>
                <div>
                  <Label>Industry</Label>
                  <Input value={costForm.industry} onChange={(e) => setCostForm(p => ({ ...p, industry: e.target.value }))} placeholder="Cybersecurity" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Booth $/sqft</Label>
                  <Input type="number" value={costForm.estimated_booth_cost_per_sqft} onChange={(e) => setCostForm(p => ({ ...p, estimated_booth_cost_per_sqft: e.target.value }))} />
                </div>
                <div>
                  <Label>Labor $/hr</Label>
                  <Input type="number" value={costForm.estimated_labor_rate_per_hr} onChange={(e) => setCostForm(p => ({ ...p, estimated_labor_rate_per_hr: e.target.value }))} />
                </div>
                <div>
                  <Label>Drayage $/cwt</Label>
                  <Input type="number" value={costForm.estimated_drayage_per_cwt} onChange={(e) => setCostForm(p => ({ ...p, estimated_drayage_per_cwt: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Electrical $/outlet</Label>
                  <Input type="number" value={costForm.estimated_electrical_per_outlet} onChange={(e) => setCostForm(p => ({ ...p, estimated_electrical_per_outlet: e.target.value }))} />
                </div>
                <div>
                  <Label>Internet Cost</Label>
                  <Input type="number" value={costForm.estimated_internet_cost} onChange={(e) => setCostForm(p => ({ ...p, estimated_internet_cost: e.target.value }))} />
                </div>
                <div>
                  <Label>Lead Retrieval</Label>
                  <Input type="number" value={costForm.estimated_lead_retrieval_cost} onChange={(e) => setCostForm(p => ({ ...p, estimated_lead_retrieval_cost: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={costForm.union_labor_required}
                  onCheckedChange={(v) => setCostForm(p => ({ ...p, union_labor_required: v }))}
                />
                <Label>Union Labor Required</Label>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={costForm.notes} onChange={(e) => setCostForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Special considerations..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveCost} disabled={!costForm.show_name || !costForm.city || addShowCost.isPending || updateShowCost.isPending}>
                {(addShowCost.isPending || updateShowCost.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCost ? "Update" : "Add"} Show
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
