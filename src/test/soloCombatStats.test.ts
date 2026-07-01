import { describe, it, expect } from 'vitest';
import { computeSoloCombatStats, getPlayerCombatStats, type AttrLevels } from '@/lib/combat';

const LEVEL = 30;

function attrs(overrides: Partial<AttrLevels>): AttrLevels {
  return {
    Forca: 0, Inteligencia: 0, Agilidade: 0, Disciplina: 0, Sabedoria: 0,
    Resiliencia: 0, Carisma: 0, Vitalidade: 0, Criatividade: 0,
    Autoaperfeicoamento: 0, Relacionamento: 0, ...overrides,
  };
}

// Builds de mesmo nível alto, com o atributo ofensivo da classe distinto + sobrevivência.
const guerreiro = attrs({ Forca: 20, Vitalidade: 15, Resiliencia: 10 });
const mago = attrs({ Inteligencia: 20, Sabedoria: 10, Vitalidade: 15, Resiliencia: 10 });
const gatuno = attrs({ Agilidade: 20, Vitalidade: 15, Resiliencia: 10 });

describe('§1 combate solo — stats por atributo + ofensivo por classe (blend calibrado)', () => {
  it('(b) ofensivo MAPEADO por classe: guerreiro=atk, mago=matk, gatuno=agi', () => {
    expect(computeSoloCombatStats(LEVEL, guerreiro, 'guerreiro').offenseAttr).toBe('atk');
    expect(computeSoloCombatStats(LEVEL, mago, 'mago').offenseAttr).toBe('matk');
    expect(computeSoloCombatStats(LEVEL, gatuno, 'gatuno').offenseAttr).toBe('agi');
    // Espadachim/Ferreiro→atk, Noviço/clerico→matk, Arqueiro→agi
    expect(computeSoloCombatStats(LEVEL, guerreiro, 'ferreiro').offenseAttr).toBe('atk');
    expect(computeSoloCombatStats(LEVEL, mago, 'clerico').offenseAttr).toBe('matk');
    expect(computeSoloCombatStats(LEVEL, gatuno, 'arqueiro').offenseAttr).toBe('agi');
  });

  it('(b) o Gatuno usa AGI de fato (antes max(atk,matk) ignorava agi → ofensivo zerado)', () => {
    const baseSemAtributo = Math.round(14 + LEVEL * 2); // (14+2L), attrOff = 0
    const g = computeSoloCombatStats(LEVEL, attrs({ Agilidade: 25 }), 'gatuno');
    expect(g.ataqueBase).toBeGreaterThan(baseSemAtributo);
    const m = computeSoloCombatStats(LEVEL, attrs({ Inteligencia: 25 }), 'mago');
    expect(m.ataqueBase).toBeGreaterThan(baseSemAtributo);
  });

  it('(a) sobrevivência calibrada NÃO regrediu: HP/DEF são o BLEND (não cru, não level-only)', () => {
    const cs = getPlayerCombatStats(LEVEL, guerreiro);
    const r = computeSoloCombatStats(LEVEL, guerreiro, 'guerreiro');
    const blendHp = Math.round((100 + LEVEL * 12) + 0.80 * (cs.hp - (100 + LEVEL * 12)));
    expect(r.hpMax).toBe(blendHp);
    expect(r.hpMax).not.toBe(120 + LEVEL * 8); // não é o override level-only antigo
    expect(r.hpMax).not.toBe(cs.hp);           // não é o stat cru (overshoot evitado)
    const blendDef = Math.round((8 + LEVEL * 1.4) + 0.35 * (cs.def - LEVEL * 3));
    expect(r.defesaBase).toBe(blendDef);
  });

  it('(c) max_mp vem do atributo (cs.mp), não fixo em 69', () => {
    const csMago = getPlayerCombatStats(LEVEL, mago);
    expect(computeSoloCombatStats(LEVEL, mago, 'mago').mpMax).toBe(Math.max(10, csMago.mp));
    const mpBaixo = computeSoloCombatStats(LEVEL, attrs({ Inteligencia: 5 }), 'mago').mpMax;
    const mpAlto = computeSoloCombatStats(LEVEL, attrs({ Inteligencia: 25 }), 'mago').mpMax;
    expect(mpAlto).toBeGreaterThan(mpBaixo); // varia com Int/Sab — não é constante
  });
});
