// /access-suspended — the page disabled / suspended agency users land on
// when they try to access protected routes. Shows clear status + reason
// + contact info.

import { Link } from "react-router-dom";
import { AlertTriangle, Lock, Clock, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanopyLogo, CanopyAmbientGlow } from "@/components/canopy";
import { useAgency } from "@/hooks/useAgency";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

export default function AccessSuspendedPage() {
  const { agency, access, isLoading } = useAgency();
  const { signOut } = useAuth();

  // Active access — bounce back to the app
  if (!isLoading && (!access || !access.isRestricted)) {
    if (typeof window !== "undefined") window.location.href = "/projects";
    return null;
  }

  const isDisabled = access?.effectiveStatus === "disabled";
  const isSuspended = access?.effectiveStatus === "suspended";
  const isTrialExpired = access?.effectiveStatus === "trial_expired";

  const Icon = isDisabled ? Lock : isSuspended ? AlertTriangle : Clock;
  const title = isDisabled
    ? "Account disabled"
    : isSuspended
    ? "Access suspended"
    : "Trial ended";

  const headline = isDisabled
    ? "Your agency's access has been disabled."
    : isSuspended
    ? "Your agency's access is currently paused."
    : "Your trial period has ended.";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background">
      {/* Background ambient */}
      <div className="absolute inset-0 canopy-grid-pattern opacity-50" aria-hidden />
      <CanopyAmbientGlow
        position="top-1/3 left-1/2 -translate-x-1/2"
        size={500}
        tone="violet"
        opacity={0.18}
      />

      <div className="w-full max-w-lg relative z-10">
        <Link to="/" className="flex items-center justify-center mb-8" aria-label="Canopy home">
          <CanopyLogo variant="stacked" size="md" />
        </Link>

        <div className="canopy-panel p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Icon className="h-5 w-5 text-amber-300" />
            </div>
            <span className="text-xs uppercase tracking-widest text-foreground/60">{title}</span>
          </div>

          <h1 className="text-2xl font-semibold mb-2">{headline}</h1>

          {agency?.name && (
            <p className="text-sm text-foreground/65 mb-4">
              <span className="font-medium text-foreground/80">{agency.name}</span> can no longer
              create or modify data in Canopy.
            </p>
          )}

          {access?.suspensionReason && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 mb-5">
              <div className="text-xs uppercase tracking-widest text-foreground/55 mb-1">
                Reason
              </div>
              <p className="text-sm text-foreground/85">{access.suspensionReason}</p>
            </div>
          )}

          {access?.trialEndsAt && isTrialExpired && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 mb-5">
              <div className="text-xs uppercase tracking-widest text-foreground/55 mb-1">
                Trial ended
              </div>
              <p className="text-sm text-foreground/85">
                {formatDistanceToNow(access.trialEndsAt, { addSuffix: true })}
              </p>
            </div>
          )}

          <div className="space-y-3 text-sm text-foreground/70 leading-relaxed">
            <p>
              {isDisabled
                ? "Your historical data remains preserved. To restore access, reach out to formalize an arrangement."
                : isSuspended
                ? "All of your data is preserved. Contact us to resolve the issue and restore access."
                : "All of your work is intact. Convert to a paid plan to keep building."}
            </p>
            <p className="flex items-center gap-2 text-foreground/80">
              <Mail className="h-4 w-4" />
              <a
                href="mailto:hello@exhibitus.com"
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                hello@exhibitus.com
              </a>
            </p>
          </div>

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button asChild variant="ghost" className="text-foreground/70">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Home
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="text-foreground/70"
              onClick={async () => {
                await signOut();
                if (typeof window !== "undefined") window.location.href = "/";
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
