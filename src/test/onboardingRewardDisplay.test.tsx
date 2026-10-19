import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ xp: 0 }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: { xp?: number }) => key === 'app.onboardingMissions.xpReward'
      ? `+${args?.xp} XP` : key,
  }),
}));
vi.mock('@/hooks/useOnboardingMissions', () => ({
  useOnboardingMissions: () => ({ data: [{
    code: 'create_goal', sort_order: 3, xp_reward: mocks.xp,
    reward_kind: 'xp', unlocked: true, claimed: false, claimed_at: null,
  }], isLoading: false }),
  useClaimOnboardingMission: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { OnboardingMissionsCard } from '@/components/OnboardingMissionsCard';

describe('recompensa de onboarding exibida', () => {
  beforeEach(() => { mocks.xp = 0; });

  it('etapa de configuração sem XP não promete +0 XP', () => {
    const html = renderToStaticMarkup(<OnboardingMissionsCard />);
    expect(html).toContain('app.onboardingMissions.missions.create_goal.title');
    expect(html).not.toContain('+0 XP');
  });

  it('exibe crédito positivo se o servidor ainda o retornar antes da migration', () => {
    mocks.xp = 25;
    const html = renderToStaticMarkup(<OnboardingMissionsCard />);
    expect(html).toContain('+25 XP');
  });
});
