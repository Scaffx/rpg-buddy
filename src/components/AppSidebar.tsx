import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { NavLink } from '@/components/NavLink';
import {
  Crown, LayoutGrid, Calendar, Target, Store, Users, Camera,
  ListOrdered, TrendingUp, Circle, Brain, LogOut, Swords, Skull,
} from 'lucide-react';
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

const navItems = [
  { title: 'Painel', url: '/', icon: LayoutGrid },
  { title: 'Calendário', url: '/calendar', icon: Calendar },
  { title: 'Missões Principais', url: '/missions', icon: Target },
  { title: 'Classes', url: '/classes', icon: Swords },
  { title: 'Loja', url: '/shop', icon: Store },
  { title: 'Missões de NPC', url: '/npc', icon: Users },
  { title: 'Evolução Corporal', url: '/body', icon: Camera },
  { title: 'Prioridade', url: '/priority', icon: ListOrdered },
  { title: 'Progresso', url: '/progress', icon: TrendingUp },
  { title: 'Virtudes', url: '/virtues', icon: Circle },
  { title: 'Boss Arena', url: '/boss', icon: Skull },
  { title: 'Chat IA', url: '/ai-chat', icon: Brain },
];

function getRank(level: number) {
  if (level >= 50) return 'Lendário';
  if (level >= 30) return 'Mestre';
  if (level >= 20) return 'Veterano';
  if (level >= 10) return 'Guerreiro';
  if (level >= 5) return 'Aprendiz';
  return 'Novato';
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, user } = useAuth();
  const { data: profile } = useProfile();
  const location = useLocation();

  const currentClass = profile?.current_class_id ? 'Aprendiz' : 'Aprendiz';
  const xpForLevel = 200;
  const currentXp = profile ? profile.total_xp % xpForLevel : 0;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        {/* Profile Section */}
        {!collapsed && (
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-6 h-6 text-primary" />
              <div>
                <h2 className="font-display font-bold text-primary text-sm">Meu RPG</h2>
                <p className="text-[10px] text-sidebar-foreground/60">Monte a sua história</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-primary font-bold text-sm truncate">
                {profile?.display_name || user?.email?.split('@')[0] || 'Aventureiro'}
              </p>
              <p className="text-[11px] text-sidebar-foreground/70">
                NÍVEL {profile?.level || 1} • {getRank(profile?.level || 1)}
              </p>
              <p className="text-[11px] text-sidebar-foreground/60">
                Classe: {currentClass}
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
          {!collapsed && <span>Sair</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
