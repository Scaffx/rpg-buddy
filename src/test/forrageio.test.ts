import { describe, it, expect } from 'vitest';
import {
  isForagePet,
  forageRarityCap,
  rollForageRarity,
  hasForagedToday,
  accrueAffinity,
  FORAGE_PETS,
} from '@/lib/pets';

describe('forrageio — pets caçadores', () => {
  it('só Gato e Demônio da Fome forrageiam', () => {
    expect([...FORAGE_PETS].sort()).toEqual(['cat', 'mini_demonio_fome']);
    expect(isForagePet('cat')).toBe(true);
    expect(isForagePet('mini_demonio_fome')).toBe(true);
    expect(isForagePet('spirit_fox')).toBe(false);
    expect(isForagePet(null)).toBe(false);
  });
});

describe('forrageio — 1x/dia (spec)', () => {
  it('hasForagedToday compara a data e ignora horas', () => {
    expect(hasForagedToday('2026-07-03', '2026-07-03')).toBe(true);
    expect(hasForagedToday('2026-07-03T09:00:00Z', '2026-07-03')).toBe(true);
    expect(hasForagedToday('2026-07-02', '2026-07-03')).toBe(false);
    expect(hasForagedToday(null, '2026-07-03')).toBe(false);
    expect(hasForagedToday(undefined, '2026-07-03')).toBe(false);
  });
});

describe('forrageio — teto de raridade por afinidade (guardrail)', () => {
  it('cap: comum (<5) → raro (5-14) → épico (15+)', () => {
    expect(forageRarityCap(0)).toBe('comum');
    expect(forageRarityCap(4)).toBe('comum');
    expect(forageRarityCap(5)).toBe('raro');
    expect(forageRarityCap(14)).toBe('raro');
    expect(forageRarityCap(15)).toBe('epico');
    expect(forageRarityCap(999)).toBe('epico');
  });

  // rng determinístico varrendo [0,1) pra checar TODAS as saídas possíveis.
  function allRolls(affinity: number): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < 1000; i++) out.add(rollForageRarity(affinity, () => i / 1000));
    return out;
  }

  it('afinidade baixa (0-4) NUNCA passa de comum', () => {
    expect([...allRolls(0)]).toEqual(['comum']);
    expect([...allRolls(4)]).toEqual(['comum']);
  });

  it('afinidade média (5-14) chega a raro mas NUNCA a épico', () => {
    const r = allRolls(10);
    expect(r.has('raro')).toBe(true);
    expect(r.has('epico')).toBe(false);
  });

  it('afinidade alta (15+) permite épico, mas NUNCA lendário', () => {
    const r = allRolls(20);
    expect(r.has('epico')).toBe(true);
    expect(r.has('lendario')).toBe(false);
    for (const rarity of r) expect(['comum', 'incomum', 'raro', 'epico']).toContain(rarity);
  });
});

describe('forrageio — afinidade sobe no dia perfeito', () => {
  it('+1 quando o dia é perfeito e ainda não ganhou hoje', () => {
    expect(accrueAffinity(3, null, true, '2026-07-03')).toEqual({ affinity: 4, lastAffinityDate: '2026-07-03' });
    expect(accrueAffinity(3, '2026-07-02', true, '2026-07-03')).toEqual({ affinity: 4, lastAffinityDate: '2026-07-03' });
  });

  it('não sobe se o dia não é perfeito', () => {
    expect(accrueAffinity(3, null, false, '2026-07-03')).toBeNull();
  });

  it('não sobe duas vezes no mesmo dia', () => {
    expect(accrueAffinity(3, '2026-07-03', true, '2026-07-03')).toBeNull();
  });
});
