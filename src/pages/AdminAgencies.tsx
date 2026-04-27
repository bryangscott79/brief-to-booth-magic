// /admin/agencies — super-admin agency management page.
//
// Lists every agency with status, owner, member/project counts, and last
// activity. Selecting one opens a drawer with all controls: suspend,
// reactivate, disable, set trial end date, edit feature flags, edit
// quotas, edit admin notes, and view the audit log.

import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import {
  Loader2,
  Search,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle2,
  Calendar,
  Settings,
  History,
  Save,
  PauseCircle,
  PlayCircle,
  XCircle,
  Crown,
  Building2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import {
  useAdminAgencies,
  useAgencyAccessLog,
  useSuspendAgency,
  useReactivateAgency,
  useDisableAgency,
  useSetAgencyTrial,
  useUpdateAgencyFeatureFlags,
  useUpdateAgencyQuotas,
  useUpdateAgencyAdminNotes,
  type AgencyAdminRow,
  type EffectiveAccessStatus,
} from "@/hooks/useAccessControl";
import { cn } from "@/lib/utils";

// ─── Status pill ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: EffectiveAccessStatus }) {
  const config: Record<EffectiveAccessStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
    active: {
      label: "Active",
      tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      icon: CheckCircle2,
    },
    trial: {
      label: "Trial",
      tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      icon: Clock,
    },
    trial_expired: {
      label: "Trial expired",
      tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      icon: Clock,
    },
    suspended: {
      label: "Suspended",
      tone: "bg-red-500/15 text-red-300 border-red-500/30",
      icon: AlertTriangle,
    },
    disabled: {
      label: "Disabled",
      tone: "bg-red-700/20 text-red-200 border-red-600/40",
      icon: Lock,
    },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge className={cn("gap-1 border", c.tone)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

// ─── Action Detail Drawer ───────────────────────────────────────────────────

function AgencyDetailDrawer({
  agency,
  open,
  onOpenChange,
}: {
  agency: AgencyAdminRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const suspend = useSuspendAgency();
  const reactivate = useReactivateAgency();
  const disable = useDisableAgency();
  const setTrial = useSetAgencyTrial();
  const updateFlags = useUpdateAgencyFeatureFlags();
  const updateQuotas = useUpdateAgencyQuotas();
  const updateNotes = useUpdateAgencyAdminNotes();
  const { data: log = [], isLoading: logLoading } = useAgencyAccessLog(agency?.id);

  const [reason, setReason] = useState("");
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [flagsJson, setFlagsJson] = useState("");
  const [quotasJson, setQuotasJson] = useState("");

  // Reset local state when the open agency changes
  useMemo(() => {
    if (agency) {
      setReason(agency.suspension_reason ?? "");
      setTrialEndsAt(agency.trial_ends_at ? agency.trial_ends_at.slice(0, 10) : "");
      setAdminNotes(agency.admin_notes ?? "");
      setFlagsJson(JSON.stringify(agency.feature_flags ?? {}, null, 2));
      setQuotasJson(JSON.stringify(agency.quotas ?? {}, null, 2));
    }
  }, [agency?.id]);

  if (!agency) return null;

  const wrapAction = async (label: string, p: Promise<unknown>) => {
    try {
      await p;
      toast({ title: label });
    } catch (e) {
      toast({
        title: `${label} failed`,
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleSuspend = () =>
    wrapAction(
      "Agency suspended",
      suspend.mutateAsync({ agencyId: agency.id, reason: reason.trim() || null }),
    );

  const handleReactivate = () =>
    wrapAction("Agency reactivated", reactivate.mutateAsync({ agencyId: agency.id }));

  const handleDisable = () =>
    wrapAction(
      "Agency disabled",
      disable.mutateAsync({ agencyId: agency.id, reason: reason.trim() || null }),
    );

  const handleSetTrial = () => {
    const date = trialEndsAt ? new Date(trialEndsAt) : null;
    return wrapAction(
      "Trial updated",
      setTrial.mutateAsync({ agencyId: agency.id, endsAt: date }),
    );
  };

  const handleSaveFlags = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(flagsJson || "{}");
    } catch {
      toast({ title: "Invalid JSON", description: "Feature flags must be valid JSON.", variant: "destructive" });
      return;
    }
    return wrapAction("Feature flags saved", updateFlags.mutateAsync({ agencyId: agency.id, flags: parsed }));
  };

  const handleSaveQuotas = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(quotasJson || "{}");
    } catch {
      toast({ title: "Invalid JSON", description: "Quotas must be valid JSON.", variant: "destructive" });
      return;
    }
    return wrapAction("Quotas saved", updateQuotas.mutateAsync({ agencyId: agency.id, quotas: parsed }));
  };

  const handleSaveNotes = () =>
    wrapAction("Notes saved", updateNotes.mutateAsync({ agencyId: agency.id, notes: adminNotes }));

  const isDisabled = agency.effective_status === "disabled";
  const isSuspended = agency.effective_status === "suspended";
  const canSuspend = !isSuspended && !isDisabled;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-2">
            <SheetTitle>{agency.name}</SheetTitle>
            <StatusPill status={agency.effective_status} />
          </div>
          <SheetDescription className="font-mono text-xs">
            {agency.slug} · owner: {agency.owner_email ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="status">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="quotas">Quotas</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          {/* ── Status / suspend / trial ─────────────────────────────── */}
          <TabsContent value="status" className="space-y-6 mt-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-foreground/55">Members</div>
                <div className="text-2xl font-semibold mt-0.5">{agency.member_count}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-foreground/55">Clients</div>
                <div className="text-2xl font-semibold mt-0.5">{agency.client_count}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-foreground/55">Projects</div>
                <div className="text-2xl font-semibold mt-0.5">{agency.project_count}</div>
              </div>
            </div>

            {/* Suspension reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Suspension reason (visible to the agency)</Label>
              <Textarea
                id="reason"
                rows={2}
                placeholder="Beta access expired. Reach out to formalize the agreement."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                onClick={handleSuspend}
                disabled={!canSuspend || suspend.isPending}
              >
                {suspend.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PauseCircle className="h-4 w-4 mr-2" />}
                Suspend
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                    disabled={isDisabled || disable.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Disable
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable {agency.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Disabling locks this agency out of the app. They keep their data, but can't
                      sign in to do anything until reactivated. Use this for terminated accounts.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisable} className="bg-red-600 hover:bg-red-500">
                      Disable agency
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                variant="default"
                className="col-span-2"
                onClick={handleReactivate}
                disabled={agency.effective_status === "active" || reactivate.isPending}
              >
                {reactivate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Reactivate (set to Active)
              </Button>
            </div>

            {/* Trial */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#A78BFA]" />
                <h4 className="font-semibold text-sm">Trial period</h4>
              </div>
              <p className="text-xs text-foreground/60">
                Set or extend a trial end date. After the date, the agency loses write access until
                reactivated. Leave blank for an open-ended trial.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={trialEndsAt}
                  onChange={(e) => setTrialEndsAt(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleSetTrial} disabled={setTrial.isPending}>
                  {setTrial.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set trial"}
                </Button>
              </div>
              {agency.trial_ends_at && (
                <p className="text-xs text-foreground/55">
                  Currently ends {formatDate(new Date(agency.trial_ends_at), "PPP")}
                </p>
              )}
            </div>

            {/* Admin notes */}
            <div className="space-y-2">
              <Label htmlFor="admin-notes">Admin notes (private to super admins)</Label>
              <Textarea
                id="admin-notes"
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={handleSaveNotes} disabled={updateNotes.isPending}>
                {updateNotes.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save notes
              </Button>
            </div>
          </TabsContent>

          {/* ── Feature flags ────────────────────────────────────────── */}
          <TabsContent value="features" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="flags-json">Feature flags (JSON)</Label>
              <p className="text-xs text-foreground/55">
                Toggles applied to this agency only. Example:{" "}
                <code className="font-mono text-[10px]">
                  {`{ "generate": true, "export": false, "rag": true }`}
                </code>
              </p>
              <Textarea
                id="flags-json"
                rows={10}
                value={flagsJson}
                onChange={(e) => setFlagsJson(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={handleSaveFlags} disabled={updateFlags.isPending}>
                {updateFlags.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save feature flags
              </Button>
            </div>

            {/* Quick toggles for common flags */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
              <div className="text-xs uppercase tracking-widest text-foreground/55 mb-2">
                Quick toggles
              </div>
              {(["generate", "export", "rag", "image_polish", "video"] as const).map((flag) => {
                const current = (agency.feature_flags as any)?.[flag] !== false;
                return (
                  <div key={flag} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{flag.replace(/_/g, " ")}</span>
                    <Switch
                      checked={current}
                      onCheckedChange={(v) => {
                        const next = { ...(agency.feature_flags as any), [flag]: v };
                        updateFlags
                          .mutateAsync({ agencyId: agency.id, flags: next })
                          .then(() =>
                            toast({ title: `${flag.replace(/_/g, " ")} ${v ? "enabled" : "disabled"}` }),
                          )
                          .catch((e) =>
                            toast({
                              title: "Update failed",
                              description: e instanceof Error ? e.message : String(e),
                              variant: "destructive",
                            }),
                          );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Quotas ───────────────────────────────────────────────── */}
          <TabsContent value="quotas" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="quotas-json">Quotas (JSON)</Label>
              <p className="text-xs text-foreground/55">
                Numeric limits applied to this agency. Example:{" "}
                <code className="font-mono text-[10px]">
                  {`{ "max_seats": 15, "max_projects": 50, "ai_compute_monthly": 10000 }`}
                </code>
              </p>
              <Textarea
                id="quotas-json"
                rows={10}
                value={quotasJson}
                onChange={(e) => setQuotasJson(e.target.value)}
                className="font-mono text-xs"
              />
              <Button onClick={handleSaveQuotas} disabled={updateQuotas.isPending}>
                {updateQuotas.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save quotas
              </Button>
            </div>
          </TabsContent>

          {/* ── Audit log ────────────────────────────────────────────── */}
          <TabsContent value="log" className="space-y-3 mt-4">
            <div className="flex items-center gap-2 text-xs text-foreground/55 mb-2">
              <History className="h-3.5 w-3.5" />
              Append-only log of every change.
            </div>
            {logLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : log.length === 0 ? (
              <p className="text-sm text-foreground/55 text-center py-8">No log entries yet.</p>
            ) : (
              <div className="space-y-2">
                {log.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium">{entry.action.replace(/_/g, " ")}</span>
                      <span className="text-xs text-foreground/50">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {entry.performer_email && (
                      <div className="text-xs text-foreground/60">by {entry.performer_email}</div>
                    )}
                    {entry.reason && (
                      <div className="text-xs mt-1 text-foreground/70 italic">"{entry.reason}"</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminAgencies() {
  const { data: isSuper, isLoading: roleLoading } = useIsSuperAdmin();
  const { data: agencies, isLoading } = useAdminAgencies();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AgencyAdminRow | null>(null);

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuper) {
    return <Navigate to="/projects" replace />;
  }

  const filtered = (agencies ?? []).filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.slug.toLowerCase().includes(search.toLowerCase()) ||
      (a.owner_email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Agencies</h1>
              <p className="text-sm text-muted-foreground">
                Suspend, disable, set trial windows, and feature-flag every agency on the platform.
              </p>
            </div>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, slug, or owner email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Stats summary */}
        {agencies && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryCard label="Total" value={agencies.length} />
            <SummaryCard
              label="Active"
              value={agencies.filter((a) => a.effective_status === "active").length}
              tone="emerald"
            />
            <SummaryCard
              label="Trial"
              value={agencies.filter((a) => a.effective_status === "trial").length}
              tone="sky"
            />
            <SummaryCard
              label="Suspended"
              value={agencies.filter((a) => a.effective_status === "suspended" || a.effective_status === "trial_expired").length}
              tone="amber"
            />
            <SummaryCard
              label="Disabled"
              value={agencies.filter((a) => a.effective_status === "disabled").length}
              tone="red"
            />
          </div>
        )}

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All agencies</CardTitle>
            <CardDescription>
              Click an agency to open its access controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {search ? "No agencies match your search." : "No agencies yet."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="w-full text-left px-5 py-3 hover:bg-white/[0.02] transition-colors flex items-center gap-4"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 border border-white/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{a.name}</span>
                        <StatusPill status={a.effective_status} />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                        <span className="font-mono">{a.slug}</span>
                        {a.owner_email && <span>· {a.owner_email}</span>}
                        <span>· {a.member_count} members · {a.project_count} projects</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground shrink-0 hidden md:block">
                      Active {formatDistanceToNow(new Date(a.last_activity_at), { addSuffix: true })}
                    </div>

                    <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AgencyDetailDrawer
        agency={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </AppLayout>
  );
}

// ─── SummaryCard ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "emerald" | "sky" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "text-foreground",
    emerald: "text-emerald-400",
    sky: "text-sky-300",
    amber: "text-amber-300",
    red: "text-red-300",
  }[tone];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-widest text-foreground/55">{label}</div>
      <div className={cn("text-3xl font-semibold mt-1", toneClass)}>{value}</div>
    </div>
  );
}
