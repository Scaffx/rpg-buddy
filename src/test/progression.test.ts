import { describe, it, expect } from 'vitest';
import { getLevelFromXp, XP_TABLE } from '@/lib/progression';

describe('getLevelFromXp', () => {
  it('retorna level 1 para 0 XP', () => {
    expect(getLevelFromXp(0)).toBe(1);
  });

  it('retorna level 1 para XP negativo', () => {
    expect(getLevelFromXp(-999)).toBe(1);
  });

  it('retorna level 1 para XP abaixo do limiar do level 2', () => {
    expect(getLevelFromXp(XP_TABLE[1] - 1)).toBe(1);
  });

  it('retorna level 2 exatamente no limiar do level 2', () => {
    expect(getLevelFromXp(XP_TABLE[1])).toBe(2);
  });

  it('retorna level 5 no limiar do level 5', () => {
    // XP_TABLE[4] = 700, level = index+1 = 5
    expect(getLevelFromXp(XP_TABLE[4])).toBe(5);
  });

  it('retorna level 10 no limiar do level 10', () => {
    expect(getLevelFromXp(XP_TABLE[9])).toBe(10);
  });

  it('retorna o level máximo para XP muito alto', () => {
    const maxLevel = XP_TABLE.length;
    expect(getLevelFromXp(999_999)).toBe(maxLevel);
  });

  it('funciona com XP fracionado (trunca)', () => {
    // XP_TABLE[1] = 200. 200.9 deve ser tratado como 200
    expect(getLevelFromXp(200.9)).toBe(2);
  });

  it('XP_TABLE é monotonicamente crescente', () => {
    for (let i = 1; i < XP_TABLE.length; i++) {
      expect(XP_TABLE[i]).toBeGreaterThan(XP_TABLE[i - 1]);
    }
  });
});
