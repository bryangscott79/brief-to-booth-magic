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
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { usePlatformOwner } from "@/contexts/PlatformOwnerContext";
import { toast } from "sonner";

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

      // Team members (where this user is the team owner)
      const { data: teamMembers } = await (supabase as any)
        .from("team_members")
        .select("id, display_name, role, created_at, accepted_at, invited_email")
        .eq("team_owner_id", userId)
        .order("created_at", { ascending: false });

      return {
        profile,
        projects: projects ?? [],
        teamMembers: (teamMembers as any[]) ?? [],
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

  const { profile, projects, teamMembers } = account;
  const displayName = profile.display_name || profile.email || `User …${profile.user_id.slice(-6)}`;

  const roleTier = profile.is_super_admin
    ? { label: "Platform Owner", icon: Crown, color: "text-amber-600 bg-amber-500/10" }
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
            value={teamMembers.length}
            icon={Users}
            sub={`${teamMembers.filter((m: any) => m.accepted_at).length} active`}
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

        {/* Team roster */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Team Roster
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!teamMembers.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No team members yet
              </p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((member: any) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0">
                        {(member.display_name || member.invited_email || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.display_name || member.invited_email || "Pending"}
                        </p>
                        {member.invited_email && member.display_name && (
                          <p className="text-xs text-muted-foreground truncate">{member.invited_email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {member.role}
                      </Badge>
                      {member.accepted_at ? (
                        <span className="text-[10px] text-primary font-medium">Active</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Pending</span>
                      )}
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
