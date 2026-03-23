import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useClearCacheOnUserChange } from "@/hooks/useClearCacheOnUserChange";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Loader2 } from "lucide-react";

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

const queryClient = new QueryClient();

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
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CacheClearGuard>
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
            <Route path="/team" element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            } />
            <Route path="/suite" element={
              <ProtectedRoute>
                <Suite />
              </ProtectedRoute>
            } />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </CacheClearGuard>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
