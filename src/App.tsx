import { Component, lazy, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useClearCacheOnUserChange } from "@/hooks/useClearCacheOnUserChange";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PlatformOwnerProvider } from "@/contexts/PlatformOwnerContext";
import { Loader2 } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Eagerly loaded (landing + auth — needed immediately)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy-loaded pages (code-split per route)
const Projects = lazy(() => import("./pages/Projects"));
const Upload = lazy(() => import("./pages/Upload"));
const Review = lazy(() => import("./pages/Review"));
const Generate = lazy(() => import("./pages/Generate"));
const Spatial = lazy(() => import("./pages/Spatial"));
const Prompts = lazy(() => import("./pages/Prompts"));
const Files = lazy(() => import("./pages/Files"));
const Export = lazy(() => import("./pages/Export"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const Team = lazy(() => import("./pages/Team"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Rhino = lazy(() => import("./pages/Rhino"));
const Suite = lazy(() => import("./pages/Suite"));
const AgencyAccount = lazy(() => import("./pages/AgencyAccount"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const AgencyKnowledge = lazy(() => import("./pages/AgencyKnowledge"));
const ActivationTypes = lazy(() => import("./pages/ActivationTypes"));
const ActivationTypeDashboard = lazy(() => import("./pages/ActivationTypeDashboard"));
const AgencyTeam = lazy(() => import("./pages/AgencyTeam"));
const SuperAdmins = lazy(() => import("./pages/SuperAdmins"));
const AdminAgencies = lazy(() => import("./pages/AdminAgencies"));
const AccessSuspended = lazy(() => import("./pages/AccessSuspended"));
const OnboardingCreateAgency = lazy(() => import("./pages/OnboardingCreateAgency"));
const Pricing = lazy(() => import("./pages/Pricing"));
const AdminIndustries = lazy(() => import("./pages/AdminIndustries"));
const AdminIndustryDashboard = lazy(() => import("./pages/AdminIndustryDashboard"));
// const Explore = lazy(() => import("./pages/Explore")); // Hidden — 360° Explorer

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  private recoverFromStaleChunk(error: Error) {
    const message = String(error?.message ?? error);
    const isChunkFailure = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
    const alreadyRetried = sessionStorage.getItem("canopy:stale-chunk-reload-attempted") === "true";

    if (isChunkFailure && !alreadyRetried) {
      sessionStorage.setItem("canopy:stale-chunk-reload-attempted", "true");
      window.location.reload();
      return true;
    }

    return false;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App render failed", error, errorInfo);
    this.recoverFromStaleChunk(error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-lg">
            <h1 className="text-xl font-semibold mb-2">Canopy needs a refresh</h1>
            <p className="text-sm text-muted-foreground mb-5">
              A previous app bundle failed to load. Refresh to get the latest version.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Refresh app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function CacheClearGuard({ children }: { children: React.ReactNode }) {
  useClearCacheOnUserChange();
  return <>{children}</>;
}

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CacheClearGuard>
          <PlatformOwnerProvider>
            <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/projects" element={
                <ProtectedRoute>
                  <Projects />
                </ProtectedRoute>
              } />
              <Route path="/upload" element={
                <ProtectedRoute>
                  <Upload />
                </ProtectedRoute>
              } />
              <Route path="/review" element={
                <ProtectedRoute>
                  <Review />
                </ProtectedRoute>
              } />
              <Route path="/generate" element={
                <ProtectedRoute>
                  <Generate />
                </ProtectedRoute>
              } />
              <Route path="/spatial" element={
                <ProtectedRoute>
                  <Spatial />
                </ProtectedRoute>
              } />
              <Route path="/pricing" element={
                <ProtectedRoute>
                  <Pricing />
                </ProtectedRoute>
              } />
              <Route path="/prompts" element={
                <ProtectedRoute>
                  <Prompts />
                </ProtectedRoute>
              } />
              <Route path="/rhino" element={
                <ProtectedRoute>
                  <Rhino />
                </ProtectedRoute>
              } />
              <Route path="/files" element={
                <ProtectedRoute>
                  <Files />
                </ProtectedRoute>
              } />
              <Route path="/export" element={
                <ProtectedRoute>
                  <Export />
                </ProtectedRoute>
              } />
              <Route path="/knowledge-base" element={
                <ProtectedRoute>
                  <KnowledgeBase />
                </ProtectedRoute>
              } />
              <Route path="/company" element={
                <ProtectedRoute>
                  <CompanyProfile />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <ProtectedRoute>
                  <AdminSettings />
                </ProtectedRoute>
              } />
              <Route path="/account/:userId" element={
                <ProtectedRoute>
                  <AgencyAccount />
                </ProtectedRoute>
              } />
              <Route path="/team" element={
                <ProtectedRoute>
                  <Team />
                </ProtectedRoute>
              } />
              <Route path="/clients" element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              } />
              <Route path="/clients/:clientId" element={
                <ProtectedRoute>
                  <ClientDashboard />
                </ProtectedRoute>
              } />
              <Route path="/agency/knowledge" element={
                <ProtectedRoute>
                  <AgencyKnowledge />
                </ProtectedRoute>
              } />
              <Route path="/agency/activation-types" element={
                <ProtectedRoute>
                  <ActivationTypes />
                </ProtectedRoute>
              } />
              <Route path="/agency/activation-types/:typeId" element={
                <ProtectedRoute>
                  <ActivationTypeDashboard />
                </ProtectedRoute>
              } />
              <Route path="/agency/team" element={
                <ProtectedRoute>
                  <AgencyTeam />
                </ProtectedRoute>
              } />
              <Route path="/admin/super-admins" element={
                <ProtectedRoute>
                  <SuperAdmins />
                </ProtectedRoute>
              } />
              <Route path="/admin/agencies" element={
                <ProtectedRoute>
                  <AdminAgencies />
                </ProtectedRoute>
              } />
              <Route path="/admin/industries" element={
                <ProtectedRoute>
                  <AdminIndustries />
                </ProtectedRoute>
              } />
              <Route path="/admin/industries/:slug" element={
                <ProtectedRoute>
                  <AdminIndustryDashboard />
                </ProtectedRoute>
              } />
              {/* Suspension landing page — disable access gate so locked-out users can land here */}
              <Route path="/access-suspended" element={
                <ProtectedRoute enforceAccessGate={false} enforceOnboarding={false}>
                  <AccessSuspended />
                </ProtectedRoute>
              } />
              {/* Onboarding — disable both gates (the page IS the gate) */}
              <Route path="/onboarding/create-agency" element={
                <ProtectedRoute enforceAccessGate={false} enforceOnboarding={false}>
                  <OnboardingCreateAgency />
                </ProtectedRoute>
              } />
              <Route path="/suite" element={
                <ProtectedRoute>
                  <Suite />
                </ProtectedRoute>
              } />
              {/* 360° Explorer hidden — kept for future re-enable */}
              {/* <Route path="/explore" element={
                <ProtectedRoute>
                  <Explore />
                </ProtectedRoute>
              } /> */}
              <Route path="/invite/:token" element={<AcceptInvite />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          <Analytics />
          <SpeedInsights />
            </TooltipProvider>
          </PlatformOwnerProvider>
        </CacheClearGuard>
      </AuthProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
