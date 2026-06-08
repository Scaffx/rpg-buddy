import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords, Save, Plus, X as XIcon, Lock, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useHeroClass } from '@/hooks/useHeroClass';
import { useSkillTreeNodes, usePlayerSkillNodes } from '@/hooks/useSkillTree';
import { getSkillLoadout } from '@/lib/combat';
import { MODE_SKILL_LIMITS } from '@/lib/constants';

const MAX = MODE_SKILL_LIMITS.event; // o loadout guarda até o teto (evento); cada modo usa os primeiros N

const EFFECT_ICON: Record<string, string> = { dano: '⚔️', heal: '💚', buff: '🛡️', debuff: '🔻', cc: '⚡', utility: '✨' };
const SOURCE_LABEL: Record<string, string> = { novice: 'Noviço', class: 'Classe', tree: 'Árvore' };

/** Editor de loadout de combate — fonte única usada no hub de Habilidades. */
export default function CombatLoadout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const { starterClass, starterItem, currentClassName, level, attributeLevels } = useHeroClass();

  const { data: treeNodes = [] } = useSkillTreeNodes(starterClass);
  const { data: treeRanks = {} } = usePlayerSkillNodes();

  const loadoutData = useMemo(
    () => getSkillLoadout(level, attributeLevels, starterClass as any, starterItem, currentClassName),
    [level, attributeLevels, starterClass, starterItem, currentClassName],
  );

  const treeSkills = useMemo(() => {
    return (treeNodes || [])
      .filter((n) => n.node_type === 'skill' && (treeRanks[n.id] || 0) >= 1)
      .map((n) => {
        const eff: any = n.effect || {};
        const rank = treeRanks[n.id] || 1;
        const pct = Number(eff.pct_per_rank ?? 10);
        const power = Math.round(Number(eff.power ?? 30) * (1 + (rank - 1) * pct / 100));
        const element = String(eff.element || 'arcano');
        return {
          id: n.id, name: n.name, power, cooldown: Number(eff.cooldown ?? 2),
          category: element === 'fisico' ? 'fisica' : 'magica', tier: 'classe',
          mpCost: Number(eff.mpCost ?? 0), effectType: String(eff.effectType || 'dano'),
          effectLabel: n.description, element, archetype: 'Árvore', unlocked: true, _src: 'tree',
        } as any;
      });
  }, [treeNodes, treeRanks]);

  const allSkills = useMemo(() => {
    const tag = (arr: any[], src: string) => arr.map((s) => ({ ...s, _src: src }));
    return [
      ...tag(loadoutData.noviceSkills, 'novice'),
      ...tag([...loadoutData.classSkills, ...(loadoutData.specialtySkills ?? [])], 'class'),
      ...treeSkills,
    ];
  }, [loadoutData, treeSkills]);

  const unlockedById = useMemo(() => new Map(allSkills.filter((s) => s.unlocked).map((s) => [s.id, s])), [allSkills]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    const raw = Array.isArray((profile as any)?.combat_skill_loadout) ? (profile as any).combat_skill_loadout : [];
    setSelectedIds(raw.map((e: any) => String(e?.id || '')).filter((id: string) => id && unlockedById.has(id)).slice(0, MAX));
  }, [profile, unlockedById]);

  const selected = selectedIds.map((id) => unlockedById.get(id)).filter(Boolean) as any[];

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');
      const payload = selectedIds.map((id) => unlockedById.get(id)).filter(Boolean).slice(0, MAX).map((s: any) => ({
        id: s.id, name: s.name, power: s.power, cooldown: s.cooldown, category: s.category,
        tier: s.tier, mpCost: s.mpCost, effectType: s.effectType, effectLabel: s.effectLabel, element: s.element,
      }));
      const { error } = await supabase.from('profiles').update({ combat_skill_loadout: payload }).eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success(t('app.habhub.loadout_saved')); },
    onError: (e: any) => toast.error(e?.message || t('app.habhub.loadout_error')),
  });

  const toggle = (id: string) => {
    if (!unlockedById.has(id)) return;
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX) { toast.error(t('app.habhub.loadout_full', { max: MAX })); return prev; }
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-5">
      {/* Slots */}
      <div className="rpg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Swords className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">{t('app.habhub.loadout_title')}</h3></div>
          <span className="text-xs font-bold text-muted-foreground">{selected.length}/{MAX}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('app.habhub.mode_limits', { solo: MODE_SKILL_LIMITS.solo, dungeon: MODE_SKILL_LIMITS.dungeon, event: MODE_SKILL_LIMITS.event })}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: MAX }).map((_, i) => {
            const s = selected[i];
            const tier = i < MODE_SKILL_LIMITS.solo ? 'solo' : i < MODE_SKILL_LIMITS.dungeon ? 'dungeon' : 'event';
            return s ? (
              <button key={s.id} onClick={() => toggle(s.id)} title="Remover" className="relative rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-center hover:border-rose-500/50 transition-colors">
                <div className="text-xl">{EFFECT_ICON[s.effectType] || '⚔️'}</div>
                <p className="text-[10px] font-bold text-emerald-200 leading-tight line-clamp-2">{s.name}</p>
                <XIcon className="absolute top-1 right-1 w-3 h-3 text-emerald-400/50" />
              </button>
            ) : (
              <div key={`e${i}`} className="rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-2.5 flex flex-col items-center justify-center min-h-[64px] gap-0.5">
                <Plus className="w-4 h-4 text-border/60" />
                <span className="text-[9px] text-muted-foreground/50 uppercase">{tier}</span>
              </div>
            );
          })}
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="w-full rounded-xl bg-primary/90 hover:bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition disabled:opacity-60 flex items-center justify-center gap-2">
          {save.isPending ? <><Sparkles className="w-4 h-4 animate-spin" /> {t('app.habhub.saving')}</> : <><Save className="w-4 h-4" /> {t('app.habhub.save')}</>}
        </button>
      </div>

      {/* Skills disponíveis */}
      <div className="grid gap-2 sm:grid-cols-2">
        {allSkills.map((s, idx) => {
          const inDeck = selectedIds.includes(s.id);
          const full = selected.length >= MAX;
          return (
            <div key={`${s.id}-${idx}`} className={`rounded-xl border p-3 space-y-2 ${s.unlocked ? 'bg-card border-border' : 'bg-muted/15 border-border/50 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground flex items-center gap-1.5">{EFFECT_ICON[s.effectType] || '⚔️'} {s.name}</p>
                  <p className="text-[10px] text-muted-foreground">{SOURCE_LABEL[s._src] || s.archetype}{s.element && s.element !== 'neutro' ? ` · ${s.element}` : ''}</p>
                </div>
                {!s.unlocked && <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Lock className="w-2.5 h-2.5" /> Nv.{s.unlockLevel}</span>}
              </div>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{s.description || s.effectLabel}</p>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">⚔️ {s.power}</span>
                {typeof s.mpCost === 'number' && s.mpCost > 0 && <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">💧 {s.mpCost}</span>}
                <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300">⏱ {s.cooldown}t</span>
              </div>
              {s.unlocked && (
                <button onClick={() => toggle(s.id)} disabled={!inDeck && full}
                  className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${inDeck ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-rose-500/10 hover:text-rose-300' : full ? 'bg-muted/20 border border-border/50 text-muted-foreground/50 cursor-not-allowed' : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'}`}>
                  {inDeck ? `✕ ${t('app.habhub.remove')}` : full ? t('app.habhub.deck_full') : `+ ${t('app.habhub.add')}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
