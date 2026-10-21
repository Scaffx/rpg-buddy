import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { hasCompletedOnboarding } from '@/lib/onboarding';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const fixture = vi.hoisted(() => ({
  profile: { starter_class: null as string | null, current_class_id: null as string | null, level: 1 },
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: fixture.profile }),
  useClasses: () => ({ data: [] }),
  useAttributes: () => ({ data: [] }),
}));

import { useHeroClass } from '@/hooks/useHeroClass';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  fixture.profile.starter_class = null;
  fixture.profile.current_class_id = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.clear();
});

function renderHero() {
  let observed: ReturnType<typeof useHeroClass> | undefined;
  const Probe = () => {
    observed = useHeroClass();
    return null;
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Probe />));
  return () => observed;
}

describe('classe inicial exibida a partir do perfil persistido', () => {
  it('não confia em localStorage para abrir árvore ou concluir onboarding', () => {
    localStorage.setItem('starter_class_v1_user', 'mago');
    localStorage.setItem('onboarding_v1_user', 'done');
    fixture.profile.starter_class = null;
    const hero = renderHero();
    expect(hero()?.hasClass).toBe(false);
    expect(hasCompletedOnboarding({ onboarding_completed: false, starter_class: null }, 'user')).toBe(false);
  });

  it('não trata Aprendiz explícito como escolha de classe-base', () => {
    fixture.profile.starter_class = null;
    fixture.profile.current_class_id = '00000001-0000-0000-0000-000000000001';
    const hero = renderHero();
    expect(hero()?.hasClass).toBe(false);
  });

  it('reconhece mago persistido sem current_class_id e exige conclusão persistida', () => {
    fixture.profile.starter_class = 'mago';
    fixture.profile.current_class_id = null;
    const hero = renderHero();
    expect(hero()?.hasClass).toBe(true);
    expect(hero()?.treeKey).toBe('mago');
    expect(hasCompletedOnboarding({ onboarding_completed: true, starter_class: 'mago' }, 'user')).toBe(true);
    expect(hasCompletedOnboarding({ onboarding_completed: false, starter_class: 'mago' }, 'user')).toBe(false);
  });
});
