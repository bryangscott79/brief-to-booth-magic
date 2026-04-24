// BrandIntelligencePanel
// ---------------------------------------------------------------------------
// Rich brand profile view for an existing client. Surfaces everything captured
// by the deep-dive (mission/vision/values/tone/voice/colors/typography/logo)
// AND lets the user re-run the deep dive at any time to refresh from the web.
//
// Intelligence entries are stored in `brand_intelligence` (RAG) and the
// structured payload mirrors into `brand_guidelines`. The same flow as the
// AddClientWizard, but operating on an existing client.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Brain,
  Palette,
  Type,
  Image as ImageIcon,
  Check,
  X,
  Trash2,
} from "lucide-react";
import {
  useBrandIntelligence,
  useUpsertClient,
  useBatchCreateIntelligence,
  useApproveBrandIntelligence,
  useDeleteBrandIntelligence,
  type Client,
  type BrandIntelligenceEntry,
} from "@/hooks/useClients";
import { useUpsertBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Brain; description: string }
> = {
  strategic_voice: {
    label: "Strategy & Voice",
    icon: Brain,
    description: "Mission, vision, values, tone, audience, messaging",
  },
  visual_identity: {
    label: "Visual Identity",
    icon: Palette,
    description: "Colors, typography, logo, photography",
  },
  process_procedure: {
    label: "Brand Rules",
    icon: Check,
    description: "Do's and don'ts",
  },
  past_learning: {
    label: "Past Learnings",
    icon: Sparkles,
    description: "Insights captured from previous projects",
  },
  vendor_material: {
    label: "Vendors & Materials",
    icon: Type,
    description: "Preferred vendors and finishes",
  },
  cost_benchmark: {
    label: "Cost Benchmarks",
    icon: Type,
    description: "Past pricing references",
  },
};

export function BrandIntelligencePanel({ client }: { client: Client }) {
  const { toast } = useToast();
  const upsertClient = useUpsertClient();
  const batchCreate = useBatchCreateIntelligence();
  const upsertGuidelines = useUpsertBrandGuidelines();
  const approve = useApproveBrandIntelligence();
  const remove = useDeleteBrandIntelligence();
  const { data: entries = [], isLoading } = useBrandIntelligence(client.id);

  const [diving, setDiving] = useState(false);
  const [website, setWebsite] = useState(client.website ?? "");

  const handleDeepDive = async () => {
    const url = website.trim();
    if (!url) {
      toast({
        title: "Website required",
        description: "Add a website URL so we can scrape brand info.",
        variant: "destructive",
      });
      return;
    }

    setDiving(true);
    try {
      // Persist the website on the client if it changed
      if (url !== (client.website ?? "")) {
        await upsertClient.mutateAsync({
          id: client.id,
          name: client.name,
          website: url,
        } as any);
      }

      const { data, error } = await supabase.functions.invoke("deep-dive-brand", {
        body: {
          url,
          clientName: client.name,
          industry: client.industry ?? "",
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Deep dive failed");

      // Persist new intelligence as pending review
      if (data.entries?.length) {
        await batchCreate.mutateAsync(
          data.entries.map((e: any) => ({
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

      // Mirror structured guidelines + colors/logo onto the client
      if (data.guidelines) {
        await upsertGuidelines.mutateAsync({
          clientId: client.id,
          ...data.guidelines,
        });
      }

      const patch: any = { id: client.id, name: client.name };
      if (data.logoUrl && !client.logo_url) patch.logo_url = data.logoUrl;
      if (data.colors?.primary && !client.primary_color) patch.primary_color = data.colors.primary;
      if (data.colors?.secondary && !client.secondary_color) patch.secondary_color = data.colors.secondary;
      if (Object.keys(patch).length > 2) {
        await upsertClient.mutateAsync(patch);
      }

      toast({
        title: "Deep dive complete",
        description: `${data.entries?.length ?? 0} new insights added — review and approve below.`,
      });
    } catch (e: any) {
      toast({
        title: "Deep dive failed",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setDiving(false);
    }
  };

  // Group entries by category
  const grouped = entries.reduce<Record<string, BrandIntelligenceEntry[]>>((acc, e) => {
    const cat = e.category || "strategic_voice";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Deep dive control */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Brand auto-discovery
              </CardTitle>
              <CardDescription className="mt-1">
                Scrape the brand's website to pull mission, vision, values, tone of voice, colors,
                fonts, logo, and more. Re-run anytime to refresh.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <Label className="text-xs">Website</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.brand.com"
                disabled={diving}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleDeepDive} disabled={diving || !website.trim()}>
                {diving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Diving…
                  </>
                ) : entries.length > 0 ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Re-run deep dive
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Run deep dive
                  </>
                )}
              </Button>
            </div>
          </div>
          {diving && (
            <p className="text-xs text-muted-foreground">
              Scraping website, mapping About / Mission pages, extracting brand profile. 20–40s.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Brand assets summary (colors + logo) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Brand assets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            {client.logo_url ? (
              <div className="flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <img
                  src={client.logo_url}
                  alt="logo"
                  className="h-10 max-w-[120px] object-contain rounded border border-border bg-background p-1"
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No logo detected</span>
            )}

            <div className="flex items-center gap-3">
              {client.primary_color && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-7 h-7 rounded-md border border-border"
                    style={{ backgroundColor: client.primary_color }}
                  />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Primary</p>
                    <p className="text-xs font-mono">{client.primary_color}</p>
                  </div>
                </div>
              )}
              {client.secondary_color && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-7 h-7 rounded-md border border-border"
                    style={{ backgroundColor: client.secondary_color }}
                  />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Secondary</p>
                    <p className="text-xs font-mono">{client.secondary_color}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Intelligence entries */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Brain className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No brand intelligence yet. Run a deep dive above to auto-populate from the web,
              or upload brand documents in the Knowledge tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => {
            const meta = CATEGORY_META[category] || {
              label: category,
              icon: Brain,
              description: "",
            };
            const Icon = meta.icon;
            return (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    {meta.label}
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {items.length}
                    </Badge>
                  </CardTitle>
                  {meta.description && (
                    <CardDescription>{meta.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-border bg-muted/20 p-3 group"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate">{entry.title}</p>
                          {entry.is_approved ? (
                            <Badge variant="default" className="text-[9px] py-0 h-4">
                              <Check className="h-2.5 w-2.5 mr-0.5" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 h-4">
                              Pending
                            </Badge>
                          )}
                          {entry.source === "past_project" && entry.source_project_id && (
                            <Badge variant="secondary" className="text-[9px] py-0 h-4">
                              From past project
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!entry.is_approved && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => approve.mutate(entry.id)}
                              title="Approve"
                            >
                              <Check className="h-3 w-3 text-primary" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => remove.mutate(entry.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {entry.content}
                      </p>
                      {entry.tags && entry.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {entry.tags.map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px] py-0 h-4">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
