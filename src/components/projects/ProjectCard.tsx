// ProjectCard — graphical project tile for the Projects grid.
//
// Layout, top to bottom:
//   1. 16:9 hero banner. Cycles through ALL current renders on hover —
//      cursor X across the banner indexes into the image array, like a
//      film-strip scrub. Status pill anchored top-right; 3-dot menu
//      anchored top-left so users have one place for actions.
//   2. Card body: client name (large), activation subtitle, meta line
//      (updated time + ownership chip), progress bar.
//
// White cards over a dark page background — picks up status colors
// cleanly and reads like a designed object instead of a list row.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Calendar,
  Layers,
  MoreHorizontal,
  Trash2,
  Archive,
  Share2,
  User,
  Shield,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { DBProject } from "@/hooks/useProjects";
import type { Client } from "@/hooks/useClients";
import {
  resolveClientDisplayName,
  resolveActivationDisplayName,
  statusPalette,
} from "@/lib/projectDisplay";

export interface ProjectCardPipelineStep {
  key: string;
  label: string;
  tooltip: string;
  check: (p: DBProject) => boolean;
}

export interface ProjectCardProps {
  project: DBProject;
  /** All current render URLs for this project, hero-first. Powers the
   *  banner image + the hover scrub. Pass `[]` to use the placeholder. */
  thumbnails: string[];
  /** Optional resolved client record for logo/color fallback in the
   *  banner placeholder + name resolution. */
  client?: Client | null;
  /** Map for `resolveClientDisplayName` (passed in so the parent only
   *  has to build it once for the whole grid). */
  clientById: Map<string, Client>;
  /** Pipeline checks for the inline progress bar. Passed in so the
   *  card doesn't have to import the project store. */
  pipelineSteps: ProjectCardPipelineStep[];
  /** Suite children, if any. */
  suiteChildren?: DBProject[];
  /** True if expanded (suite parent). */
  isSuiteExpanded?: boolean;
  /** Toggle expand/collapse for suite parents. */
  onToggleSuite?: () => void;
  /** True when the current user owns this project. */
  isOwn: boolean;
  /** Open the project (route to its current step). */
  onOpen: () => void;
  /** Open the suite overview page (only meaningful for suite parents). */
  onOpenSuite?: () => void;
  /** Delete handler — guarded by an AlertDialog inside the menu. */
  onDelete?: () => void;
  /** Optional archive + share hooks. When omitted, those menu items
   *  are hidden so we don't show actions we can't perform. */
  onArchive?: () => void;
  onShare?: () => void;
}

export function ProjectCard({
  project,
  thumbnails,
  client,
  clientById,
  pipelineSteps,
  suiteChildren,
  isSuiteExpanded,
  onToggleSuite,
  isOwn,
  onOpen,
  onOpenSuite,
  onDelete,
  onArchive,
  onShare,
}: ProjectCardProps) {
  // Display strings — resolved once per render. Cheap, but useMemo
  // also serves as a dependency stake for hover state below.
  const clientName = useMemo(
    () => resolveClientDisplayName(project, clientById),
    [project, clientById],
  );
  const activationName = useMemo(
    () => resolveActivationDisplayName(project, clientName),
    [project, clientName],
  );
  const titleLine = clientName ?? project.name;
  const subtitleLine = clientName ? activationName : null;
  const palette = statusPalette(project.status);

  const hasChildren = !!suiteChildren && suiteChildren.length > 0;

  // ── Banner scrub ────────────────────────────────────────────────────
  // Cursor X across the banner picks an image. With one image we just
  // show it; with N images we divide the banner width into N slices.
  const [scrubIndex, setScrubIndex] = useState(0);
  const handleBannerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (thumbnails.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
    const idx = Math.min(thumbnails.length - 1, Math.floor(ratio * thumbnails.length));
    setScrubIndex(idx);
  };
  const handleBannerMouseLeave = () => setScrubIndex(0);

  const activeImage = thumbnails[scrubIndex] ?? thumbnails[0] ?? null;

  // ── Pipeline progress ───────────────────────────────────────────────
  const completedCount = pipelineSteps.filter((s) => s.check(project)).length;
  const pct = Math.round((completedCount / pipelineSteps.length) * 100);

  // Banner placeholder background — color swatch from the client's
  // brand colors when no renders exist yet, falls back to a neutral
  // gradient so the card never looks "empty".
  const placeholderBg = useMemo(() => {
    if (client?.primary_color) {
      const secondary = client.secondary_color ?? client.primary_color;
      return `linear-gradient(135deg, ${client.primary_color} 0%, ${secondary} 100%)`;
    }
    return "linear-gradient(135deg, #475569 0%, #1e293b 100%)";
  }, [client]);

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 bg-white dark:bg-zinc-50 text-zinc-900 border border-zinc-200"
      onClick={onOpen}
    >
      {/* ── Banner ──────────────────────────────────────────────── */}
      <div
        className="relative aspect-[16/9] bg-zinc-200 overflow-hidden"
        style={!activeImage ? { background: placeholderBg } : undefined}
        onMouseMove={handleBannerMouseMove}
        onMouseLeave={handleBannerMouseLeave}
      >
        {activeImage ? (
          // The img tag is positioned absolute so we can stack overlays
          // (status pill, menu) on top without blocking the scrub area.
          <img
            src={activeImage}
            alt={`${titleLine} render`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : client?.logo_url ? (
          // No renders yet — show the client logo centered on the
          // brand-color gradient. Establishes identity before any
          // hero exists.
          <img
            src={client.logo_url}
            alt={client.name}
            className="absolute inset-1/4 w-1/2 h-1/2 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
            loading="lazy"
            draggable={false}
          />
        ) : (
          // No renders, no client — show the project initials as a
          // last-resort placeholder so the card has SOME identity.
          <div className="absolute inset-0 flex items-center justify-center text-white text-3xl font-bold tracking-wide opacity-90">
            {titleLine.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Subtle bottom gradient for badge readability on busy images. */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

        {/* ── 3-dot menu (top-left corner) ────────────────────── */}
        <div className="absolute top-2 left-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 rounded-full bg-white/90 hover:bg-white shadow-sm border-0"
                onClick={(e) => e.stopPropagation()}
                aria-label="Project actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-zinc-700" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              {hasChildren && onOpenSuite && (
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); onOpenSuite(); }}
                >
                  <Layers className="h-3.5 w-3.5 mr-2" />
                  Open suite overview
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); onShare(); }}
                >
                  <Share2 className="h-3.5 w-3.5 mr-2" />
                  Share…
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); onArchive(); }}
                >
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              {(onShare || onArchive || (hasChildren && onOpenSuite)) && isOwn && onDelete && (
                <DropdownMenuSeparator />
              )}
              {/* Delete is wrapped in an AlertDialog so the user gets a
                  confirmation before permanently nuking the project. */}
              {isOwn && onDelete && (
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
                        Permanently delete "{project.name}" and all its data — brief,
                        renders, exports, references. Cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Status pill (top-right corner) ──────────────────── */}
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium shadow-sm",
              palette.badgeClass,
            )}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${palette.dotClass}`} />
            {palette.label}
          </span>
        </div>

        {/* ── Suite badge (bottom-left when applicable) ────────── */}
        {hasChildren && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="secondary" className="text-[10px] h-5 bg-white/90 text-zinc-800 border-0">
              <Layers className="h-2.5 w-2.5 mr-1" />
              Suite · {suiteChildren!.length}
            </Badge>
          </div>
        )}

        {/* ── Scrub dots (only when 2+ images) ───────────────── */}
        {thumbnails.length > 1 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {thumbnails.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i === scrubIndex ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2 min-w-0">
          {hasChildren && onToggleSuite && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSuite(); }}
              className="shrink-0 p-0.5 rounded hover:bg-zinc-100 transition-colors -ml-1"
              aria-label={isSuiteExpanded ? "Collapse suite" : "Expand suite"}
            >
              {isSuiteExpanded
                ? <ChevronDown className="h-4 w-4 text-zinc-500" />
                : <ChevronRight className="h-4 w-4 text-zinc-500" />}
            </button>
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="text-base font-semibold leading-tight tracking-tight text-zinc-900 truncate">
              {titleLine}
            </h3>
            {subtitleLine && (
              <p className="text-xs text-zinc-600 leading-snug line-clamp-2">
                {subtitleLine}
              </p>
            )}
          </div>
        </div>

        {/* Meta line */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
          </span>
          {isOwn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-indigo-600">
                  <User className="h-2.5 w-2.5" />
                  Mine
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Your project</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <Shield className="h-2.5 w-2.5" />
                  Shared
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Owner: {project.user_id.slice(0, 8)}…
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Progress bar — same logic as before but rendered against the
            white background so the bars read clearly. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span>{completedCount} of {pipelineSteps.length} steps complete</span>
            <span className="font-medium text-zinc-800">{pct}%</span>
          </div>
          <div className="flex gap-1">
            {pipelineSteps.map((step) => {
              const done = step.check(project);
              return (
                <Tooltip key={step.key}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors cursor-default",
                        done ? "bg-indigo-500" : "bg-zinc-200",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="flex items-center gap-1.5 text-xs max-w-[200px]">
                    {done
                      ? <CheckCircle2 className="h-3 w-3 text-indigo-500 shrink-0" />
                      : <Circle className="h-3 w-3 text-zinc-400 shrink-0" />}
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
      </div>
    </Card>
  );
}
