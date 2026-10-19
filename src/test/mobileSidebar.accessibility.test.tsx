import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn(), user: { email: 'hero@example.com' } }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { display_name: 'Hero', level: 1, total_xp: 0 } }),
  useClasses: () => ({ data: [] }),
}));
vi.mock('@/hooks/useGold', () => ({ useGoldBalance: () => ({ data: { gold: 0 } }) }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ isTrial: false, daysUntilBlock: null }) }));
vi.mock('@/components/ActiveTalentsBadge', () => ({ default: () => null }));
vi.mock('@/components/HelpTutorialModal', () => ({ default: () => null }));
vi.mock('@/components/branding/LifeonRPGLogo', () => ({ LifeonRPGEmblem: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
});

describe('sidebar móvel', () => {
  it('abre como diálogo nomeado e descrito sem avisos Radix; botão de fechar devolve o foco', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root?.render(
        <MemoryRouter>
          <SidebarProvider>
            <SidebarTrigger />
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>,
      ));

      const trigger = container.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]');
      expect(trigger).not.toBeNull();
      expect(trigger?.textContent).toContain('Abrir menu de navegação');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      await act(async () => trigger.click());
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');

      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog).not.toBeNull();
      const title = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '');
      const description = document.getElementById(dialog?.getAttribute('aria-describedby') ?? '');
      expect(title?.textContent).toBe('Menu de navegação');
      expect(title?.classList.contains('sr-only')).toBe(true);
      expect(description?.textContent).toBe('Acesse as áreas do LifeonRPG, ajuda e a opção de sair.');
      expect(dialog?.querySelector('a[href="/profile"]')?.textContent).toContain('app.sidebar.profile');
      expect([...dialog?.querySelectorAll('button') ?? []].some((button) => button.textContent?.includes('Ajuda & Tutorial'))).toBe(true);
      expect([...dialog?.querySelectorAll('button') ?? []].some((button) => button.textContent?.includes('app.sidebar.logout'))).toBe(true);
      expect([...dialog?.querySelectorAll('button') ?? []].find((button) => button.textContent?.includes('Ajuda & Tutorial'))?.getAttribute('aria-label')).toBe('Ajuda & Tutorial');
      expect([...dialog?.querySelectorAll('button') ?? []].find((button) => button.textContent?.includes('app.sidebar.logout'))?.getAttribute('aria-label')).toBe('app.sidebar.logout');
      expect([...errors.mock.calls, ...warnings.mock.calls].flat().join(' ')).not.toMatch(/DialogTitle|Missing `Description`/);

      const closeButton = [...dialog?.querySelectorAll('button') ?? []].find((button) => button.textContent?.includes('Close'));
      expect(closeButton).toBeDefined();
      await act(async () => closeButton?.click());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    }
  });

  it('abre pelo atalho e fecha por Escape, restaurando o foco anterior', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    const opener = document.createElement('button');
    opener.textContent = 'Outro controle';
    document.body.appendChild(opener);
    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root?.render(
        <MemoryRouter>
          <SidebarProvider>
            <SidebarTrigger />
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>,
      ));

      opener.focus();
      expect(document.activeElement).toBe(opener);
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })));
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(document.activeElement).toBe(opener);
    } finally {
      opener.remove();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    }
  });

  it('nomeia links e botões quando a barra lateral de desktop está recolhida', async () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    try {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root?.render(
        <MemoryRouter>
          <SidebarProvider defaultOpen={false}>
            <SidebarTrigger />
            <AppSidebar />
          </SidebarProvider>
        </MemoryRouter>,
      ));

      const trigger = container.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]');
      expect(trigger?.textContent).toContain('Expandir barra lateral');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('a[href="/profile"]')?.getAttribute('aria-label')).toBe('app.sidebar.profile');
      expect([...container.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === 'Ajuda & Tutorial')).toBe(true);
      expect([...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'app.sidebar.logout')).toBeDefined();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    }
  });
});
