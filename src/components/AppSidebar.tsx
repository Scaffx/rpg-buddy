import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useClasses } from '@/hooks/useProfile';
import { NavLink } from '@/components/NavLink';
import ActiveTalentsBadge from '@/components/ActiveTalentsBadge';
import HelpTutorialModal from '@/components/HelpTutorialModal';
import {
  Crown, LayoutGrid, Calendar, Target, Store, Users,
  ListOrdered, TrendingUp, Circle, LogOut, Swords, Skull, Coins, User, Heart, ScrollText,
  Sparkles, Smartphone, HelpCircle, Clock, Trophy, PawPrint, UsersRound, Hammer, Zap,
} from 'lucide-react';
import { useGoldBalance } from '@/hooks/useGold';
import { useSubscription } from '@/hooks/useSubscription';
import { getLevelProgress } from '@/lib/progression';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

// ── Grupos de navegação agrupados por contexto ──────────────────────────────
const navGroups = [
  {
    labelKey: 'nav_group.hero',
    label: 'Herói',
    items: [
      { key: 'profile',   url: '/profile', icon: User },
      { key: 'dashboard', url: '/',         icon: LayoutGrid },
      { key: 'classes',   url: '/classes',  icon: Swords },
      { key: 'talents',   url: '/feats',    icon: Sparkles },
    ],
  },
  {
    labelKey: 'nav_group.activities',
    label: 'Atividades',
    items: [
      { key: 'calendar',  url: '/calendar',   icon: Calendar },
      { key: 'missions',  url: '/missions',   icon: Target },
      { key: 'health',    url: '/health',     icon: Heart },
      { key: 'priority',  url: '/prioridade', icon: ListOrdered },
      { key: 'progress',  url: '/progress',   icon: TrendingUp },
      { key: 'virtues',   url: '/virtues',    icon: Circle },
    ],
  },
  {
    labelKey: 'nav_group.world',
    label: 'Mundo',
    items: [
      { key: 'shop',        url: '/shop',        icon: Store },
      { key: 'npc_missions',url: '/npc',         icon: Users },
      { key: 'boss_arena',  url: '/boss',        icon: Skull },
      { key: 'portal_event', url: '/portal',      icon: Zap },
      { key: 'leaderboard', url: '/leaderboard', icon: Trophy },
      { key: 'companheiro', url: '/companheiro', icon: PawPrint },
      { key: 'social',      url: '/social',      icon: UsersRound },
    ],
  },
  {
    labelKey: 'nav_group.system',
    label: 'Sistema',
    items: [
      { key: 'mobile',      url: '/mobile',      icon: Smartphone },
      { key: 'system_info', url: '/system-info', icon: ScrollText },
    ],
  },
];

function getRankKey(level: number) {
  if (level >= 50) return 'legendary';
  if (level >= 30) return 'master';
  if (level >= 20) return 'veteran';
  if (level >= 10) return 'warrior';
  if (level >= 5) return 'apprentice';
  return 'novice';
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, user } = useAuth();
  const { data: profile } = useProfile();
  const { data: classes } = useClasses();
  const { data: goldBalance } = useGoldBalance();
  const { isTrial, daysUntilBlock } = useSubscription();
  const { t } = useTranslation();
  const currentGold = (goldBalance as any)?.gold ?? 100;
  const [showHelp, setShowHelp] = useState(false);

  const currentClass = useMemo(() => {
    const id = (profile as any)?.current_class_id;
    if (!id || !classes) return 'Aprendiz';
    const found = (classes as any[]).find((c) => c.id === id);
    return found?.name ?? 'Aprendiz';
  }, [profile, classes]);

  const CRAFTING_CLASSES = ['Alquimista', 'Mecânico', 'Mestre-Ferreiro', 'Criador'];
  const hasCrafting = CRAFTING_CLASSES.includes(currentClass);

  const xpProgress = getLevelProgress(profile?.total_xp || 0);
  const heroName = profile?.display_name || user?.email?.split('@')[0] || 'Aventureiro';
  const heroLevel = profile?.level || 1;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border [&_[data-sidebar=content]]:overflow-y-auto [&_[data-sidebar=content]]:scrollbar-none [&_[data-sidebar=content]]:[-ms-overflow-style:none] [&_[data-sidebar=content]]:[-webkit-overflow-scrolling:touch]">
      <SidebarContent>

        {/* ── Card de Perfil ─────────────────────────────────── */}
        {!collapsed ? (
          <div className="m-3 rounded-xl border border-sidebar-border/60 bg-gradient-to-b from-sidebar-accent/60 to-sidebar-background/80 p-3 space-y-2.5">
            {/* Logo + título do app */}
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
                <Crown className="w-4 h-4 text-primary" />
              </div>
              <span className="font-display text-xs font-bold text-primary tracking-wide uppercase">
                {t('app.sidebar.my_rpg')}
              </span>
            </div>

            {/* Nome do herói */}
            <div>
              <p className="font-display font-bold text-foreground text-sm leading-tight truncate">
                {heroName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center rounded-full bg-primary/15 border border-primary/25 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Nv. {heroLevel}
                </span>
                <span className="text-[10px] text-sidebar-foreground/55 truncate">{currentClass}</span>
              </div>
            </div>

            {/* Barra de XP */}
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-500"
                  style={{ width: `${xpProgress.progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-sidebar-foreground/40 font-mono">
                  {xpProgress.currentLevelXp.toLocaleString()} / {xpProgress.xpForNextLevel.toLocaleString()} XP
                </span>
                <span className="text-[9px] text-sidebar-foreground/40">{Math.round(xpProgress.progressPercent)}%</span>
              </div>
            </div>

            {/* Ouro */}
            <div className="flex items-center gap-1.5 rounded-lg bg-yellow-500/8 border border-yellow-500/20 px-2.5 py-1.5">
              <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span className="text-xs font-bold text-yellow-400">{currentGold.toLocaleString()}</span>
              <span className="text-[10px] text-yellow-400/60 ml-auto">ouro</span>
            </div>

            {/* Talentos ativos */}
            <ActiveTalentsBadge compact />

            {/* Trial badge */}
            {isTrial && daysUntilBlock !== null && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5">
                <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-300 leading-tight">
                  {daysUntilBlock === 0
                    ? 'Trial expira hoje!'
                    : `${daysUntilBlock} dia${daysUntilBlock !== 1 ? 's' : ''} restante${daysUntilBlock !== 1 ? 's' : ''}`}
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Collapsed: apenas ícone da coroa centralizado */
          <div className="flex justify-center py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/25">
              <Crown className="w-4 h-4 text-primary" />
            </div>
          </div>
        )}

        {/* ── Navegação agrupada ─────────────────────────────── */}
        {navGroups.map((group, gIdx) => (
          <SidebarGroup key={group.labelKey} className={gIdx === 0 ? 'pt-0' : 'pt-0'}>
            {/* Label do grupo — só quando expandido */}
            {!collapsed && (
              <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/35 select-none">
                {group.label}
              </p>
            )}
            {/* Separador sutil quando collapsed */}
            {collapsed && gIdx > 0 && (
              <div className="mx-auto my-1 h-px w-6 bg-sidebar-border/60" />
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sidebar-foreground/60 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                      >
                        <item.icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                        {!collapsed && (
                          <span className="text-[13px] truncate">{t(`app.sidebar.${item.key}`)}</span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* ── Itens extras (Craft + Ajuda) ───────────────────── */}
        <SidebarGroup className="pt-0">
          {!collapsed && (
            <p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/35 select-none">
              Outros
            </p>
          )}
          {collapsed && <div className="mx-auto my-1 h-px w-6 bg-sidebar-border/60" />}
          <SidebarGroupContent>
            <SidebarMenu>
              {hasCrafting && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/crafting"
                      className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sidebar-foreground/60 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      activeClassName="bg-primary/10 text-primary font-semibold border-l-2 border-primary"
                    >
                      <Hammer className="h-4 w-4 shrink-0 text-amber-400 transition-transform group-hover:scale-105" />
                      {!collapsed && <span className="text-[13px] truncate">Craft</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    type="button"
                    onClick={() => setShowHelp(true)}
                    className="group flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sidebar-foreground/60 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    title="Ver tutorial e ajuda"
                  >
                    <HelpCircle className="h-4 w-4 shrink-0 text-sky-400 transition-transform group-hover:scale-105" />
                    {!collapsed && <span className="text-[13px] truncate">Ajuda & Tutorial</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      {/* ── Rodapé: Logout ─────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <button
          onClick={signOut}
          className="group flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sidebar-foreground/50 transition-all hover:text-destructive hover:bg-destructive/8"
        >
          <LogOut className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          {!collapsed && <span className="text-[13px]">{t('app.sidebar.logout')}</span>}
        </button>
      </SidebarFooter>
      <HelpTutorialModal open={showHelp} onClose={() => setShowHelp(false)} />
    </Sidebar>
  );
}
