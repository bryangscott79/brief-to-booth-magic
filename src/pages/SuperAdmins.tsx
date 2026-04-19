// SuperAdmins — platform-level super admin management.
// Route: /admin/super-admins
//
// Only accessible to existing super admins. Allows inviting new super admins
// by email and revoking existing super admin roles.

import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Crown, Loader2, UserPlus, Mail, Trash2, Clock, Shield } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { useAuth } from "@/hooks/useAuth";
import {
  useSuperAdmins,
  useSuperAdminInvites,
  useInviteSuperAdmin,
  useCancelSuperAdminInvite,
  useRevokeSuperAdmin,
} from "@/hooks/useSuperAdmins";

export default function SuperAdminsPage() {
  const { user } = useAuth();
  const { data: isSuperAdmin, isLoading: checkingRole } = useIsSuperAdmin();
  const { toast } = useToast();

  const { data: admins = [], isLoading: loadingAdmins } = useSuperAdmins();
  const { data: invites = [], isLoading: loadingInvites } = useSuperAdminInvites();
  const invite = useInviteSuperAdmin();
  const cancelInvite = useCancelSuperAdminInvite();
  const revoke = useRevokeSuperAdmin();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  if (checkingRole) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/projects" replace />;
  }

  const handleInvite = async () => {
    try {
      await invite.mutateAsync(inviteEmail);
      toast({ title: "Invite created", description: `${inviteEmail} will become a super admin on sign-up.` });
      setInviteOpen(false);
      setInviteEmail("");
    } catch (e) {
      toast({
        title: "Invite failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (userId: string, email: string) => {
    if (userId === user?.id) {
      if (!confirm("Revoke YOUR own super admin access? You'll lose platform-level privileges.")) return;
    } else {
      if (!confirm(`Revoke super admin access for ${email}?`)) return;
    }
    try {
      await revoke.mutateAsync(userId);
      toast({ title: "Super admin revoked" });
    } catch (e) {
      toast({
        title: "Revoke failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Super Admins</h1>
              <p className="text-sm text-muted-foreground">
                Platform-level administrators with access to every agency.
              </p>
            </div>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite super admin
          </Button>
        </div>

        {/* Current super admins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active</CardTitle>
            <CardDescription>
              {admins.length} {admins.length === 1 ? "account" : "accounts"} with super admin access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAdmins ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No super admins found.</p>
            ) : (
              <div className="space-y-2">
                {admins.map((a) => (
                  <div
                    key={a.user_id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <Crown className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {a.email}
                        {a.user_id === user?.id && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Granted {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(a.user_id, a.email)}
                      disabled={admins.length === 1 || revoke.isPending}
                      title={admins.length === 1 ? "Cannot revoke the last super admin" : "Revoke"}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending invites */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
            <CardDescription>
              Users become super admins automatically when they sign up with these emails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingInvites ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending invites.</p>
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
                      </div>
                    </div>
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

        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200">
                Super admins can view and impersonate any agency. Grant this role with care.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite super admin</DialogTitle>
              <DialogDescription>
                When this user signs up with the email below, they'll automatically be granted
                platform-level super admin access.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="sa-invite-email">Email</Label>
                <Input
                  id="sa-invite-email"
                  type="email"
                  placeholder="admin@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
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
      </div>
    </AppLayout>
  );
}
