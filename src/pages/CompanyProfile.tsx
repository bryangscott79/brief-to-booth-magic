import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCompanyProfile, useShowCosts, type ShowCost } from "@/hooks/useCompanyProfile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Building2,
  Plus,
  Trash2,
  Edit,
  Loader2,
  Save,
  MapPin,
  DollarSign,
  Upload,
  Image,
  Palette,
  Mail,
  Phone,
  Globe,
  User,
  Check,
} from "lucide-react";

function formatCurrency(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

// Logo upload component
function LogoUploader({ 
  label, 
  currentUrl, 
  onUpload, 
  variant = 'light' 
}: { 
  label: string; 
  currentUrl: string | null; 
  onUpload: (url: string) => void;
  variant?: 'light' | 'dark';
}) {
  const [isUploading, setIsUploading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !user) return;
    
    const file = acceptedFiles[0];
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/logos/${variant}_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(path);
      
      onUpload(publicUrl);
      toast({ title: "Logo uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [user, variant, onUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp'] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
          ${variant === 'dark' ? 'bg-gray-900' : 'bg-white'}
        `}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        ) : currentUrl ? (
          <div className="flex items-center justify-center gap-4">
            <img 
              src={currentUrl} 
              alt={label} 
              className="h-12 max-w-[150px] object-contain"
            />
            <Badge variant="secondary" className="text-xs">
              <Check className="h-3 w-3 mr-1" />
              Uploaded
            </Badge>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop logo here or click to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, SVG up to 2MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Color picker component
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div 
          className="w-10 h-10 rounded-lg border cursor-pointer"
          style={{ backgroundColor: value || '#0047AB' }}
          onClick={() => document.getElementById(`color-${label}`)?.click()}
        />
        <Input
          id={`color-${label}`}
          type="color"
          value={value || '#0047AB'}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 h-10 p-1 cursor-pointer"
        />
        <Input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#0047AB"
          className="flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}

export default function CompanyProfilePage() {
  const { profile, isLoading: profileLoading, upsertProfile } = useCompanyProfile();
  const { costs, isLoading: costsLoading, addShowCost, updateShowCost, deleteShowCost } = useShowCosts();
  const { toast } = useToast();

  // Company basics
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [boothSizes, setBoothSizes] = useState("");
  const [notes, setNotes] = useState("");
  
  // Branding
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDarkUrl, setLogoDarkUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState("#0047AB");
  const [secondaryColor, setSecondaryColor] = useState("#4682B4");
  const [tagline, setTagline] = useState("");
  
  // Contact
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [website, setWebsite] = useState("");
  
  const [profileDirty, setProfileDirty] = useState(false);
  const [activeTab, setActiveTab] = useState("branding");

  // Show cost dialog state
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
      setLogoUrl(profile.logo_url || null);
      setLogoDarkUrl(profile.logo_dark_url || null);
      setBrandColor(profile.brand_color || "#0047AB");
      setSecondaryColor(profile.secondary_color || "#4682B4");
      setTagline(profile.tagline || "");
      setContactName(profile.contact_name || "");
      setContactEmail(profile.contact_email || "");
      setContactPhone(profile.contact_phone || "");
      setAddress(profile.address || "");
      setWebsite(profile.website || "");
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    try {
      await upsertProfile.mutateAsync({
        company_name: companyName || null,
        industry: industry || null,
        default_booth_sizes: boothSizes ? boothSizes.split(",").map(s => s.trim()) : null,
        notes: notes || null,
        logo_url: logoUrl,
        logo_dark_url: logoDarkUrl,
        brand_color: brandColor || null,
        secondary_color: secondaryColor || null,
        tagline: tagline || null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        address: address || null,
        website: website || null,
      });
      setProfileDirty(false);
      toast({ title: "Company profile saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const markDirty = () => setProfileDirty(true);

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
        await updateShowCost.mutateAsync({ id: editingCost.id, ...payload });
        toast({ title: "Show cost updated" });
      } else {
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
      <div className="container py-8 max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Company Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure your company branding for proposals and exports
            </p>
          </div>
          <Button 
            onClick={handleSaveProfile} 
            disabled={!profileDirty || upsertProfile.isPending}
            className="btn-glow"
          >
            {upsertProfile.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="contact" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Contact Info
            </TabsTrigger>
            <TabsTrigger value="costs" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Show Costs
            </TabsTrigger>
          </TabsList>

          {/* Branding Tab */}
          <TabsContent value="branding" className="space-y-6 mt-6">
            <Card className="element-card">
              <CardHeader>
                <CardTitle className="text-lg">Company Information</CardTitle>
                <CardDescription>Basic info about your exhibit company</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Company Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => { setCompanyName(e.target.value); markDirty(); }}
                      placeholder="Acme Exhibits"
                    />
                  </div>
                  <div>
                    <Label>Tagline</Label>
                    <Input
                      value={tagline}
                      onChange={(e) => { setTagline(e.target.value); markDirty(); }}
                      placeholder="Creating extraordinary experiences"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Industry</Label>
                    <Input
                      value={industry}
                      onChange={(e) => { setIndustry(e.target.value); markDirty(); }}
                      placeholder="Trade Show Exhibits"
                    />
                  </div>
                  <div>
                    <Label>Default Booth Sizes</Label>
                    <Input
                      value={boothSizes}
                      onChange={(e) => { setBoothSizes(e.target.value); markDirty(); }}
                      placeholder="20x20, 30x30, 40x40"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="element-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Logo Assets
                </CardTitle>
                <CardDescription>
                  Upload your company logos for use in proposals and exports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  <LogoUploader
                    label="Logo (Light Background)"
                    currentUrl={logoUrl}
                    onUpload={(url) => { setLogoUrl(url); markDirty(); }}
                    variant="light"
                  />
                  <LogoUploader
                    label="Logo (Dark Background)"
                    currentUrl={logoDarkUrl}
                    onUpload={(url) => { setLogoDarkUrl(url); markDirty(); }}
                    variant="dark"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="element-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Brand Colors
                </CardTitle>
                <CardDescription>
                  Colors used in proposal headers, accents, and styling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  <ColorPicker
                    label="Primary Brand Color"
                    value={brandColor}
                    onChange={(v) => { setBrandColor(v); markDirty(); }}
                  />
                  <ColorPicker
                    label="Secondary Color"
                    value={secondaryColor}
                    onChange={(v) => { setSecondaryColor(v); markDirty(); }}
                  />
                </div>
                
                <div className="mt-6 p-4 rounded-lg border">
                  <p className="text-sm text-muted-foreground mb-3">Preview</p>
                  <div className="flex items-center gap-4">
                    <div 
                      className="h-12 px-6 rounded-lg flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: brandColor }}
                    >
                      Primary Button
                    </div>
                    <div 
                      className="h-12 px-6 rounded-lg flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: secondaryColor }}
                    >
                      Secondary
                    </div>
                    <div 
                      className="h-3 flex-1 rounded-full"
                      style={{ background: `linear-gradient(90deg, ${brandColor}, ${secondaryColor})` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Info Tab */}
          <TabsContent value="contact" className="space-y-6 mt-6">
            <Card className="element-card">
              <CardHeader>
                <CardTitle className="text-lg">Contact Information</CardTitle>
                <CardDescription>
                  This information appears on proposals and exports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Primary Contact Name
                    </Label>
                    <Input
                      value={contactName}
                      onChange={(e) => { setContactName(e.target.value); markDirty(); }}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => { setContactEmail(e.target.value); markDirty(); }}
                      placeholder="john@acmeexhibits.com"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <Input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => { setContactPhone(e.target.value); markDirty(); }}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Website
                    </Label>
                    <Input
                      type="url"
                      value={website}
                      onChange={(e) => { setWebsite(e.target.value); markDirty(); }}
                      placeholder="https://acmeexhibits.com"
                    />
                  </div>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Address
                  </Label>
                  <Textarea
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); markDirty(); }}
                    placeholder="123 Exhibition Way&#10;Atlanta, GA 30303"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Internal Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                    placeholder="Any internal notes about your company..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Show Costs Tab */}
          <TabsContent value="costs" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Show & Venue Cost Database
                </h2>
                <p className="text-muted-foreground text-sm">
                  Industry-standard costs per show and city. Add your own custom entries.
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
                  <p className="text-muted-foreground">No show costs yet. Add your first show.</p>
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
          </TabsContent>
        </Tabs>

        {/* Add/Edit Show Cost Dialog */}
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
