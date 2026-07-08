// ProjectBar — the Flow C project chrome row: breadcrumb "Projects / {name}",
// an optional mono spec pill (footprint · budget), status text, and a
// right-side slot for the primary CTA / controls. Presentation only.

import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectBarProps {
  projectName: string;
  /** Mono spec pill content, e.g. "20×30 ft · $85k" */
  spec?: ReactNode;
  /** Short status text, rendered in slate */
  status?: ReactNode;
  /** Right side: controls + primary CTA */
  right?: ReactNode;
  /** Leading slot (e.g. sidebar trigger) */
  leading?: ReactNode;
  className?: string;
}

export function ProjectBar({ projectName, spec, status, right, leading, className }: ProjectBarProps) {
  const navigate = useNavigate();

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {leading}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <button
          onClick={() => navigate("/projects")}
          className="flex shrink-0 items-center gap-1.5 text-slate transition-colors hover:text-navy"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </button>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-faint" />
        <span className="truncate font-semibold text-navy">{projectName}</span>
        {spec && (
          <span className="ml-2 hidden shrink-0 items-center rounded-full border border-cloud-line bg-cloud px-2.5 py-0.5 font-mono text-[11px] font-medium text-charcoal md:inline-flex">
            {spec}
          </span>
        )}
        {status && <span className="ml-2 hidden shrink-0 text-xs text-slate lg:inline">{status}</span>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
