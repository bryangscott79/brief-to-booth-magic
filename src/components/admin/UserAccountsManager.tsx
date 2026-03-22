import { useState } from "react";
import { useAdminProfiles, useInviteUser, usePlatformInvites, useManageAdminRole, UserProfile } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search,
  Eye,
  Calendar,
  Loader2,
  UserPlus,
  Shield,
  ShieldOff,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  reviewed: "bg-blue-500/10 text-blue-600",
  generating: "bg-amber-500/10 text-amber-600",
  complete: "bg-emerald-500/10 text-emerald-600",
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  trade_show_booth: "Trade Show",
  live_brand_activation: "Brand Activation",
  permanent_installation: "Permanent Install",
  pop_up_retail: "Pop-Up Retail",
  corporate_environment: "Corporate",
  museum_exhibit: "Museum",
};

function getInitials(email: string | null, displayName: string | null) {
  if (displayName) return displayName.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

function getDisplayLabel(profile: UserProfile) {
  return profile.display_name || profile.email || `User …${profile.user_id.slice(-6)}`;
}

// ─── Invite Dialog ────────────────────────────────────────────────────────────
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const invite = useInviteUser();

  const handleSubmit = async () => {
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send invitation");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite User to Platform
          </DialogTitle>
          <DialogDescription>
            The user will receive an email with a link to set up their account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Member</span>
                    <span className="text-xs text-muted-foreground">Can create and manage their own projects</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Admin</span>
                    <span className="text-xs text-muted-foreground">Full access to all accounts and projects</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleSubmit}
              disabled={!email.trim() || invite.isPending}
            >
              {invite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Invite
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  profile,
  currentUserId,
}: {
  profile: UserProfile;
  currentUserId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const manageRole = useManageAdminRole();

  const isSelf = profile.user_id === currentUserId;

  const toggleAdmin = async () => {
    try {
      if (profile.is_admin) {
        await manageRole.mutateAsync({ target_user_id: profile.user_id, action: "revoke_admin" });
        toast.success(`Admin removed from ${getDisplayLabel(profile)}`);
      } else {
        await manageRole.mutateAsync({ target_user_id: profile.user_id, action: "grant_admin" });
        toast.success(`${getDisplayLabel(profile)} is now an admin`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Card className="cursor-pointer hover:border-primary/40 transition-colors group">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar */}
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    profile.is_admin
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {getInitials(profile.email, profile.display_name)}
                </div>

                {/* Identity */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">
                      {getDisplayLabel(profile)}
                      {isSelf && (
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(you)</span>
                      )}
                    </p>
                    {profile.is_admin && (
                      <Badge className="h-4 text-[10px] px-1.5 bg-primary/10 text-primary border-0">
                        <Shield className="h-2.5 w-2.5 mr-0.5" />
                        Admin
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {profile.projects?.length ?? 0} project{(profile.projects?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Joined {format(new Date(profile.created_at), "MMM yyyy")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                      profile.is_admin
                        ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                        : "text-muted-foreground hover:text-primary"
                    )}
                    onClick={(e) => { e.stopPropagation(); toggleAdmin(); }}
                    disabled={manageRole.isPending}
                  >
                    {manageRole.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : profile.is_admin ? (
                      <ShieldOff className="h-3 w-3" />
                    ) : (
                      <Shield className="h-3 w-3" />
                    )}
                    {profile.is_admin ? "Remove Admin" : "Make Admin"}
                  </Button>
                )}
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </Card>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 pl-4 border-l-2 border-border/60 space-y-2 mt-1 mb-3">
          {!profile.projects?.length ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No projects yet</p>
          ) : (
            profile.projects.map((project) => (
              <Card key={project.id} className="bg-muted/30 border-border/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                            STATUS_COLORS[project.status] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          {project.status}
                        </span>
                        <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                          {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type.replace(/_/g, " ")}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(project.updated_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => navigate(`/review?project=${project.id}`)}
                        title="View brief"
                      >
                        <Eye className="h-3 w-3" />
                        Brief
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => navigate(`/generate?project=${project.id}`)}
                        title="Open project"
                      >
                        <LayoutGrid className="h-3 w-3" />
                        Open
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Invites Tab ──────────────────────────────────────────────────────────────
function InvitesTab({ onInvite }: { onInvite: () => void }) {
  const { data: invites, isLoading } = usePlatformInvites();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {invites?.length ?? 0} invitation{(invites?.length ?? 0) !== 1 ? "s" : ""} sent
        </p>
        <Button size="sm" className="gap-2" onClick={onInvite}>
          <UserPlus className="h-4 w-4" />
          New Invite
        </Button>
      </div>

      {!invites?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No invitations sent yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => {
            const accepted = !!inv.accepted_at;
            const expired = !accepted && new Date(inv.expires_at) < new Date();
            return (
              <Card key={inv.id} className="border-border/60">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          accepted ? "bg-emerald-500/10 text-emerald-600" :
                          expired  ? "bg-muted text-muted-foreground" :
                                     "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {inv.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inv.email}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                            {inv.role}
                          </Badge>
                          <span>{format(new Date(inv.created_at), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {accepted ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Accepted
                        </span>
                      ) : expired ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          Expired
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                          <Clock className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function UserAccountsManager() {
  const { data: profiles, isLoading } = useAdminProfiles();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = (profiles ?? []).filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.email?.toLowerCase().includes(q) ||
      p.display_name?.toLowerCase().includes(q) ||
      p.user_id.toLowerCase().includes(q) ||
      p.projects?.some((proj) => proj.name.toLowerCase().includes(q))
    );
  });

  const totalProjects = (profiles ?? []).reduce((s, p) => s + (p.projects?.length ?? 0), 0);
  const adminCount = (profiles ?? []).filter((p) => p.is_admin).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <Tabs defaultValue="users">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              All Users
              <Badge variant="secondary" className="ml-1 text-xs h-4 px-1.5">
                {profiles?.length ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-2">
              <Mail className="h-4 w-4" />
              Invitations
            </TabsTrigger>
          </TabsList>

          <Button className="gap-2" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite User
          </Button>
        </div>

        {/* ── Users Tab ── */}
        <TabsContent value="users" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-bold">{profiles?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total accounts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-bold">{totalProjects}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total projects</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-bold">{adminCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Admin users</p>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email, name, or project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">
                {search ? "No users match your search" : "No accounts found"}
              </p>
              {!search && (
                <p className="text-xs opacity-70">
                  Users will appear here once they sign up or are invited
                </p>
              )}
            </div>
          )}

          {/* User list */}
          <div className="space-y-2">
            {filtered.map((profile) => (
              <UserRow
                key={profile.user_id}
                profile={profile}
                currentUserId={user?.id}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── Invites Tab ── */}
        <TabsContent value="invites">
          <InvitesTab onInvite={() => setInviteOpen(true)} />
        </TabsContent>
      </Tabs>
    </>
  );
}
