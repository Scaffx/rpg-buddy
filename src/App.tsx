import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Missions from "./pages/Missions";
import CalendarPage from "./pages/CalendarPage";
import BossPage from "./pages/BossPage";
import ClassesPage from "./pages/ClassesPage";
import ProgressPage from "./pages/ProgressPage";
import ShopPage from "./pages/ShopPage";
import NpcPage from "./pages/NpcPage";
import ProfilePage from "./pages/ProfilePage";
import HealthPage from "./pages/HealthPage";
import FeatsTree from "./pages/FeatsTree";
import NotFound from "./pages/NotFound";
import PrioridadePage from "./pages/PrioridadePage";
import Onboarding from "./pages/Onboarding";
import SystemInfoPage from "./pages/SystemInfoPage";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Redireciona para onboarding se o usuário ainda não completou o formulário inicial
  // Verifica banco primeiro, fallback para localStorage (caso a migration não tenha sido aplicada)
  const onboardingDone = (profile as any)?.onboarding_completed === true
    || localStorage.getItem(`onboarding_v1_${user.id}`) === 'done';
  if (!onboardingDone) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/missions" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
            <Route path="/boss" element={<ProtectedRoute><BossPage /></ProtectedRoute>} />
            <Route path="/health" element={<ProtectedRoute><HealthPage /></ProtectedRoute>} />
            <Route path="/feats" element={<ProtectedRoute><FeatsTree /></ProtectedRoute>} />
            <Route path="/classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
            <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
            <Route path="/shop" element={<ProtectedRoute><ShopPage /></ProtectedRoute>} />
            <Route path="/npc" element={<ProtectedRoute><NpcPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/prioridade" element={<ProtectedRoute><PrioridadePage /></ProtectedRoute>} />
            <Route path="/system-info" element={<ProtectedRoute><SystemInfoPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
