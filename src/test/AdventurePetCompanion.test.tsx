import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdventurePetCompanion } from '@/components/adventure/AdventurePetCompanion';
import type { AdventurePetSnapshot } from '@/lib/autoAdventurePayload';

const types = [
  'spirit_fox', 'calopsita', 'mini_necromante', 'mini_leviata',
  'golem_guardian', 'mini_kraken', 'dog', 'mini_dragao_sombrio',
  'mini_demonio_fome', 'mini_relampago', 'mini_wyrm_gelo', 'cat',
] as const;

function snapshot(companion_type: string, overrides: Partial<AdventurePetSnapshot> = {}): AdventurePetSnapshot {
  return {
    companion_id: 'frozen-battle-companion',
    companion_type,
    name: 'Nimbo',
    bonus: { stat: 'def', pct: 0.13 },
    sustain: null,
    base_stats: { atk: 10, def: 10, hp: 10, mp: 10 },
    effective_stats: { atk: 10, def: 11, hp: 10, mp: 10 },
    ...overrides,
  };
}

function markupFor(pet: AdventurePetSnapshot | null | undefined, still = false, heroDefeated = false) {
  return renderToStaticMarkup(<AdventurePetCompanion pet={pet} still={still} heroDefeated={heroDefeated} />);
}

describe('AdventurePetCompanion', () => {
  it('draws all twelve catalogued pets as distinct native SVGs', () => {
    const drawings = types.map(type => {
      const markup = markupFor(snapshot(type));
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const root = doc.querySelector('.adventure-pet-companion');
      const svg = root?.querySelector('svg');
      expect(root?.getAttribute('data-pet-type')).toBe(type);
      expect(svg?.getAttribute('viewBox')).toBe('0 0 64 64');
      expect(svg?.querySelectorAll('path, ellipse, circle').length).toBeGreaterThan(5);
      expect(root?.getAttribute('role')).toBe('img');
      return svg?.innerHTML;
    });
    expect(new Set(drawings).size).toBe(types.length);
  });

  it('does not invent a pet for missing or unknown snapshots', () => {
    expect(markupFor(null)).toBe('');
    expect(markupFor(undefined)).toBe('');
    expect(markupFor(snapshot('unregistered_pet'))).toBe('');
  });

  it('reads real bonus and sustain values from the frozen snapshot', () => {
    const markup = markupFor(snapshot('mini_necromante', {
      bonus: { stat: 'atk', pct: 0.17 },
      sustain: { kind: 'regen_mp', pct: 0.08 },
    }));
    const root = new DOMParser().parseFromString(markup, 'text/html').querySelector('.adventure-pet-companion');
    const label = root?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Nimbo · Mini necromante');
    expect(label).toContain('+17% ofensa (ATK/MATK)');
    expect(label).toContain('Efeito na aventura: +8% de recuperação de MP');
    expect(label).not.toContain('/turno');
    expect(root?.querySelector('.adventure-pet-companion__bonus')).not.toBeNull();
    expect(markup).not.toMatch(/(?:attack|damage|cura|healing|onClick|onclick|<button)/i);
  });

  it('shows no bonus glow for a zero-percent snapshot and becomes still on pause or defeat', () => {
    const zero = snapshot('dog', { bonus: { stat: 'hp', pct: 0 } });
    const markup = markupFor(zero);
    expect(markup).not.toContain('adventure-pet-companion__bonus');
    expect(markup).not.toContain('Bônus passivo');
    expect(markupFor(zero, true)).toContain('adventure-pet-companion--still');
    expect(markupFor(zero, false, true)).toContain('adventure-pet-companion--still');
  });

  it('keeps silent timed gestures CSS-only with pause and reduced-motion stops', () => {
    const css = readFileSync('src/components/adventure/adventurePetCompanion.css', 'utf8');
    expect(css).toContain('adventure-pet-dog-gesture 15s');
    expect(css).toContain('adventure-pet-dragon-orbit 15s');
    expect(css).toContain('.adventure-pet-companion--still .adventure-pet-companion__motion');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
    expect(css).not.toMatch(/url\(|@keyframes.*(?:attack|damage)/);
  });
});
