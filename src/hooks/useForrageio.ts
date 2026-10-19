import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAllCompanions } from './useCompanion';
import { getActivePetType, isForagePet } from '@/lib/pets';

const db = supabase as any;

/** One server-validated forage claim per user and São Paulo day. */
export function useForrageio() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: companions } = useAllCompanions();
  const ranForDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !companions) return;
    const activeType = getActivePetType(user.id);
    if (!isForagePet(activeType)) return;
    const pet = companions.find((c) => c.companion_type === activeType);
    if (!pet) return;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    if (ranForDayRef.current === today) return;
    ranForDayRef.current = today;

    void (async () => {
      try {
        const { data, error } = await db.rpc('forage_inventory', { p_companion_id: pet.id });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['companions_all', user.id] });
        if (data?.item_id && !data?.replayed) {
          qc.invalidateQueries({ queryKey: ['inventory', user.id] });
          toast.success(t('app.companion.forage_toast_title', {
            name: pet.name,
            defaultValue: `🐾 ${pet.name} forrageou!`,
          }), { description: `${data.name} · ${data.rarity}` });
        }
      } catch (error) {
        ranForDayRef.current = null;
        console.warn('[forrageio] pulado:', error);
      }
    })();
  }, [user, companions, qc, t]);
}
