import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdventurePetPanel } from '@/components/AdventurePetPanel';

const frozen = {
  companion_id: 'old-id', companion_type: 'mini_kraken', name: 'Kraken',
  bonus: { stat: 'hp' as const, pct: 0.1 }, sustain: { kind: 'regen_hp' as const, pct: 0.05 },
  base_stats: { atk: 20, def: 10, hp: 100, mp: 30 },
  effective_stats: { atk: 20, def: 10, hp: 110, mp: 30 },
};

describe('adventure pet snapshot view', () => {
  it.each([
    [0.5, 0.05, 0.025, '+5% HP máx', '+2,5% HP/turno'],
    [0.75, 0.075, 0.0375, '+7,5% HP máx', '+3,75% HP/turno'],
    [1, 0.1, 0.05, '+10% HP máx', '+5% HP/turno'],
    [0.625, 0.0625, 0.03125, '+6,25% HP máx', '+3,125% HP/turno'],
    [0, 0, 0, '+0% HP máx', '+0% HP/turno'],
  ] as const)('mounts the frozen %s participation view with exact effective labels', async (
    participation, bonusPct, sustainPct, bonusLabel, sustainText,
  ) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const battlePet = { ...frozen, participation, care_as_of: '2026-10-29T10:00:00Z',
      effective_bonus: { stat: 'hp' as const, pct: bonusPct },
      effective_sustain: { kind: 'regen_hp' as const, pct: sustainPct } };
    const selection = { enabled: true, active_companion_id: 'new-id', pets: [{
      id: 'new-id', companion_type: 'mini_dragao_sombrio', name: 'Dragão',
      bonus: { stat: 'atk' as const, pct: 0.1 }, sustain: null,
    }] };
    try {
      await act(async () => root.render(<AdventurePetPanel battlePet={battlePet}
        selection={selection} selectionLoading={false} selectionError={false} />));
      const current = container.querySelector('p:nth-child(2)')?.textContent ?? '';
      expect(current).toContain('Esta luta (efeito efetivo)');
      expect(current).toContain(bonusLabel);
      expect(current).toContain(sustainText);
      expect(current).not.toContain('+3% HP/turno');
      expect(container.textContent).toContain('máximo +10% ofensa (ATK/MATK)');
      selection.pets[0].name = 'Outro dragão';
      selection.pets[0].bonus.pct = 0.2;
      await act(async () => root.render(<AdventurePetPanel battlePet={battlePet}
        selection={selection} selectionLoading={false} selectionError={false} />));
      expect(container.querySelector('p:nth-child(2)')?.textContent).toBe(current);
      expect(container.textContent).toContain('Outro dragão');
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('shows frozen current pet and separately the next selection with base to effective stats', () => {
    const html = renderToStaticMarkup(<AdventurePetPanel battlePet={frozen} selectionLoading={false} selectionError={false} selection={{
      enabled: true, active_companion_id: 'new-id', pets: [{ id: 'new-id', companion_type: 'mini_dragao_sombrio', name: 'Dragão', bonus: { stat: 'atk', pct: 0.1 }, sustain: null }],
    }} />);
    expect(html).toContain('Esta luta:');
    expect(html).toContain('Kraken');
    expect(html).toContain('Próxima luta:');
    expect(html).toContain('Dragão');
    expect(html).toContain('100');
    expect(html).toContain('110');
    expect(html).toContain('ATK/MATK');
    expect(html).toContain('A troca não altera a luta atual');
  });

  it('shows the rollout gate without claiming a pet fights', () => {
    const html = renderToStaticMarkup(<AdventurePetPanel battlePet={null} selectionLoading={false} selectionError={false} selection={{ enabled: false, active_companion_id: null, pets: [] }} />);
    expect(html).toContain('Esta luta começou sem pet');
    expect(html).toContain('aguardando liberação');
  });
});
