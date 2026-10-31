import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdventureJourneyPanel } from '@/components/adventure/AdventureJourneyPanel';
import { parseAdventureJourney } from '@/hooks/useAdventureJourney';

const mock = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  epoch: 1,
  rpc: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mock.user, continuity: { epoch: mock.epoch } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let client: QueryClient | null = null;

async function mount(stage: number) {
  client ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container ??= document.createElement('div');
  if (!container.isConnected) document.body.appendChild(container);
  root ??= createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={client!}><AdventureJourneyPanel stage={stage} /></QueryClientProvider>));
  return container;
}

async function waitFor(assertion: () => void) {
  let last: unknown;
  for (let i = 0; i < 35; i++) {
    try { assertion(); return; } catch (error) { last = error; }
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw last;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  client?.clear();
  root = null; container = null; client = null;
  mock.rpc.mockReset(); mock.user = { id: 'user-a' }; mock.epoch = 1;
});

describe('jornada dos cinco reinos', () => {
  it('only offers the milestone when confirmed by the server, not by the presentation stage', async () => {
    mock.rpc.mockResolvedValue({ data: { stage: 4, cycle: 1, chapter: 1, view_cycle: 1, choices: [] }, error: null });
    const page = await mount(5);
    await waitFor(() => expect(page.textContent).toContain('Atualizando a jornada'));
    expect(page.querySelectorAll('button')).toHaveLength(0);
  });

  it('shows distinct choices and persists the server-confirmed consequence without combat rewards', async () => {
    let state: { stage: number; cycle: number; chapter: number; view_cycle: number; choices: { chapter: number; choice: string; chosen_at: string }[] } =
      { stage: 5, cycle: 1, chapter: 1, view_cycle: 1, choices: [] };
    mock.rpc.mockImplementation((name: string, args?: { p_choice: string }) => {
      if (name === 'save_adventure_journey_choice') {
        state = { ...state, choices: [{ chapter: 1, choice: args!.p_choice, chosen_at: '2026-10-31T12:00:00Z' }] };
        return Promise.resolve({ data: { cycle: 1, chapter: 1, choice: args!.p_choice, replayed: false }, error: null });
      }
      return Promise.resolve({ data: state, error: null });
    });
    const page = await mount(5);
    await waitFor(() => expect(page.textContent).toContain('Restaurar o marco'));
    expect(page.textContent).toContain('Seguir as pegadas');
    await act(async () => {
      [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Seguir as pegadas'))!.click();
    });
    await waitFor(() => expect(page.textContent).toContain('Você encontrou uma rota discreta'));
    expect(page.textContent).not.toContain('XP');
    expect(mock.rpc).toHaveBeenCalledWith('save_adventure_journey_choice', {
      p_cycle: 1, p_chapter: 1, p_choice: 'explore',
    });
    expect(page.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps a rejected choice visible as an error and never confirms it', async () => {
    mock.rpc.mockImplementation((name: string) => Promise.resolve(name === 'get_adventure_journey'
      ? { data: { stage: 5, cycle: 1, chapter: 1, view_cycle: 1, choices: [] }, error: null }
      : { data: null, error: { message: 'JOURNEY_CHAPTER_LOCKED', code: '22023' } }));
    const page = await mount(5);
    await waitFor(() => expect(page.textContent).toContain('Restaurar o marco'));
    await act(async () => { [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Restaurar o marco'))!.click(); });
    await waitFor(() => expect(page.querySelector('[role="alert"]')?.textContent).toContain('progresso confirmado'));
    expect(page.textContent).not.toContain('Seu caminho:');
  });

  it('keeps a failed read retryable and does not offer unverified choices', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'network unavailable' } });
    const page = await mount(25);
    await waitFor(() => expect(page.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível atualizar'));
    expect(page.textContent).toContain('Tentar novamente');
    expect(page.textContent).not.toContain('Restaurar o marco');
    expect(page.querySelectorAll('button')).toHaveLength(1);
  });

  it('switches account scope before rendering a second user journey', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { stage: 15, cycle: 1, chapter: 2, view_cycle: 1,
      choices: [{ chapter: 1, choice: 'restore', chosen_at: '2026-10-31T12:00:00Z' }] }, error: null })
      .mockResolvedValueOnce({ data: { stage: 1, cycle: 1, chapter: 1, view_cycle: 1, choices: [] }, error: null });
    const page = await mount(15);
    await waitFor(() => expect(page.textContent).toContain('Reino do deserto'));
    expect(page.textContent).toContain('O marco voltou a brilhar');
    mock.user = { id: 'user-b' }; mock.epoch = 2;
    await mount(1);
    await waitFor(() => expect(page.textContent).toContain('etapa 1 confirmada'));
    expect(page.textContent).not.toContain('O marco voltou a brilhar');
    expect(client?.getQueryData(['adventure-journey', 'user-b', 2, null])).toMatchObject({ stage: 1 });
  });

  it('refreshes on retreat and keeps a later chapter choice from the same cycle', async () => {
    let state = { stage: 15, cycle: 1, chapter: 2, view_cycle: 1,
      choices: [{ chapter: 2, choice: 'explore', chosen_at: '2026-10-31T12:00:00Z' }] };
    mock.rpc.mockImplementation(() => Promise.resolve({ data: state, error: null }));
    const page = await mount(15);
    await waitFor(() => expect(page.textContent).toContain('Você traçou uma passagem pelas estrelas'));
    state = { ...state, stage: 10, chapter: 1 };
    await mount(10);
    await waitFor(() => expect(page.textContent).toContain('etapa 10 confirmada'));
    expect(page.textContent).toContain('Caminhos guardados neste ciclo');
    expect(page.textContent).toContain('Você traçou uma passagem pelas estrelas');
  });

  it('can return to an earlier cycle and make an unlocked choice without a deadline', async () => {
    let pastChoices: { chapter: number; choice: string; chosen_at: string }[] = [];
    mock.rpc.mockImplementation((name: string, args?: { p_cycle?: number | null; p_chapter?: number; p_choice?: string }) => {
      if (name === 'save_adventure_journey_choice') {
        pastChoices = [{ chapter: args!.p_chapter!, choice: args!.p_choice!, chosen_at: '2026-10-31T12:00:00Z' }];
        return Promise.resolve({ data: { cycle: 1, chapter: 3, choice: 'restore', replayed: false }, error: null });
      }
      return Promise.resolve({ data: {
        stage: 55, cycle: 2, chapter: 1, view_cycle: args?.p_cycle ?? 2,
        choices: args?.p_cycle === 1 ? pastChoices : [],
      }, error: null });
    });
    const page = await mount(55);
    await waitFor(() => expect(page.textContent).toContain('ciclo 2'));
    await act(async () => { [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Ciclo anterior'))!.click(); });
    await waitFor(() => expect(page.textContent).toContain('ciclo 1 de 2'));
    const selector = page.querySelector('select')!;
    await act(async () => { selector.value = '3'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
    await waitFor(() => expect(page.textContent).toContain('Reino da água'));
    await act(async () => { [...page.querySelectorAll('button')].find(button => button.textContent?.includes('Reparar a ponte'))!.click(); });
    await waitFor(() => expect(page.textContent).toContain('A ponte voltou a unir as margens'));
    expect(mock.rpc).toHaveBeenCalledWith('save_adventure_journey_choice', {
      p_cycle: 1, p_chapter: 3, p_choice: 'restore',
    });
  });

  it('rejects inconsistent or forged server payloads', () => {
    expect(() => parseAdventureJourney({ stage: 5, cycle: 2, chapter: 1, view_cycle: 2, choices: [] })).toThrow();
    expect(parseAdventureJourney({ stage: 10, cycle: 1, chapter: 1, view_cycle: 1,
      choices: [{ chapter: 2, choice: 'restore', chosen_at: '2026-10-31T12:00:00Z' }] }).choices).toHaveLength(1);
    expect(() => parseAdventureJourney({ stage: 5, cycle: 1, chapter: 1, view_cycle: 1,
      choices: [{ chapter: 1, choice: 'restore', chosen_at: '2026-10-31T12:00:00Z' },
        { chapter: 1, choice: 'explore', chosen_at: '2026-10-31T12:00:00Z' }] })).toThrow();
  });
});
