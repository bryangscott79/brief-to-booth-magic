import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Plus, Users, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useClients, useUpsertClient, type Client } from "@/hooks/useClients";
import { useAgency } from "@/hooks/useAgency";
import { cn } from "@/lib/utils";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

function useClientProjectCounts(agencyId: string | undefined) {
  return useQuery({
    queryKey: ["client-project-counts", agencyId],
    queryFn: async () => {
      if (!agencyId) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("projects")
        .select("client_id")
        .eq("agency_id", agencyId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const cid = (row as { client_id: string | null }).client_id;
        if (!cid) continue;
        counts[cid] = (counts[cid] ?? 0) + 1;
      }
      return counts;
    },
    enabled: !!agencyId,
  });
}

function ClientCard({ client, projectCount }: { client: Client; projectCount: number }) {
  return (
    <Card className="element-card transition-colors hover:border-primary/30">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          {/* Logo / fallback */}
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg overflow-hidden",
              client.logo_url ? "bg-muted" : "bg-primary/10"
            )}
          >
            {client.logo_url ? (
              <img
                src={client.logo_url}
                alt={client.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-sm font-semibold text-primary">
                {initialsFromName(client.name) || "?"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight truncate">{client.name}</h3>
            {client.industry && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.industry}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {projectCount} project{projectCount === 1 ? "" : "s"}
              </Badge>
              <Link
                to={`/clients/${client.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClientsPage() {
  const { agency, isLoading: agencyLoading } = useAgency();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: projectCounts = {} } = useClientProjectCounts(agency?.id);
  const upsertClient = useUpsertClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    logo_url: "",
    notes: "",
  });

  const sorted = useMemo(() => {
    return [...clients].sort((a, b) => a.name.localeCompare(b.name));
  }, [clients]);

  const resetForm = () => {
    setForm({ name: "", industry: "", website: "", logo_url: "", notes: "" });
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await upsertClient.mutateAsync({
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      logo_url: form.logo_url.trim() || null,
      notes: form.notes.trim() || null,
    });
    resetForm();
    setOpen(false);
  };

  const isLoading = agencyLoading || clientsLoading;

  return (
    <AppLayout>
      <div className="container py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-1">Clients</h1>
            <p className="text-muted-foreground text-sm">
              {sorted.length} client{sorted.length === 1 ? "" : "s"}
            </p>
          </div>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="mr-2 h-4 w-4" />
                Add client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add client</DialogTitle>
                <DialogDescription>
                  Create a new client for your agency.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="client-name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="client-name"
                    placeholder="e.g., Acme Corp"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-industry">Industry</Label>
                  <Input
                    id="client-industry"
                    placeholder="e.g., Healthcare"
                    value={form.industry}
                    onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-website">Website</Label>
                  <Input
                    id="client-website"
                    placeholder="https://…"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-logo">Logo URL</Label>
                  <Input
                    id="client-logo"
                    placeholder="https://…/logo.png"
                    value={form.logo_url}
                    onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-notes">Notes</Label>
                  <Textarea
                    id="client-notes"
                    placeholder="Anything worth remembering about this client…"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!form.name.trim() || upsertClient.isPending}
                >
                  {upsertClient.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Create client
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <Card className="element-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
              <p className="text-muted-foreground text-center mb-6 text-sm">
                Create your first client to organize projects and brand work.
              </p>
              <Button onClick={() => setOpen(true)} className="btn-glow">
                <Plus className="mr-2 h-4 w-4" />
                Add your first client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sorted.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                projectCount={projectCounts[client.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
