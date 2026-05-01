import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  total_xp: number;
  level: number;
  starter_class: string | null;
  avatar_url: string | null;
}

export interface WeeklyLeaderboardEntry extends LeaderboardEntry {
  weekly_count: number;
}

export function useGlobalLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles' as never)
        .select('user_id, display_name, total_xp, level, starter_class, avatar_url')
        .order('total_xp', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    staleTime: 60 * 1000,
  });
}

export function useWeeklyLeaderboard() {
  return useQuery<WeeklyLeaderboardEntry[]>({
    queryKey: ['leaderboard_weekly'],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { data: logs, error: logsError } = await supabase
        .from('activity_log' as never)
        .select('user_id')
        .eq('action' as never, 'mission_completed' as never)
        .gte('created_at' as never, since.toISOString());

      if (logsError) {
        // Fallback: use global leaderboard sorted by total_xp
        const { data: fallback, error: fbError } = await supabase
          .from('profiles' as never)
          .select('user_id, display_name, total_xp, level, starter_class, avatar_url')
          .order('total_xp', { ascending: false })
          .limit(100);
        if (fbError) throw fbError;
        return ((fallback ?? []) as LeaderboardEntry[]).map((p) => ({ ...p, weekly_count: 0 }));
      }

      const countMap: Record<string, number> = {};
      for (const log of (logs ?? []) as { user_id: string }[]) {
        countMap[log.user_id] = (countMap[log.user_id] ?? 0) + 1;
      }

      const userIds = Object.keys(countMap);
      if (userIds.length === 0) return [];

      const { data: profiles, error: profError } = await supabase
        .from('profiles' as never)
        .select('user_id, display_name, total_xp, level, starter_class, avatar_url')
        .in('user_id' as never, userIds);

      if (profError) throw profError;

      return ((profiles ?? []) as LeaderboardEntry[])
        .map((p) => ({ ...p, weekly_count: countMap[p.user_id] ?? 0 }))
        .sort((a, b) => b.weekly_count - a.weekly_count)
        .slice(0, 100);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useClassLeaderboard(starterClass: string | null) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_class', starterClass],
    queryFn: async () => {
      if (!starterClass) return [];
      const { data, error } = await supabase
        .from('profiles' as never)
        .select('user_id, display_name, total_xp, level, starter_class, avatar_url')
        .eq('starter_class' as never, starterClass as never)
        .order('total_xp', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    enabled: !!starterClass,
    staleTime: 60 * 1000,
  });
}
