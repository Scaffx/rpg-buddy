import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdventureHeroClass } from '@/lib/adventureVisuals';
import { AdventureHeroSprite } from '../AdventureSprites';

const classes: AdventureHeroClass[] = ['guerreiro', 'mago', 'gatuno', 'arqueiro', 'clerico', 'ferreiro', 'aprendiz'];
const animatedParts = ['legs', 'body', 'arms', 'weapon'];

describe('drawn adventure heroes', () => {
  it.each(classes)('%s retains the scene and animation contract', heroClass => {
    const markup = renderToStaticMarkup(<AdventureHeroSprite heroClass={heroClass} className="adventure-hero-svg" />);
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;

    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(svg.getAttribute('shape-rendering')).toBeNull();
    expect(svg.getAttribute('data-hero-class')).toBe(heroClass);
    for (const part of animatedParts) {
      const group = svg.querySelector(`.adventure-hero-${part}`);
      expect(group, `${heroClass} ${part}`).not.toBeNull();
      expect(group?.getAttribute('transform')).toBeNull();
      expect(group?.firstElementChild?.getAttribute('transform')).toBe('scale(.5)');
      expect(group?.querySelectorAll('path, ellipse, circle').length).toBeGreaterThan(1);
    }
  });

  it('gives each class distinct native artwork', () => {
    const bodies = classes.map(heroClass => {
      const markup = renderToStaticMarkup(<AdventureHeroSprite heroClass={heroClass} />);
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
      return svg.querySelector('.adventure-hero-body')?.outerHTML;
    });
    expect(new Set(bodies).size).toBe(classes.length);
  });
});
