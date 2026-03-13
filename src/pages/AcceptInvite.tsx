import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAcceptInvite } from "@/hooks/useTeam";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const acceptInvite = useAcceptInvite();
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    // If not authenticated, redirect to auth with return URL
    if (!authLoading && !user) {
      navigate(`/auth?redirect=/invite/${token}`);
    }
  }, [authLoading, user, navigate, token]);

  const handleAccept = async () => {
    if (!token) return;
    setHasAttempted(true);
    const invite = await acceptInvite.mutateAsync(token);
    // Navigate to the project
    setTimeout(() => {
      navigate(`/upload?project=${invite.project_id}`);
    }, 1500);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Link2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle>Project Invite</CardTitle>
          <CardDescription>
            You&apos;ve been invited to collaborate on a project in BriefEngine
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {acceptInvite.isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium">Invite accepted!</p>
              <p className="text-sm text-muted-foreground">Redirecting to project...</p>
            </div>
          ) : acceptInvite.isError ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="font-medium">Unable to accept invite</p>
              <p className="text-sm text-muted-foreground text-center">
                {acceptInvite.error?.message || "This invite may have expired or already been used."}
              </p>
              <Button variant="outline" onClick={() => navigate("/projects")}>
                Go to Projects
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-sm text-muted-foreground text-center">
                Click below to accept this invitation and gain access to the project.
              </p>
              <Button
                onClick={handleAccept}
                disabled={acceptInvite.isPending || hasAttempted}
                className="w-full"
              >
                {acceptInvite.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Accept Invite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
