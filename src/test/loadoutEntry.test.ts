import { describe, it, expect } from 'vitest';
import { buildTreeSkillEntry } from '@/lib/combat';

// Regressão: aprender uma skill (player_skill_nodes) não a equipava em
// profiles.combat_skill_loadout, e o combate lê SÓ o loadout — todo jogador
// entrava em luta apenas com Ataque Básico. Este helper é a fonte única do
// formato da entrada, usada pelo editor de loadout e pelo onboarding.

const nodeBase = {
  id: 'mago_tronco',
  name: 'Dardo Arcano',
  description: 'Um projétil de energia bruta.',
  effect: { power: 40, cooldown: 3, mpCost: 5, effectType: 'dano', element: 'arcano', pct_per_rank: 10 },
};

describe('buildTreeSkillEntry', () => {
  it('mapeia o nó para o formato lido pelo combate', () => {
    const entry = buildTreeSkillEntry(nodeBase);
    expect(entry).toMatchObject({
      id: 'mago_tronco',
      name: 'Dardo Arcano',
      power: 40,
      cooldown: 3,
      mpCost: 5,
      effectType: 'dano',
      element: 'arcano',
      category: 'magica',
      effectLabel: 'Um projétil de energia bruta.',
    });
  });

  it('escala o poder pelo rank via pct_per_rank', () => {
    // rank 3 → 40 * (1 + 2*10/100) = 48
    expect(buildTreeSkillEntry(nodeBase, 3).power).toBe(48);
  });

  it('trata rank inválido como 1 (sem escalar)', () => {
    expect(buildTreeSkillEntry(nodeBase, 0).power).toBe(40);
    expect(buildTreeSkillEntry(nodeBase, NaN).power).toBe(40);
  });

  it('classifica elemento físico como categoria física', () => {
    const fisico = { ...nodeBase, effect: { ...nodeBase.effect, element: 'fisico' } };
    expect(buildTreeSkillEntry(fisico).category).toBe('fisica');
  });

  it('usa defaults seguros quando o efeito está vazio', () => {
    const entry = buildTreeSkillEntry({ id: 'x', name: 'Sem Efeito' });
    expect(entry).toMatchObject({
      power: 30,
      cooldown: 2,
      mpCost: 0,
      effectType: 'dano',
      element: 'arcano',
      effectLabel: '',
    });
  });
});
