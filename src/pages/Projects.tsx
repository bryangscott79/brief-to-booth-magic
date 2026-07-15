import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Plus,
  FolderOpen,
  Trash2,
  Calendar,
  Loader2,
  Search,
  Shield,
  User,
  Users,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Building2,
  X,
  MoreHorizontal,
  Archive,
  Share2,
} from "lucide-react";
import { useProjects, DBProject } from "@/hooks/useProjects";
import { useAgency } from "@/hooks/useAgency";
import { PageHeader, EmptyState, SectionLabel } from "@/components/shell";
import { useProjectStore } from "@/store/projectStore";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { useClients, type Client } from "@/hooks/useClients";
import { useProjectThumbnails } from "@/hooks/useProjectThumbnails";
import { ProjectVisualThumb } from "@/components/projects/ProjectVisualThumb";
import { ProjectCard } from "@/components/projects/ProjectCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  statusPalette,
  resolveActivationDisplayName,
} from "@/lib/projectDisplay";
import { formatDistanceToNow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Pipeline step definitions ---
// Each check reflects the minimum data needed to consider that step "done"
// and unlock the most value in the next step.
const PIPELINE_STEPS: { key: string; label: string; tooltip: string; check: (p: DBProject) => boolean }[] = [
  {
    key: "brief",
    label: "Brief Uploaded",
    tooltip: "A brief document or text has been added to the project",
    check: (p) => !!(p.brief_text || p.brief_file_url || p.brief_file_name),
  },
  {
    key: "review",
    label: "Brief Reviewed",
    tooltip: "The brief has been parsed and key data (brand, objectives, events) confirmed",
    check: (p) => {
      if (!p.parsed_brief) return false;
      const pb = p.parsed_brief as any;
      // brand name + at least one objective or event show
      return !!(pb?.brand?.name && (pb?.objectives?.primary || pb?.events?.shows?.length));
    },
  },
  {
    key: "elements",
    label: "Elements Generated",
    tooltip: "AI has generated the Big Idea and at least one experience element",
    check: (p) => !!(p.big_idea && (p.experience_framework || p.interactive_mechanics || p.digital_storytelling)),
  },
  {
    key: "spatial",
    label: "Spatial Planned",
    tooltip: "A spatial strategy with layout zones has been defined",
    check: (p) => {
      if (!p.spatial_strategy) return false;
      const ss = p.spatial_strategy as any;
      // SpatialStrategy uses configs[].zones array
      return !!(ss?.configs?.length || ss?.zones?.length || ss?.scalingStrategy);
    },
  },
  {
    key: "prompts",
    label: "Render Prompts Ready",
    tooltip: "Render prompts have been generated",
    // hero_style_confirmed is optional — prompts existing is sufficient
    check: (p) => !!(p.render_prompts),
  },
  {
    key: "export",
    label: "Exported",
    tooltip: "Final assets have been exported or presentation generated",
    check: (p) => p.status === "completed",
  },
];

// ProjectProgressBar moved into the new ProjectCard component
// (src/components/projects/ProjectCard.tsx) so the white-card aesthetic
// renders progress bars in matching tones.

/**
 * Renders a project's status as a color-coded pill — distinct hues for
 * draft (amber), parsing (sky), reviewed (indigo), generating (violet),
 * and delivered (emerald). Replaces the prior shadcn variant mapping
 * which only had 3 visual tones across 5 states.
 */
function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const p = statusPalette(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${p.badgeClass} ${className ?? ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${p.dotClass}`} />
      {p.label}
    </span>
  );
}

type OwnerFilter = "mine" | "all";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { agency } = useAgency();

  // Admin mode fetches all projects; non-admin always fetches own
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("mine");
  const adminMode = isAdmin && ownerFilter === "all";

  const { projects, isLoading, createProject, deleteProject } = useProjects(adminMode);
  const { setActiveStep } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectBrandUrl, setNewProjectBrandUrl] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSuiteCreate, setIsSuiteCreate] = useState(false);

  const [search, setSearch] = useState("");
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());

  // Per-client filter for the projects list. "all" means no filter.
  const [clientFilter, setClientFilter] = useState<string>("all");
  // Grid (default) vs table view. Persists in localStorage so users
  // don't have to re-toggle every visit.
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    if (typeof window === "undefined") return "grid";
    const stored = window.localStorage.getItem("projects:viewMode");
    return stored === "table" ? "table" : "grid";
  });
  const setViewModePersisted = (mode: "grid" | "table") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("projects:viewMode", mode);
    }
  };

  // Clients in the agency — used for the filter dropdown and to resolve
  // each project's client name + brand colors + logo for the visuals.
  const { data: clients = [] } = useClients();
  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  // Bulk-fetch one hero thumbnail per project so the list can render
  // a visual reference for every card / row in a single query.
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { data: thumbnailsByProject } = useProjectThumbnails(projectIds);

  // Group projects: standalone, parents (with children), children (hidden at top level)
  const { topLevel, childrenByParent } = useMemo(() => {
    const childMap = new Map<string, DBProject[]>();
    const parentIds = new Set<string>();

    // First pass: identify all child projects and collect parent IDs
    for (const p of projects) {
      const pid = (p as any).parent_id as string | null;
      if (pid) {
        parentIds.add(pid);
        const existing = childMap.get(pid) ?? [];
        existing.push(p);
        childMap.set(pid, existing);
      }
    }

    // Also mark projects that have children (even if those children are in the list)
    for (const p of projects) {
      if (childMap.has(p.id)) {
        parentIds.add(p.id);
      }
    }

    // Top-level = projects that have no parent_id
    const top = projects.filter((p) => !(p as any).parent_id);

    return { topLevel: top, childrenByParent: childMap };
  }, [projects]);

  // Client-side filters: search (name/owner/brand) AND client selector.
  const filtered = useMemo(() => {
    let list = topLevel;
    if (clientFilter !== "all") {
      list = list.filter((p) => p.client_id === clientFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.user_id.toLowerCase().includes(q) ||
          (p.parsed_brief as any)?.brand?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [topLevel, search, clientFilter]);

  /**
   * Resolve the best display name for a project's client.
   *   1. Linked client record (clients.name)
   *   2. parsed_brief.brand.name (when no client linked yet)
   *   3. null (no client info available)
   */
  const resolveClientName = (project: DBProject): string | null => {
    if (project.client_id) {
      const c = clientById.get(project.client_id);
      if (c) return c.name;
    }
    const brand = (project.parsed_brief as any)?.brand?.name;
    return typeof brand === "string" ? brand : null;
  };

  /** Resolve the linked client record (or null) for visual + tag use. */
  const resolveClient = (project: DBProject): Client | null =>
    project.client_id ? clientById.get(project.client_id) ?? null : null;

  // Group filtered projects by client for the table view.
  const groupedByClient = useMemo(() => {
    const groups = new Map<string, { name: string; projects: DBProject[] }>();
    for (const p of filtered) {
      const name = resolveClientName(p) ?? "Unassigned";
      const key = p.client_id ?? `__brand__:${name.toLowerCase()}`;
      const existing = groups.get(key);
      if (existing) existing.projects.push(p);
      else groups.set(key, { name, projects: [p] });
    }
    // Sort group entries by name for stable display.
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([key, value]) => ({ key, ...value }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, clientById]);

  const toggleSuiteExpand = (id: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const result = await createProject.mutateAsync({
      name: newProjectName,
      brand_website_url: newProjectBrandUrl.trim() || null,
    });

    // If suite, stamp the is_suite flag on the project immediately
    if (isSuiteCreate) {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.from("projects").update({ is_suite: true } as any).eq("id", result.id);
    }

    const wasSuite = isSuiteCreate;
    setNewProjectName("");
    setNewProjectBrandUrl("");
    setIsDialogOpen(false);
    setIsSuiteCreate(false);

    if (wasSuite) {
      setActiveStep("upload");
      navigate(`/upload?project=${result.id}&suite=true`);
    } else {
      setActiveStep("upload");
      navigate(`/upload?project=${result.id}`);
    }
  };


  const handleOpenProject = (project: DBProject) => {
    // Suite projects (has children OR flagged as suite) always go to /suite
    if (childrenByParent.has(project.id) || (project as any).is_suite) {
      navigate(`/suite?project=${project.id}`);
      return;
    }
    const routes: Record<string, string> = {
      draft: `/upload?project=${project.id}`,
      parsing: `/upload?project=${project.id}`,
      reviewed: `/review?project=${project.id}`,
      generating: `/generate?project=${project.id}`,
      completed: `/export?project=${project.id}`,
    };
    navigate(routes[project.status] || `/upload?project=${project.id}`);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container py-12">
        {/* Header */}
        <PageHeader
          className="mb-6"
          eyebrow={
            <>
              {agency?.name ?? "Workspace"} · {filtered.length} {adminMode ? "projects · all users" : `active project${filtered.length !== 1 ? "s" : ""}`}
            </>
          }
          title={adminMode ? "All Projects" : "Your Projects"}
          subtitle={
            adminMode
              ? "Every project across the agency — open any to review or edit."
              : "From brief to booth — pick up where you left off."
          }
          actions={
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setIsSuiteCreate(false); }}>
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isSuiteCreate ? "Create Activation Suite" : "Create New Project"}</DialogTitle>
                <DialogDescription>
                  {isSuiteCreate
                    ? "Create a parent project that contains multiple activations."
                    : "Give your project a name to get started."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Project name
                  </label>
                  <Input
                    autoFocus
                    placeholder={isSuiteCreate ? "e.g., CES 2025 Full Program" : "e.g., RSA Conference 2024"}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Brand website <span className="text-muted-foreground/70">(optional)</span>
                  </label>
                  <Input
                    placeholder="https://brand.com"
                    value={newProjectBrandUrl}
                    onChange={(e) => setNewProjectBrandUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    We'll scrape colors, logo, fonts, and voice from this URL and pre-load it
                    into brand intelligence for this project.
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {!isSuiteCreate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-auto text-xs text-muted-foreground"
                    onClick={() => setIsSuiteCreate(true)}
                  >
                    <Layers className="mr-1.5 h-3.5 w-3.5" />
                    Create Suite instead
                  </Button>
                )}
                {isSuiteCreate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mr-auto text-xs text-muted-foreground"
                    onClick={() => setIsSuiteCreate(false)}
                  >
                    Single project instead
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); setIsSuiteCreate(false); }}>Cancel</Button>
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                  {isSuiteCreate ? "Create Suite" : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          }
        />

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Owner filter — admin only */}
          {isAdmin && (
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              <button
                onClick={() => setOwnerFilter("mine")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  ownerFilter === "mine"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-3 w-3" />
                My Projects
              </button>
              <button
                onClick={() => setOwnerFilter("all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  ownerFilter === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-3 w-3" />
                All Users
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={adminMode ? "Search by project name or user…" : "Search projects…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Client filter — surfaces every client in the agency that
              has at least one project, plus an "All" option. Hidden when
              there are no clients to filter. */}
          {clients.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-8 text-xs w-[180px]">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {clientFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setClientFilter("all")}
                  className="text-muted-foreground hover:text-foreground"
                  title="Clear client filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* View mode toggle — grid (default) or table. Persists in
              localStorage so users don't have to re-toggle every visit. */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5 ml-auto">
            <button
              type="button"
              onClick={() => setViewModePersisted("grid")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid view"
            >
              <LayoutGrid className="h-3 w-3" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewModePersisted("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Table view (grouped by client)"
            >
              <ListIcon className="h-3 w-3" />
              Table
            </button>
          </div>

          {/* Result count */}
          {(search || clientFilter !== "all") && (
            <span className="text-xs text-muted-foreground basis-full sm:basis-auto">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Admin notice banner */}
        {adminMode && (
          <div className="flex items-center gap-2 px-3 py-2 mb-5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Admin view — you can open any project. Changes will affect that user's project.
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 ? (
          <Card>
            {search ? (
              <EmptyState
                icon={Search}
                title={`No results for "${search}"`}
                body="Try a different project name or user ID."
              />
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="No projects yet"
                body="Create your first project to start transforming briefs into booth designs."
                action={
                  <Button onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Project
                  </Button>
                }
              />
            )}
          </Card>
        ) : viewMode === "table" ? (
          // ── Table view — grouped by client ─────────────────────────
          <div className="space-y-6">
            {groupedByClient.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <SectionLabel accent="blue">{group.name}</SectionLabel>
                  <span className="inline-flex items-center rounded-full border border-cloud-line bg-white px-1.5 font-mono text-[10px] font-medium text-navy">
                    {group.projects.length}
                  </span>
                </div>
                <Card className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {group.projects.map((project) => {
                      const isOwnProject = project.user_id === user?.id;
                      const children = childrenByParent.get(project.id);
                      const hasChildren = !!children && children.length > 0;
                      const completedCount = PIPELINE_STEPS.filter((s) => s.check(project)).length;
                      const pct = Math.round((completedCount / PIPELINE_STEPS.length) * 100);
                      const heroUrl = thumbnailsByProject?.get(project.id)?.[0] ?? null;
                      const client = resolveClient(project);
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => handleOpenProject(project)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                        >
                          <ProjectVisualThumb
                            heroUrl={heroUrl}
                            client={client}
                            projectName={project.name}
                            size={44}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Table row uses the activation name as the
                                  primary label (the client is already the
                                  group header above). Falls back to the
                                  project name when no clean activation
                                  name can be derived. */}
                              <span className="text-sm font-medium truncate">
                                {resolveActivationDisplayName(project, group.name) ?? project.name}
                              </span>
                              {hasChildren && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                  <Layers className="h-2.5 w-2.5 mr-0.5" />
                                  Suite · {children.length}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                              </span>
                              <span>· {pct}% complete</span>
                              {!isOwnProject && (
                                <span className="flex items-center gap-1 text-muted-foreground/70">
                                  <Shield className="h-2.5 w-2.5" />
                                  Shared
                                </span>
                              )}
                            </div>
                          </div>
                          <StatusPill status={project.status} className="shrink-0" />
                          {/* 3-dot actions menu — same shape as the
                              card's banner menu. Stops click propagation
                              so the row's onClick (open project) doesn't
                              fire when interacting with the menu. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Project actions"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              {hasChildren && (
                                <DropdownMenuItem
                                  onSelect={(e) => { e.preventDefault(); navigate(`/suite?project=${project.id}`); }}
                                >
                                  <Layers className="h-3.5 w-3.5 mr-2" />
                                  Open suite overview
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  toast({
                                    title: "Sharing — coming soon",
                                    description: "Per-project sharing controls are planned.",
                                  });
                                }}
                              >
                                <Share2 className="h-3.5 w-3.5 mr-2" />
                                Share…
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  toast({
                                    title: "Archive — coming soon",
                                    description: "We'll add an archived state in a follow-up.",
                                  });
                                }}
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" />
                                Archive
                              </DropdownMenuItem>
                              {isOwnProject && (
                                <>
                                  <DropdownMenuSeparator />
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem
                                        onSelect={(e) => e.preventDefault()}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete project?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Permanently delete "{project.name}" and all its data. Cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={(e) => { e.stopPropagation(); deleteProject.mutate(project.id); }}
                                          className="bg-destructive hover:bg-destructive/90"
                                        >
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => {
              const isOwnProject = project.user_id === user?.id;
              const children = childrenByParent.get(project.id);
              const hasChildren = !!children && children.length > 0;
              const isExpanded = expandedSuites.has(project.id);
              // useProjectThumbnails now returns string[] (hero-first
              // ordered) so the banner can scrub. Empty array = use
              // placeholder.
              const thumbs = thumbnailsByProject?.get(project.id) ?? [];
              const client = resolveClient(project);

              return (
                <div key={project.id} className={hasChildren ? "col-span-full" : ""}>
                  <ProjectCard
                    project={project}
                    thumbnails={thumbs}
                    client={client}
                    clientById={clientById}
                    pipelineSteps={PIPELINE_STEPS}
                    suiteChildren={children}
                    isSuiteExpanded={isExpanded}
                    onToggleSuite={
                      hasChildren ? () => toggleSuiteExpand(project.id) : undefined
                    }
                    isOwn={isOwnProject}
                    onOpen={() => handleOpenProject(project)}
                    onOpenSuite={
                      hasChildren ? () => navigate(`/suite?project=${project.id}`) : undefined
                    }
                    onDelete={
                      isOwnProject ? () => deleteProject.mutate(project.id) : undefined
                    }
                    // Stub menu items so the actions are surfaced now and
                    // can be wired to real implementations later.
                    onShare={() => toast({
                      title: "Sharing — coming soon",
                      description: "Per-project sharing controls are planned. For now, agency teammates already have access via shared agency membership.",
                    })}
                    onArchive={() => toast({
                      title: "Archive — coming soon",
                      description: "We'll add an archived state so finished projects can be hidden from the active list without deleting their data.",
                    })}
                  />

                  {/* Expanded suite children — same as before, just outside
                      the new card so the white-card aesthetic is preserved
                      for the parent. */}
                  {hasChildren && isExpanded && (
                    <Collapsible open={isExpanded}>
                      <CollapsibleContent>
                        <div className="ml-6 mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {children!.map((child) => {
                            const childAny = child as any;
                            return (
                              <Card
                                key={child.id}
                                className="element-card cursor-pointer transition-colors hover:border-primary/20 border-l-2 border-l-primary/30"
                                onClick={() => navigate(`/review?project=${child.id}`)}
                              >
                                <CardContent className="py-3 px-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{child.name}</p>
                                      <div className="flex items-center gap-1.5 mt-1">
                                        {childAny.activation_type && (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                            {String(childAny.activation_type).replace(/_/g, " ")}
                                          </Badge>
                                        )}
                                        {childAny.scale_classification && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {String(childAny.scale_classification).replace(/_/g, " ")}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <StatusPill status={child.status} className="shrink-0" />
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
