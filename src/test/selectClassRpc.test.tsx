import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const api = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: { current_class_id: 'mage-id' }, error: null }),
  from: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-id' } }) }));

import { useSelectClass } from '@/hooks/useProfile';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe('seleção de classe', () => {
  it('pede evolução ao RPC e não grava campos de classe no perfil', async () => {
    let selectClass: ReturnType<typeof useSelectClass> | undefined;
    const Probe = () => {
      selectClass = useSelectClass();
      return null;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const queryClient = new QueryClient();
    await act(async () => root?.render(
      <QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>,
    ));
    await act(async () => {
      await selectClass?.mutateAsync({ classId: 'mage-id', starterClass: 'guerreiro' });
    });
    expect(api.rpc).toHaveBeenCalledWith('advance_hero_class', { p_class_id: 'mage-id' });
    expect(api.from).not.toHaveBeenCalled();
  });
});
