import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useAllCompanions } from './useCompanion';
import { useMissions, useProfile } from './useProfile';
import { computeAnchorStatusToday } from '@/lib/anchors';
import { DAYS_MAP, getLocalDateString } from '@/lib/streakUtils';
import {
  getActivePetType,
  isForagePet,
  hasForagedToday,
  accrueAffinity,
  rollForageRarity,
  FORAGE_RARITY_DESC,
  type ForageRarity,
} from '@/lib/pets';

const db = supabase as any;
const EQUIP_CATEGORIES = ['weapon', 'armor', 'accessory'];

type ForageItem = { id: string; name: string; rarity: string };

/**
 * Escolhe um item equipável do forrageio: começa na raridade sorteada e desce
 * até achar um item que o herói ainda NÃO tem (nunca sobe acima do teto). Exclui
 * consumíveis e drops de boss (forrageio é gear "selvagem", não loot exclusivo).
 */
async function pickForageItem(rarity: ForageRarity, level: number, userId: string): Promise<ForageItem | null> {
  const { data: owned } = await db.from('user_inventory').select('item_id').eq('user_id', userId);
  const ownedIds = new Set((owned || []).map((r: any) => r.item_id));

  const startIdx = FORAGE_RARITY_DESC.indexOf(rarity);
  for (let i = startIdx; i < FORAGE_RARITY_DESC.length; i++) {
    const { data } = await db
      .from('game_items')
      .select('id, name, rarity, category, is_consumable, boss_drop_level, level_required')
      .in('category', EQUIP_CATEGORIES)
      .eq('rarity', FORAGE_RARITY_DESC[i])
      .eq('is_consumable', false)
      .is('boss_drop_level', null)
      .lte('level_required', Math.max(1, level));
    const pool = (data || []).filter((it: any) => !ownedIds.has(it.id));
    if (pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return { id: chosen.id, name: chosen.name, rarity: chosen.rarity };
    }
  }
  return null;
}

/**
 * Job diário de forrageio (Fase 1.5). Roda no app open (montado no AppLayout).
 * Se o pet ATIVO for caçador: acumula afinidade em dia perfeito e, 1x/dia, traz
 * um item equipável cuja raridade escala com a afinidade. Client-only, sem edge.
 * Falha em silêncio — forrageio é bônus e nunca pode quebrar o app.
 */
export function useForrageio() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: companions } = useAllCompanions();
  const { data: missions } = useMissions();
  const { data: profile } = useProfile();
  const ranForDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !companions || !missions) return;

    const activeType = getActivePetType(user.id);
    if (!isForagePet(activeType)) return;
    const pet = companions.find((c) => c.companion_type === activeType);
    if (!pet) return;

    const todayStr = getLocalDateString();
    if (ranForDayRef.current === todayStr) return; // já processado nesta sessão hoje
    ranForDayRef.current = todayStr;

    void (async () => {
      try {
        const todayDay = DAYS_MAP[new Date().getDay()];
        const anchor = computeAnchorStatusToday(missions as any[], todayStr, todayDay);
        const perfectDay = anchor.hasAnchors && anchor.allComplete;

        // 1) Afinidade: +1 uma vez por dia perfeito.
        let affinity = Number(pet.affinity ?? 0);
        const accrued = accrueAffinity(affinity, pet.last_affinity_date ?? null, perfectDay, todayStr);
        if (accrued) {
          affinity = accrued.affinity;
          await db
            .from('companions')
            .update({ affinity: accrued.affinity, last_affinity_date: accrued.lastAffinityDate })
            .eq('id', pet.id);
        }

        // 2) Forrageio: 1x/dia.
        if (!hasForagedToday(pet.last_forage_at ?? null, todayStr)) {
          const rarity = rollForageRarity(affinity);
          const item = await pickForageItem(rarity, Number(profile?.level ?? 1), user.id);

          // Marca forrageado independentemente de ter achado item (1x/dia real).
          await db.from('companions').update({ last_forage_at: todayStr }).eq('id', pet.id);

          if (item) {
            await db.from('user_inventory').insert({
              user_id: user.id,
              item_id: item.id,
              quantity: 1,
              equipped: false,
            });
            qc.invalidateQueries({ queryKey: ['inventory'] });
            toast.success(t('app.companion.forage_toast_title', { name: pet.name, defaultValue: `🐾 ${pet.name} forrageou!` }), {
              description: `${item.name} · ${item.rarity}`,
            });
          }
        }

        qc.invalidateQueries({ queryKey: ['companions_all', user.id] });
      } catch (e) {
        // Silencioso: se as colunas ainda não existem (pré-migração) ou falha de rede,
        // libera o retry no próximo open sem incomodar o usuário.
        ranForDayRef.current = null;
        console.warn('[forrageio] pulado:', e);
      }
    })();
  }, [user, companions, missions, profile, qc, t]);
}
