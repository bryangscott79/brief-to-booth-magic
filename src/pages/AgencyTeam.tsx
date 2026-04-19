// AgencyTeam — manage team members of the current user's agency.
// Route: /agency/team
//
// Owners/admins can: invite new members by email, change roles, remove members.
// Pending invites apply automatically when the invitee signs up.

import { useState } from "react";
import {
  Loader2,
  UserPlus,
  Users as UsersIcon,
  Mail,
  Trash2,
  Shield,
  Crown,
  Clock,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAgency } from "@/hooks/useAgency";
import {
  useAgencyTeam,
  useAgencyInvites,
  useInviteAgencyMember,
  useCancelAgencyInvite,
  useUpdateAgencyMemberRole,
  useRemoveAgencyMember,
  type AgencyMemberRow,
} from "@/hooks/useAgencyTeam";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin", hint: "Full agency access except ownership transfer" },
  { value: "member", label: "Member", hint: "Create/edit projects and clients" },
  { value: "viewer", label: "Viewer", hint: "Read-only access" },
];

export default function AgencyTeam() {
  const { agency, role: myRole, isLoading: agencyLoading } = useAgency();
  const { toast } = useToast();

  const { data: members = [], isLoading: membersLoading } = useAgencyTeam(agency?.id);
  const { data: invites = [], isLoading: invitesLoading } = useAgencyInvites(agency?.id);
  const invite = useInviteAgencyMember(agency?.id);
  const cancelInvite = useCancelAgencyInvite(agency?.id);
  const updateRole = useUpdateAgencyMemberRole(agency?.id);
  const removeMember = useRemoveAgencyMember(agency?.id);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const canManage = myRole === "owner" || myRole === "admin";

  const handleInvite = async () => {
    try {
      await invite.mutateAsync({ email: inviteEmail, role: inviteRole });
      toast({ title: "Invite sent", description: `Invitation created for ${inviteEmail}.` });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    } catch (e) {
      toast({
        title: "Invite failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (member: AgencyMemberRow, newRole: string) => {
    if (member.is_primary_owner) {
      toast({ title: "Cannot change primary owner's role", variant: "destructive" });
      return;
    }
    try {
      await updateRole.mutateAsync({
        memberId: member.id,
        role: newRole as "owner" | "admin" | "member" | "viewer",
      });
      toast({ title: "Role updated" });
    } catch (e) {
      toast({
        title: "Role update failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRemove = async (member: AgencyMemberRow) => {
    if (member.is_primary_owner) {
      toast({ title: "Cannot remove the primary owner", variant: "destructive" });
      return;
    }
    if (!confirm(`Remove ${member.email} from ${agency?.name || "the agency"}?`)) return;
    try {
      await removeMember.mutateAsync(member.id);
      toast({ title: "Member removed" });
    } catch (e) {
      toast({
        title: "Remove failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  if (agencyLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!agency) {
    return (
      <AppLayout>
        <Card className="p-6 max-w-3xl mx-auto mt-10">
          <CardContent>
            <p className="text-muted-foreground">You aren't a member of an agency yet.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Members of {agency.name}. Owners and admins can invite new teammates and assign roles.
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite member
            </Button>
          )}
        </div>

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "person" : "people"} in this agency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {m.is_primary_owner ? (
                        <Crown className="h-4 w-4 text-primary" />
                      ) : (
                        <span className="text-xs font-semibold text-primary">
                          {m.email[0]?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{m.email}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {formatDistanceToNow(new Date(m.joined_at), { addSuffix: true })}
                        {m.is_primary_owner && " · Primary owner"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canManage && !m.is_primary_owner ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleRoleChange(m, v)}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {m.role}
                        </Badge>
                      )}
                      {canManage && !m.is_primary_owner && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemove(m)}
                          title="Remove member"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending invites */}
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending invites</CardTitle>
              <CardDescription>
                Invitations apply automatically when the invitee signs up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invitesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : invites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No pending invites.
                </p>
              ) : (
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-border"
                    >
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{inv.email}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          Sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                          {inv.expires_at &&
                            ` · expires ${formatDistanceToNow(new Date(inv.expires_at), {
                              addSuffix: true,
                            })}`}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {inv.role}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => cancelInvite.mutate(inv.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Role reference */}
        {canManage && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2 mb-3">
                <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Role reference</div>
                  <div className="text-xs text-muted-foreground">
                    Only the primary owner can transfer ownership to another user.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium">Owner</span>
                  <span className="text-muted-foreground"> · Full control including billing</span>
                </div>
                <div>
                  <span className="font-medium">Admin</span>
                  <span className="text-muted-foreground"> · Manage team, clients, projects</span>
                </div>
                <div>
                  <span className="font-medium">Member</span>
                  <span className="text-muted-foreground"> · Create/edit projects</span>
                </div>
                <div>
                  <span className="font-medium">Viewer</span>
                  <span className="text-muted-foreground"> · Read-only</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invite dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                They'll automatically join {agency.name} when they sign up with this email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@agency.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        <div className="flex flex-col">
                          <span>{r.label}</span>
                          <span className="text-xs text-muted-foreground">{r.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={invite.isPending || !inviteEmail.trim()}>
                {invite.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Send invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!canManage && members.length > 0 && (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                You don't have permission to manage team members. Ask an admin or owner.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
