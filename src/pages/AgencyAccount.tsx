import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Crown,
  Shield,
  FolderOpen,
  Users,
  Calendar,
  Activity,
  CreditCard,
  Eye,
  Loader2,
  User,
  Clock,
  Building2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { usePlatformOwner } from "@/contexts/PlatformOwnerContext";
import { toast } from "sonner";
import { useState } from "react";
import {
  useIsSuperAdmin,
  useUserMemberships,
  useInviteUser,
  useRemoveAgencyMember,
  useDeleteUserAccount,
} from "@/hooks/useAdminRole";
import { useAdminAgencies } from "@/hooks/useAccessControl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  reviewed: "bg-blue-500/10 text-blue-600",
  generating: "bg-amber-500/10 text-amber-600",
  complete: "bg-emerald-500/10 text-emerald-600",
};

const SUBSCRIPTION_TIERS = [
  { id: "free", label: "Free", color: "bg-muted text-muted-foreground" },
  { id: "starter", label: "Starter", color: "bg-blue-500/10 text-blue-600" },
  { id: "professional", label: "Professional", color: "bg-primary/10 text-primary" },
  { id: "agency", label: "Agency", color: "bg-purple-500/10 text-purple-600" },
  { id: "enterprise", label: "Enterprise", color: "bg-amber-500/10 text-amber-600" },
];

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Super-admin controls: which agencies this user belongs to, plus account
 *  deletion. Members/agency admins never see this card. */
function MembershipCard({ userId, userEmail }: { userId: string; userEmail: string | null }) {
  const navigate = useNavigate();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { data: memberships, isLoading } = useUserMemberships(userId, !!isSuperAdmin);
  const { data: agencies } = useAdminAgencies();
  const addToAgency = useInviteUser();
  const removeMember = useRemoveAgencyMember();
  const deleteAccount = useDeleteUserAccount();
  const [addAgencyId, setAddAgencyId] = useState("");
  const [addRole, setAddRole] = useState("member");

  if (!isSuperAdmin) return null;

  const memberAgencyIds = new Set((memberships ?? []).map((m) => m.agency_id));
  const addable = (agencies ?? []).filter((a) => !memberAgencyIds.has(a.id));

  const handleAdd = async () => {
    if (!addAgencyId || !userEmail) return;
    try {
      await addToAgency.mutateAsync({ email: userEmail, role: addRole, agencyId: addAgencyId });
      toast.success("Added to agency");
      setAddAgencyId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add to agency");
    }
  };

  const handleRemove = async (agencyId: string, agencyName: string | null) => {
    try {
      await removeMember.mutateAsync({ agencyId, userId });
      toast.success(`Removed from ${agencyName ?? "agency"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove member");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount.mutateAsync(userId);
      toast.success("Account deleted");
      navigate("/admin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete account");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Agency Membership
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {memberships?.length ?? 0} agenc{(memberships?.length ?? 0) === 1 ? "y" : "ies"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (memberships ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not a member of any agency — they'll be forced to create one at sign-in unless you add them below.
          </p>
        ) : (
          <div className="space-y-2">
            {(memberships ?? []).map((m) => (
              <div key={m.membership_id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.agency_name ?? m.agency_slug ?? m.agency_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.role}
                    {m.is_primary_owner && " · primary owner"}
                  </p>
                </div>
                {!m.is_primary_owner && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(m.agency_id, m.agency_name)}
                    disabled={removeMember.isPending}
                    title="Remove from agency"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Add to agency</p>
            <Select value={addAgencyId} onValueChange={setAddAgencyId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agency…" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={addRole} onValueChange={setAddRole}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={!addAgencyId || !userEmail || addToAgency.isPending} className="gap-2">
            {addToAgency.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add
          </Button>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Deleting the account removes their login, roles, and memberships. Their projects are preserved. Blocked while they still own an agency.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {userEmail ?? "this account"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes their login and removes them from every agency. Projects they created are preserved. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgencyAccountPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { setPreviewMode } = usePlatformOwner();

  const { data: account, isLoading } = useQuery({
    queryKey: ["agency-account", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) throw new Error("No userId");
      // Profile
      const { data: profiles } = await supabase
        .rpc("get_all_user_profiles" as any);

      const profile = ((profiles as any[]) ?? []).find(
        (p: any) => p.user_id === userId
      );
      if (!profile) throw new Error("User not found");

      // Projects
      const { data: projects, error: projectsError } = await (supabase as any)
        .from("projects")
        .select("id, name, status, activation_type, project_type, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (projectsError) console.error("[AgencyAccount] projects load error", projectsError);

      // Agency owned by this account, plus its canonical agency roster.
      const { data: ownedAgencies, error: agencyError } = await (supabase as any)
        .from("agencies")
        .select("id, name, slug, owner_user_id, created_at, updated_at")
        .eq("owner_user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (agencyError) console.error("[AgencyAccount] agency load error", agencyError);

      const ownedAgency = ((ownedAgencies as any[]) ?? [])[0] ?? null;
      let agencyMembers: any[] = [];

      if (ownedAgency?.id) {
        const { data: members, error: membersError } = await (supabase.rpc as any)("list_agency_members", {
          _agency_id: ownedAgency.id,
        });
        if (membersError) console.error("[AgencyAccount] agency members load error", membersError);
        agencyMembers = (members as any[]) ?? [];
      }

      return {
        profile,
        projects: projects ?? [],
        ownedAgency,
        agencyMembers,
      };
    },
  });

  const handlePreviewAsAgency = () => {
    setPreviewMode(true);
    navigate("/projects");
    toast.info("Preview mode active — browsing as Agency Admin", {
      description: "Your navigation has switched to agency view. Use the banner to exit.",
      duration: 5000,
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="container max-w-4xl py-8">
          <p className="text-muted-foreground">Account not found.</p>
        </div>
      </AppLayout>
    );
  }

  const { profile, projects, ownedAgency, agencyMembers } = account;
  const displayName = profile.display_name || profile.email || `User …${profile.user_id.slice(-6)}`;
  const isAgencyOwner = !!ownedAgency && ownedAgency.owner_user_id === profile.user_id;

  const roleTier = profile.is_super_admin
    ? { label: "Platform Owner", icon: Crown, color: "text-amber-600 bg-amber-500/10" }
    : isAgencyOwner
    ? { label: "Agency Owner", icon: Crown, color: "text-primary bg-primary/10" }
    : profile.is_admin
    ? { label: "Agency Admin", icon: Shield, color: "text-primary bg-primary/10" }
    : { label: "Member", icon: User, color: "text-muted-foreground bg-muted" };

  return (
    <AppLayout>
      <div className="container max-w-5xl py-8 space-y-6">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 -ml-1 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/admin")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold",
                profile.is_super_admin
                  ? "bg-amber-500 text-white"
                  : profile.is_admin
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {profile.is_super_admin ? (
                <Crown className="h-6 w-6" />
              ) : (
                (profile.display_name || profile.email || "?").slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
                <Badge className={cn("text-xs h-5 border-0", roleTier.color)}>
                  <roleTier.icon className="h-3 w-3 mr-1" />
                  {roleTier.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {profile.email} · Joined {format(new Date(profile.created_at), "MMMM yyyy")}
              </p>
              {ownedAgency && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>
                    {isAgencyOwner ? "Account owner" : "Member"} for {ownedAgency.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {ownedAgency.slug}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
            onClick={handlePreviewAsAgency}
          >
            <Eye className="h-4 w-4" />
            Preview as Agency Admin
          </Button>
        </div>

        <Separator />

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Projects"
            value={projects.length}
            icon={FolderOpen}
            sub={`${projects.filter((p: any) => p.status === "complete").length} complete`}
          />
          <StatCard
            label="Team Members"
            value={agencyMembers.length}
            icon={Users}
            sub={ownedAgency ? `${ownedAgency.name} roster` : "No agency"}
          />
          <StatCard
            label="Last Active"
            value={projects.length ? formatDistanceToNow(new Date(projects[0].updated_at)) : "—"}
            icon={Activity}
            sub="ago"
          />
          <StatCard
            label="Member Since"
            value={format(new Date(profile.created_at), "MMM yyyy")}
            icon={Calendar}
          />
        </div>

        {/* Subscription tier */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              {SUBSCRIPTION_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                    // For now default to "free" — this will be wired to real billing later
                    tier.id === "free"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40"
                  )}
                >
                  {tier.label}
                </button>
              ))}
              <p className="text-xs text-muted-foreground ml-auto">
                Billing integration coming soon
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Agency membership management (super admin) */}
        <MembershipCard userId={profile.user_id} userEmail={profile.email} />

        {/* Team roster */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Roster
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {agencyMembers.length} member{agencyMembers.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!agencyMembers.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No team members yet
              </p>
            ) : (
              <div className="space-y-2">
                {agencyMembers.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0">
                        {(member.email || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.email || `User …${member.user_id?.slice(-6) ?? ""}`}
                        </p>
                        {member.is_primary_owner && (
                          <p className="text-xs text-muted-foreground truncate">Account owner for {ownedAgency?.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {member.is_primary_owner ? "owner" : member.role}
                      </Badge>
                      <span className="text-[10px] text-primary font-medium">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent projects */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Recent Projects
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {projects.length} total
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!projects.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 8).map((project: any) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[project.status] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          {project.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {(project.activation_type ?? project.project_type ?? "").replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {format(new Date(project.updated_at), "MMM d, yyyy")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
