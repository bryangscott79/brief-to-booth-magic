import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CanopyLogo, CanopyAmbientGlow } from "@/components/canopy";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Account creation is invite-only — only super admins (via the
  // admin-invite-user edge function) and agency admins (via the
  // team-management page) can provision new logins. We deliberately
  // do NOT destructure signUp from useAuth here; the public sign-up
  // path has been retired in favor of the beta-waitlist flow.
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // Beta-waitlist form state. Separate from the sign-in card to keep
  // the dominant flow (existing user sign-in) uncluttered.
  const [showBetaRequest, setShowBetaRequest] = useState(false);
  const [betaSubmitted, setBetaSubmitted] = useState(false);

  // "Set a password" mode serves two flows that arrive by email link:
  //   ?type=recovery — password reset
  //   ?type=invite   — first sign-in from an admin invite (no password exists yet)
  // Supabase also announces recovery links via the PASSWORD_RECOVERY auth
  // event (the tokens ride the URL hash and are consumed by the client), so
  // we listen for that too in case the query param was lost in a redirect.
  const typeParam = searchParams.get("type");
  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const isSetPassword = typeParam === "recovery" || typeParam === "invite" || recoveryEvent;
  const isInvite = typeParam === "invite";

  useEffect(() => {
    // Email links that failed verification come back with the reason in the
    // URL hash (e.g. #error_code=otp_expired). Corporate mail scanners often
    // "pre-click" one-time links, which burns the token before the human
    // opens it — surface that clearly instead of a dead form.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = hash.get("error_code");
    if (errorCode) {
      setLinkError(
        errorCode === "otp_expired"
          ? "That link has expired or was already used (some email systems pre-open links). Request a fresh one below — and open it directly in your browser."
          : hash.get("error_description")?.replace(/\+/g, " ") ?? "This sign-in link is no longer valid. Request a fresh one below.",
      );
      // Clean the error out of the URL so a refresh doesn't re-toast.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryEvent(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const { error } = await signIn(email, password);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Welcome back" });
      navigate("/projects");
    }
    setIsLoading(false);
  };

  // Beta access request. Writes to the public.beta_waitlist table
  // (anon-insert allowed via RLS). Super admins see submissions in
  // the Supabase dashboard at Tables → beta_waitlist. Future enhancement:
  // wire a Resend/edge-function notification to bryan@gofightwin.co
  // so new requests trigger an email instead of requiring a poll.
  const handleBetaRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string)?.trim();
    const name = ((formData.get("name") as string) ?? "").trim() || null;
    const agency = ((formData.get("agency") as string) ?? "").trim() || null;
    const reason = ((formData.get("reason") as string) ?? "").trim() || null;

    if (!email) {
      toast({ title: "Email is required", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    // Direct insert against the anon-writable beta_waitlist table.
    // The UNIQUE(lower(email)) index gives us idempotent submissions —
    // a re-submission from the same address surfaces a friendly
    // "already on the list" message rather than a hard error.
    const { error } = await supabase
      .from("beta_waitlist" as never)
      // deno-lint-ignore no-explicit-any
      .insert({ email, name, agency, reason, source: "auth_page" } as any);

    if (error) {
      // Unique-violation = email already submitted. Treat as success
      // from the user's perspective — they ARE on the list.
      const isDuplicate = (error as { code?: string }).code === "23505";
      if (isDuplicate) {
        setBetaSubmitted(true);
        toast({
          title: "You're already on the list",
          description: "We'll reach out at the next intake.",
        });
      } else {
        toast({
          title: "Couldn't submit",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      setBetaSubmitted(true);
      toast({
        title: "Request received",
        description: "Thanks — we'll be in touch when invites open up.",
      });
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?type=recovery`,
    });

    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Check your email",
        description: "We sent a password reset link.",
      });
      setShowForgotPassword(false);
    }
    setIsLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // The email link must have established a session for updateUser to work.
    // If it didn't (expired link, opened in a different browser, or a mail
    // scanner consumed the one-time token), fail with a way forward instead
    // of a cryptic "Auth session missing".
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      toast({
        title: "This link is no longer valid",
        description:
          "It may have expired or already been used. Request a fresh link and open it directly in your browser.",
        variant: "destructive",
      });
      setShowForgotPassword(true);
      setIsLoading(false);
      navigate("/auth", { replace: true });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: isInvite ? "Welcome to Canopy" : "Password updated" });
      navigate("/projects");
    }
    setIsLoading(false);
  };

  return (
    <div className="canopy-dark relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background text-foreground">
      {/* Ambient brand glows */}
      <div className="absolute inset-0 canopy-grid-pattern opacity-60" aria-hidden />
      <CanopyAmbientGlow
        position="top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2"
        size={500}
        tone="violet"
        opacity={0.25}
        animate
      />
      <CanopyAmbientGlow
        position="bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2"
        size={500}
        tone="pink"
        opacity={0.2}
        animate
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center mb-10" aria-label="Canopy home">
          <CanopyLogo variant="stacked" size="lg" showByline />
        </Link>

        <div className="canopy-panel overflow-hidden">
          {linkError && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 text-xs leading-relaxed text-amber-200">
              {linkError}
            </div>
          )}
          {isSetPassword ? (
            /* ─── SET PASSWORD (recovery or first-time invite) ─────── */
            <form onSubmit={handleUpdatePassword}>
              <CardHeader>
                <CardTitle>{isInvite ? "Welcome to Canopy" : "Set a new password"}</CardTitle>
                <CardDescription>
                  {isInvite
                    ? "You've been invited — choose a password to finish setting up your account."
                    : "Enter a new password for your account."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input id="new-password" name="password" type="password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirm password</Label>
                  <Input id="confirm-new-password" name="confirmPassword" type="password" required />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full canopy-button-primary"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Update password
                </Button>
              </CardFooter>
            </form>
          ) : showForgotPassword ? (
            /* ─── FORGOT PASSWORD ─────────────────────────────────── */
            <form onSubmit={handleForgotPassword}>
              <CardHeader>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="inline-flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground mb-2 self-start"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to sign in
                </button>
                <CardTitle>Reset your password</CardTitle>
                <CardDescription>
                  We'll send a reset link to the email on your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    placeholder="you@agency.com"
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full canopy-button-primary"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send reset link
                </Button>
              </CardFooter>
            </form>
          ) : showBetaRequest ? (
            /* ─── REQUEST BETA ACCESS ─────────────────────────────── */
            betaSubmitted ? (
              <>
                <CardHeader>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBetaRequest(false);
                      setBetaSubmitted(false);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground mb-2 self-start"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to sign in
                  </button>
                  <CardTitle>You're on the list</CardTitle>
                  <CardDescription>
                    Canopy is invite-only right now. We'll reach out at the next
                    intake — usually within a few days. Watch the inbox you
                    submitted.
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </>
            ) : (
              <form onSubmit={handleBetaRequest}>
                <CardHeader>
                  <button
                    type="button"
                    onClick={() => setShowBetaRequest(false)}
                    className="inline-flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground mb-2 self-start"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Back to sign in
                  </button>
                  <CardTitle>Request beta access</CardTitle>
                  <CardDescription>
                    Canopy is invite-only while we onboard agencies one at a
                    time. Drop your details and we'll be in touch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="beta-email">Work email</Label>
                    <Input
                      id="beta-email"
                      name="email"
                      type="email"
                      placeholder="you@agency.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beta-name">Your name</Label>
                    <Input
                      id="beta-name"
                      name="name"
                      type="text"
                      placeholder="Alex Quinn"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beta-agency">Agency or company</Label>
                    <Input
                      id="beta-agency"
                      name="agency"
                      type="text"
                      placeholder="Acme Experiential"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="beta-reason">
                      What kind of work are you bringing to Canopy?{" "}
                      <span className="text-foreground/40 font-normal">
                        (optional)
                      </span>
                    </Label>
                    <Textarea
                      id="beta-reason"
                      name="reason"
                      placeholder="Trade-show booths, brand activations, retail builds…"
                      rows={3}
                      maxLength={1000}
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full canopy-button-primary"
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Request access
                  </Button>
                </CardFooter>
              </form>
            )
          ) : (
            /* ─── SIGN IN ─────────────────────────────────────────── */
            <form onSubmit={handleSignIn}>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 border-primary/40 bg-primary/10 text-primary"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Invite-only beta
                  </Badge>
                </div>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Enter the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    placeholder="you@agency.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs text-foreground/60 hover:text-foreground transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <Input id="signin-password" name="password" type="password" required />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-3">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full canopy-button-primary"
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in
                </Button>
                <p className="text-center text-xs text-foreground/60">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setShowBetaRequest(true)}
                    className="text-primary hover:underline underline-offset-2 font-medium"
                  >
                    Request beta access
                  </button>
                </p>
              </CardFooter>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-foreground/50 mt-6">
          By continuing you agree to Canopy's terms and privacy policy.
        </p>
      </div>
    </div>
  );
}
