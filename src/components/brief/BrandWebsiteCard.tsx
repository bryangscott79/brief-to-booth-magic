// BrandWebsiteCard
// ---------------------------------------------------------------------------
// A top-of-Upload-page card that captures the brand website URL up front and
// (when a client is already linked to the project) fires the deep-dive-brand
// extractor against that URL. When there's no client yet, the URL is still
// saved to projects.brand_website_url — the BrandGuidePrompt in the brief
// confirm step reads it and pre-fills so the user only ever types the URL once.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useBrandIntelligence,
  useBatchCreateIntelligence,
  useUpsertClient,
  type BrandIntelligenceEntry,
  type Client,
} from "@/hooks/useClients";
import { useUpsertBrandGuidelines } from "@/hooks/useBrandGuidelines";
import { useQueryClient } from "@tanstack/react-query";

interface BrandWebsiteCardProps {
  projectId: string;
  initialUrl?: string | null;
  client?: Client | null;
}

export function BrandWebsiteCard({ projectId, initialUrl, client }: BrandWebsiteCardProps) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: entries = [] } = useBrandIntelligence(client?.id);
  const batchCreate = useBatchCreateIntelligence();
  const upsertGuidelines = useUpsertBrandGuidelines();
  const upsertClient = useUpsertClient();

  useEffect(() => {
    setUrl(initialUrl ?? "");
  }, [initialUrl]);

  const persistUrl = async (value: string) => {
    setSaving(true);
    try {
      await supabase
        .from("projects")
        .update({ brand_website_url: value.trim() || null } as any)
        .eq("id", projectId);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!url.trim()) return;
    await persistUrl(url);

    if (!client) {
      toast({
        title: "URL saved",
        description:
          "We'll extract brand data automatically after you upload your brief and confirm the client.",
      });
      return;
    }

    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("deep-dive-brand", {
        body: {
          url: url.trim(),
          clientName: client.name,
          industry: client.industry ?? "",
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Extraction failed");

      // Dedupe against existing entries (category::title)
      const existingByKey = new Map<string, BrandIntelligenceEntry>();
      for (const e of entries) existingByKey.set(`${e.category}::${e.title}`, e);
      const toCreate = (data.entries || []).filter(
        (e: any) => !existingByKey.has(`${e.category}::${e.title}`),
      );
      if (toCreate.length > 0) {
        await batchCreate.mutateAsync(
          toCreate.map((e: any) => ({
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

      if (data.guidelines) {
        try {
          await upsertGuidelines.mutateAsync({ clientId: client.id, ...data.guidelines });
        } catch {
          /* non-fatal */
        }
      }

      const patch: any = { id: client.id, name: client.name };
      if (data.logoUrl && !client.logo_url) patch.logo_url = data.logoUrl;
      if (data.colors?.primary && !client.primary_color) patch.primary_color = data.colors.primary;
      if (data.colors?.secondary && !client.secondary_color)
        patch.secondary_color = data.colors.secondary;
      if (!client.website) patch.website = url.trim();
      if (Object.keys(patch).length > 2) await upsertClient.mutateAsync(patch);

      toast({
        title: `Brand extracted for ${client.name}`,
        description:
          toCreate.length > 0
            ? `${toCreate.length} new brand ${toCreate.length === 1 ? "entry" : "entries"} added.`
            : "Nothing new to add — brand is already loaded.",
      });
    } catch (e: any) {
      toast({
        title: "Extraction failed",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Globe className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Brand website</p>
            {savedTick && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                <Check className="h-3 w-3" /> saved
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste the brand's URL — we'll scrape colors, logo, fonts, tone, and messaging so
            every downstream render, prompt, and export locks to the real brand.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[220px] space-y-1">
          <Label className="text-xs">Website URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if ((url.trim() || "") !== (initialUrl ?? "")) persistUrl(url);
            }}
            placeholder="https://www.brand.com"
            disabled={extracting}
            className="h-9"
          />
        </div>
        <Button
          onClick={handleExtract}
          disabled={extracting || saving || !url.trim()}
          size="sm"
          variant="generative"
        >
          {extracting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Extracting…
            </>
          ) : (
            <>
              <span className="mr-1.5" aria-hidden="true">✦</span>
              {client ? "Extract now" : "Save URL"}
            </>
          )}
        </Button>
      </div>

      {!client && url.trim() && (
        <p className="text-[11px] text-muted-foreground">
          No client linked yet — the URL is saved and extraction will run against the client
          after you upload and confirm your brief.
        </p>
      )}
    </div>
  );
}
