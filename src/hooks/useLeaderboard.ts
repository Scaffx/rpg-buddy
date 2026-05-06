import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  total_xp: number;
  level: number;
  starter_class: string | null;
  current_class_name: string | null;
  avatar_url: string | null;
}

export interface WeeklyLeaderboardEntry extends LeaderboardEntry {
  weekly_count: number;
}

export interface StreakLeaderboardEntry extends LeaderboardEntry {
  current_streak: number;
}

// All hooks use SECURITY DEFINER RPC functions to bypass RLS and show all users.

export function useGlobalLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_global'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_global_leaderboard', { p_limit: 100 });
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
      const { data, error } = await (supabase.rpc as any)('get_weekly_leaderboard', { p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => ({ ...r, weekly_count: Number(r.weekly_count ?? 0) }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useClassLeaderboard(starterClass: string | null) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_class', starterClass],
    queryFn: async () => {
      if (!starterClass) return [];
      const { data, error } = await (supabase.rpc as any)('get_class_leaderboard', { p_class: starterClass, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    enabled: !!starterClass,
    staleTime: 60 * 1000,
  });
}

// ── Regional variants ─────────────────────────────────────────────────────────

export function useRegionalLeaderboard(region: string | null) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_regional', region],
    queryFn: async () => {
      if (!region) return [];
      const { data, error } = await (supabase.rpc as any)('get_regional_leaderboard', { p_region: region, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    enabled: !!region,
    staleTime: 60 * 1000,
  });
}

export function useRegionalWeeklyLeaderboard(region: string | null) {
  return useQuery<WeeklyLeaderboardEntry[]>({
    queryKey: ['leaderboard_regional_weekly', region],
    queryFn: async () => {
      if (!region) return [];
      const { data, error } = await (supabase.rpc as any)('get_regional_weekly_leaderboard', { p_region: region, p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => ({ ...r, weekly_count: Number(r.weekly_count ?? 0) }));
    },
    enabled: !!region,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegionalClassLeaderboard(region: string | null, starterClass: string | null) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_regional_class', region, starterClass],
    queryFn: async () => {
      if (!starterClass || !region) return [];
      const { data, error } = await (supabase.rpc as any)('get_regional_class_leaderboard', { p_region: region, p_class: starterClass, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    enabled: !!starterClass && !!region,
    staleTime: 60 * 1000,
  });
}

// ── Streak leaderboard ────────────────────────────────────────────────────────

export function useStreakLeaderboard() {
  return useQuery<StreakLeaderboardEntry[]>({
    queryKey: ['leaderboard_streak'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_streak_leaderboard', { p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => ({ ...r, current_streak: Number(r.current_streak ?? 0) }));
    },
    staleTime: 60 * 1000,
  });
}

export function useRegionalStreakLeaderboard(region: string | null) {
  return useQuery<StreakLeaderboardEntry[]>({
    queryKey: ['leaderboard_regional_streak', region],
    queryFn: async () => {
      if (!region) return [];
      const { data, error } = await (supabase.rpc as any)('get_regional_streak_leaderboard', { p_region: region, p_limit: 100 });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any) => ({ ...r, current_streak: Number(r.current_streak ?? 0) }));
    },
    enabled: !!region,
    staleTime: 60 * 1000,
  });
}

// ── Champions per class (1 por classe) ────────────────────────────────────────

export function useClassChampions() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_class_champions'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_class_champions');
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    staleTime: 60 * 1000,
  });
}

export function useRegionalClassChampions(region: string | null) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard_regional_class_champions', region],
    queryFn: async () => {
      if (!region) return [];
      const { data, error } = await (supabase.rpc as any)('get_regional_class_champions', { p_region: region });
      if (error) throw error;
      return (data ?? []) as LeaderboardEntry[];
    },
    enabled: !!region,
    staleTime: 60 * 1000,
  });
}
