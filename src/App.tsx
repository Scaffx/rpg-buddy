import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useClickSound } from "@/hooks/useClickSound";
import { ShortRestStatusProvider } from "@/hooks/useShortRestStatus";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { hasCompletedOnboarding } from "@/lib/onboarding";
import LifeonRPGSplash from "@/components/branding/LifeonRPGSplash";
import EntrySplashGate from "@/components/branding/EntrySplashGate";
import BedtimeGate from "@/components/BedtimeGate";

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
const SkillTreePage = lazy(() => import("./pages/SkillTreePage"));
const HabilidadesHub = lazy(() => import("./pages/HabilidadesHub"));
const SkillAnimationGallery = lazy(() => import("./pages/SkillAnimationGallery"));
const EnemyAnimationGallery = lazy(() => import("./pages/EnemyAnimationGallery"));
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
const ReleasesAdminPage = lazy(() => import("./pages/admin/ReleasesAdminPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage"));
const RefundPage = lazy(() => import("./pages/legal/RefundPage"));
const DeleteAccountPage = lazy(() => import("./pages/legal/DeleteAccountPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

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

function AuthRecovery({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Não foi possível confirmar sua sessão</h1>
        <p>Tente novamente para continuar.</p>
        <button type="button" onClick={onRetry} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

function ProtectedRoute({
  children,
  bypassOnboarding = false,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  bypassOnboarding?: boolean;
  requireAdmin?: boolean;
}) {
  const { user, loading, authError, retryAuth } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  if (authError) return <AuthRecovery onRetry={retryAuth} />;
  if (loading || profileLoading || (requireAdmin && adminLoading)) {
    return (
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
    );
  }
  // Visitantes deslogados vão pra Landing pública (raiz "/" passa a mostrar Landing).
  if (!user) return <Navigate to="/landing" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  // Se o perfil não existe no banco (trigger falhou ou usuário migrado sem recovery),
  // redireciona para onboarding independente do localStorage.
  if (!bypassOnboarding && profile === null) return <Navigate to="/onboarding" replace />;

  // Redireciona para onboarding se o usuário ainda não completou o formulário inicial
  // Verifica banco primeiro, fallback para localStorage (caso a migration não tenha sido aplicada)
  const onboardingDone = hasCompletedOnboarding((profile as Record<string, unknown> | null), user.id);
  if (!bypassOnboarding && !onboardingDone) return <Navigate to="/onboarding" replace />;

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, authError, retryAuth } = useAuth();
  if (authError) return <AuthRecovery onRetry={retryAuth} />;
  if (loading) {
    return (
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LandingRoute() {
  // A Landing é pública; qualquer conta autenticada entra no app.
  const { user, loading, authError, retryAuth } = useAuth();
  if (authError) return <AuthRecovery onRetry={retryAuth} />;
  if (loading) {
    return (
      <LifeonRPGSplash fullscreen label="abrindo o portal" />
    );
  }
  if (user) return <Navigate to="/" replace />;
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
        <Route path="/previa-habilidades" element={<SkillAnimationGallery />} />
        <Route path="/previa-inimigos" element={<EnemyAnimationGallery />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund" element={<RefundPage />} />
        {/* Pública de propósito: a Google Play exige URL de exclusão sem login. */}
        <Route path="/excluir-conta" element={<DeleteAccountPage />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/missions" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="/boss" element={<ProtectedRoute><BossPage /></ProtectedRoute>} />
        <Route path="/portal" element={<ProtectedRoute><EntrySplashGate label="abrindo o portal"><PortalEventPage /></EntrySplashGate></ProtectedRoute>} />
        <Route path="/health" element={<ProtectedRoute><HealthPage /></ProtectedRoute>} />
        <Route path="/habilidades" element={<ProtectedRoute><HabilidadesHub /></ProtectedRoute>} />
        <Route path="/feats" element={<ProtectedRoute><FeatsTree /></ProtectedRoute>} />
        <Route path="/skill-tree" element={<ProtectedRoute><SkillTreePage /></ProtectedRoute>} />
        <Route path="/classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
        <Route path="/progress" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
        <Route path="/shop" element={<ProtectedRoute><ShopPage /></ProtectedRoute>} />
        <Route path="/npc" element={<ProtectedRoute><NpcPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/prioridade" element={<ProtectedRoute><PrioridadePage /></ProtectedRoute>} />
        <Route path="/ajustes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/system-info" element={<ProtectedRoute><SystemInfoPage /></ProtectedRoute>} />
        <Route path="/virtues" element={<ProtectedRoute><VirtuesPage /></ProtectedRoute>} />
        <Route path="/mobile" element={<ProtectedRoute><MobilePage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/companheiro" element={<ProtectedRoute><CompanionPage /></ProtectedRoute>} />
        <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
        <Route
          path="/admin/releases"
          element={
            <ProtectedRoute bypassOnboarding requireAdmin>
              <ReleasesAdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <BedtimeGate />
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
