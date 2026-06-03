import { lazy, Suspense } from "react";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import LifeonRPGSplash from "@/components/branding/LifeonRPGSplash";

// Páginas carregadas sob demanda (code-split por rota) — reduz drasticamente o
// bundle inicial: cada página vira um chunk separado, baixado só quando acessada.
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Missions = lazy(() => import("./pages/Missions"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const BossPage = lazy(() => import("./pages/BossPage"));
const PortalEventPage = lazy(() => import("./pages/PortalEventPage"));
const ClassesPage = lazy(() => import("./pages/ClassesPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const ShopPage = lazy(() => import("./pages/ShopPage"));
const NpcPage = lazy(() => import("./pages/NpcPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const FeatsTree = lazy(() => import("./pages/FeatsTree"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrioridadePage = lazy(() => import("./pages/PrioridadePage"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SystemInfoPage = lazy(() => import("./pages/SystemInfoPage"));
const VirtuesPage = lazy(() => import("./pages/VirtuesPage"));
const Landing = lazy(() => import("./pages/Landing"));
const MobilePage = lazy(() => import("./pages/MobilePage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const SocialPage = lazy(() => import("./pages/SocialPage"));
const CompanionPage = lazy(() => import("./pages/CompanionPage"));
const CraftingPage = lazy(() => import("./pages/CraftingPage"));
const ReleasesAdminPage = lazy(() => import("./pages/admin/ReleasesAdminPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const RefundPage = lazy(() => import("./pages/legal/RefundPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // 1 min: evita refetch a cada navegação
      gcTime: 5 * 60_000,       // 5 min de cache em memória
      refetchOnWindowFocus: false, // não refaz tudo ao voltar pra aba
      retry: 1,
    },
  },
});

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
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
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

  // Enforce de assinatura: após trial/vencimento, redireciona para Landing com paywall.
  // Admins do sistema (app_metadata.role = 'admin') ficam isentos para poder operar o painel.
  if (!bypassSubscription && !isActive && !isAdmin) {
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LandingRoute() {
  // Landing pública: visitantes e usuários com assinatura expirada veem o pitch.
  // Usuários com assinatura ativa vão direto pro app.
  const { user, loading } = useAuth();
  const { isActive, isLoading: subLoading } = useSubscription();
  if (loading || (user && subLoading)) {
    return (
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
    );
  }
  // Usuário ativo → manda pro dashboard
  if (user && isActive) return <Navigate to="/" replace />;
  // Expirado ou visitante → mostra Landing (com paywall modal para expirados)
  return <Landing />;
}

function AppRoutes() {
  useClickSound();

  return (
    <Suspense fallback={<LifeonRPGSplash fullscreen label="abrindo o portal" />}>
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
        <Route path="/portal" element={<ProtectedRoute><PortalEventPage /></ProtectedRoute>} />
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
        <Route path="/crafting" element={<ProtectedRoute><CraftingPage /></ProtectedRoute>} />
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
    </Suspense>
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
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </ShortRestStatusProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
