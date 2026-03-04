import { useState } from "react";
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
import { Plus, FolderOpen, Trash2, Calendar, Loader2, CheckCircle2, Circle } from "lucide-react";
import { useProjects, DBProject } from "@/hooks/useProjects";
import { useProjectStore } from "@/store/projectStore";
import { formatDistanceToNow } from "date-fns";

// --- Pipeline step definitions ---
const PIPELINE_STEPS: { key: string; label: string; check: (p: DBProject) => boolean }[] = [
  { key: "brief",    label: "Brief Uploaded",      check: (p) => !!p.brief_text },
  { key: "review",   label: "Brief Reviewed",       check: (p) => !!p.parsed_brief },
  { key: "elements", label: "Elements Generated",   check: (p) => !!(p.big_idea || p.experience_framework || p.interactive_mechanics) },
  { key: "spatial",  label: "Spatial Planned",      check: (p) => !!p.spatial_strategy },
  { key: "prompts",  label: "Render Prompts Ready", check: (p) => !!p.render_prompts },
  { key: "export",   label: "Exported",             check: (p) => p.status === "completed" },
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
                  className={`h-1.5 flex-1 rounded-full transition-colors cursor-default ${
                    done ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs">
                {done
                  ? <CheckCircle2 className="h-3 w-3 text-primary" />
                  : <Circle className="h-3 w-3 text-muted-foreground" />
                }
                {step.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

// --- Status badge config ---
const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  parsing: { label: "Parsing", variant: "secondary" },
  reviewed: { label: "Reviewed", variant: "secondary" },
  generating: { label: "Generating", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, isLoading, createProject, deleteProject } = useProjects();
  const { setActiveStep } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const result = await createProject.mutateAsync(newProjectName);
    setNewProjectName("");
    setIsDialogOpen(false);
    setActiveStep("upload");
    navigate(`/upload?project=${result.id}`);
  };

  const handleOpenProject = (projectId: string, status: string) => {
    const routes: Record<string, string> = {
      draft: `/upload?project=${projectId}`,
      parsing: `/upload?project=${projectId}`,
      reviewed: `/review?project=${projectId}`,
      generating: `/generate?project=${projectId}`,
      completed: `/export?project=${projectId}`,
    };
    navigate(routes[status] || `/upload?project=${projectId}`);
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Projects</h1>
            <p className="text-muted-foreground">Manage your brief response projects</p>
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

        {projects.length === 0 ? (
          <Card className="element-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground text-center mb-6">
                Create your first project to start transforming briefs into booth designs.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} className="btn-glow">
                <Plus className="mr-2 h-4 w-4" />
                Create First Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="element-card cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => handleOpenProject(project.id, project.status)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <Badge variant={STATUS_BADGES[project.status]?.variant || "outline"}>
                      {STATUS_BADGES[project.status]?.label || project.status}
                    </Badge>
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{project.name}" and all its data.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProject.mutate(project.id);
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
