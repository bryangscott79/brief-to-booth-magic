import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, UserPlus, Shield, Eye, Pencil, Trash2, Mail, Loader2, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
  type TeamMember,
} from "@/hooks/useTeam";
import { formatDistanceToNow } from "date-fns";

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
  admin: { label: "Admin", icon: Shield, color: "text-red-500", description: "Full access — can manage team and delete projects" },
  designer: { label: "Designer", icon: Pencil, color: "text-blue-500", description: "Edit projects, upload renders, generate elements" },
  viewer: { label: "Viewer", icon: Eye, color: "text-gray-500", description: "Read-only access, can download exports" },
};

export function TeamManager() {
  const { user } = useAuth();
  const { data: members = [], isLoading } = useTeamMembers();
  const inviteMember = useInviteTeamMember();
  const updateMember = useUpdateTeamMember();
  const removeMember = useRemoveTeamMember();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "designer" | "viewer">("designer");

  // Filter to show only members this user owns (not memberships in other teams)
  const ownedMembers = members.filter((m) => m.team_owner_id === user?.id && m.user_id !== user?.id);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteDisplayName.trim()) return;
    await inviteMember.mutateAsync({
      email: inviteEmail.trim(),
      displayName: inviteDisplayName.trim(),
      role: inviteRole,
    });
    setInviteEmail("");
    setInviteDisplayName("");
    setInviteRole("designer");
    setIsInviteOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Team Members</h2>
          <p className="text-sm text-muted-foreground">
            Add core team members who can access all projects
          </p>
        </div>
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Add a core team member. They&apos;ll have access to all projects based on their role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  placeholder="e.g., Matt Rodriguez"
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="matt@agency.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                          <span>{config.label}</span>
                          <span className="text-xs text-muted-foreground">— {config.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
              <Button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || !inviteDisplayName.trim() || inviteMember.isPending}
              >
                {inviteMember.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Member List */}
      {ownedMembers.length === 0 ? (
        <Card className="element-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserPlus className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">No team members yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Invite your team to collaborate on projects. Team members get access to all projects based on their role.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {ownedMembers.map((member) => (
            <TeamMemberCard
              key={member.id}
              member={member}
              onUpdateRole={(role) => updateMember.mutate({ id: member.id, updates: { role } })}
              onRemove={() => removeMember.mutate(member.id)}
              isUpdating={updateMember.isPending}
            />
          ))}
        </div>
      )}

      {/* Owner info */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            You (Owner)
          </CardTitle>
          <CardDescription className="text-xs">
            {user?.email} — Full admin access to all projects, team, and settings
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// ---------- Team Member Card ----------

function TeamMemberCard({
  member,
  onUpdateRole,
  onRemove,
  isUpdating,
}: {
  member: TeamMember;
  onUpdateRole: (role: "admin" | "designer" | "viewer") => void;
  onRemove: () => void;
  isUpdating: boolean;
}) {
  const config = ROLE_CONFIG[member.role];
  const Icon = config?.icon || Eye;
  const isPending = !member.accepted_at;

  return (
    <Card className="element-card">
      <CardContent className="flex items-center justify-between py-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-muted ${config?.color || ""}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{member.display_name}</span>
              {isPending ? (
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="h-3 w-3" /> Pending
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </Badge>
              )}
            </div>
            {member.invited_email && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Mail className="h-3 w-3" />
                {member.invited_email}
              </div>
            )}
            <span className="text-xs text-muted-foreground">
              Added {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={member.role}
            onValueChange={(v) => onUpdateRole(v as "admin" | "designer" | "viewer")}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will revoke {member.display_name}&apos;s access to all projects. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove} className="bg-destructive hover:bg-destructive/90">
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
