// PlatformImageModelManager — super-admin-only panel showing every agency
// and which image-generation model their renders are routed through.
//
// This is the ONLY place in the product where the underlying model
// providers are revealed. Regular users see abstract quality tiers in
// the registry (Signature / Studio / Draft / Typographic); super admins
// see the registered tier + the underlying provider id so they can
// reason about cost, latency, and capability tradeoffs across the fleet.
//
// Storage: each agency's preference lives on `agencies.image_model`
// (a text column, default "google/gemini-3-pro-image-preview" set at
// migration time). Updating the column flips every render call from
// that agency to the new provider on next dispatch — no edge-function
// redeploy needed.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Sparkles, AlertCircle } from "lucide-react";
import {
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  getImageModel,
  type ImageModelId,
} from "@/lib/imageModels";

interface AgencyRow {
  id: string;
  name: string | null;
  image_model: string;
}

export function PlatformImageModelManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: agencies, isLoading, error } = useQuery({
    queryKey: ["platform", "agencies", "image-model"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name, image_model")
        .order("name");
      if (error) throw error;
      return (data ?? []) as AgencyRow[];
    },
  });

  const updateModel = useMutation({
    mutationFn: async ({ agencyId, modelId }: { agencyId: string; modelId: ImageModelId }) => {
      const { error } = await supabase
        .from("agencies")
        .update({ image_model: modelId })
        .eq("id", agencyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform", "agencies", "image-model"] });
    },
  });

  const filtered = useMemo(() => {
    if (!agencies) return [];
    const term = search.trim().toLowerCase();
    if (!term) return agencies;
    return agencies.filter((a) => (a.name ?? "").toLowerCase().includes(term));
  }, [agencies, search]);

  // Tally usage across the fleet so the super admin can see the
  // distribution at a glance.
  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of agencies ?? []) {
      const key = a.image_model || DEFAULT_IMAGE_MODEL;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [agencies]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Image Generation Models
        </h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Visible to super admins only. Every render call routes through the model assigned to the
          requesting agency. End users see abstract quality tiers — they never see the underlying
          provider name. Changes apply to the next render dispatched from that agency.
        </p>
      </div>

      {/* Registry — all available models with their tier label and the
          underlying provider id (super-admin disclosure). */}
      <Card className="bg-muted/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Available models</CardTitle>
          <CardDescription className="text-xs">
            Tier names are what end users see. Provider ids are internal — used by the
            edge functions and stored on <code className="font-mono text-[10px]">agencies.image_model</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {IMAGE_MODELS.map((m) => {
            const usage = tally.get(m.id) ?? 0;
            const isPlatformDefault = m.id === DEFAULT_IMAGE_MODEL;
            return (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.label}</span>
                    {m.badge && (
                      <Badge variant="secondary" className="text-[10px]">
                        {m.badge}
                      </Badge>
                    )}
                    {isPlatformDefault && (
                      <Badge variant="outline" className="text-[10px]">
                        Schema default
                      </Badge>
                    )}
                    {!m.available && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Unavailable
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{m.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{usage}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {usage === 1 ? "agency" : "agencies"}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Per-agency assignment table. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm">Agency assignments</CardTitle>
              <CardDescription className="text-xs">
                Override the model on a per-agency basis.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search agencies"
                className="pl-8 h-8 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agencies…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              Failed to load agencies. {(error as Error).message}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {search ? "No agencies match that search." : "No agencies on the platform yet."}
            </p>
          )}
          {filtered.map((agency) => {
            const current = getImageModel(agency.image_model);
            const isSaving = pendingId === agency.id && updateModel.isPending;
            return (
              <div
                key={agency.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {agency.name ?? <span className="italic text-muted-foreground">Unnamed</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                    {agency.image_model || DEFAULT_IMAGE_MODEL}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Select
                    value={current.id}
                    disabled={isSaving}
                    onValueChange={(modelId) => {
                      setPendingId(agency.id);
                      updateModel.mutate(
                        { agencyId: agency.id, modelId: modelId as ImageModelId },
                        {
                          onSuccess: () => {
                            const next = getImageModel(modelId);
                            toast.success(
                              `${agency.name ?? "Agency"} → ${next.label}`,
                            );
                          },
                          onError: (err: any) => {
                            toast.error(err?.message ?? "Failed to update model");
                          },
                          onSettled: () => setPendingId(null),
                        },
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            {m.badge && (
                              <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4">
                                {m.badge}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
