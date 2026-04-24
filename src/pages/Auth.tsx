import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CanopyLogo, CanopyAmbientGlow } from "@/components/canopy";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const isRecovery = searchParams.get("type") === "recovery";

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

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
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

    const { error } = await signUp(email, password);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Check your email",
        description: "We sent you a confirmation link.",
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

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated" });
      navigate("/projects");
    }
    setIsLoading(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background">
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
          {isRecovery ? (
            /* ─── RECOVERY (new password) ──────────────────────────── */
            <form onSubmit={handleUpdatePassword}>
              <CardHeader>
                <CardTitle>Set a new password</CardTitle>
                <CardDescription>Enter a new password for your account.</CardDescription>
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
          ) : (
            /* ─── NORMAL SIGN IN / SIGN UP ────────────────────────── */
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2 bg-white/[0.03] border-b border-white/[0.06] rounded-none">
                <TabsTrigger value="signin" className="data-[state=active]:bg-white/[0.05] data-[state=active]:text-foreground rounded-none">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-white/[0.05] data-[state=active]:text-foreground rounded-none">
                  Create account
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="m-0">
                <form onSubmit={handleSignIn}>
                  <CardHeader>
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
                  <CardFooter>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full canopy-button-primary"
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Sign in
                    </Button>
                  </CardFooter>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="m-0">
                <form onSubmit={handleSignUp}>
                  <CardHeader>
                    <CardTitle>Create your account</CardTitle>
                    <CardDescription>Start designing experiences before they happen.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        placeholder="you@agency.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" name="password" type="password" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirm password</Label>
                      <Input
                        id="signup-confirm"
                        name="confirmPassword"
                        type="password"
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
                      Create account
                    </Button>
                  </CardFooter>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <p className="text-center text-xs text-foreground/50 mt-6">
          By continuing you agree to Canopy's terms and privacy policy.
        </p>
      </div>
    </div>
  );
}
