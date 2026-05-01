import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SkeletonChoice = 'adopt' | 'reject' | null;

export interface HeroStoryChoicesRow {
  user_id: string;
  skeleton_champion: SkeletonChoice;
  updated_at: string;
}

export function useHeroStoryChoices() {
  const { user } = useAuth();
  return useQuery<HeroStoryChoicesRow | null>({
    queryKey: ['hero_story_choices', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hero_story_choices' as never)
        .select('*')
        .eq('user_id' as never, user!.id as never)
        .maybeSingle();
      if (error) throw error;
      return (data as HeroStoryChoicesRow | null) ?? null;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

export function useSaveSkeletonChoice() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (choice: 'adopt' | 'reject') => {
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('hero_story_choices' as never)
        .upsert(
          {
            user_id: user.id,
            skeleton_champion: choice,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'user_id' } as never,
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hero_story_choices', user?.id] }),
  });
}
