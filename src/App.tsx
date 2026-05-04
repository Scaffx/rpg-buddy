import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useClickSound } from "@/hooks/useClickSound";
import { ShortRestStatusProvider } from "@/hooks/useShortRestStatus";
import { SubscriptionPaywall } from "@/components/SubscriptionPaywall";
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
import VirtuesPage from "./pages/VirtuesPage";
import Landing from "./pages/Landing";
import MobilePage from "./pages/MobilePage";import LeaderboardPage from './pages/LeaderboardPage';
import SocialPage from './pages/SocialPage';
import CompanionPage from './pages/CompanionPage';import ReleasesAdminPage from "./pages/admin/ReleasesAdminPage";import ResetPassword from './pages/ResetPassword';import TermsPage from "./pages/legal/TermsPage";
import PrivacyPage from "./pages/legal/PrivacyPage";
import RefundPage from "./pages/legal/RefundPage";
import { Loader2 } from "lucide-react";
import { hasCompletedOnboarding } from "@/lib/onboarding";

const queryClient = new QueryClient();

function ProtectedRoute({
  children,
  bypassOnboarding = false,
  bypassSubscription = false,
}: {
  children: React.ReactNode;
  bypassOnboarding?: boolean;
  bypassSubscription?: boolean;
}) {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { isActive, isLoading: subscriptionLoading } = useSubscription();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  if (loading || profileLoading || subscriptionLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  // Visitantes deslogados vão pra Landing pública (raiz "/" passa a mostrar Landing).
  if (!user) return <Navigate to="/landing" replace />;

  // Se o perfil não existe no banco (trigger falhou ou usuário migrado sem recovery),
  // redireciona para onboarding independente do localStorage.
  if (!bypassOnboarding && profile === null) return <Navigate to="/onboarding" replace />;

  // Redireciona para onboarding se o usuário ainda não completou o formulário inicial
  // Verifica banco primeiro, fallback para localStorage (caso a migration não tenha sido aplicada)
  const onboardingDone = hasCompletedOnboarding((profile as Record<string, unknown> | null), user.id);
  if (!bypassOnboarding && !onboardingDone) return <Navigate to="/onboarding" replace />;

  // Enforce de assinatura: após trial/vencimento, bloqueia acesso às rotas protegidas.
  // Admins do sistema (app_metadata.role = 'admin') ficam isentos para poder operar o painel.
  if (!bypassSubscription && !isActive && !isAdmin) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-4xl">
          <SubscriptionPaywall />
        </div>
      </div>
    );
  }

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

function LandingRoute() {
  // Landing pública: visitantes veem o pitch; logados vão direto pro app.
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <Landing />;
}

function AppRoutes() {
  useClickSound();

  return (
    <Routes>
      <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/landing" element={<LandingRoute />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refund" element={<RefundPage />} />
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
      <Route path="/virtues" element={<ProtectedRoute><VirtuesPage /></ProtectedRoute>} />
      <Route path="/mobile" element={<ProtectedRoute><MobilePage /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
      <Route path="/companheiro" element={<ProtectedRoute><CompanionPage /></ProtectedRoute>} />
      <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
      <Route
        path="/admin/releases"
        element={
          <ProtectedRoute bypassOnboarding bypassSubscription>
            <ReleasesAdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ShortRestStatusProvider>
              <AppRoutes />
            </ShortRestStatusProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
