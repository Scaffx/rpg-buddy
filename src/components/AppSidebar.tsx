import { useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useClasses } from '@/hooks/useProfile';
import { NavLink } from '@/components/NavLink';
import ActiveTalentsBadge from '@/components/ActiveTalentsBadge';
import {
  Crown, LayoutGrid, Calendar, Target, Store, Users, Camera,
  ListOrdered, TrendingUp, Circle, Brain, LogOut, Swords, Skull, Coins, User, Heart, ScrollText,
  Sparkles, Smartphone,
} from 'lucide-react';
import { useGoldBalance } from '@/hooks/useGold';
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

const navItemDefs = [
  { key: 'profile', url: '/profile', icon: User },
  { key: 'dashboard', url: '/', icon: LayoutGrid },
  { key: 'calendar', url: '/calendar', icon: Calendar },
  { key: 'missions', url: '/missions', icon: Target },
  { key: 'classes', url: '/classes', icon: Swords },
  { key: 'talents', url: '/feats', icon: Sparkles },
  { key: 'shop', url: '/shop', icon: Store },
  { key: 'npc_missions', url: '/npc', icon: Users },
  { key: 'health', url: '/health', icon: Heart },
  { key: 'priority', url: '/prioridade', icon: ListOrdered },
  { key: 'progress', url: '/progress', icon: TrendingUp },
  { key: 'virtues', url: '/virtues', icon: Circle },
  { key: 'boss_arena', url: '/boss', icon: Skull },
  { key: 'mobile', url: '/mobile', icon: Smartphone },
  { key: 'system_info', url: '/system-info', icon: ScrollText },
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
  const location = useLocation();
  const { t } = useTranslation();
  const currentGold = (goldBalance as any)?.gold ?? 100;

  const navItems = useMemo(
    () => navItemDefs.map((item) => ({ ...item, title: t(`app.sidebar.${item.key}`) })),
    [t],
  );

  const currentClass = useMemo(() => {
    const id = (profile as any)?.current_class_id;
    if (!id || !classes) return 'Aprendiz';
    const found = (classes as any[]).find((c) => c.id === id);
    if (!found) return 'Aprendiz';
    return `${found.icon || ''} ${found.name}`.trim();
  }, [profile, classes]);
  const xpForLevel = 200;
  const currentXp = profile ? profile.total_xp % xpForLevel : 0;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border [&_[data-sidebar=content]]:overflow-y-auto [&_[data-sidebar=content]]:scrollbar-none [&_[data-sidebar=content]]:[-ms-overflow-style:none] [&_[data-sidebar=content]]:[-webkit-overflow-scrolling:touch]">
      <SidebarContent>
        {/* Profile Section */}
        {!collapsed && (
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-6 h-6 text-primary" />
              <div>
                <h2 className="font-display font-bold text-primary text-sm">{t('app.sidebar.my_rpg')}</h2>
                <p className="text-[10px] text-sidebar-foreground/60">{t('app.sidebar.my_rpg_sub')}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-primary font-bold text-sm truncate">
                {profile?.display_name || user?.email?.split('@')[0] || 'Aventureiro'}
              </p>
              <p className="text-[11px] text-sidebar-foreground/70">
                {t('app.sidebar.level')} {profile?.level || 1} • {t(`app.rank.${getRankKey(profile?.level || 1)}`)}
              </p>
              <p className="text-[11px] text-sidebar-foreground/60">
                {t('app.sidebar.class')}: {currentClass}
              </p>
              <div className="space-y-1">
                <div className="rpg-stat-bar h-1.5">
                  <div
                    className="rpg-stat-fill h-full"
                    style={{ width: `${(currentXp / xpForLevel) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-sidebar-foreground/50">
                  {currentXp}/{xpForLevel} XP
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Coins className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-bold text-yellow-400">{currentGold} 🪙</span>
              </div>
              <ActiveTalentsBadge compact className="mt-1" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent/50 text-sidebar-foreground/70"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-destructive transition-colors rounded-md hover:bg-sidebar-accent/50"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t('app.sidebar.logout')}</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
