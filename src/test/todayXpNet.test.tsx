import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), gte: vi.fn(), gt: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useTodayXp } from '@/hooks/useProfile';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('XP exibido hoje', () => {
  it('soma crédito e reversão no dia de São Paulo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-19T02:00:00Z'));
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ gte: mocks.gte });
    mocks.gte.mockResolvedValue({
      data: [{ xp_gained: 31 }, { xp_gained: -31 }], error: null,
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const result = { current: undefined as number | undefined };
    function Harness() {
      result.current = useTodayXp().data;
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      act(() => {
        root.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
      });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
      expect(result.current).toBe(0);
      expect(mocks.from).toHaveBeenCalledWith('activity_log');
      expect(mocks.gt).not.toHaveBeenCalled();
      expect(mocks.gte).toHaveBeenCalledWith('created_at', '2026-10-18T03:00:00.000Z');
    } finally {
      act(() => root.unmount());
      client.clear();
    }
  });
});
