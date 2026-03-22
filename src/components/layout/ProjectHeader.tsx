import { useLocation, useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  Upload,
  FileSearch,
  Sparkles,
  Grid3X3,
  FileText,
  ImageIcon,
  Download,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectSync } from "@/hooks/useProjectSync";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const PROJECT_STEPS = [
  { path: "/upload",   label: "Brief",    shortLabel: "Brief",    icon: Upload },
  { path: "/review",   label: "Review",   shortLabel: "Review",   icon: FileSearch },
  { path: "/generate", label: "Generate", shortLabel: "Generate", icon: Sparkles },
  { path: "/spatial",  label: "Spatial",  shortLabel: "Spatial",  icon: Grid3X3 },
  { path: "/prompts",  label: "Prompts",  shortLabel: "Prompts",  icon: FileText },
  { path: "/files",    label: "Files",    shortLabel: "Files",    icon: ImageIcon },
  { path: "/export",   label: "Export",   shortLabel: "Export",   icon: Download },
];

const PROJECT_PATHS = PROJECT_STEPS.map((s) => s.path);

export function ProjectHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const { project } = useProjectSync();

  const isProjectRoute = PROJECT_PATHS.includes(location.pathname);

  // Don't render the project step bar on non-project pages
  if (!isProjectRoute) {
    return (
      <header className="h-12 flex items-center border-b border-border bg-background/80 backdrop-blur-sm px-3 shrink-0">
        <SidebarTrigger className="h-7 w-7 text-muted-foreground" />
      </header>
    );
  }

  const buildPath = (path: string) =>
    projectId ? `${path}?project=${projectId}` : path;

  const currentStepIndex = PROJECT_STEPS.findIndex(
    (s) => s.path === location.pathname
  );

  return (
    <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm">
      {/* Top row: sidebar trigger + project breadcrumb */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border/50">
        <SidebarTrigger className="h-7 w-7 shrink-0 text-muted-foreground" />

        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <button
            onClick={() => navigate("/projects")}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <span className="font-medium text-foreground truncate">
            {project?.name ?? "Untitled Project"}
          </span>
        </div>
      </div>

      {/* Step nav row */}
      <div className="flex items-center gap-0.5 px-3 h-10 overflow-x-auto scrollbar-none">
        {PROJECT_STEPS.map((step, idx) => {
          const active = location.pathname === step.path;
          const past = idx < currentStepIndex;
          const Icon = step.icon;

          return (
            <Tooltip key={step.path}>
              <TooltipTrigger asChild>
                <Link
                  to={buildPath(step.path)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : past
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{step.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {step.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </header>
  );
}
