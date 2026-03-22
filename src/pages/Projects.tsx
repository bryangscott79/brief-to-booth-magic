import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Plus,
  FolderOpen,
  Trash2,
  Calendar,
  Loader2,
  CheckCircle2,
  Circle,
  Search,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useProjects, DBProject } from "@/hooks/useProjects";
import { useProjectStore } from "@/store/projectStore";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

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

function ProjectProgressBar({ project }: { project: DBProject }) {
  const completedCount = PIPELINE_STEPS.filter(s => s.check(project)).length;
  const pct = Math.round((completedCount / PIPELINE_STEPS.length) * 100);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{completedCount} of {PIPELINE_STEPS.length} steps complete</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="flex gap-1">
        {PIPELINE_STEPS.map((step) => {
          const done = step.check(project);
          return (
            <Tooltip key={step.key}>
              <TooltipTrigger asChild>
                <div
                  className={`h-2 flex-1 rounded-full transition-colors cursor-default ${
                    done ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs max-w-[200px]">
                {done
                  ? <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                  : <Circle className="h-3 w-3 text-muted-foreground shrink-0" />}
                <span>
                  <span className="font-semibold">{step.label}</span>
                  {" — "}{done ? "Complete" : step.tooltip}
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  parsing: { label: "Parsing", variant: "secondary" },
  reviewed: { label: "Reviewed", variant: "secondary" },
  generating: { label: "Generating", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
};

type OwnerFilter = "mine" | "all";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();

  // Admin mode fetches all projects; non-admin always fetches own
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("mine");
  const adminMode = isAdmin && ownerFilter === "all";

  const { projects, isLoading, createProject, deleteProject } = useProjects(adminMode);
  const { setActiveStep } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Client-side filter by search query (project name or owner user_id prefix)
  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.user_id.toLowerCase().includes(q) ||
        (p.parsed_brief as any)?.brand?.name?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const result = await createProject.mutateAsync(newProjectName);
    setNewProjectName("");
    setIsDialogOpen(false);
    setActiveStep("upload");
    navigate(`/upload?project=${result.id}`);
  };

  const handleOpenProject = (project: DBProject) => {
    // If admin is viewing someone else's project, just go to review/upload
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
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              {adminMode ? "All Projects" : "Your Projects"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {adminMode
                ? `${filtered.length} project${filtered.length !== 1 ? "s" : ""} across all users`
                : "Manage your brief response projects"}
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-glow">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Give your project a name to get started.</DialogDescription>
              </DialogHeader>
              <Input
                placeholder="e.g., RSA Conference 2024"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                  Create Project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

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

          {/* Result count */}
          {search && (
            <span className="text-xs text-muted-foreground">
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
          <Card className="element-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              {search ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">No results for "{search}"</h3>
                  <p className="text-muted-foreground text-center text-sm">Try a different project name or user ID.</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                  <p className="text-muted-foreground text-center mb-6">
                    Create your first project to start transforming briefs into booth designs.
                  </p>
                  <Button onClick={() => setIsDialogOpen(true)} className="btn-glow">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Project
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => {
              const isOwnProject = project.user_id === user?.id;
              return (
                <Card
                  key={project.id}
                  className="element-card cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => handleOpenProject(project)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug break-words min-w-0 flex-1">{project.name}</CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {adminMode && !isOwnProject && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10">
                                <Shield className="h-3 w-3 text-primary" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              Owner: {project.user_id.slice(0, 8)}…
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Badge variant={STATUS_BADGES[project.status]?.variant || "outline"}>
                          {STATUS_BADGES[project.status]?.label || project.status}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Calendar className="h-3 w-3" />
                      Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProjectProgressBar project={project} />
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm text-muted-foreground">
                        {project.parsed_brief ? (
                          <span>{(project.parsed_brief as any).brand?.name || "Brief uploaded"}</span>
                        ) : (
                          <span>No brief uploaded</span>
                        )}
                      </div>
                      {/* Only allow delete on own projects */}
                      {isOwnProject && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{project.name}" and all its data. This action cannot be undone.
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
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
