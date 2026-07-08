import { useLocation, useSearchParams } from "react-router-dom";
import {
  Upload,
  FileSearch,
  Sparkles,
  Grid3X3,
  FileText,
  ImageIcon,
  Download,
  Ruler,
  // Calculator, // Pricing moved out of project nav into agency-level account
  // Compass,    // Hidden — 360° Explorer
} from "lucide-react";
import { ProjectBar, StepPillNav, type StepPill } from "@/components/shell";
import { cn } from "@/lib/utils";
import { useProjectSync } from "@/hooks/useProjectSync";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SuiteContextBar } from "@/components/layout/SuiteContextBar";
import { useMeasurementSystem } from "@/hooks/useMeasurementSystem";

// Pricing intentionally excluded — it's an agency-account feature, not a
// per-project step. See AppSidebar (Agency section) for the entry point.
const PROJECT_STEPS = [
  { path: "/upload",   label: "Brief",    shortLabel: "Brief",    icon: Upload },
  { path: "/review",   label: "Review",   shortLabel: "Review",   icon: FileSearch },
  { path: "/generate", label: "Generate", shortLabel: "Generate", icon: Sparkles },
  { path: "/spatial",  label: "Spatial",  shortLabel: "Spatial",  icon: Grid3X3 },
  { path: "/prompts",  label: "Prompts",  shortLabel: "Prompts",  icon: FileText },
  { path: "/files",    label: "Files",    shortLabel: "Files",    icon: ImageIcon },
  // { path: "/explore",  label: "360°",     shortLabel: "360°",     icon: Compass }, // Hidden — low value for now
  { path: "/export",   label: "Export",   shortLabel: "Export",   icon: Download },
];

const PROJECT_PATHS = PROJECT_STEPS.map((s) => s.path);

export function ProjectHeader() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const { dbProject: project } = useProjectSync();
  // Measurement-system preference. Resolves to detected unit from the brief
  // unless the user has explicitly chosen one. Setting it persists per
  // project (localStorage today; DB column when Lovable's pipeline cooperates).
  const { system: measurementSystem, setSystem: setMeasurementSystem, isExplicit } =
    useMeasurementSystem(projectId, (project as any)?.parsed_brief);

  const isProjectRoute = PROJECT_PATHS.includes(location.pathname);

  // Don't render the project step bar on non-project pages
  if (!isProjectRoute) {
    return (
      <header className="h-12 flex items-center border-b border-cloud-line bg-card px-3 shrink-0">
        <SidebarTrigger className="h-7 w-7 text-slate" />
      </header>
    );
  }

  const buildPath = (path: string) =>
    projectId ? `${path}?project=${projectId}` : path;

  const currentStepIndex = PROJECT_STEPS.findIndex(
    (s) => s.path === location.pathname
  );

  // Derive Flow C spec pill from the parsed brief when available:
  // footprint · budget in mono.
  const parsedBrief = (project as any)?.parsed_brief;
  const specParts: string[] = [];
  const boothSize = parsedBrief?.booth_size ?? parsedBrief?.boothSize;
  if (typeof boothSize === "string" && boothSize.trim()) specParts.push(boothSize.trim());
  const budget = parsedBrief?.budget;
  if (typeof budget === "string" && budget.trim()) specParts.push(budget.trim());
  const spec = specParts.length > 0 ? specParts.join(" · ") : undefined;

  const stepPills: StepPill[] = PROJECT_STEPS.map((step, idx) => ({
    key: step.path,
    label: step.label,
    number: idx + 1,
    status:
      location.pathname === step.path
        ? "active"
        : idx < currentStepIndex
        ? "complete"
        : "pending",
    to: buildPath(step.path),
  }));

  return (
    <header className="shrink-0 border-b border-cloud-line bg-card">
      {/* Top row: sidebar trigger + project breadcrumb + spec pill + units */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-cloud-line/60">
        <ProjectBar
          className="flex-1 min-w-0"
          leading={<SidebarTrigger className="h-7 w-7 shrink-0 text-slate" />}
          projectName={project?.name ?? "Untitled Project"}
          spec={spec}
        />

        {/* Measurement system control — persists per project. The dot
          * indicates whether the value was set explicitly or auto-detected. */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 h-7 text-xs font-medium transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                  )}
                >
                  <Ruler className="h-3.5 w-3.5" />
                  <span>{measurementSystem === "metric" ? "m" : "ft"}</span>
                  {!isExplicit && (
                    <span
                      className="h-1 w-1 rounded-full bg-muted-foreground/40"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isExplicit ? "Project units" : "Project units (auto-detected)"}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">
              Project units
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={measurementSystem}
              onValueChange={(v) =>
                setMeasurementSystem(v === "metric" ? "metric" : "imperial")
              }
            >
              <DropdownMenuRadioItem value="imperial">
                <div className="flex flex-col">
                  <span className="text-sm">Imperial</span>
                  <span className="text-[11px] text-muted-foreground">ft, sqft</span>
                </div>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="metric">
                <div className="flex flex-col">
                  <span className="text-sm">Metric</span>
                  <span className="text-[11px] text-muted-foreground">m, sqm</span>
                </div>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                if (!projectId) return;
                try {
                  localStorage.removeItem(`canopy:project-measurement-system:${projectId}`);
                } catch {
                  /* ignore */
                }
                // Force a reload of the auto-detected value.
                window.location.reload();
              }}
              className="text-xs text-muted-foreground"
              disabled={!isExplicit}
            >
              Reset to auto-detect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Suite context bar */}
      <SuiteContextBar />

      {/* Step nav row — Flow C pill rail on the cloud ground */}
      <div className="flex items-center bg-cloud px-3 py-2">
        <StepPillNav steps={stepPills} />
      </div>
    </header>
  );
}
