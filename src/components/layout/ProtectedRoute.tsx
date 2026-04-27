import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { useOnboardingState } from "@/hooks/useOnboarding";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  /** When true, lock disabled / trial-expired agencies out of this route. Default: true. */
  enforceAccessGate?: boolean;
  /** When true, force users without an agency to /onboarding/create-agency. Default: true. */
  enforceOnboarding?: boolean;
}

export function ProtectedRoute({
  children,
  enforceAccessGate = true,
  enforceOnboarding = true,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { access, isLoading: agencyLoading } = useAgency();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const onboarding = useOnboardingState();
  const location = useLocation();

  if (isLoading || agencyLoading || onboarding.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // ─── ONBOARDING GATE ────────────────────────────────────────────────────
  // Every authenticated non-super-admin user must belong to an agency.
  // The onboarding pages and the suspension landing are exempt to avoid
  // redirect loops.
  const onOnboardingPage = location.pathname.startsWith("/onboarding");
  const onSuspendedPage = location.pathname === "/access-suspended";

  if (
    enforceOnboarding &&
    !isSuperAdmin &&
    !onOnboardingPage &&
    !onSuspendedPage &&
    onboarding.needsOnboarding
  ) {
    return <Navigate to="/onboarding/create-agency" replace />;
  }

  // ─── ACCESS GATE ────────────────────────────────────────────────────────
  // Super admins bypass entirely. Suspension landing page is exempt.
  if (
    enforceAccessGate &&
    !isSuperAdmin &&
    !onSuspendedPage &&
    access &&
    access.isLockedOut
  ) {
    return <Navigate to="/access-suspended" replace />;
  }

  return <>{children}</>;
}
