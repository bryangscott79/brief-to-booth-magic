import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgency } from "@/hooks/useAgency";
import { useIsSuperAdmin } from "@/hooks/useAdminRole";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  /** When true, lock disabled / trial-expired agencies out of this route. Default: true. */
  enforceAccessGate?: boolean;
}

export function ProtectedRoute({ children, enforceAccessGate = true }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { access, isLoading: agencyLoading } = useAgency();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const location = useLocation();

  if (isLoading || agencyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Super admins bypass the gate entirely (so they can administer suspended agencies).
  // The /access-suspended route itself doesn't need the gate (would create a loop).
  const onSuspendedPage = location.pathname === "/access-suspended";
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
