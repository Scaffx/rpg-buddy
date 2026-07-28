/**
 * Automático de combate.
 *
 * Resolve a luta trivial sem exigir atenção: rotaciona as habilidades, cai no
 * ataque básico quando falta mana e bebe frasco quando aperta. De propósito ele
 * NÃO troca equipamento — quem quiser explorar vantagem elemental joga no
 * manual e é recompensado por isso. O automático é conveniência, não estratégia.
 *
 * Só a decisão mora aqui, pura e determinística; quem executa o turno é a edge
 * (submitCombatTurn), que segue sendo a única autoridade sobre dano.
 */

export type AutoSkill = {
  id: string;
  name: string;
  power: number;
  mpCost?: number;
  effectType?: string;
  element?: string;
};

export type AutoBattleState = {
  hpPlayer: number;
  hpPlayerMax: number;
  mpPlayer: number;
  /** Habilidades equipadas no loadout, na ordem em que o jogador as salvou. */
  skills: AutoSkill[];
  /** Quantos turnos já foram jogados nesta luta (usado para rotacionar). */
  turnsTaken: number;
  flaskHpLeft: number;
  flaskMpLeft: number;
};

export type AutoBattleAction =
  | { kind: 'skill'; skill: AutoSkill }
  | { kind: 'basic' }
  | { kind: 'flask_hp' }
  | { kind: 'flask_mp' };

/** Abaixo disto o automático prioriza sobreviver a atacar. */
export const AUTO_HP_FLASK_THRESHOLD = 0.3;

/** Custo da habilidade, tratando ausência como gratuita. */
function costOf(skill: AutoSkill): number {
  return Math.max(0, Number(skill.mpCost ?? 0));
}

/** Habilidades que causam dano e cabem no MP disponível. */
function usableSkills(state: AutoBattleState): AutoSkill[] {
  return state.skills.filter(
    (s) => s.id && (s.effectType ?? 'dano') !== 'buff' && costOf(s) <= state.mpPlayer,
  );
}

/**
 * Decide a próxima ação. Ordem de prioridade:
 *   1. HP baixo e ainda há frasco de vida → bebe (sobreviver vem antes de atacar)
 *   2. Nenhuma habilidade cabe no MP, mas há frasco de mana → bebe
 *   3. Rotaciona entre as habilidades disponíveis
 *   4. Ataque básico
 */
export function decideAutoAction(state: AutoBattleState): AutoBattleAction {
  const hpMax = state.hpPlayerMax > 0 ? state.hpPlayerMax : 1;
  const hpRatio = state.hpPlayer / hpMax;

  if (hpRatio <= AUTO_HP_FLASK_THRESHOLD && state.flaskHpLeft > 0) {
    return { kind: 'flask_hp' };
  }

  const usable = usableSkills(state);

  // Só vale beber mana se existir habilidade que o MP atual não alcança —
  // beber com o loadout inteiro disponível seria desperdício de carga.
  if (usable.length === 0 && state.flaskMpLeft > 0) {
    const hasSkillWaitingOnMana = state.skills.some(
      (s) => s.id && (s.effectType ?? 'dano') !== 'buff' && costOf(s) > state.mpPlayer,
    );
    if (hasSkillWaitingOnMana) return { kind: 'flask_mp' };
  }

  if (usable.length > 0) {
    // Rotação simples: espalha o uso em vez de martelar sempre a mesma.
    const index = state.turnsTaken % usable.length;
    return { kind: 'skill', skill: usable[index] };
  }

  return { kind: 'basic' };
}

/** Intervalo entre turnos automáticos: rápido, mas legível por quem assiste. */
export const AUTO_TURN_DELAY_MS = 1500;
