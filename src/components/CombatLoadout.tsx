import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords, Save, X as XIcon, Lock, Sparkles, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInventory } from '@/hooks/useInventory';
import { useHeroClass } from '@/hooks/useHeroClass';
import { useSkillTreeNodes, usePlayerSkillNodes } from '@/hooks/useSkillTree';
import { buildTreeSkillEntry } from '@/lib/combat';

// Loadout LIVRE: sem teto rígido. O jogador leva todas as skills que desbloqueou;
// o balanceio vem da PROFUNDIDADE da árvore (focar/maxar 2 elementos > espalhar).
const EFFECT_ICON: Record<string, string> = { dano: '⚔️', heal: '💚', buff: '🛡️', debuff: '🔻', cc: '⚡', utility: '✨' };
const adventureExecutable = (effectType: string) =>
  ['dano', 'damage', 'heal', 'buff', 'debuff', 'cc'].includes(effectType);
const directDamageOnly = (effectType: string) => effectType === 'dano' || effectType === 'damage';
const SOURCE_LABEL: Record<string, string> = { novice: 'Noviço', class: 'Classe', tree: 'Árvore', weapon: 'Arma', cinza: 'Cinza' };
const MAGE_AREA_VARIANTS: Record<string, { id: string; name: string }> = {
  m_bola_fogo: { id: 'm_fogo_var', name: 'Meteoro' },
  m_lanca_gelo: { id: 'm_gelo_var', name: 'Nova Gélida' },
  m_corrente_raio: { id: 'm_raio_var', name: 'Tornado' },
};

/** Mapeia nós-skill alocados (rank>=1) de uma árvore para entradas de loadout. */
function buildTreeSkills(nodes: any[], ranks: Record<string, number>, archetype = 'Árvore'): any[] {
  return (nodes || [])
    .filter((n) => n.node_type === 'skill' && (ranks[n.id] || 0) >= 1)
    .map((n) => ({
      ...buildTreeSkillEntry(n, ranks[n.id] || 1),
      archetype,
      unlocked: true,
      _src: 'tree',
    }) as any);
}

/** Editor de loadout de combate — fonte única usada no hub de Habilidades. */
export default function CombatLoadout() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const { treeKey, hasClass } = useHeroClass();

  const { data: treeNodes = [] } = useSkillTreeNodes(treeKey);
  const { data: cinzaNodes = [] } = useSkillTreeNodes('cinzas');
  // Skills do Aprendiz (tier 0) SEMPRE carregadas: ao virar tier-1 (treeKey vira a
  // classe), o Golpe Improvisado já alocado continua disponível no loadout LIVRE.
  const { data: aprendizNodes = [] } = useSkillTreeNodes('aprendiz');
  const { data: treeRanks = {} } = usePlayerSkillNodes();
  const areaVariantName = (baseId: string): string | null => {
    const variant = MAGE_AREA_VARIANTS[baseId];
    return treeKey === 'mago' && variant && (treeRanks[variant.id] || 0) >= 1 ? variant.name : null;
  };
  const { data: inventory = [] } = useInventory();
  const secondsFormatter = useMemo(() => new Intl.NumberFormat(i18n?.resolvedLanguage || i18n?.language || 'pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }), [i18n?.resolvedLanguage, i18n?.language]);
  // O motor da aventura automática agenda o próximo uso após (cooldown + 1) ações de 2,8 s.
  const cooldownSeconds = (cooldown: unknown) => secondsFormatter.format((Number(cooldown ?? 0) + 1) * 2.8);

  // Cinzas de Guerra: a skill da ARMA equipada vira disponível no loadout (Fase B).
  const weaponSkills = useMemo(() => {
    return (inventory || [])
      .filter((inv: any) => inv.equipped && (inv.game_items as any)?.weapon_skill)
      .map((inv: any) => {
        const gi: any = inv.game_items;
        const ws: any = gi.weapon_skill || {};
        return {
          id: `weapon_${inv.item_id || gi.id}`,
          name: String(ws.name || `Golpe de ${gi.name}`),
          power: Number(ws.power ?? 40),
          cooldown: Number(ws.cooldown ?? 2),
          category: 'fisica',
          tier: 'arma',
          mpCost: Number(ws.mpCost ?? 0),
          effectType: String(ws.effectType || 'dano'),
          effectLabel: String(ws.desc || `Habilidade de ${gi.name}`),
          element: String(ws.element || gi.weapon_element || 'neutro'),
          archetype: gi.name,
          unlocked: true,
          _src: 'weapon',
        } as any;
      });
  }, [inventory]);

  const treeSkills = useMemo(() => buildTreeSkills(treeNodes, treeRanks), [treeNodes, treeRanks]);
  // Skills do Aprendiz alocadas seguem no loadout mesmo após escolher classe tier-1.
  const aprendizSkills = useMemo(() => buildTreeSkills(aprendizNodes, treeRanks, 'Aprendiz'), [aprendizNodes, treeRanks]);

  // Elemento/tipo da ARMA equipada — usado para liberar Cinzas compatíveis.
  const equippedWeapon = useMemo(() => {
    const inv = (inventory || []).find((i: any) => i.equipped && (i.game_items as any)?.category === 'weapon');
    const gi: any = inv?.game_items || null;
    return gi ? { element: String(gi.weapon_element || 'neutro'), type: String(gi.weapon_type || '') } : null;
  }, [inventory]);

  // Cinzas de Guerra: artes aprendidas (player_skill_nodes, tree='cinzas') que SÓ aparecem
  // quando a arma compatível (elemento e/ou tipo) está equipada — o servidor reforça o gate.
  const cinzaSkills = useMemo(() => {
    return (cinzaNodes || [])
      .filter((n: any) => n.node_type === 'skill' && (treeRanks[n.id] || 0) >= 1)
      .filter((n: any) => {
        const reqType = (n as any).requires_weapon_type;
        const reqEl = (n as any).requires_weapon_element;
        if (reqType && (!equippedWeapon || equippedWeapon.type !== reqType)) return false;
        if (reqEl && (!equippedWeapon || equippedWeapon.element !== reqEl)) return false;
        return true;
      })
      .map((n: any) => {
        const eff: any = n.effect || {};
        const rank = treeRanks[n.id] || 1;
        const pct = Number(eff.pct_per_rank ?? 0);
        const power = Math.round(Number(eff.power ?? 30) * (1 + (rank - 1) * pct / 100));
        const element = String(eff.element || 'neutro');
        return {
          id: n.id, name: n.name, power, cooldown: Number(eff.cooldown ?? 2),
          category: element === 'fisico' ? 'fisica' : 'magica', tier: 'cinza',
          mpCost: Number(eff.mpCost ?? 0), effectType: String(eff.effectType || 'dano'),
          effectLabel: n.description, element, archetype: 'Cinza de Guerra', unlocked: true, _src: 'cinza',
        } as any;
      });
  }, [cinzaNodes, treeRanks, equippedWeapon]);

  // Sem classe escolhida → só ARMA + CINZAS. As skills de CLASSE (árvore) só liberam após
  // o jogador escolher uma classe (antes, starterClass caía em 'novato' e mostrava skills indevidas).
  const allSkills = useMemo(() => {
    const merged = [...weaponSkills, ...(hasClass ? treeSkills : []), ...cinzaSkills, ...aprendizSkills];
    // dedup por id (aprendiz coincide com treeSkills quando o próprio treeKey é 'aprendiz')
    const seen = new Set<string>();
    return merged.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }, [weaponSkills, treeSkills, cinzaSkills, aprendizSkills, hasClass]);

  const unlockedById = useMemo(() => new Map(allSkills.filter((s) => s.unlocked).map((s) => [s.id, s])), [allSkills]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    const raw = Array.isArray((profile as any)?.combat_skill_loadout) ? (profile as any).combat_skill_loadout : [];
    setSelectedIds([...new Set<string>(raw.map((entry: unknown) =>
      entry && typeof entry === 'object' && 'id' in entry ? String(entry.id || '') : '',
    ).filter((id: string) => id && unlockedById.has(id)))]);
  }, [profile, unlockedById]);

  const selected = selectedIds.map((id) => unlockedById.get(id)).filter(Boolean) as any[];

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');
      const payload = selectedIds.map((id) => unlockedById.get(id)).filter(Boolean).map((s: any) => ({
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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const move = (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= selectedIds.length) return;
    setSelectedIds((ids) => {
      const ordered = [...ids];
      [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
      return ordered;
    });
  };

  return (
    <div className="space-y-5">
      {/* Slots */}
      <div className="rpg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Swords className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">{t('app.habhub.loadout_title')}</h3></div>
          <span className="text-xs font-bold text-muted-foreground">{t('app.habhub.equipped_count', { n: selected.length })}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('app.habhub.loadout_free_hint')}</p>
        {selected.length > 0 ? (
          <div className="space-y-2" aria-label={t('app.habhub.ordered_skills')}>
            {selected.map((s, index) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200">
                <span className="font-semibold">{index + 1}. {EFFECT_ICON[s.effectType] || '⚔️'} {s.name}</span>
                {areaVariantName(s.id) && <span className="text-sky-200">Após salvar, na próxima luta: {areaVariantName(s.id)} atinge o grupo</span>}
                <span className="text-muted-foreground">{t('app.habhub.skill_cost_cooldown', { mp: s.mpCost ?? 0, seconds: cooldownSeconds(s.cooldown) })}</span>
                {directDamageOnly(s.effectType) && <span className="text-muted-foreground">{t('app.habhub.direct_damage_only')}</span>}
                {!adventureExecutable(s.effectType) && <span className="text-amber-300">{t('app.habhub.not_in_auto_adventure')}</span>}
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('app.habhub.move_up', { name: s.name })} className="rounded p-1 hover:bg-emerald-500/20 disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label={t('app.habhub.move_down', { name: s.name })} className="rounded p-1 hover:bg-emerald-500/20 disabled:opacity-40"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => toggle(s.id)} aria-label={t('app.habhub.remove_named', { name: s.name })} className="rounded p-1 hover:bg-rose-500/20"><XIcon className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">{t('app.habhub.loadout_empty')}</p>
        )}
        <button onClick={() => save.mutate()} disabled={save.isPending} className="w-full rounded-xl bg-primary/90 hover:bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition disabled:opacity-60 flex items-center justify-center gap-2">
          {save.isPending ? <><Sparkles className="w-4 h-4 animate-spin" /> {t('app.habhub.saving')}</> : <><Save className="w-4 h-4" /> {t('app.habhub.save')}</>}
        </button>
      </div>

      {/* Skills disponíveis */}
      <div className="grid gap-2 sm:grid-cols-2">
        {allSkills.map((s, idx) => {
          const inDeck = selectedIds.includes(s.id);
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
              {areaVariantName(s.id) && <p className="text-xs text-sky-200">Variante aprendida: {areaVariantName(s.id)} atinge o grupo na próxima luta quando esta base estiver equipada.</p>}
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">⚔️ {s.power}</span>
                <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300">⏱ {t('app.habhub.skill_cost_cooldown', { mp: s.mpCost ?? 0, seconds: cooldownSeconds(s.cooldown) })}</span>
              </div>
              {!adventureExecutable(s.effectType) && <p className="text-xs text-amber-300">{t('app.habhub.not_in_auto_adventure')}</p>}
              {directDamageOnly(s.effectType) && <p className="text-xs text-muted-foreground">{t('app.habhub.direct_damage_only')}</p>}
              {s.unlocked && (
                <button onClick={() => toggle(s.id)}
                  className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${inDeck ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-rose-500/10 hover:text-rose-300' : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'}`}>
                  {inDeck ? `✕ ${t('app.habhub.remove')}` : `+ ${t('app.habhub.add')}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
