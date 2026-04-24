// AddClientWizard
// ------------------------------------------------------------------------------------
// Two-step new-client flow:
//
//   Step 1: Basic info (name + website + industry). On "Create & deep dive", we save
//           the client immediately, then kick off the deep-dive-brand edge function
//           to scrape Firecrawl branding + key brand pages and ask Gemini 2.5 Pro to
//           extract a comprehensive brand profile (mission, vision, values, tone,
//           sentiment, audience, pillars, dos/don'ts, colors, typography, logo).
//
//   Step 2: Review & edit. Auto-extracted entries are shown as editable cards. The
//           user can edit any field, remove entries, swap the logo URL, tweak colors,
//           and click "Save & finish". Approved entries land in brand_intelligence,
//           the structured payload syncs into brand_guidelines, and primary/secondary
//           colors + logo_url update the client row.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Sparkles, Check, Trash2, Globe, ArrowRight, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useUpsertClient,
  useBatchCreateIntelligence,
  type Client,
  type BrandIntelligenceEntry,
} from "@/hooks/useClients";
import { useUpsertBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── TYPES ──────────────────────────────────────────────────────────────────

type DeepDiveEntry = {
  category: BrandIntelligenceEntry["category"];
  title: string;
  content: string;
  tags: string[];
};

type DeepDiveResult = {
  success: boolean;
  entries: DeepDiveEntry[];
  guidelines: any;
  logoUrl: string;
  colors: { primary: string; secondary: string };
  error?: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  visual_identity: "Visual",
  strategic_voice: "Voice",
  vendor_material: "Vendors",
  process_procedure: "Process",
  cost_benchmark: "Costs",
  past_learning: "Learnings",
};

// ─── COMPONENT ──────────────────────────────────────────────────────────────

export function AddClientWizard({ onClose }: { onClose: () => void }) {
  const upsertClient = useUpsertClient();
  const batchCreate = useBatchCreateIntelligence();
  const upsertGuidelines = useUpsertBrandGuidelines();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: "", industry: "", website: "" });

  const [client, setClient] = useState<Client | null>(null);
  const [diveLoading, setDiveLoading] = useState(false);
  const [diveError, setDiveError] = useState<string | null>(null);
  const [diveResult, setDiveResult] = useState<DeepDiveResult | null>(null);

  // Step-2 editable state
  const [entries, setEntries] = useState<DeepDiveEntry[]>([]);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── Step 1 → Step 2: create client + run deep dive ────────────────────────
  const handleCreateAndDive = async () => {
    if (!form.name.trim()) return;

    setDiveLoading(true);
    setDiveError(null);

    try {
      // 1) Create the client row first so we have a stable ID
      const created = await upsertClient.mutateAsync({
        name: form.name.trim(),
        industry: form.industry.trim() || null,
        website: form.website.trim() || null,
      } as any);
      const newClient = created as unknown as Client;
      setClient(newClient);

      // Move to step 2 immediately so the user sees progress
      setStep(2);

      // 2) Skip dive if no website
      if (!form.website.trim()) {
        setDiveLoading(false);
        return;
      }

      // 3) Call deep-dive-brand edge function
      const { data, error } = await supabase.functions.invoke("deep-dive-brand", {
        body: {
          url: form.website.trim(),
          clientName: form.name.trim(),
          industry: form.industry.trim(),
        },
      });

      if (error) throw error;
      const result = data as DeepDiveResult;
      if (!result.success) throw new Error(result.error || "Deep dive failed");

      setDiveResult(result);
      setEntries(result.entries || []);
      setLogoUrl(result.logoUrl || "");
      setPrimaryColor(result.colors?.primary || "");
      setSecondaryColor(result.colors?.secondary || "");
    } catch (e: any) {
      console.error("Deep dive error:", e);
      setDiveError(e.message || "Could not deep-dive this brand");
      toast({
        title: "Deep dive failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setDiveLoading(false);
    }
  };

  // ─── Step 2: persist edits ─────────────────────────────────────────────────
  const handleSaveAndFinish = async () => {
    if (!client) return;
    setSaving(true);
    try {
      // Update client with logo + colors if changed
      if (logoUrl || primaryColor || secondaryColor) {
        await upsertClient.mutateAsync({
          id: client.id,
          name: client.name,
          logo_url: logoUrl || null,
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
        } as any);
      }

      // Batch create the (edited, kept) intelligence entries
      if (entries.length > 0) {
        await batchCreate.mutateAsync(
          entries.map((e) => ({
            client_id: client.id,
            category: e.category,
            title: e.title,
            content: e.content,
            tags: e.tags,
            source: "ai_extracted" as const,
            source_project_id: null,
            is_approved: false,
            approved_at: null,
            confidence_score: 0.85,
          })),
        );
      }

      // Sync structured guidelines
      if (diveResult?.guidelines) {
        await upsertGuidelines.mutateAsync({
          clientId: client.id,
          ...diveResult.guidelines,
        });
      }

      toast({
        title: "Client created",
        description: entries.length > 0
          ? `${entries.length} brand intelligence entries added — review & approve in the client detail page.`
          : "You can add brand intelligence manually anytime.",
      });
      onClose();
    } catch (e: any) {
      toast({ title: "Error saving", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── STEP 1 RENDER ─────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground">
            We'll deep-dive the brand from their website — pulling logo, colors, fonts,
            mission, vision, values, tone of voice, and more. You'll review & edit
            everything before it's saved.
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Client name *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Samsung"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Industry</Label>
          <Input
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            placeholder="Consumer Electronics"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Input
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            placeholder="https://www.samsung.com"
          />
          <p className="text-xs text-muted-foreground">
            Optional, but required for the deep dive. You can add this later and re-run from the client page.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={diveLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreateAndDive} disabled={diveLoading || !form.name.trim()}>
            {diveLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Creating…
              </>
            ) : form.website.trim() ? (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Create & deep dive
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              "Create client"
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ─── STEP 2 RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-lg font-bold shrink-0"
          style={{ backgroundColor: primaryColor || "hsl(var(--primary))" }}
        >
          {(client?.name || "?").charAt(0)}
        </div>
        <div>
          <h3 className="font-semibold">{client?.name}</h3>
          {form.website && (
            <a href={form.website} target="_blank" rel="noopener" className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
              <Globe className="h-3 w-3" />
              {form.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>

      {/* Loading / error / results */}
      {diveLoading && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-8 text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium">Deep-diving the brand…</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Scraping the website, mapping About / Mission pages, and asking Gemini to
              extract a complete brand profile. This can take 20-40 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {diveError && !diveLoading && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-destructive">Couldn't auto-extract brand data</p>
            <p className="text-xs text-muted-foreground mt-1">{diveError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              You can still save the client and add brand intelligence manually from the client page.
            </p>
          </CardContent>
        </Card>
      )}

      {!diveLoading && diveResult && (
        <>
          {/* Brand assets — logo + colors */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">Brand assets</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs">Logo URL</Label>
                  <div className="flex gap-2 items-center">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="logo"
                        className="h-9 w-9 rounded border border-border object-contain bg-background"
                        onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.3")}
                      />
                    )}
                    <Input
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://.../logo.png"
                      className="flex-1 text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Primary color</Label>
                  <div className="flex gap-2">
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      placeholder="#000000"
                      className="text-xs font-mono"
                    />
                    {primaryColor && (
                      <div className="w-9 h-9 rounded-md border border-border shrink-0" style={{ backgroundColor: primaryColor }} />
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Secondary color</Label>
                  <div className="flex gap-2">
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      placeholder="#FFFFFF"
                      className="text-xs font-mono"
                    />
                    {secondaryColor && (
                      <div className="w-9 h-9 rounded-md border border-border shrink-0" style={{ backgroundColor: secondaryColor }} />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Extracted entries — editable */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">
                Extracted brand intelligence ({entries.length})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Edit, remove, or keep — all saved as pending review</p>
          </div>

          {entries.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No entries auto-extracted. Add intelligence manually from the client detail page.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <Card key={idx} className="group">
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="text-[10px] py-0 shrink-0">
                        {CATEGORY_LABEL[entry.category] || entry.category}
                      </Badge>
                      <Input
                        value={entry.title}
                        onChange={(e) => {
                          const next = [...entries];
                          next[idx] = { ...entry, title: e.target.value };
                          setEntries(next);
                        }}
                        className="flex-1 h-7 text-sm font-medium border-transparent hover:border-border focus:border-input -mt-1 -ml-1"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                        onClick={() => setEntries(entries.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Textarea
                      value={entry.content}
                      onChange={(e) => {
                        const next = [...entries];
                        next[idx] = { ...entry, content: e.target.value };
                        setEntries(next);
                      }}
                      rows={Math.min(6, Math.max(2, Math.ceil(entry.content.length / 80)))}
                      className="text-xs"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <DialogFooter className="sticky bottom-0 bg-background pt-3 border-t border-border">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Skip & finish
        </Button>
        <Button onClick={handleSaveAndFinish} disabled={saving || diveLoading}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          <Check className={cn("h-3.5 w-3.5 mr-1", saving && "hidden")} />
          Save & finish
        </Button>
      </DialogFooter>
    </div>
  );
}
