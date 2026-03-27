import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRole, type AppRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";

const ROLE_HIERARCHY: Record<AppRole, number> = {
  super_admin: 4,
  admin: 3,
  member: 2,
  client: 1,
};

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: AppRole;
  fallback?: ReactNode;
}

export function ProtectedRoute({ children, requiredRole, fallback }: ProtectedRouteProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { role, isLoading: roleLoading } = useRole();
  const location = useLocation();

  if (authLoading || (user && requiredRole && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const userLevel = role ? ROLE_HIERARCHY[role] : 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole];

    if (userLevel < requiredLevel) {
      if (fallback) {
        return <>{fallback}</>;
      }
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
          <h1 className="text-2xl font-semibold text-foreground">Not authorized</h1>
          <p className="text-muted-foreground">
            You do not have permission to access this page.
          </p>
          <a href="/projects" className="text-primary underline hover:no-underline">
            Go to Projects
          </a>
        </div>
      );
    }
  }

  return <>{children}</>;
}
