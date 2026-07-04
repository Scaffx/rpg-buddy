import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords, Save, X as XIcon, Lock, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInventory } from '@/hooks/useInventory';
import { useHeroClass } from '@/hooks/useHeroClass';
import { useSkillTreeNodes, usePlayerSkillNodes } from '@/hooks/useSkillTree';

// Loadout LIVRE: sem teto rígido. O jogador leva todas as skills que desbloqueou;
// o balanceio vem da PROFUNDIDADE da árvore (focar/maxar 2 elementos > espalhar).
const EFFECT_ICON: Record<string, string> = { dano: '⚔️', heal: '💚', buff: '🛡️', debuff: '🔻', cc: '⚡', utility: '✨' };
const SOURCE_LABEL: Record<string, string> = { novice: 'Noviço', class: 'Classe', tree: 'Árvore', weapon: 'Arma', cinza: 'Cinza' };

/** Mapeia nós-skill alocados (rank>=1) de uma árvore para entradas de loadout. */
function buildTreeSkills(nodes: any[], ranks: Record<string, number>, archetype = 'Árvore'): any[] {
  return (nodes || [])
    .filter((n) => n.node_type === 'skill' && (ranks[n.id] || 0) >= 1)
    .map((n) => {
      const eff: any = n.effect || {};
      const rank = ranks[n.id] || 1;
      const pct = Number(eff.pct_per_rank ?? 10);
      const power = Math.round(Number(eff.power ?? 30) * (1 + (rank - 1) * pct / 100));
      const element = String(eff.element || 'arcano');
      return {
        id: n.id, name: n.name, power, cooldown: Number(eff.cooldown ?? 2),
        category: element === 'fisico' ? 'fisica' : 'magica', tier: 'classe',
        mpCost: Number(eff.mpCost ?? 0), effectType: String(eff.effectType || 'dano'),
        effectLabel: n.description, element, archetype, unlocked: true, _src: 'tree',
      } as any;
    });
}

/** Editor de loadout de combate — fonte única usada no hub de Habilidades. */
export default function CombatLoadout() {
  const { t } = useTranslation();
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
  const { data: inventory = [] } = useInventory();

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
    setSelectedIds(raw.map((e: any) => String(e?.id || '')).filter((id: string) => id && unlockedById.has(id)));
  }, [profile, unlockedById]);

  // Frascos (estilo Elden Ring): aloca até 4 entre Vida e Mana. Persistido em profiles.
  const [flaskHp, setFlaskHp] = useState(2);
  const [flaskMp, setFlaskMp] = useState(2);
  useEffect(() => {
    setFlaskHp(Math.max(0, Number((profile as any)?.flask_hp_count ?? 2)));
    setFlaskMp(Math.max(0, Number((profile as any)?.flask_mp_count ?? 2)));
  }, [profile]);
  const saveFlasks = async (hp: number, mp: number) => {
    if (!user || hp < 0 || mp < 0 || hp + mp > 4) return;
    setFlaskHp(hp); setFlaskMp(mp);
    await supabase.from('profiles').update({ flask_hp_count: hp, flask_mp_count: mp } as any).eq('user_id', user.id);
    qc.invalidateQueries({ queryKey: ['profile'] });
  };

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

  return (
    <div className="space-y-5">
      {/* Frascos de combate (Elden Ring): aloca 4 entre Vida e Mana */}
      <div className="rpg-card space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">🧪 Frascos de combate</h3>
          <span className="text-xs font-bold text-muted-foreground">{flaskHp + flaskMp}/4</span>
        </div>
        <p className="text-xs text-muted-foreground">Aloque até 4 frascos entre Vida (cura 40% do HP) e Mana (restaura 50% do MP). Resetam a cada luta.</p>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-300">🧪 Vida</span>
            <button onClick={() => saveFlasks(Math.max(0, flaskHp - 1), flaskMp)} className="w-6 h-6 rounded bg-muted/40 text-foreground font-bold">−</button>
            <span className="w-4 text-center text-sm font-bold text-foreground">{flaskHp}</span>
            <button onClick={() => saveFlasks(flaskHp + 1, flaskMp)} disabled={flaskHp + flaskMp >= 4} className="w-6 h-6 rounded bg-muted/40 text-foreground font-bold disabled:opacity-40">+</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-sky-300">💧 Mana</span>
            <button onClick={() => saveFlasks(flaskHp, Math.max(0, flaskMp - 1))} className="w-6 h-6 rounded bg-muted/40 text-foreground font-bold">−</button>
            <span className="w-4 text-center text-sm font-bold text-foreground">{flaskMp}</span>
            <button onClick={() => saveFlasks(flaskHp, flaskMp + 1)} disabled={flaskHp + flaskMp >= 4} className="w-6 h-6 rounded bg-muted/40 text-foreground font-bold disabled:opacity-40">+</button>
          </div>
        </div>
      </div>

      {/* Slots */}
      <div className="rpg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Swords className="w-4 h-4 text-primary" /><h3 className="text-sm font-bold text-foreground">{t('app.habhub.loadout_title')}</h3></div>
          <span className="text-xs font-bold text-muted-foreground">{t('app.habhub.equipped_count', { n: selected.length })}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('app.habhub.loadout_free_hint')}</p>
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)} title={t('app.habhub.remove')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:border-rose-500/50 transition-colors">
                <span>{EFFECT_ICON[s.effectType] || '⚔️'}</span>
                <span>{s.name}</span>
                <XIcon className="w-3 h-3 text-emerald-400/60" />
              </button>
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
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">⚔️ {s.power}</span>
                {typeof s.mpCost === 'number' && s.mpCost > 0 && <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">💧 {s.mpCost}</span>}
                <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300">⏱ {s.cooldown}t</span>
              </div>
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
