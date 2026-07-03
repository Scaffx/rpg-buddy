import { describe, it, expect } from 'vitest';
import { getPetBonus, applyPetBonus, petBonusLabel, PET_BONUS, type CombatBaseStats } from '@/lib/pets';
import { computeSoloCombatStats, type AttrLevels } from '@/lib/combat';

const BASE: CombatBaseStats = { ataqueBase: 50, defesaBase: 30, hpMax: 200, mpMax: 100 };

function attrs(over: Partial<AttrLevels> = {}): AttrLevels {
  const base: AttrLevels = {
    Forca: 5, Inteligencia: 5, Agilidade: 5, Disciplina: 5, Sabedoria: 5, Resiliencia: 5,
    Carisma: 5, Vitalidade: 5, Criatividade: 5, Autoaperfeicoamento: 5, Relacionamento: 5,
  };
  return { ...base, ...over };
}

describe('pets — catálogo de bônus (Fase 1)', () => {
  it('mapeia companion_type → bônus e ignora tipos desconhecidos', () => {
    expect(getPetBonus('spirit_fox')).toEqual({ stat: 'mp', pct: 0.10 });
    expect(getPetBonus('golem_guardian')).toEqual({ stat: 'hp', pct: 0.10 });
    expect(getPetBonus('mini_dragao_sombrio')).toEqual({ stat: 'atk', pct: 0.10 });
    expect(getPetBonus('mini_relampago')).toEqual({ stat: 'def', pct: 0.10 });
    expect(getPetBonus('inexistente')).toBeNull();
    expect(getPetBonus(null)).toBeNull();
  });

  it('todos os 12 pets têm um bônus de stat válido (nenhum órfão)', () => {
    const owned = [
      'spirit_fox', 'golem_guardian', 'mini_relampago', 'mini_leviata', 'mini_kraken',
      'mini_dragao_sombrio', 'mini_demonio_fome', 'mini_necromante', 'mini_wyrm_gelo',
      'dog', 'cat', 'calopsita',
    ];
    for (const type of owned) {
      const b = PET_BONUS[type];
      expect(b, `pet ${type} sem bônus`).toBeTruthy();
      expect(['mp', 'hp', 'atk', 'def']).toContain(b.stat);
      expect(b.pct).toBeGreaterThan(0);
    }
  });

  it('petBonusLabel gera rótulo neutro de idioma', () => {
    expect(petBonusLabel({ stat: 'mp', pct: 0.10 })).toBe('+10% MP máx');
    expect(petBonusLabel({ stat: 'atk', pct: 0.25 })).toBe('+25% ATK');
    expect(petBonusLabel(null)).toBeNull();
  });
});

describe('pets — applyPetBonus (aplicação nos stats)', () => {
  it('aumenta APENAS o stat do bônus, arredondando', () => {
    expect(applyPetBonus(BASE, { stat: 'mp', pct: 0.10 })).toEqual({ ...BASE, mpMax: 110 });
    expect(applyPetBonus(BASE, { stat: 'hp', pct: 0.10 })).toEqual({ ...BASE, hpMax: 220 });
    expect(applyPetBonus(BASE, { stat: 'atk', pct: 0.10 })).toEqual({ ...BASE, ataqueBase: 55 });
    expect(applyPetBonus(BASE, { stat: 'def', pct: 0.10 })).toEqual({ ...BASE, defesaBase: 33 });
  });

  it('bônus nulo é no-op (mesma referência)', () => {
    expect(applyPetBonus(BASE, null)).toBe(BASE);
  });

  it('preserva campos extras do objeto (ex.: offenseAttr)', () => {
    const withExtra = { ...BASE, offenseAttr: 'matk' as const };
    const out = applyPetBonus(withExtra, { stat: 'mp', pct: 0.10 });
    expect(out.offenseAttr).toBe('matk');
    expect(out.mpMax).toBe(110);
  });
});

describe('pets — integração com o combate solo (spec: "pet A altera max_mp")', () => {
  it('pet de MP eleva o mpMax do combate; os outros stats ficam iguais', () => {
    const base = computeSoloCombatStats(10, attrs({ Inteligencia: 12 }), 'mago');
    const withPet = applyPetBonus(base, getPetBonus('spirit_fox')); // Tipo A: +10% MP

    expect(withPet.mpMax).toBe(Math.round(base.mpMax * 1.1));
    expect(withPet.mpMax).toBeGreaterThan(base.mpMax);
    // guardrail: só MP muda
    expect(withPet.ataqueBase).toBe(base.ataqueBase);
    expect(withPet.defesaBase).toBe(base.defesaBase);
    expect(withPet.hpMax).toBe(base.hpMax);
  });

  it('pet de HP eleva o hpMax sem tocar no MP', () => {
    const base = computeSoloCombatStats(10, attrs(), 'guerreiro');
    const withPet = applyPetBonus(base, getPetBonus('golem_guardian'));
    expect(withPet.hpMax).toBe(Math.round(base.hpMax * 1.1));
    expect(withPet.mpMax).toBe(base.mpMax);
  });
});
