import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdventurePetPanel } from '@/components/AdventurePetPanel';

const frozen = {
  companion_id: 'old-id', companion_type: 'mini_kraken', name: 'Kraken',
  bonus: { stat: 'hp' as const, pct: 0.1 }, sustain: { kind: 'regen_hp' as const, pct: 0.05 },
  base_stats: { atk: 20, def: 10, hp: 100, mp: 30 },
  effective_stats: { atk: 20, def: 10, hp: 110, mp: 30 },
};

describe('adventure pet snapshot view', () => {
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
