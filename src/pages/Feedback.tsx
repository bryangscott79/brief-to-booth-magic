// Feedback — the in-app bug & feature tracker.
//
// Everyone submits; agency admins (owner/admin) and super admins review and
// prioritize submissions into feature builds. Members see their own
// submissions and their live status; reviewers additionally get the triage
// queue (status / priority / internal notes). RLS enforces both sides — this
// page only branches presentation on useCanReviewFeedback().

import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader, EmptyState, SectionLabel, StatusChip } from "@/components/shell";
import type { StatusChipVariant } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAgency } from "@/hooks/useAgency";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useFeedback,
  useSubmitFeedback,
  useTriageFeedback,
  useCanReviewFeedback,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
} from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { Bug, Lightbulb, MessageSquarePlus, Sparkles, ChevronDown, Loader2, ImagePlus, Paperclip, X } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

// ── vocabulary ────────────────────────────────────────────────────────────────

const TYPE_META: Record<FeedbackType, { label: string; className: string; icon: typeof Bug }> = {
  bug: { label: "Bug", className: "bg-red-soft text-blocking", icon: Bug },
  feature: { label: "Feature", className: "bg-violet-soft text-[#6D28D9]", icon: Lightbulb },
  improvement: { label: "Improvement", className: "bg-[#F0F9FF] text-[#0E7490]", icon: Sparkles },
};

const STATUS_META: Record<FeedbackStatus, { label: string; variant: StatusChipVariant }> = {
  new: { label: "New", variant: "attention" },
  under_review: { label: "Under review", variant: "warning" },
  planned: { label: "Planned", variant: "neutral" },
  in_progress: { label: "In progress", variant: "generating" },
  shipped: { label: "Shipped", variant: "pass" },
  declined: { label: "Declined", variant: "neutral" },
};

const STATUS_ORDER: FeedbackStatus[] = [
  "new",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
];

const PRIORITY_META: Record<FeedbackPriority, { label: string; className: string }> = {
  critical: { label: "P0 · Critical", className: "bg-blocking text-white" },
  high: { label: "P1 · High", className: "bg-amber-soft text-warn" },
  medium: { label: "P2 · Medium", className: "bg-cloud text-charcoal" },
  low: { label: "P3 · Low", className: "bg-cloud text-slate-faint" },
};

const NO_PRIORITY = "unset";

function TypeChip({ type }: { type: FeedbackType }) {
  const meta = TYPE_META[type] ?? TYPE_META.bug;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] whitespace-nowrap",
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.5} />
      {meta.label}
    </span>
  );
}

function PriorityChip({ priority }: { priority: FeedbackPriority | null }) {
  if (!priority) return null;
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-semibold tracking-tight whitespace-nowrap",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

// ── submit dialog ─────────────────────────────────────────────────────────────

const MAX_SHOTS = 5;
const MAX_SHOT_MB = 10;

interface PendingShot {
  file: File;
  preview: string;
}

function SubmitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const submit = useSubmitFeedback();
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [shots, setShots] = useState<PendingShot[]>([]);

  const addShots = (files: File[]) => {
    setShots((prev) => {
      const room = MAX_SHOTS - prev.length;
      if (room <= 0) {
        toast({ title: `Up to ${MAX_SHOTS} screenshots`, variant: "destructive" });
        return prev;
      }
      const accepted: PendingShot[] = [];
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_SHOT_MB * 1024 * 1024) {
          toast({ title: `${file.name} is too large`, description: `Screenshots up to ${MAX_SHOT_MB} MB.`, variant: "destructive" });
          continue;
        }
        accepted.push({ file, preview: URL.createObjectURL(file) });
      }
      return [...prev, ...accepted];
    });
  };

  const removeShot = (preview: string) => {
    setShots((prev) => {
      const gone = prev.find((s) => s.preview === preview);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((s) => s.preview !== preview);
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addShots,
    accept: { "image/png": [], "image/jpeg": [], "image/webp": [], "image/gif": [] },
    maxFiles: MAX_SHOTS,
    noKeyboard: false,
  });

  const reset = () => {
    setType("bug");
    setTitle("");
    setDescription("");
    setPagePath("");
    shots.forEach((s) => URL.revokeObjectURL(s.preview));
    setShots([]);
  };

  const handleSubmit = async () => {
    if (title.trim().length < 3) {
      toast({ title: "Add a short title", description: "A few words so reviewers can scan it.", variant: "destructive" });
      return;
    }
    try {
      await submit.mutateAsync({
        type,
        title,
        description,
        pagePath: pagePath.trim() || null,
        files: shots.map((s) => s.file),
      });
      toast({ title: "Feedback submitted", description: "You can follow its status on this page." });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't submit feedback",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New feedback</DialogTitle>
          <DialogDescription>
            Report a bug or pitch a feature — your team's admins review and prioritize these into builds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_META) as FeedbackType[]).map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-[12px] font-semibold transition-colors",
                    active
                      ? "border-navy bg-cloud text-navy"
                      : "border-border text-slate hover:border-navy/40 hover:text-navy",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-navy">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "bug" ? "Renders vanish after refresh on Files" : "Bulk-approve brand intelligence entries"}
              maxLength={200}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-navy">Details</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                type === "bug"
                  ? "What happened, what you expected, and steps to reproduce…"
                  : "What problem would this solve for you?"
              }
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-navy">
              Where in the app? <span className="font-normal text-slate">(optional)</span>
            </label>
            <Input
              value={pagePath}
              onChange={(e) => setPagePath(e.target.value)}
              placeholder="/prompts, Spatial step, Files lightbox…"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-navy">
              Screenshots <span className="font-normal text-slate">(optional · up to {MAX_SHOTS})</span>
            </label>
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-4 text-[12px] transition-colors",
                isDragActive
                  ? "border-navy bg-cloud text-navy"
                  : "border-border text-slate hover:border-navy/40 hover:text-navy",
              )}
            >
              <input {...getInputProps()} />
              <ImagePlus className="h-4 w-4" strokeWidth={1.5} />
              {isDragActive ? "Drop screenshots here" : "Drag & drop screenshots, or click to upload"}
            </div>
            {shots.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {shots.map((shot) => (
                  <div key={shot.preview} className="group relative h-16 w-24 overflow-hidden rounded-md border border-border bg-cloud">
                    <img src={shot.preview} alt={shot.file.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeShot(shot.preview)}
                      aria-label={`Remove ${shot.file.name}`}
                      className="absolute right-1 top-1 rounded-full bg-navy/80 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {submit.isPending && shots.length > 0 ? "Uploading…" : "Submit feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── review row ────────────────────────────────────────────────────────────────

function ReviewRow({
  item,
  agencyName,
  showAgency,
}: {
  item: FeedbackItem;
  agencyName?: string;
  showAgency: boolean;
}) {
  const { toast } = useToast();
  const triage = useTriageFeedback();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.admin_notes ?? "");

  const apply = async (patch: { status?: FeedbackStatus; priority?: FeedbackPriority | null; adminNotes?: string | null }) => {
    try {
      await triage.mutateAsync({ id: item.id, ...patch });
    } catch (err) {
      toast({
        title: "Couldn't update feedback",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const statusMeta = STATUS_META[item.status] ?? STATUS_META.new;

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <TypeChip type={item.type} />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-[14px] font-semibold text-navy">{item.title}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-slate-faint transition-transform", expanded && "rotate-180")}
            strokeWidth={1.5}
          />
        </button>
        {item.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate">
            <Paperclip className="h-3 w-3" strokeWidth={1.5} />
            {item.attachments.length}
          </span>
        )}
        <PriorityChip priority={item.priority} />
        <span className="hidden font-mono text-[11px] text-slate-faint lg:inline">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
        <Select value={item.status} onValueChange={(v) => apply({ status: v as FeedbackStatus })}>
          <SelectTrigger className="h-8 w-[140px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-[12px]">
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={item.priority ?? NO_PRIORITY}
          onValueChange={(v) => apply({ priority: v === NO_PRIORITY ? null : (v as FeedbackPriority) })}
        >
          <SelectTrigger className="h-8 w-[130px] text-[12px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PRIORITY} className="text-[12px]">
              No priority
            </SelectItem>
            {(Object.keys(PRIORITY_META) as FeedbackPriority[]).map((p) => (
              <SelectItem key={p} value={p} className="text-[12px]">
                {PRIORITY_META[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {expanded && (
        <div className="space-y-3 bg-cloud/60 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-slate">
            <span>{item.submitter_email ?? "unknown submitter"}</span>
            {showAgency && agencyName && <span>· {agencyName}</span>}
            {item.page_path && <span>· {item.page_path}</span>}
            <span>· {new Date(item.created_at).toLocaleDateString()}</span>
            <StatusChip variant={statusMeta.variant}>{statusMeta.label}</StatusChip>
          </div>
          {item.description ? (
            <p className="max-w-3xl whitespace-pre-wrap text-[13px] leading-[19px] text-charcoal">
              {item.description}
            </p>
          ) : (
            <p className="text-[13px] italic text-slate-faint">No details provided.</p>
          )}
          {item.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.attachments.map((att) => (
                <a
                  key={att.url}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  title={att.name}
                  className="block h-24 w-36 overflow-hidden rounded-md border border-border bg-white transition-opacity hover:opacity-80"
                >
                  <img src={att.url} alt={att.name} loading="lazy" className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <div className="max-w-3xl space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate">
              Internal notes <span className="font-normal normal-case tracking-normal">(reviewers only)</span>
            </label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-white" />
            {notes !== (item.admin_notes ?? "") && (
              <Button size="sm" onClick={() => apply({ adminNotes: notes.trim() || null })} disabled={triage.isPending}>
                Save notes
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

const Feedback = () => {
  const { user } = useAuth();
  const { agency } = useAgency();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const canReview = useCanReviewFeedback();
  const { data, isLoading } = useFeedback();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");

  const items = data?.items ?? [];
  const schemaReady = data?.schemaReady ?? true;

  // Super admins see cross-agency rows — label them.
  const { data: agencyNames } = useQuery({
    queryKey: ["feedback-agency-names"],
    enabled: !!isSuperAdmin && items.some((i) => i.agency_id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("agencies").select("id, name");
      if (error) return {} as Record<string, string>;
      return Object.fromEntries((rows ?? []).map((r) => [r.id, r.name])) as Record<string, string>;
    },
  });

  const mine = useMemo(() => items.filter((i) => i.user_id === user?.id), [items, user?.id]);
  const queue = useMemo(() => {
    const rows = statusFilter === "all" ? items : items.filter((i) => i.status === statusFilter);
    return rows;
  }, [items, statusFilter]);

  const openCount = items.filter((i) => i.status === "new" || i.status === "under_review").length;

  const filterChips: Array<{ key: FeedbackStatus | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: items.length },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: STATUS_META[s].label,
      count: items.filter((i) => i.status === s).length,
    })),
  ];

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl px-6 py-2">
        <PageHeader
          eyebrow={
            canReview
              ? `${agency?.name ?? "Canopy"} · ${items.length} submissions · ${openCount} awaiting review`
              : `${agency?.name ?? "Canopy"} · ${mine.length} submissions`
          }
          title="Feedback"
          subtitle={
            canReview
              ? "Review what your team is hitting and prioritize it into builds."
              : "Report bugs and pitch features — admins review and prioritize every submission."
          }
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <MessageSquarePlus className="mr-2 h-4 w-4" strokeWidth={1.5} />
              New feedback
            </Button>
          }
        />

        {!schemaReady && (
          <div className="mb-6 rounded-lg border border-amber-soft bg-amber-soft/50 px-4 py-3 text-[13px] text-warn">
            The feedback tables haven't been set up yet. Run{" "}
            <span className="font-mono text-[12px]">supabase/migrations/20260824000000_feedback_tracker.sql</span> in the
            Supabase SQL editor, then reload this page.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-slate-faint" />
          </div>
        ) : (
          <>
            {canReview && (
              <section className="mb-10">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <SectionLabel accent="blue">Review queue</SectionLabel>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {filterChips.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setStatusFilter(c.key)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          statusFilter === c.key
                            ? "border-navy bg-navy text-white"
                            : "border-border bg-white text-slate hover:text-navy",
                        )}
                      >
                        {c.label} <span className="font-mono">{c.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {queue.length === 0 ? (
                  <EmptyState
                    icon={MessageSquarePlus}
                    title={statusFilter === "all" ? "No feedback yet" : `Nothing ${STATUS_META[statusFilter as FeedbackStatus]?.label.toLowerCase() ?? ""}`}
                    body="Submissions from your team will land here for triage."
                  />
                ) : (
                  <div className="overflow-hidden rounded-[14px] border border-border bg-white">
                    {queue.map((item) => (
                      <ReviewRow
                        key={item.id}
                        item={item}
                        showAgency={!!isSuperAdmin}
                        agencyName={item.agency_id ? agencyNames?.[item.agency_id] : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            <section>
              <div className="mb-3">
                <SectionLabel accent="violet">Your submissions</SectionLabel>
              </div>
              {mine.length === 0 ? (
                <EmptyState
                  icon={MessageSquarePlus}
                  title="Nothing submitted yet"
                  body="Spotted a bug or wishing for a feature? Send it in — you'll see its status here."
                  action={<Button onClick={() => setDialogOpen(true)}>New feedback</Button>}
                />
              ) : (
                <div className="overflow-hidden rounded-[14px] border border-border bg-white">
                  {mine.map((item) => {
                    const statusMeta = STATUS_META[item.status] ?? STATUS_META.new;
                    return (
                      <div key={item.id} className="flex items-center gap-3 border-t border-border px-5 py-3.5 first:border-t-0">
                        <TypeChip type={item.type} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-navy">{item.title}</p>
                          {item.description && (
                            <p className="truncate text-[12px] text-slate">{item.description}</p>
                          )}
                        </div>
                        {item.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate">
                            <Paperclip className="h-3 w-3" strokeWidth={1.5} />
                            {item.attachments.length}
                          </span>
                        )}
                        <PriorityChip priority={item.priority} />
                        <span className="hidden font-mono text-[11px] text-slate-faint sm:inline">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                        <StatusChip variant={statusMeta.variant}>{statusMeta.label}</StatusChip>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <SubmitDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppLayout>
  );
};

export default Feedback;
