import { describe, it, expect } from 'vitest';
import {
  getSustainEffect,
  applyMpCostReduction,
  applyRegen,
  sustainLabel,
  PET_SUSTAIN,
  type SustainEffect,
} from '@/lib/pets';

describe('sustain (Fase 2) — catálogo', () => {
  it('mapeia os 3 pets de sustain e ignora o resto', () => {
    expect(getSustainEffect('mini_leviata')).toEqual({ kind: 'mp_cost', pct: 0.20 });
    expect(getSustainEffect('mini_kraken')).toEqual({ kind: 'regen_hp', pct: 0.05 });
    expect(getSustainEffect('mini_necromante')).toEqual({ kind: 'regen_mp', pct: 0.08 });
    expect(getSustainEffect('spirit_fox')).toBeNull();
    expect(getSustainEffect(null)).toBeNull();
    expect(Object.keys(PET_SUSTAIN).sort()).toEqual(['mini_kraken', 'mini_leviata', 'mini_necromante']);
  });
});

describe('sustain — redução de custo de MP (Leviatã)', () => {
  const leviata = getSustainEffect('mini_leviata');

  it('reduz o custo em 20% e arredonda; nunca negativo', () => {
    expect(applyMpCostReduction(10, leviata)).toBe(8);
    expect(applyMpCostReduction(15, leviata)).toBe(12);
    expect(applyMpCostReduction(0, leviata)).toBe(0);
  });

  it('sem pet de custo, o custo é inalterado (só arredonda)', () => {
    expect(applyMpCostReduction(10, null)).toBe(10);
    expect(applyMpCostReduction(10, getSustainEffect('mini_kraken'))).toBe(10); // kraken não mexe em custo
  });
});

describe('sustain — regen por turno (Kraken HP / Necromante MP)', () => {
  it('regen HP soma % do máx e capa no máximo', () => {
    const kraken = getSustainEffect('mini_kraken'); // +5%
    expect(applyRegen(100, 200, kraken, 'regen_hp')).toBe(110); // 100 + 5% de 200
    expect(applyRegen(195, 200, kraken, 'regen_hp')).toBe(200); // cap
  });

  it('regen MP soma % do máx e capa no máximo', () => {
    const necro = getSustainEffect('mini_necromante'); // +8%
    expect(applyRegen(50, 100, necro, 'regen_mp')).toBe(58);
    expect(applyRegen(96, 100, necro, 'regen_mp')).toBe(100); // cap
  });

  it('não aplica regen do tipo errado / sem pet', () => {
    const kraken = getSustainEffect('mini_kraken');
    expect(applyRegen(50, 100, kraken, 'regen_mp')).toBe(50); // kraken é regen_hp
    expect(applyRegen(50, 100, null, 'regen_hp')).toBe(50);
    expect(applyRegen(50, 100, getSustainEffect('mini_leviata'), 'regen_hp')).toBe(50); // leviatã é mp_cost
  });
});

describe('sustain — rótulos', () => {
  it('gera rótulo legível por efeito', () => {
    expect(sustainLabel({ kind: 'mp_cost', pct: 0.2 } as SustainEffect)).toBe('-20% custo de MP');
    expect(sustainLabel({ kind: 'regen_hp', pct: 0.05 } as SustainEffect)).toBe('+5% HP/turno');
    expect(sustainLabel({ kind: 'regen_mp', pct: 0.08 } as SustainEffect)).toBe('+8% MP/turno');
    expect(sustainLabel(null)).toBeNull();
  });
});
