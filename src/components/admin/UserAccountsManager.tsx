import { useState } from "react";
import { useAdminProfiles, useInviteUser, usePlatformInvites, useManageAdminRole, useIsSuperAdmin, UserProfile } from "@/hooks/useAdminRole";
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
  Users,
  ChevronRight,
  FolderOpen,
  Search,
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
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";


function getInitials(email: string | null, displayName: string | null) {
  if (displayName) return displayName.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

function getDisplayLabel(profile: UserProfile) {
  return profile.display_name || profile.email || `User …${profile.user_id.slice(-6)}`;
}

// ─── Invite Dialog ────────────────────────────────────────────────────────────
function InviteDialog({
  open,
  onClose,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  isSuperAdmin: boolean;
}) {
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
                    <span className="font-medium">Agency Admin</span>
                    <span className="text-xs text-muted-foreground">Manages their agency team and projects</span>
                  </div>
                </SelectItem>
                {isSuperAdmin && (
                  <SelectItem value="super_admin">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">Platform Owner</span>
                      <span className="text-xs text-muted-foreground">Full platform access — all agencies and users</span>
                    </div>
                  </SelectItem>
                )}
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

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ profile }: { profile: UserProfile }) {
  if (profile.is_super_admin) {
    return (
      <Badge className="h-4 text-[10px] px-1.5 bg-amber-500/10 text-amber-600 border-0">
        <Crown className="h-2.5 w-2.5 mr-0.5" />
        Platform Owner
      </Badge>
    );
  }
  if (profile.is_admin) {
    return (
      <Badge className="h-4 text-[10px] px-1.5 bg-primary/10 text-primary border-0">
        <Shield className="h-2.5 w-2.5 mr-0.5" />
        Agency Admin
      </Badge>
    );
  }
  return null;
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  profile,
  currentUserId,
  currentUserIsSuperAdmin,
}: {
  profile: UserProfile;
  currentUserId: string | undefined;
  currentUserIsSuperAdmin: boolean;
}) {
  const navigate = useNavigate();
  const manageRole = useManageAdminRole();

  const isSelf = profile.user_id === currentUserId;

  const toggleAdmin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (profile.is_admin) {
        await manageRole.mutateAsync({ target_user_id: profile.user_id, action: "revoke_admin" });
        toast.success(`Agency Admin removed from ${getDisplayLabel(profile)}`);
      } else {
        await manageRole.mutateAsync({ target_user_id: profile.user_id, action: "grant_admin" });
        toast.success(`${getDisplayLabel(profile)} is now an Agency Admin`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    }
  };

  const avatarClass = profile.is_super_admin
    ? "bg-amber-500 text-white"
    : profile.is_admin
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground";

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 transition-colors group"
      onClick={() => navigate(`/account/${profile.user_id}`)}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarClass)}>
              {profile.is_super_admin
                ? <Crown className="h-4 w-4" />
                : getInitials(profile.email, profile.display_name)}
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
                <RoleBadge profile={profile} />
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
            {!isSelf && currentUserIsSuperAdmin && !profile.is_super_admin && (
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                  profile.is_admin
                    ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:text-primary"
                )}
                onClick={toggleAdmin}
                disabled={manageRole.isPending}
              >
                {manageRole.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : profile.is_admin ? (
                  <ShieldOff className="h-3 w-3" />
                ) : (
                  <Shield className="h-3 w-3" />
                )}
                {profile.is_admin ? "Remove Admin" : "Make Agency Admin"}
              </Button>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </CardHeader>
    </Card>
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
                          accepted ? "bg-primary/10 text-primary" :
                          expired  ? "bg-muted text-muted-foreground" :
                                     "bg-accent text-accent-foreground"
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
                        <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Accepted
                        </span>
                      ) : expired ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          Expired
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-foreground/60 font-medium">
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
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = (profiles ?? []).filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.email?.toLowerCase().includes(q) ||
      p.display_name?.toLowerCase().includes(q) ||
      p.user_id.toLowerCase().includes(q) ||
      p.projects?.some((proj) => proj.project_title.toLowerCase().includes(q))
    );
  });

  const totalProjects = (profiles ?? []).reduce((s, p) => s + (p.projects?.length ?? 0), 0);
  const adminCount = (profiles ?? []).filter((p) => p.is_admin && !p.is_super_admin).length;
  const superAdminCount = (profiles ?? []).filter((p) => p.is_super_admin).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        isSuperAdmin={!!isSuperAdmin}
      />

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
          <div className="grid grid-cols-4 gap-4">
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
                <p className="text-xs text-muted-foreground mt-0.5">Agency Admins</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="pt-5 pb-4">
                <p className="text-2xl font-bold text-amber-600">{superAdminCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Platform Owners</p>
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

          {/* User list — platform owners first, then agency admins, then members */}
          <div className="space-y-2">
            {[...filtered]
              .sort((a, b) => {
                if (a.is_super_admin && !b.is_super_admin) return -1;
                if (!a.is_super_admin && b.is_super_admin) return 1;
                if (a.is_admin && !b.is_admin) return -1;
                if (!a.is_admin && b.is_admin) return 1;
                return 0;
              })
              .map((profile) => (
                <UserRow
                  key={profile.user_id}
                  profile={profile}
                  currentUserId={user?.id}
                  currentUserIsSuperAdmin={!!isSuperAdmin}
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
