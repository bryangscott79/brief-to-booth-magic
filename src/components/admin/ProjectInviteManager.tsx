import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Link2, Plus, Trash2, Copy, Check, Loader2, Clock, Upload, Eye, Pencil } from "lucide-react";
import {
  useProjectInvites,
  useCreateInviteLink,
  useRevokeInvite,
  type ProjectInvite,
} from "@/hooks/useTeam";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const SCOPE_CONFIG: Record<string, { label: string; icon: typeof Upload; color: string; description: string }> = {
  upload_only: { label: "Upload Only", icon: Upload, color: "text-green-500", description: "Can upload files (Rhino renders) to this project" },
  view_comment: { label: "View & Comment", icon: Eye, color: "text-blue-500", description: "Can view project outputs and leave comments" },
  full_edit: { label: "Full Edit", icon: Pencil, color: "text-orange-500", description: "Can edit project, generate elements, upload files" },
};

interface ProjectInviteManagerProps {
  projectId: string;
  projectName?: string;
}

export function ProjectInviteManager({ projectId, projectName }: ProjectInviteManagerProps) {
  const { data: invites = [], isLoading } = useProjectInvites(projectId);
  const createInvite = useCreateInviteLink();
  const revokeInvite = useRevokeInvite();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [scope, setScope] = useState<"upload_only" | "view_comment" | "full_edit">("upload_only");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCreate = async () => {
    const result = await createInvite.mutateAsync({
      projectId,
      scope,
      label: label.trim() || undefined,
      email: email.trim() || undefined,
      expiresInDays: parseInt(expiresInDays, 10),
    });

    // Auto-copy the invite link
    const link = `${window.location.origin}/invite/${result.token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied to clipboard!", description: link });

    setLabel("");
    setEmail("");
    setScope("upload_only");
    setIsCreateOpen(false);
  };

  const handleCopy = async (invite: ProjectInvite) => {
    const link = `${window.location.origin}/invite/${invite.token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeInvites = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const usedOrExpiredInvites = invites.filter((i) => i.accepted_at || new Date(i.expires_at) <= new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Contractor Invite Links
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Share project-scoped access links with external contractors
            {projectName && <> for <strong>{projectName}</strong></>}
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Invite Link</DialogTitle>
              <DialogDescription>
                Generate a shareable link for a contractor. They&apos;ll only have access to this project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Label (optional)</label>
                <Input
                  placeholder="e.g., Matt's Rhino designer"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email (optional)</label>
                <Input
                  type="email"
                  placeholder="designer@studio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Access Level</label>
                <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCOPE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {SCOPE_CONFIG[scope]?.description}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Expires in</label>
                <Select value={expiresInDays} onValueChange={setExpiresInDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createInvite.isPending}>
                {createInvite.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Create & Copy Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : invites.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Link2 className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No invite links yet. Create one to share project access with contractors.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Active invites */}
          {activeInvites.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</h4>
              {activeInvites.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  isCopied={copiedId === invite.id}
                  onCopy={() => handleCopy(invite)}
                  onRevoke={() => revokeInvite.mutate({ id: invite.id, projectId })}
                />
              ))}
            </div>
          )}

          {/* Used/expired invites */}
          {usedOrExpiredInvites.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Used / Expired
              </h4>
              {usedOrExpiredInvites.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  isCopied={copiedId === invite.id}
                  onCopy={() => handleCopy(invite)}
                  onRevoke={() => revokeInvite.mutate({ id: invite.id, projectId })}
                  disabled
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Invite Card ----------

function InviteCard({
  invite,
  isCopied,
  onCopy,
  onRevoke,
  disabled,
}: {
  invite: ProjectInvite;
  isCopied: boolean;
  onCopy: () => void;
  onRevoke: () => void;
  disabled?: boolean;
}) {
  const scopeConfig = SCOPE_CONFIG[invite.scope];
  const isExpired = new Date(invite.expires_at) <= new Date();
  const isAccepted = !!invite.accepted_at;

  return (
    <Card className={`element-card ${disabled ? "opacity-60" : ""}`}>
      <CardContent className="flex items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted`}>
            {scopeConfig ? <scopeConfig.icon className={`h-3.5 w-3.5 ${scopeConfig.color}`} /> : <Link2 className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {invite.label || invite.email || "Unnamed link"}
              </span>
              <Badge variant={isAccepted ? "default" : isExpired ? "outline" : "secondary"} className="text-xs shrink-0">
                {isAccepted ? "Accepted" : isExpired ? "Expired" : scopeConfig?.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {isExpired
                ? `Expired ${formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}`
                : `Expires ${formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!disabled && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopy}>
              {isCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke Invite?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this invite link. Anyone who hasn&apos;t accepted yet will lose access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRevoke} className="bg-destructive hover:bg-destructive/90">
                  Revoke
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
