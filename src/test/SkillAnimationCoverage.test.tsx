import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AdventureScene } from '@/components/adventure/AdventureScene';
import { CLASS_ANIMATIONS, findSkillAnimation } from '@/components/adventure/skills/registry';
import type { SkillAnimationClass } from '@/components/adventure/skills/types';
import catalog from '@/components/adventure/skills/catalog.snapshot.json';
import SkillAnimationGallery from '@/pages/SkillAnimationGallery';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
function render(content: React.ReactNode) {
  if (!container) { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); }
  act(() => root!.render(content));
  return container;
}
afterEach(() => { if(root) act(() => root!.unmount()); container?.remove(); root = null; container = null; });

describe('class skill animation coverage and server presentation', () => {
  it('covers every live active/variant exactly once, with real names and no passive casts', () => {
    const expected = catalog.filter(node => node.nodeType === 'skill' || node.nodeType === 'variant');
    const definitions = Object.values(CLASS_ANIMATIONS).flatMap(group => group.skills);
    expect(definitions.map(skill => skill.id).sort()).toEqual(expected.map(node => node.id).sort());
    expect(new Set(definitions.map(skill => skill.id)).size).toBe(definitions.length);
    for (const [key, group] of Object.entries(CLASS_ANIMATIONS)) {
      for (const skill of group.skills) {
        expect(skill.name).toBe(expected.find(node => node.id === skill.id)?.name);
        const Effect = group.Effect;
        const page = render(<Effect skillId={skill.id} target={skill.target} />);
        expect(page.querySelector('[data-skill-vfx]')).not.toBeNull();
        expect(page.querySelector('[data-skill-id]')?.getAttribute('data-skill-id')).toBe(skill.id);
      }
      const Effect = group.Effect;
      expect(render(<Effect skillId="unknown-skill" target="enemy" />).childElementCount).toBe(0);
      expect(findSkillAnimation('not-allocated-id', key as SkillAnimationClass)).toBeNull();
    }
  });

  it('matches only the hero class or retained Apprentice/weapon skills', () => {
    expect(findSkillAnimation('m_bola_fogo','guerreiro')).toBeNull();
    expect(findSkillAnimation('m_bola_fogo','mago')?.definition.name).toBe('Bola de Fogo');
    expect(findSkillAnimation('a_golpe','mago')).not.toBeNull();
    expect(findSkillAnimation('cinza_corte_flamejante','guerreiro')).not.toBeNull();
    expect(findSkillAnimation('m_fogo_p1','mago')).toBeNull();
  });

  it('keeps server values and removes the prior VFX after the current event window', () => {
    const frame = {status:'fighting' as const,heroHp:88,heroMaxHp:130,heroMp:22,heroMaxMp:30,enemyHp:70,enemyMaxHp:100,
      action:{id:'battle-event-1',actor:'hero' as const,kind:'skill' as const,skillId:'m_bola_fogo',skillName:'Bola de Fogo',effect:'fire' as const,damage:12,mpCost:8}};
    const props = {stage:39,biome:'vulcanico' as const,heroClass:'mago' as const,heroName:'Herói',enemyName:'Asa de Brasa',isBoss:false,paused:false};
    const page = render(<AdventureScene {...props} frame={frame} />);
    expect(page.querySelector('[data-animation-skill="m_bola_fogo"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Mana: 22 de 30 MP"]')).not.toBeNull();
    expect(page.textContent).toContain('12 de dano');
    expect(page.textContent).toContain('−8 MP');
    render(<AdventureScene {...props} frame={{...frame,animateAction:false}} />);
    expect(page.querySelector('[data-animation-skill]')).toBeNull();
    expect(page.textContent).toContain('Bola de Fogo');
    expect(page.querySelector('[data-action-style="idle"]')).not.toBeNull();
  });

  it('uses the hero target for healing and retains pause/reduced-motion support', () => {
    const page = render(<AdventureScene stage={3} biome="floresta" heroClass="clerico" heroName="Herói" enemyName="Alvo" isBoss={false} paused
      frame={{status:'fighting',action:{id:'healing',actor:'hero',kind:'skill',skillId:'n_cura',skillName:'Cura Menor',skillType:'heal',healing:20,damage:0}}} />);
    expect(page.querySelector('[data-animation-target="self"]')).not.toBeNull();
    expect(page.querySelector('.adventure-still')).not.toBeNull();
    expect(page.textContent).toContain('+20 HP curado');
  });

  it('lets visitors preview locked variants and switch classes without allocating skills', () => {
    const page = render(<MemoryRouter initialEntries={['/previa-habilidades?classe=mago&habilidade=m_fogo_var']}><SkillAnimationGallery /></MemoryRouter>);
    expect(page.querySelector('#skill-gallery-selection')?.textContent).toBe('Meteoro');
    expect(page.textContent).toContain('Esta variante ainda não tem efeito na aventura');
    expect(page.querySelector('.adventure-action-strip')?.getAttribute('aria-live')).toBe('off');
    const buttons = [...page.querySelectorAll('button')];
    act(() => buttons.find(button => button.textContent === 'Bola de FogoAtiva')!.click());
    expect(page.querySelector('#skill-gallery-selection')?.textContent).toBe('Bola de Fogo');
    expect((page.querySelector('.adventure-fighter-enemy [data-hit-id]') as HTMLElement)?.style.animationDelay).toBe('0ms');
    const classSelect = page.querySelector('select')!;
    act(() => {classSelect.value='guerreiro';classSelect.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(page.querySelector('[data-hero-class="guerreiro"]')).not.toBeNull();
    expect(page.querySelector('#skill-gallery-selection')?.textContent).toBe('Golpe Marcial');
    expect(page.textContent).toContain('não equipa habilidades nem altera seu personagem');
  });
});
