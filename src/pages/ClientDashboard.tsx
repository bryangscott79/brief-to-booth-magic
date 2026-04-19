import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Edit,
  FolderOpen,
  Globe,
  Loader2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient, useUpsertClient, type Client } from "@/hooks/useClients";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join("");
}

interface ClientProjectRow {
  id: string;
  name?: string | null;
  project_title?: string | null;
  status: string | null;
  updated_at: string | null;
  created_at: string | null;
}

function useClientProjects(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-projects", clientId],
    queryFn: async (): Promise<ClientProjectRow[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_title, status, updated_at, created_at")
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientProjectRow[];
    },
    enabled: !!clientId,
  });
}

function ClientHeader({
  client,
  onEdit,
}: {
  client: Client;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-4 min-w-0">
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl overflow-hidden",
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
            <span className="text-lg font-semibold text-primary">
              {initialsFromName(client.name) || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight truncate">{client.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {client.industry && <span>{client.industry}</span>}
            {client.website && (
              <a
                href={client.website}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Globe className="h-3 w-3" />
                <span className="truncate max-w-[260px]">{client.website}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <Button variant="outline" onClick={onEdit}>
        <Edit className="mr-2 h-4 w-4" />
        Edit client
      </Button>
    </div>
  );
}

function EditClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: Client;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upsertClient = useUpsertClient();
  const [form, setForm] = useState({
    name: client.name,
    industry: client.industry ?? "",
    website: client.website ?? "",
    logo_url: client.logo_url ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: client.name,
        industry: client.industry ?? "",
        website: client.website ?? "",
        logo_url: client.logo_url ?? "",
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await upsertClient.mutateAsync({
      id: client.id,
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      logo_url: form.logo_url.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update details for {client.name}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-client-name">Name</Label>
            <Input
              id="edit-client-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-industry">Industry</Label>
            <Input
              id="edit-client-industry"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-website">Website</Label>
            <Input
              id="edit-client-website"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-logo">Logo URL</Label>
            <Input
              id="edit-client-logo"
              value={form.logo_url}
              onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.name.trim() || upsertClient.isPending}
          >
            {upsertClient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTab({ client, projectCount }: { client: Client; projectCount: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Keep local state in sync when the underlying client updates.
  useEffect(() => {
    setNotes(client.notes ?? "");
  }, [client.id, client.notes]);

  const lastUpdated = client.updated_at
    ? formatDistanceToNow(new Date(client.updated_at), { addSuffix: true })
    : null;
  const createdAt = client.created_at
    ? new Date(client.created_at).toLocaleDateString()
    : null;

  const handleNotesBlur = async () => {
    if (notes === (client.notes ?? "")) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ notes: notes.trim() ? notes : null } as any)
        .eq("id", client.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      toast({ title: "Notes saved" });
    } catch (e: any) {
      toast({
        title: "Error saving notes",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Projects
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-3xl font-bold">{projectCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {projectCount === 0 ? "No projects yet" : `${projectCount} total`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Last activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-base font-medium">{lastUpdated ?? "—"}</p>
          {createdAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Created {createdAt}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
          <CardDescription>
            Anything worth remembering about this client. Saves automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Add notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={6}
            disabled={saving}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function BrandTab({ client }: { client: Client }) {
  // Full brand guidelines editor comes in a later pass; surface the basics now.
  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand</CardTitle>
        <CardDescription>
          Brand colors, tone, typography, logo rules, and reference materials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {client.primary_color && (
            <div>
              <Label className="text-xs text-muted-foreground">Primary color</Label>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: client.primary_color }}
                />
                <span className="text-sm font-mono">{client.primary_color}</span>
              </div>
            </div>
          )}
          {client.secondary_color && (
            <div>
              <Label className="text-xs text-muted-foreground">Secondary color</Label>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: client.secondary_color }}
                />
                <span className="text-sm font-mono">{client.secondary_color}</span>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Upload brand guide PDFs and reference imagery in the Knowledge tab — the AI will extract
          tone, typography, and usage rules automatically.
        </p>
      </CardContent>
    </Card>
  );
}

function KnowledgeTab({ clientId }: { clientId: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <KnowledgeBasePanel
          scope="client"
          scopeId={clientId}
          title="Client knowledge"
          description="Brand guides, rate cards, past campaigns, research — anything that should inform every project for this client."
        />
      </CardContent>
    </Card>
  );
}

function ProjectsTab({ clientId }: { clientId: string }) {
  const { data: projects = [], isLoading } = useClientProjects(clientId);

  const rows = useMemo(() => {
    return projects.map((p) => ({
      id: p.id,
      title: p.name || p.project_title || "Untitled project",
      status: p.status ?? "draft",
      updatedAt: p.updated_at ?? p.created_at ?? null,
    }));
  }, [projects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold mb-1">No projects yet</h3>
          <p className="text-xs text-muted-foreground text-center">
            Projects linked to this client will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link
          key={row.id}
          to={`/upload?project=${row.id}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/30 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{row.title}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {row.status}
              </Badge>
              {row.updatedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDistanceToNow(new Date(row.updatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </Link>
      ))}
    </div>
  );
}

export default function ClientDashboardPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data: client, isLoading } = useClient(clientId);
  const { data: projects = [] } = useClientProjects(clientId);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="container py-12">
          <Link
            to="/clients"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to clients
          </Link>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold mb-2">Client not found</h2>
              <p className="text-sm text-muted-foreground">
                This client may have been deleted or you don't have access.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-12">
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>

        <div className="mb-8">
          <ClientHeader client={client} onEdit={() => setEditOpen(true)} />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="brand">Brand</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab client={client} projectCount={projects.length} />
          </TabsContent>
          <TabsContent value="brand">
            <BrandTab client={client} />
          </TabsContent>
          <TabsContent value="knowledge">
            <KnowledgeTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="projects">
            <ProjectsTab clientId={client.id} />
          </TabsContent>
        </Tabs>

        <EditClientDialog client={client} open={editOpen} onOpenChange={setEditOpen} />
      </div>
    </AppLayout>
  );
}
