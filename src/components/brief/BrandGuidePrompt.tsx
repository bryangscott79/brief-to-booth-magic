// BrandGuidePrompt — inline "add brand guidelines" CTA that appears in
// the BriefUpload confirm step whenever the matched client's brand
// intelligence is thin.
//
// Why: new projects under existing clients used to skip the brand-guide
// upload entirely (the AddClientWizard is the only flow that prompts
// for it, and that only fires on FIRST client creation). Result: every
// new project for an established client inherited whatever brand intel
// the client had — empty in most cases — and renders went generic.
//
// This component reuses the same deep-dive-brand edge function as
// BrandIntelligencePanel + AddClientWizard. URL mode, PDF inline,
// PDF storage, PDF page-rasterised — all four paths are supported so
// the user never has to think about file size.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Loader2,
  Globe,
  FileText,
  Upload,
  Check,
  X as XIcon,
  Brain,
} from "lucide-react";
import {
  useBrandIntelligence,
  useUpsertClient,
  useBatchCreateIntelligence,
  type Client,
  type BrandIntelligenceEntry,
} from "@/hooks/useClients";
import { useUpsertBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { renderPdfToImages } from "@/lib/pdfPageRenderer";
import { cn } from "@/lib/utils";

export interface BrandGuidePromptProps {
  /** Client whose brand intel we're checking. */
  client: Client;
  /**
   * Threshold below which the prompt shows. Default 4 — enough to
   * cover the "I just need mission + colors + voice + photography"
   * minimum bar. Above this, the client has working brand intel and
   * we don't pester the user.
   */
  threshold?: number;
  /**
   * Called after a successful deep-dive so the parent can refetch
   * or hide the prompt. Default behaviour is to hide on success.
   */
  onComplete?: () => void;
  /** Dismiss button is hidden when false (used in compulsory flows). */
  dismissible?: boolean;
  /**
   * Pre-fill the website input from the project-level brand URL
   * captured on the Upload page. Wins over `client.website`.
   */
  defaultWebsite?: string | null;
  className?: string;
}

export function BrandGuidePrompt({
  client,
  threshold = 4,
  onComplete,
  dismissible = true,
  defaultWebsite,
  className,
}: BrandGuidePromptProps) {
  const { toast } = useToast();
  const { data: entries = [] } = useBrandIntelligence(client.id);
  const batchCreate = useBatchCreateIntelligence();
  const upsertGuidelines = useUpsertBrandGuidelines();
  const upsertClient = useUpsertClient();

  const [dismissed, setDismissed] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const initialWebsite = (defaultWebsite ?? client.website ?? "").trim();
  const [mode, setMode] = useState<"url" | "pdf">(initialWebsite ? "url" : "pdf");
  const [website, setWebsite] = useState(initialWebsite);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [renderProgress, setRenderProgress] = useState("");


  const isBrandReady = entries.length >= threshold;

  // Dismissed by the user → stay hidden for the session.
  if (dismissed) return null;
  // Brand is healthy → show the compact "ready" chip rather than the
  // full prompt. Keeps the affordance visible so the user can refresh
  // on demand (per the project-onboarding requirement) without nagging.
  if (isBrandReady && !forceExpanded) {
    const colorCount =
      (client.primary_color ? 1 : 0) + (client.secondary_color ? 1 : 0);
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs",
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-5 w-5 rounded bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Check className="h-3 w-3 text-emerald-600" />
          </div>
          <span className="text-foreground/90 truncate">
            Brand for <span className="font-medium">{client.name}</span> is set
            {colorCount > 0 ? ` · ${colorCount} color${colorCount === 1 ? "" : "s"}` : ""}
            {` · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setForceExpanded(true)}
          className="text-emerald-700 hover:text-emerald-800 hover:underline underline-offset-2 whitespace-nowrap"
        >
          Refresh from PDF
        </button>
      </div>
    );
  }

  /**
   * Shared persistence: writes entries with dedupe-by-(category,title)
   * so re-running on the same client tops up the catalog instead of
   * duplicating. The brand_guidelines upsert is wrapped in try/catch
   * because that table is supplementary; if its schema cache lags a
   * migration we still want the primary intel rows to land.
   */
  const persist = async (data: any) => {
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    if (Array.isArray(data.entries)) {
      const existingByKey = new Map<string, BrandIntelligenceEntry>();
      for (const e of entries) existingByKey.set(`${e.category}::${e.title}`, e);
      const toCreate: any[] = [];
      const toUpdate: Array<{ id: string; content: string; tags: string[] }> = [];
      for (const inc of data.entries) {
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
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("brand_intelligence")
          .update({
            content: u.content,
            tags: u.tags,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", u.id);
        if (!error) updatedCount++;
      }
    }
    if (data.guidelines) {
      try {
        await upsertGuidelines.mutateAsync({
          clientId: client.id,
          ...data.guidelines,
        });
      } catch (err) {
        console.warn(
          "[brand-guide] guidelines upsert failed (non-fatal):",
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

  const surfaceError = (err: any): string => {
    let detail = err?.message ?? String(err);
    try {
      const ctx: any = err?.context;
      if (ctx?.body) {
        const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
        if (parsed?.error) detail = parsed.error;
      }
    } catch {
      // fall through
    }
    return detail;
  };

  const handleRun = async () => {
    setRunning(true);
    setRenderProgress("");
    try {
      let body: Record<string, any>;
      if (mode === "url") {
        const url = website.trim();
        if (!url) throw new Error("Enter a website URL or switch to PDF.");
        if (url !== (client.website ?? "")) {
          await upsertClient.mutateAsync({
            id: client.id,
            name: client.name,
            website: url,
          } as any);
        }
        body = { url, clientName: client.name, industry: client.industry ?? "" };
      } else {
        if (!pdfFile) throw new Error("Choose a brand-book PDF.");
        const INLINE_MAX = 2 * 1024 * 1024;
        const STORAGE_MAX = 6 * 1024 * 1024;
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
          setRenderProgress("Rendering PDF pages…");
          const { pages, totalPages } = await renderPdfToImages(pdfFile, {
            maxWidth: 1500,
            quality: 0.72,
            maxPages: 40,
            onProgress: (i, total) =>
              setRenderProgress(`Rendered page ${i} of ${total}…`),
          });
          if (pages.length === 0) throw new Error("Could not render any pages.");
          if (pages.length < totalPages) {
            toast({
              title: "PDF truncated",
              description: `Sent ${pages.length} of ${totalPages} pages.`,
            });
          }
          body = {
            pageImages: pages.map((p) => p.jpegBase64),
            clientName: client.name,
            industry: client.industry ?? "",
          };
          setRenderProgress("");
        }
      }
      const { data, error } = await supabase.functions.invoke("deep-dive-brand", {
        body,
      });
      if (error) throw new Error(surfaceError(error));
      if (!data?.success) throw new Error(data?.error || "Deep dive failed");
      const summary = await persist(data);
      const parts: string[] = [];
      if (summary.createdCount > 0) parts.push(`${summary.createdCount} added`);
      if (summary.updatedCount > 0) parts.push(`${summary.updatedCount} updated`);
      if (summary.skippedCount > 0) parts.push(`${summary.skippedCount} unchanged`);
      toast({
        title: `Brand guide updated for ${client.name}`,
        description:
          parts.length > 0
            ? parts.join(" · ")
            : "No new data extracted — the source may be missing brand details.",
      });
      onComplete?.();
      setDismissed(true);
    } catch (e: any) {
      toast({
        title: "Couldn't extract brand details",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setRenderProgress("");
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">
              Brand guide for {client.name} is thin
            </p>
            <Badge variant="outline" className="text-[10px]">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add the brand's website or upload their brand book — Gemini pulls colors, fonts,
            voice, photography rules, and dos & don'ts. Every render in this project will use it.
          </p>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Dismiss"
            title="Add later from the client page"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mode toggle — same UX as the BrandIntelligencePanel */}
      <div className="inline-flex rounded-md border border-border bg-background p-0.5">
        <button
          type="button"
          onClick={() => setMode("url")}
          disabled={running}
          className={cn(
            "h-7 px-3 rounded text-xs flex items-center gap-1.5 transition-colors",
            mode === "url"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="h-3.5 w-3.5" />
          Website
        </button>
        <button
          type="button"
          onClick={() => setMode("pdf")}
          disabled={running}
          className={cn(
            "h-7 px-3 rounded text-xs flex items-center gap-1.5 transition-colors",
            mode === "pdf"
              ? "bg-muted text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Brand book PDF
        </button>
      </div>

      {mode === "url" ? (
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[220px] space-y-1">
            <Label className="text-xs">Website</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.brand.com"
              disabled={running}
              className="h-9"
            />
          </div>
          <Button onClick={handleRun} disabled={running || !website.trim()} size="sm">
            {running ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Running…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Extract</>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs">Brand book PDF</Label>
          <div className="flex gap-2 flex-wrap items-end">
            <label
              className={cn(
                "flex-1 min-w-[220px] flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors",
                running && "opacity-50 pointer-events-none",
              )}
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                {pdfFile ? pdfFile.name : "Choose a PDF (any size, up to 40 pages)…"}
              </span>
              {pdfFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPdfFile(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={running}
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button onClick={handleRun} disabled={running || !pdfFile} size="sm">
              {running ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Extracting…</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Extract</>
              )}
            </Button>
          </div>
        </div>
      )}

      {running && (
        <p className="text-[11px] text-muted-foreground">
          {renderProgress
            ? renderProgress
            : mode === "url"
            ? "Scraping the site and extracting brand profile…"
            : "Reading every page of the PDF and extracting brand profile…"}
        </p>
      )}
      {!running && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Check className="h-3 w-3 text-emerald-500" />
          Results land in {client.name}'s brand intelligence — review &amp; approve there.
        </p>
      )}
    </div>
  );
}
