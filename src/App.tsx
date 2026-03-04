import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useClearCacheOnUserChange } from "@/hooks/useClearCacheOnUserChange";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Eagerly loaded (small, critical path)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy loaded (heavy routes — code-split into separate chunks)
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

const queryClient = new QueryClient();

function CacheClearGuard({ children }: { children: React.ReactNode }) {
  useClearCacheOnUserChange();
  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          <Suspense fallback={<PageLoader />}>
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
