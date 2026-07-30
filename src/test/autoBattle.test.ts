import { describe, it, expect } from 'vitest';
import { decideAutoAction, AUTO_HP_FLASK_THRESHOLD, type AutoBattleState, type AutoSkill } from '@/lib/autoBattle';

const golpe: AutoSkill = { id: 'a', name: 'Golpe', power: 40, mpCost: 5 };
const raio: AutoSkill = { id: 'b', name: 'Raio', power: 60, mpCost: 12 };

function state(over: Partial<AutoBattleState> = {}): AutoBattleState {
  return {
    hpPlayer: 100,
    hpPlayerMax: 100,
    mpPlayer: 50,
    skills: [golpe, raio],
    turnsTaken: 0,
    flaskHpLeft: 2,
    flaskMpLeft: 2,
    ...over,
  };
}

describe('decideAutoAction', () => {
  it('rotaciona entre as habilidades disponiveis', () => {
    expect(decideAutoAction(state({ turnsTaken: 0 }))).toEqual({ kind: 'skill', skill: golpe });
    expect(decideAutoAction(state({ turnsTaken: 1 }))).toEqual({ kind: 'skill', skill: raio });
    expect(decideAutoAction(state({ turnsTaken: 2 }))).toEqual({ kind: 'skill', skill: golpe });
  });

  it('bebe frasco de vida antes de atacar quando o HP aperta', () => {
    const s = state({ hpPlayer: 20 }); // 20% <= 30%
    expect(decideAutoAction(s)).toEqual({ kind: 'flask_hp' });
  });

  it('nao bebe vida se nao houver frasco — segue lutando', () => {
    const s = state({ hpPlayer: 10, flaskHpLeft: 0 });
    expect(decideAutoAction(s).kind).toBe('skill');
  });

  it('respeita exatamente o limiar de HP', () => {
    const naLinha = state({ hpPlayer: AUTO_HP_FLASK_THRESHOLD * 100 });
    expect(decideAutoAction(naLinha)).toEqual({ kind: 'flask_hp' });
    const acima = state({ hpPlayer: AUTO_HP_FLASK_THRESHOLD * 100 + 1 });
    expect(decideAutoAction(acima).kind).toBe('skill');
  });

  it('bebe mana quando nenhuma habilidade cabe no MP atual', () => {
    const s = state({ mpPlayer: 0 });
    expect(decideAutoAction(s)).toEqual({ kind: 'flask_mp' });
  });

  it('cai no ataque basico sem MP e sem frasco de mana', () => {
    const s = state({ mpPlayer: 0, flaskMpLeft: 0 });
    expect(decideAutoAction(s)).toEqual({ kind: 'basic' });
  });

  it('nao desperdica frasco de mana quando o loadout inteiro ja cabe', () => {
    // MP suficiente para tudo: nao ha razao para beber.
    const s = state({ mpPlayer: 99 });
    expect(decideAutoAction(s).kind).toBe('skill');
  });

  it('usa apenas as habilidades que cabem no MP', () => {
    // MP 5 alcanca o Golpe (5) mas nao o Raio (12).
    const s = state({ mpPlayer: 5, turnsTaken: 1 });
    expect(decideAutoAction(s)).toEqual({ kind: 'skill', skill: golpe });
  });

  it('ataque basico quando o loadout esta vazio', () => {
    const s = state({ skills: [] });
    expect(decideAutoAction(s)).toEqual({ kind: 'basic' });
  });

  it('ignora habilidades de buff — o automatico so ataca', () => {
    const buff: AutoSkill = { id: 'c', name: 'Guarda', power: 0, mpCost: 0, effectType: 'buff' };
    const s = state({ skills: [buff] });
    expect(decideAutoAction(s)).toEqual({ kind: 'basic' });
  });
});
