import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useClearCacheOnUserChange } from "@/hooks/useClearCacheOnUserChange";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Projects from "./pages/Projects";
import Upload from "./pages/Upload";
import Review from "./pages/Review";
import Generate from "./pages/Generate";
import Spatial from "./pages/Spatial";
import Prompts from "./pages/Prompts";
import Files from "./pages/Files";
import Export from "./pages/Export";
import KnowledgeBase from "./pages/KnowledgeBase";
import CompanyProfile from "./pages/CompanyProfile";
import AdminSettings from "./pages/AdminSettings";
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";
import Rhino from "./pages/Rhino";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function CacheClearGuard({ children }: { children: React.ReactNode }) {
  useClearCacheOnUserChange();
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CacheClearGuard>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            <Route path="/invite/:token" element={<AcceptInvite />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </CacheClearGuard>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
