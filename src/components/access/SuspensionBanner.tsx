// SuspensionBanner — shown at the top of agency-scoped pages when the
// agency's access is restricted (suspended / disabled / trial expired
// / trial ending soon). Renders nothing for active agencies.

import { AlertTriangle, Lock, Clock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAgency } from "@/hooks/useAgency";

const TONE = {
  suspended:
    "bg-red-500/10 text-red-200 border-red-500/30",
  disabled:
    "bg-red-700/15 text-red-100 border-red-600/40",
  trial_expired:
    "bg-amber-500/12 text-amber-100 border-amber-500/35",
  trial_warning:
    "bg-amber-500/8 text-amber-100 border-amber-500/25",
} as const;

export function SuspensionBanner() {
  const { agency, access } = useAgency();
  if (!agency || !access) return null;
  if (!access.isRestricted && access.trialDaysRemaining === null) return null;
  if (access.effectiveStatus === "active") return null;

  // Active trial with more than 14 days left → no banner.
  if (
    access.effectiveStatus === "trial" &&
    access.trialDaysRemaining !== null &&
    access.trialDaysRemaining > 14
  ) {
    return null;
  }

  const isSuspended = access.effectiveStatus === "suspended";
  const isDisabled = access.effectiveStatus === "disabled";
  const isTrialExpired = access.effectiveStatus === "trial_expired";
  const isTrialActive = access.effectiveStatus === "trial";

  const tone =
    isDisabled
      ? TONE.disabled
      : isSuspended
      ? TONE.suspended
      : isTrialExpired
      ? TONE.trial_expired
      : TONE.trial_warning;

  const Icon = isDisabled
    ? Lock
    : isSuspended
    ? AlertTriangle
    : isTrialExpired
    ? Clock
    : CheckCircle2;

  const headline = isDisabled
    ? "Your access has been disabled."
    : isSuspended
    ? "Your access is currently suspended."
    : isTrialExpired
    ? "Your trial has ended."
    : `Trial: ${access.trialDaysRemaining} day${access.trialDaysRemaining === 1 ? "" : "s"} remaining`;

  const detail =
    access.suspensionReason ||
    (isTrialExpired
      ? "Reach out to formalize your account to restore full access."
      : isTrialActive
      ? "Convert to a paid plan to keep working without interruption."
      : "Reach out to your platform contact to resolve.");

  return (
    <div
      className={cn(
        "border-b backdrop-blur-sm px-4 py-3 sticky top-0 z-40",
        tone,
      )}
      role="alert"
    >
      <div className="container flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-semibold">{headline}</span>
          <span className="opacity-80 ml-2">{detail}</span>
        </div>
        {(isSuspended || isDisabled || isTrialExpired) && (
          <Link
            to="/access-suspended"
            className="text-xs font-medium underline-offset-4 hover:underline shrink-0 self-center"
          >
            Details
          </Link>
        )}
      </div>
    </div>
  );
}
