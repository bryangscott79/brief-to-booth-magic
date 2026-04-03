import { useState } from "react";
import {
  useClients, useUpsertClient, useDeleteClient,
  useBrandIntelligence, useUpsertBrandIntelligence, useDeleteBrandIntelligence, useApproveBrandIntelligence,
  type Client, type BrandIntelligenceEntry,
} from "@/hooks/useClients";
import { BrandGuidelinesEditor } from "@/components/admin/BrandGuidelinesEditor";
import { BrandAssetLibrary } from "@/components/admin/BrandAssetLibrary";
import { ClientBrandKnowledgeBase } from "@/components/admin/ClientBrandKnowledgeBase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, Edit, Building2, Brain, Palette,
  ShoppingCart, DollarSign, BookOpen, Star, ChevronRight, Sparkles,
  Check, X, MessageSquare, Loader2, Globe, Search
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<BrandIntelligenceEntry["category"], { label: string; icon: any; color: string; description: string }> = {
  visual_identity: { label: "Visual Identity", icon: Palette, color: "text-purple-500", description: "Logo, colors, typography, imagery dos and don'ts" },
  strategic_voice: { label: "Strategic Voice", icon: MessageSquare, color: "text-blue-500", description: "Brand POV, tone of voice, messaging pillars" },
  vendor_material: { label: "Vendors & Materials", icon: ShoppingCart, color: "text-amber-500", description: "Preferred vendors, materials, finishes, suppliers" },
  process_procedure: { label: "Processes", icon: BookOpen, color: "text-green-500", description: "Agency processes, workflows, brand standards" },
  cost_benchmark: { label: "Cost Benchmarks", icon: DollarSign, color: "text-emerald-500", description: "Budget benchmarks, typical pricing, cost norms" },
  past_learning: { label: "Past Learnings", icon: Star, color: "text-rose-500", description: "What worked, what didn't, feedback from past projects" },
};

const SOURCE_BADGE: Record<BrandIntelligenceEntry["source"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  manual: { label: "Manual", variant: "outline" },
  ai_extracted: { label: "AI Extracted", variant: "secondary" },
  feedback: { label: "Feedback", variant: "secondary" },
};

function IntelligenceEntryForm({
  clientId,
  entry,
  onClose,
}: {
  clientId: string;
  entry?: BrandIntelligenceEntry;
  onClose: () => void;
}) {
  const upsert = useUpsertBrandIntelligence();
  const [form, setForm] = useState({
    category: (entry?.category ?? "visual_identity") as BrandIntelligenceEntry["category"],
    title: entry?.title ?? "",
    content: entry?.content ?? "",
    tags: entry?.tags?.join(", ") ?? "",
  });

  const handleSave = async () => {
    await upsert.mutateAsync({
      ...(entry?.id ? { id: entry.id } : {}),
      client_id: clientId,
      category: form.category,
      title: form.title,
      content: form.content,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_META).map(([k, v]) => {
              const Icon = v.icon;
              return (
                <SelectItem key={k} value={k}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", v.color)} />
                    {v.label}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{CATEGORY_META[form.category].description}</p>
      </div>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Brand Colors, Preferred AV Vendor, Don't Show Competitors..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Intelligence Content</Label>
        <Textarea
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          rows={5}
          placeholder="Describe the intelligence in detail. This will be injected into AI prompts when this client is active..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Tags (comma-separated)</Label>
        <Input
          value={form.tags}
          onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          placeholder="colors, typography, premium, outdoor..."
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={upsert.isPending || !form.title || !form.content}>
          {upsert.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Save Intelligence
        </Button>
      </DialogFooter>
    </div>
  );
}

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const upsert = useUpsertClient();
  const [form, setForm] = useState({
    name: client?.name ?? "",
    industry: client?.industry ?? "",
    website: client?.website ?? "",
    description: client?.description ?? "",
    primary_color: client?.primary_color ?? "",
    secondary_color: client?.secondary_color ?? "",
  });

  const handleSave = async () => {
    await upsert.mutateAsync({ ...(client?.id ? { id: client.id } : {}), ...form });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Client / Brand Name *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Red Bull GmbH" />
        </div>
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Energy Drink" />
        </div>
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
        </div>
        <div className="space-y-1.5">
          <Label>Primary Brand Color</Label>
          <div className="flex gap-2">
            <Input value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} placeholder="#CC1E4A" className="flex-1" />
            {form.primary_color && (
              <div className="w-9 h-9 rounded-md border border-border shrink-0" style={{ backgroundColor: form.primary_color }} />
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Secondary Brand Color</Label>
          <div className="flex gap-2">
            <Input value={form.secondary_color} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))} placeholder="#C0C0C0" className="flex-1" />
            {form.secondary_color && (
              <div className="w-9 h-9 rounded-md border border-border shrink-0" style={{ backgroundColor: form.secondary_color }} />
            )}
          </div>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label>Description / Notes</Label>
          <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Key context about this client..." />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={upsert.isPending || !form.name}>
          {upsert.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Save Client
        </Button>
      </DialogFooter>
    </div>
  );
}

function ClientDetail({ client, onBack }: { client: Client; onBack: () => void }) {
  const { data: entries = [], isLoading } = useBrandIntelligence(client.id);
  const deleteEntry = useDeleteBrandIntelligence();
  const approve = useApproveBrandIntelligence();

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BrandIntelligenceEntry | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const pending = entries.filter(e => !e.is_approved);
  const approved = entries.filter(e => e.is_approved);
  const filtered = filterCategory === "all" ? approved : approved.filter(e => e.category === filterCategory);

  const categoryCount = Object.keys(CATEGORY_META).reduce((acc, cat) => {
    acc[cat] = approved.filter(e => e.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
            ← Clients
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-lg font-bold"
              style={{ backgroundColor: client.primary_color || "hsl(var(--primary))" }}
            >
              {client.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold">{client.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {client.industry && <span>{client.industry}</span>}
                {client.website && (
                  <>
                    <span>·</span>
                    <a href={client.website} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-foreground">
                      <Globe className="h-3 w-3" />
                      {client.website.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAddEntry(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Intelligence
          </Button>
        </div>
      </div>

      {/* Color swatches */}
      {(client.primary_color || client.secondary_color) && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Brand colors:</span>
          {client.primary_color && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: client.primary_color }} />
              <span className="text-xs font-mono">{client.primary_color}</span>
            </div>
          )}
          {client.secondary_color && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: client.secondary_color }} />
              <span className="text-xs font-mono">{client.secondary_color}</span>
            </div>
          )}
        </div>
      )}

      {/* Pending approvals */}
      {pending.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              {pending.length} AI-extracted entries pending approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map(entry => {
              const meta = CATEGORY_META[entry.category];
              const Icon = meta.icon;
              return (
                <div key={entry.id} className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border">
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{entry.title}</span>
                      <Badge variant="secondary" className="text-xs">{meta.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 text-green-600 hover:text-green-700"
                      onClick={() => approve.mutate({ id: entry.id, clientId: client.id })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
                      onClick={() => deleteEntry.mutate({ id: entry.id, clientId: client.id })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory("all")}
          className={cn(
            "text-xs px-3 py-1.5 rounded-full border transition-colors",
            filterCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
          )}
        >
          All ({approved.length})
        </button>
        {Object.entries(CATEGORY_META).map(([k, v]) => {
          const count = categoryCount[k] || 0;
          if (count === 0) return null;
          const Icon = v.icon;
          return (
            <button
              key={k}
              onClick={() => setFilterCategory(k)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors",
                filterCategory === k ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              )}
            >
              <Icon className="h-3 w-3" />
              {v.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Intelligence entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No intelligence entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add entries manually or complete a project to extract intelligence automatically
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowAddEntry(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add first entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(CATEGORY_META).map(([cat, meta]) => {
            const catEntries = filtered.filter(e => e.category === cat);
            if (catEntries.length === 0) return null;
            const Icon = meta.icon;
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", meta.color)} />
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">({catEntries.length})</span>
                </div>
                {catEntries.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-muted/30 group transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{entry.title}</span>
                        <Badge {...SOURCE_BADGE[entry.source]} className="text-[10px] py-0">{SOURCE_BADGE[entry.source].label}</Badge>
                        {entry.confidence_score != null && (
                          <span className="text-[10px] text-muted-foreground">{Math.round(entry.confidence_score * 100)}% confidence</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {entry.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button size="sm" variant="ghost" className="h-7"
                        onClick={() => setEditingEntry(entry)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete intelligence entry?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently remove "{entry.title}" from this client's brand intelligence.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteEntry.mutate({ id: entry.id, clientId: client.id })}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Client Brand Knowledge Base (Layer 2) */}
      <div className="border-t border-border pt-6">
        <ClientBrandKnowledgeBase clientId={client.id} clientName={client.name} />
      </div>

      {/* Brand Guidelines */}
      <div className="border-t border-border pt-6">
        <BrandGuidelinesEditor clientId={client.id} />
      </div>

      {/* Brand Asset Library */}
      <div className="border-t border-border pt-6">
        <BrandAssetLibrary clientId={client.id} />
      </div>

      {/* Add intelligence dialog */}
      <Dialog open={showAddEntry || !!editingEntry} onOpenChange={(v) => { if (!v) { setShowAddEntry(false); setEditingEntry(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Intelligence Entry" : "Add Brand Intelligence"}</DialogTitle>
          </DialogHeader>
          <IntelligenceEntryForm
            clientId={client.id}
            entry={editingEntry ?? undefined}
            onClose={() => { setShowAddEntry(false); setEditingEntry(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ClientsManager() {
  const { data: clients = [], isLoading } = useClients();
  const deleteClient = useDeleteClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || "").toLowerCase().includes(search.toLowerCase())
  );

  if (selectedClient) {
    return (
      <ClientDetail
        client={selectedClient}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clients & Brand Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Manage client brand memory, processes, and preferences that feed into future projects
          </p>
        </div>
        <Button onClick={() => setShowAddClient(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Client
        </Button>
      </div>

      {/* Search */}
      {clients.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="pl-9"
          />
        </div>
      )}

      {/* Client grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No clients yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Create your first client to start building brand intelligence that improves every project
            </p>
            <Button className="mt-4" onClick={() => setShowAddClient(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add first client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Card
              key={client.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => setSelectedClient(client)}
            >
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-lg font-bold shrink-0"
                      style={{ backgroundColor: client.primary_color || "hsl(var(--primary))" }}
                    >
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm leading-tight">{client.name}</h3>
                      {client.industry && (
                        <p className="text-xs text-muted-foreground">{client.industry}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7"
                      onClick={e => { e.stopPropagation(); setEditingClient(client); }}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
                          onClick={e => e.stopPropagation()}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete the client and all associated brand intelligence.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteClient.mutate(client.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {client.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{client.description}</p>
                )}

                {/* Color swatches */}
                {(client.primary_color || client.secondary_color) && (
                  <div className="flex gap-1.5 mb-3">
                    {client.primary_color && <div className="w-4 h-4 rounded-full border border-border/50" style={{ backgroundColor: client.primary_color }} title={client.primary_color} />}
                    {client.secondary_color && <div className="w-4 h-4 rounded-full border border-border/50" style={{ backgroundColor: client.secondary_color }} title={client.secondary_color} />}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Brain className="h-3 w-3" />
                    Brand intelligence
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit client dialog */}
      <Dialog open={showAddClient || !!editingClient} onOpenChange={(v) => { if (!v) { setShowAddClient(false); setEditingClient(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClient ? `Edit ${editingClient.name}` : "New Client"}</DialogTitle>
          </DialogHeader>
          <ClientForm
            client={editingClient ?? undefined}
            onClose={() => { setShowAddClient(false); setEditingClient(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
