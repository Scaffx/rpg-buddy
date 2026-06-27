import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CompanionRow } from '@/hooks/useCompanion';

// Companheiros COSMÉTICOS (§4): combat stats em 0, companion_role 'none'.
const base = {
  user_id: 'u1', xp: 10, mood: 80,
  equipped_item_id: null, last_fed_at: null, last_played_at: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  max_hp: 0, current_hp: 0, atk: 0, def: 0, max_mp: 0, current_mp: 0,
  companion_role: 'none' as const,
};
const COMPANIONS: CompanionRow[] = [
  { ...base, id: 'c1', companion_type: 'dog', origin: 'lvl3_choice', name: 'Rex', level: 3 },
  { ...base, id: 'c2', companion_type: 'mini_kraken', origin: 'shop', name: 'Krakenzinho', level: 2 },
];

vi.mock('@/components/AppLayout', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { level: 5 }, isLoading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }) },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      if (opts?.defaultValue) return opts.defaultValue;
      if (opts?.level !== undefined) return `Nivel ${opts.level}`;
      return key;
    },
  }),
}));
// Mantém helpers reais (getMoodTier/computeLiveMood/etc.), mocka só os hooks de dados.
vi.mock('@/hooks/useCompanion', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useAllCompanions: () => ({ data: COMPANIONS, isLoading: false }),
    useCreateCompanion: () => ({ mutate: vi.fn(), isPending: false }),
    useInteractCompanion: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import CompanionPage from '@/pages/CompanionPage';

function renderHtml(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <CompanionPage />
    </QueryClientProvider>,
  );
}

describe('CompanionPage (cosmético, §4)', () => {
  it('renderiza os dois companheiros (animal + pet) sem quebrar', () => {
    const html = renderHtml();
    expect(html).toContain('Rex');
    expect(html).toContain('Krakenzinho');
    // companionDisplay resolve nome do animal e do pet de loja
    expect(html).toContain('Cachorro');
    expect(html).toContain('Mini Kraken');
  });

  it('NÃO mostra combate (ATK/DEF) nem seletor de equipamento', () => {
    const html = renderHtml();
    expect(html).not.toMatch(/>ATK</);
    expect(html).not.toMatch(/>DEF</);
    expect(html).not.toContain('Arma (arte');
    expect(html).not.toContain('Armadura (guarda');
    // sem "Combat stats" / bloco de combate
    expect(html.toLowerCase()).not.toContain('combat_stats');
  });
});
