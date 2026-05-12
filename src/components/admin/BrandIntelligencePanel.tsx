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
  Trash2,
  FileText,
  Upload,
  Globe,
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
import { renderPdfToImages } from "@/lib/pdfPageRenderer";

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
  const [mode, setMode] = useState<"url" | "pdf">("url");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  /**
   * Shared post-processing: takes the deep-dive response (URL or PDF
   * mode — both shapes are identical) and persists everything back
   * to brand_intelligence + brand_guidelines + the client row.
   *
   * Dedupe rules:
   *   • Match existing entries by (category, title) — that's how deep-
   *     dive names its outputs (e.g. "Mission", "Brand Colors").
   *   • Identical content + same approval state → skip silently.
   *   • New content with the same title → UPDATE the existing entry
   *     (keeps the user's approval state intact; they review the
   *     freshened content).
   *   • Brand-new (title, category) → INSERT.
   *
   * The brand_guidelines upsert is non-fatal — that table is a
   * structured projection of brand_intelligence and the schema cache
   * sometimes lags a migration. We log + continue rather than blowing
   * up the whole flow when it errors.
   */
  const persistDeepDiveResult = async (data: any) => {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    if (data.entries?.length) {
      const incoming = data.entries as Array<{
        category: string;
        title: string;
        content: string;
        tags: string[];
      }>;
      // Index existing entries by category+title for O(1) dedupe.
      const existingByKey = new Map<string, BrandIntelligenceEntry>();
      for (const e of entries) {
        existingByKey.set(`${e.category}::${e.title}`, e);
      }

      const toCreate: typeof incoming = [];
      const toUpdate: Array<{ id: string; content: string; tags: string[] }> = [];
      for (const inc of incoming) {
        const key = `${inc.category}::${inc.title}`;
        const existing = existingByKey.get(key);
        if (!existing) {
          toCreate.push(inc);
        } else if (
          existing.content.trim() === inc.content.trim() &&
          JSON.stringify(existing.tags ?? []) === JSON.stringify(inc.tags ?? [])
        ) {
          skippedCount++;
        } else {
          toUpdate.push({ id: existing.id, content: inc.content, tags: inc.tags });
        }
      }

      if (toCreate.length > 0) {
        await batchCreate.mutateAsync(
          toCreate.map((e) => ({
            client_id: client.id,
            category: e.category as BrandIntelligenceEntry["category"],
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
        createdCount = toCreate.length;
      }

      if (toUpdate.length > 0) {
        // Update existing rows individually — Supabase doesn't expose a
        // bulk upsert by (client_id, category, title) without a unique
        // constraint, and we don't want to add one because user-edited
        // entries may legitimately share a title.
        for (const u of toUpdate) {
          const { error } = await supabase
            .from("brand_intelligence")
            .update({ content: u.content, tags: u.tags, updated_at: new Date().toISOString() } as any)
            .eq("id", u.id);
          if (error) {
            console.warn(`[deep-dive] Failed to update entry ${u.id}:`, error.message);
          } else {
            updatedCount++;
          }
        }
      }
    }

    if (data.guidelines) {
      try {
        await upsertGuidelines.mutateAsync({
          clientId: client.id,
          ...data.guidelines,
        });
      } catch (err) {
        // brand_guidelines is supplementary structured data — the
        // primary store is brand_intelligence. If the schema cache
        // hasn't caught up to a migration or the table is missing,
        // log + continue rather than failing the whole deep dive.
        console.warn(
          "[deep-dive] brand_guidelines upsert failed (non-fatal):",
          (err as any)?.message ?? err,
        );
      }
    }

    const patch: any = { id: client.id, name: client.name };
    if (data.logoUrl && !client.logo_url) patch.logo_url = data.logoUrl;
    if (data.colors?.primary && !client.primary_color) patch.primary_color = data.colors.primary;
    if (data.colors?.secondary && !client.secondary_color) patch.secondary_color = data.colors.secondary;
    if (Object.keys(patch).length > 2) {
      await upsertClient.mutateAsync(patch);
    }

    return { createdCount, updatedCount, skippedCount };
  };

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

      const summary = await persistDeepDiveResult(data);

      toast({
        title: "Deep dive complete",
        description: dedupSummary(summary),
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

  /**
   * Tracks pdfjs page-rendering progress so we can show the user
   * something useful during the 2-6s rasterise phase on large PDFs.
   */
  const [renderProgress, setRenderProgress] = useState<string>("");

  /**
   * PDF deep dive — three paths depending on file size:
   *
   *   ≤ 2 MB:   send the raw PDF inline as base64 (fastest, no
   *             rendering step, exactly how the original flow worked).
   *
   *   2-6 MB:   upload raw PDF to Supabase Storage, function downloads
   *             server-side. Bypasses the request body cap, edge
   *             worker memory still handles it.
   *
   *   > 6 MB:   client-side pdfjs renders each page to a JPEG at
   *             ~1500px wide. Total payload after rasterisation is
   *             typically 3-6MB even for 30+ MB brand books. Gemini
   *             reads multi-image inputs page-by-page. This is how
   *             arbitrarily-large brand books actually go through.
   */
  const handlePdfDeepDive = async () => {
    if (!pdfFile) {
      toast({
        title: "PDF required",
        description: "Choose a brand book or guideline PDF first.",
        variant: "destructive",
      });
      return;
    }
    setDiving(true);
    setRenderProgress("");
    try {
      const INLINE_MAX = 2 * 1024 * 1024;
      const STORAGE_MAX = 6 * 1024 * 1024;
      let body: Record<string, any>;

      if (pdfFile.size <= INLINE_MAX) {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(",");
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(pdfFile);
        });
        body = {
          fileBase64,
          fileType: "pdf",
          clientName: client.name,
          industry: client.industry ?? "",
        };
      } else if (pdfFile.size <= STORAGE_MAX) {
        const storageBucket = "knowledge-base";
        const storagePath = `clients/${client.id}/brand-pdf/${Date.now()}_${pdfFile.name}`;
        const { error: upErr } = await supabase.storage
          .from(storageBucket)
          .upload(storagePath, pdfFile, { upsert: false, contentType: "application/pdf" });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
        body = {
          storageBucket,
          storagePath,
          clientName: client.name,
          industry: client.industry ?? "",
        };
      } else {
        // Large brand book — rasterise client-side and send pages.
        setRenderProgress("Rendering PDF pages…");
        const { pages, totalPages } = await renderPdfToImages(pdfFile, {
          maxWidth: 1500,
          quality: 0.72,
          maxPages: 40,
          onProgress: (i, total) =>
            setRenderProgress(`Rendered page ${i} of ${total}…`),
        });
        if (pages.length === 0) {
          throw new Error("Could not render any pages from this PDF.");
        }
        if (pages.length < totalPages) {
          toast({
            title: "PDF truncated",
            description: `Sent the first ${pages.length} of ${totalPages} pages. Anything past page ${pages.length} won't be analysed.`,
          });
        }
        body = {
          pageImages: pages.map((p) => p.jpegBase64),
          clientName: client.name,
          industry: client.industry ?? "",
        };
        setRenderProgress("");
      }

      const { data, error } = await supabase.functions.invoke("deep-dive-brand", {
        body,
      });
      // Surface the actual error message when the function returned a
      // non-2xx — supabase-js's default error is just "non-2xx status
      // code", which doesn't help diagnosis.
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) detail = parsed.error;
          }
        } catch {
          // ignore — fall back to default error.message
        }
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.error || "PDF deep dive failed");

      const summary = await persistDeepDiveResult(data);

      toast({
        title: `Processed "${pdfFile.name}"`,
        description: dedupSummary(summary),
      });
      setPdfFile(null);
    } catch (e: any) {
      toast({
        title: "PDF deep dive failed",
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
      {/* Deep dive control — supports BOTH a website URL (Firecrawl
          scrape) and a brand-book PDF upload (Gemini multimodal). Both
          paths produce the same brand_intelligence + brand_guidelines
          output, so users can mix and match — e.g. run the URL dive
          first, then layer in a PDF guideline for richer specs. */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Brand auto-discovery
              </CardTitle>
              <CardDescription className="mt-1">
                Pull mission, vision, values, tone of voice, colors, fonts, logo, and brand rules
                — from a website OR an uploaded brand book / guideline PDF. Re-run anytime to
                refresh or layer in more sources.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Mode toggle */}
          <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setMode("url")}
              disabled={diving}
              className={`h-7 px-3 rounded text-xs flex items-center gap-1.5 transition-colors ${
                mode === "url"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Website
            </button>
            <button
              type="button"
              onClick={() => setMode("pdf")}
              disabled={diving}
              className={`h-7 px-3 rounded text-xs flex items-center gap-1.5 transition-colors ${
                mode === "pdf"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Brand book PDF
            </button>
          </div>

          {mode === "url" ? (
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
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Brand book / guideline PDF</Label>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <label
                    className={`flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors ${
                      diving ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">
                      {pdfFile ? pdfFile.name : "Choose a PDF…"}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={diving}
                      onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <div className="flex items-end">
                  <Button onClick={handlePdfDeepDive} disabled={diving || !pdfFile}>
                    {diving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Extract from PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Drop in a brand book, identity guide, or visual-language doc — any size up to 40
                pages. Gemini reads colors, type rules, dos & don'ts, photography guidelines, and
                stores each finding as a reviewable brand-intelligence entry below. Large PDFs are
                rasterised page-by-page in your browser before extraction.
              </p>
            </div>
          )}
          {diving && (
            <p className="text-xs text-muted-foreground">
              {mode === "url"
                ? "Scraping website, mapping About / Mission pages, extracting brand profile. 20–40s."
                : renderProgress
                ? renderProgress
                : "Reading every page of the PDF, extracting colors, typography, voice, photography rules. 20–40s."}
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
                          {entry.source_project_id && (
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
                              onClick={() => approve.mutate({ id: entry.id, clientId: client.id })}
                              title="Approve"
                            >
                              <Check className="h-3 w-3 text-primary" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => remove.mutate({ id: entry.id, clientId: client.id })}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {/* Visual color swatches for the "Brand Colors" entry.
                          Without these the brand-color list reads as a wall
                          of hex strings; with them, the user instantly sees
                          the palette. Hex extraction matches both styles
                          deep-dive emits — "#FF5000 — Name (Usage)" and
                          bare "#FF5000" lines. */}
                      {category === "visual_identity" &&
                        entry.title === "Brand Colors" && (
                          <ColorSwatchRow content={entry.content} />
                        )}
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

// ─── dedupSummary ─────────────────────────────────────────────────────────
// Builds the toast description from the persistDeepDiveResult counts so
// re-runs report "3 added · 2 updated · 4 unchanged" instead of "9 new
// insights added" (which was the lie that caused the duplicate-entries
// bug).

function dedupSummary({
  createdCount,
  updatedCount,
  skippedCount,
}: {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}): string {
  const parts: string[] = [];
  if (createdCount > 0) parts.push(`${createdCount} added`);
  if (updatedCount > 0) parts.push(`${updatedCount} updated`);
  if (skippedCount > 0) parts.push(`${skippedCount} unchanged`);
  if (parts.length === 0) return "No changes — re-run produced the same data.";
  return parts.join(" · ") + ". Review pending entries below.";
}

// ─── ColorSwatchRow ───────────────────────────────────────────────────────
// Parses hex codes out of the "Brand Colors" entry's freeform text and
// renders a row of color squares. Each swatch shows the hex underneath so
// the visual reads as both palette + reference card. Greedy hex match
// (#abc or #abcdef) deduped in order so repeated mentions don't double up.

function ColorSwatchRow({ content }: { content: string }) {
  // Match #FFF, #FFFF, #FFFFFF, #FFFFFFFF (3/4/6/8-digit). Brand books
  // typically use 6-digit but we accept the rest too. Case-insensitive.
  const matches = content.match(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi) ?? [];
  if (matches.length === 0) return null;
  const seen = new Set<string>();
  const hexes: string[] = [];
  for (const m of matches) {
    const key = m.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      hexes.push(m);
    }
  }
  return (
    <div className="flex flex-wrap gap-2 mb-2 mt-0.5">
      {hexes.map((hex) => (
        <div key={hex} className="flex flex-col items-center gap-0.5">
          <div
            className="w-9 h-9 rounded-md border border-border shadow-sm"
            style={{ backgroundColor: hex }}
            title={hex}
          />
          <span className="text-[9px] font-mono text-muted-foreground">{hex.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}
