// /pricing?project=:id — bill-of-materials editor with live cost roll-up.
//
// Phase 1A scope:
//   - Add/edit/delete BOM line items (description, quantity, unit, category,
//     CSI division, manufacturer/model, quality tier, optional override price).
//   - Live priced view (price_plan RPC) showing best-available unit price,
//     source badge, freshness, total per line, currency.
//   - Roll-ups by CSI division and grand total.
//   - Region + quality-tier selectors at the top.
//
// Phase 1B will add: rate-card CSV import, "Estimate with AI" per item,
// snapshot/version history, export PDF.

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  Plus,
  Trash2,
  DollarSign,
  Sparkles,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  usePlanItems,
  useCreatePlanItem,
  useUpdatePlanItem,
  useDeletePlanItem,
  usePricedPlan,
  usePricingSummary,
  type PlanItem,
  type PricedItem,
} from "@/hooks/usePricing";
import { cn } from "@/lib/utils";

// ─── CSI MasterFormat short list (most common divisions) ───────────────────

const CSI_DIVISIONS = [
  { value: "01 - General Requirements", label: "01 — General Requirements" },
  { value: "02 - Existing Conditions",  label: "02 — Existing Conditions" },
  { value: "03 - Concrete",             label: "03 — Concrete" },
  { value: "04 - Masonry",              label: "04 — Masonry" },
  { value: "05 - Metals",               label: "05 — Metals" },
  { value: "06 - Wood & Plastics",      label: "06 — Wood & Plastics" },
  { value: "07 - Thermal & Moisture",   label: "07 — Thermal & Moisture" },
  { value: "08 - Openings",             label: "08 — Openings (Doors, Windows)" },
  { value: "09 - Finishes",             label: "09 — Finishes" },
  { value: "10 - Specialties",          label: "10 — Specialties" },
  { value: "11 - Equipment",            label: "11 — Equipment" },
  { value: "12 - Furnishings",          label: "12 — Furnishings" },
  { value: "21 - Fire Suppression",     label: "21 — Fire Suppression" },
  { value: "22 - Plumbing",             label: "22 — Plumbing" },
  { value: "23 - HVAC",                 label: "23 — HVAC" },
  { value: "26 - Electrical",           label: "26 — Electrical" },
  { value: "27 - Communications & A/V", label: "27 — Communications & A/V" },
  { value: "28 - Electronic Safety",    label: "28 — Electronic Safety / Security" },
  { value: "31 - Earthwork",            label: "31 — Earthwork" },
  { value: "32 - Exterior Improvements", label: "32 — Exterior / Landscape" },
  { value: "33 - Utilities",            label: "33 — Utilities" },
];

const CATEGORIES = [
  "structural",
  "envelope",
  "finish",
  "mechanical",
  "electrical",
  "plumbing",
  "av_equipment",
  "fixture",
  "appliance",
  "furniture",
  "labor",
  "site",
  "other",
];

const UNITS = ["each", "sqft", "sqm", "lf", "lm", "cy", "cm", "gallon", "lb", "kg", "hr", "day"];

// ─── Helpers ────────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<string, { label: string; tone: string }> = {
  override:              { label: "Override",          tone: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  agency_rate_card:      { label: "Rate card",         tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  agency_inventory:      { label: "Inventory",         tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  ai_estimate:           { label: "AI estimate",       tone: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  commodity_feed:        { label: "Commodity feed",    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  vendor_api:            { label: "Vendor API",        tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  rsmeans:               { label: "RSMeans",           tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  subcontractor_quote:   { label: "Sub quote",         tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  manual:                { label: "Manual",            tone: "bg-white/10 text-foreground/70 border-white/20" },
  no_quote:              { label: "Unpriced",          tone: "bg-red-500/15 text-red-300 border-red-500/30" },
};

function formatCurrency(amount: number | null, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [params] = useSearchParams();
  const projectId = params.get("project") || undefined;
  const { toast } = useToast();

  const [region, setRegion] = useState<string>("US");
  const [qualityTier, setQualityTier] = useState<"basic" | "standard" | "premium" | "custom">("standard");

  const { data: items = [], isLoading: itemsLoading } = usePlanItems(projectId);
  const { data: priced = [], isLoading: pricedLoading } = usePricedPlan(projectId, { region, quality_tier: qualityTier });
  const { data: summary = [] } = usePricingSummary(projectId, { region, quality_tier: qualityTier });

  const create = useCreatePlanItem();
  const update = useUpdatePlanItem();
  const del = useDeletePlanItem();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<PlanItem | null>(null);

  // Build a quick map for joining priced rows back to their plan item ids
  const pricedById = useMemo(() => {
    const map = new Map<string, PricedItem>();
    for (const p of priced) map.set(p.item_id, p);
    return map;
  }, [priced]);

  const grandTotal = useMemo(
    () => priced.reduce((sum, p) => sum + (p.total_price ?? 0), 0),
    [priced],
  );

  const unpricedCount = useMemo(
    () => priced.filter((p) => !p.is_priced).length,
    [priced],
  );

  // Group items by csi_division for display
  const grouped = useMemo(() => {
    const out: Record<string, PlanItem[]> = {};
    for (const item of items) {
      const key = item.csi_division ?? "Uncategorized";
      (out[key] ??= []).push(item);
    }
    return out;
  }, [items]);

  if (!projectId) {
    return (
      <AppLayout>
        <div className="container py-12">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No project selected. Open a project to manage its pricing.
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#F472B6]/20 border border-white/10 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-[#A78BFA]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pricing</h1>
              <p className="text-sm text-muted-foreground">
                Bill of materials with real-time pricing — agency rate cards, AI estimates,
                commodity feeds, and overrides.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={qualityTier} onValueChange={(v) => setQualityTier(v as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Region (ZIP/metro)"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-32"
            />
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add line item
            </Button>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Grand total" value={formatCurrency(grandTotal)} tone="violet" />
          <SummaryTile label="Line items" value={items.length.toString()} />
          <SummaryTile label="Priced" value={(priced.length - unpricedCount).toString()} tone="emerald" />
          <SummaryTile
            label="Unpriced"
            value={unpricedCount.toString()}
            tone={unpricedCount > 0 ? "amber" : undefined}
          />
        </div>

        {/* Line items grouped by CSI division */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line items</CardTitle>
            <CardDescription>
              Edit quantity inline. Click a row to override pricing or change details.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {itemsLoading || pricedLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground mb-4">No line items yet.</p>
                <Button variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first line item
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {Object.entries(grouped).map(([division, rows]) => {
                  const divisionTotal = rows.reduce((sum, r) => sum + (pricedById.get(r.id)?.total_price ?? 0), 0);
                  return (
                    <div key={division}>
                      {/* Division header */}
                      <div className="px-5 py-2 bg-white/[0.02] flex items-center justify-between">
                        <span className="text-xs uppercase tracking-widest text-foreground/55 font-medium">
                          {division}
                        </span>
                        <span className="text-sm font-semibold text-foreground/85">
                          {formatCurrency(divisionTotal)}
                        </span>
                      </div>
                      {rows.map((item) => {
                        const p = pricedById.get(item.id);
                        return (
                          <ItemRow
                            key={item.id}
                            item={item}
                            priced={p}
                            onEdit={() => setEditing(item)}
                            onDelete={async () => {
                              if (!confirm(`Delete "${item.description}"?`)) return;
                              try {
                                await del.mutateAsync({ id: item.id, project_id: projectId });
                                toast({ title: "Line item deleted" });
                              } catch (e) {
                                toast({
                                  title: "Delete failed",
                                  description: e instanceof Error ? e.message : String(e),
                                  variant: "destructive",
                                });
                              }
                            }}
                            onQuantityChange={async (q) => {
                              try {
                                await update.mutateAsync({
                                  id: item.id,
                                  project_id: projectId,
                                  updates: { quantity: q } as any,
                                });
                              } catch (e) {
                                toast({
                                  title: "Update failed",
                                  description: e instanceof Error ? e.message : String(e),
                                  variant: "destructive",
                                });
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}

                {/* Grand total footer */}
                <div className="px-5 py-4 bg-white/[0.04] flex items-center justify-between">
                  <span className="text-sm font-semibold">Grand total</span>
                  <span className="text-2xl font-bold canopy-text-gradient">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Roll-up by division (text summary) */}
        {summary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roll-up</CardTitle>
              <CardDescription>
                Summary by CSI division. Region: <span className="font-mono">{region}</span> · Quality:{" "}
                <span className="font-mono">{qualityTier}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs space-y-1.5 font-mono">
                {summary
                  .filter((r) => r.csi_division !== null)
                  .map((row, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                      <span className="text-foreground/75">
                        {row.csi_division}
                        {row.category && <span className="text-foreground/50"> · {row.category}</span>}
                      </span>
                      <span className="text-foreground/85 font-semibold">
                        {formatCurrency(row.subtotal)}
                        {row.unpriced_count > 0 && (
                          <span className="text-amber-400/80 ml-2">
                            ({row.unpriced_count} unpriced)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add / edit dialog */}
      <ItemDialog
        open={showAdd || editing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setShowAdd(false);
            setEditing(null);
          }
        }}
        existing={editing}
        onSubmit={async (input) => {
          try {
            if (editing) {
              await update.mutateAsync({
                id: editing.id,
                project_id: projectId,
                updates: input as any,
              });
              toast({ title: "Line item updated" });
            } else {
              await create.mutateAsync({
                project_id: projectId,
                ...input,
                item_key: input.item_key || slugify(input.description),
              } as any);
              toast({ title: "Line item added" });
            }
            setShowAdd(false);
            setEditing(null);
          } catch (e) {
            toast({
              title: "Save failed",
              description: e instanceof Error ? e.message : String(e),
              variant: "destructive",
            });
          }
        }}
      />
    </AppLayout>
  );
}

// ─── Item row ───────────────────────────────────────────────────────────────

function ItemRow({
  item,
  priced,
  onEdit,
  onDelete,
  onQuantityChange,
}: {
  item: PlanItem;
  priced?: PricedItem;
  onEdit: () => void;
  onDelete: () => void;
  onQuantityChange: (q: number) => void;
}) {
  const [editingQty, setEditingQty] = useState(false);
  const [qty, setQty] = useState(item.quantity.toString());
  const sourceConfig = SOURCE_BADGE[priced?.source ?? "no_quote"];

  const saveQty = () => {
    const n = parseFloat(qty);
    if (!isNaN(n) && n !== item.quantity) onQuantityChange(n);
    setEditingQty(false);
  };

  return (
    <div className="px-5 py-3 hover:bg-white/[0.015] transition-colors flex items-center gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{item.description}</span>
          {item.manufacturer && (
            <span className="text-xs text-foreground/50 font-mono">
              {item.manufacturer}
              {item.model_number && ` · ${item.model_number}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-foreground/55">
          {item.category && <span>{item.category}</span>}
          {item.category && <span>·</span>}
          <span className="font-mono">{item.item_key}</span>
        </div>
      </div>

      {/* Quantity */}
      <div className="w-32 text-right">
        {editingQty ? (
          <div className="flex items-center gap-1 justify-end">
            <Input
              type="number"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={saveQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveQty();
                if (e.key === "Escape") {
                  setQty(item.quantity.toString());
                  setEditingQty(false);
                }
              }}
              autoFocus
              className="h-7 w-20 text-right text-xs"
            />
            <span className="text-xs text-foreground/55">{item.unit}</span>
          </div>
        ) : (
          <button
            onClick={() => setEditingQty(true)}
            className="text-sm font-mono hover:text-[#A78BFA] transition-colors"
          >
            {Number(item.quantity).toLocaleString()} {item.unit}
          </button>
        )}
      </div>

      {/* Unit price */}
      <div className="w-28 text-right">
        <div className="text-sm font-mono">
          {priced?.unit_price !== undefined && priced.unit_price !== null
            ? formatCurrency(priced.unit_price)
            : "—"}
        </div>
        <div className="text-xs text-foreground/45">/ {item.unit}</div>
      </div>

      {/* Total */}
      <div className="w-32 text-right">
        <div className="text-sm font-semibold">
          {priced?.total_price !== undefined && priced.total_price !== null
            ? formatCurrency(priced.total_price)
            : "—"}
        </div>
        {priced?.regional_factor !== undefined && priced.regional_factor !== 1 && (
          <div className="text-[10px] text-foreground/45">×{priced.regional_factor.toFixed(2)} regional</div>
        )}
      </div>

      {/* Source badge */}
      <div className="w-28 flex justify-center">
        <Badge
          variant="outline"
          className={cn("text-[10px] gap-1 border", sourceConfig?.tone ?? SOURCE_BADGE.no_quote.tone)}
        >
          {priced?.source === "no_quote" ? (
            <AlertTriangle className="h-2.5 w-2.5" />
          ) : priced?.confidence === "high" ? (
            <CheckCircle2 className="h-2.5 w-2.5" />
          ) : priced?.fetched_at ? (
            <Clock className="h-2.5 w-2.5" />
          ) : (
            <DollarSign className="h-2.5 w-2.5" />
          )}
          {sourceConfig?.label ?? priced?.source ?? "—"}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-foreground/55 hover:text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ─── Add/edit dialog ────────────────────────────────────────────────────────

interface ItemFormInput {
  item_key: string;
  description: string;
  quantity: number;
  unit: string;
  category: string | null;
  csi_division: string | null;
  manufacturer: string | null;
  model_number: string | null;
  quality_tier: "basic" | "standard" | "premium" | "custom";
  override_unit_price: number | null;
  notes: string | null;
}

function ItemDialog({
  open,
  onOpenChange,
  existing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: PlanItem | null;
  onSubmit: (input: ItemFormInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ItemFormInput>(() => ({
    item_key: existing?.item_key ?? "",
    description: existing?.description ?? "",
    quantity: existing?.quantity ?? 1,
    unit: existing?.unit ?? "each",
    category: existing?.category ?? null,
    csi_division: existing?.csi_division ?? null,
    manufacturer: existing?.manufacturer ?? null,
    model_number: existing?.model_number ?? null,
    quality_tier: existing?.quality_tier ?? "standard",
    override_unit_price: existing?.override_unit_price ?? null,
    notes: existing?.notes ?? null,
  }));

  // Reset when an existing item changes (open with different row)
  useMemo(() => {
    if (existing) {
      setForm({
        item_key: existing.item_key,
        description: existing.description,
        quantity: existing.quantity,
        unit: existing.unit,
        category: existing.category,
        csi_division: existing.csi_division,
        manufacturer: existing.manufacturer,
        model_number: existing.model_number,
        quality_tier: existing.quality_tier,
        override_unit_price: existing.override_unit_price,
        notes: existing.notes,
      });
    } else {
      setForm({
        item_key: "",
        description: "",
        quantity: 1,
        unit: "each",
        category: null,
        csi_division: null,
        manufacturer: null,
        model_number: null,
        quality_tier: "standard",
        override_unit_price: null,
        notes: null,
      });
    }
  }, [existing?.id]);

  const isEdit = !!existing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit line item" : "New line item"}</DialogTitle>
          <DialogDescription>
            Add an item to the project's bill of materials. The pricing engine matches
            against your rate cards and external sources by item key.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="desc">Description *</Label>
              <Input
                id="desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="2×4 lumber, 8ft, pressure treated"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="csi">CSI division</Label>
              <Select
                value={form.csi_division ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, csi_division: v === "none" ? null : v }))}
              >
                <SelectTrigger id="csi">
                  <SelectValue placeholder="Pick a division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {CSI_DIVISIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat">Category</Label>
              <Select
                value={form.category ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v === "none" ? null : v }))}
              >
                <SelectTrigger id="cat">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mfr">Manufacturer</Label>
              <Input
                id="mfr"
                value={form.manufacturer ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value || null }))}
                placeholder="e.g. QSC, Crestron, Sherwin-Williams"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model number</Label>
              <Input
                id="model"
                value={form.model_number ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, model_number: e.target.value || null }))}
                placeholder="e.g. K12.2, SW7036"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quality">Quality tier</Label>
              <Select value={form.quality_tier} onValueChange={(v) => setForm((f) => ({ ...f, quality_tier: v as any }))}>
                <SelectTrigger id="quality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="override">Override unit price (optional)</Label>
              <Input
                id="override"
                type="number"
                step="0.01"
                value={form.override_unit_price ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    override_unit_price: e.target.value ? parseFloat(e.target.value) : null,
                  }))
                }
                placeholder="Leave blank to use looked-up price"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="key">Item key</Label>
              <Input
                id="key"
                value={form.item_key}
                onChange={(e) => setForm((f) => ({ ...f, item_key: e.target.value }))}
                placeholder="auto-generated from description if blank"
                className="font-mono text-xs"
              />
              <p className="text-xs text-foreground/45">
                Stable identifier used to match against pricing quotes. Use the same key
                across projects to share rate-card prices.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={!form.description.trim()}>
              <Save className="h-4 w-4 mr-2" />
              {isEdit ? "Save changes" : "Add line item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary tile ───────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "violet" | "emerald" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "text-foreground",
    violet:  "canopy-text-gradient",
    emerald: "text-emerald-400",
    amber:   "text-amber-300",
    red:     "text-red-300",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-widest text-foreground/55">{label}</div>
        <div className={cn("text-2xl font-semibold mt-1", toneClass)}>{value}</div>
      </CardContent>
    </Card>
  );
}
