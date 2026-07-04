import { describe, it, expect } from 'vitest';
import { computeHealthAnchors, combinePerfectDay, type AnchorStatusToday } from '@/lib/anchors';

const noMissionAnchors: AnchorStatusToday = { hasAnchors: false, allComplete: false, pendingTitles: [] };
const missionAnchorsDone: AnchorStatusToday = { hasAnchors: true, allComplete: true, pendingTitles: [] };
const missionAnchorsPending: AnchorStatusToday = { hasAnchors: true, allComplete: false, pendingTitles: ['Ler 10 páginas'] };

describe('computeHealthAnchors — "qualquer registro"', () => {
  it('refeição basta ≥1; água basta > 0', () => {
    expect(computeHealthAnchors(0, 0)).toEqual({ meal: false, water: false });
    expect(computeHealthAnchors(1, 0)).toEqual({ meal: true, water: false });
    expect(computeHealthAnchors(0, 250)).toEqual({ meal: false, water: true });
    expect(computeHealthAnchors(3, 2000)).toEqual({ meal: true, water: true });
  });
});

describe('combinePerfectDay — saúde DESABILITADA (comportamento atual intacto)', () => {
  it('sem âncoras de missão e sem saúde → sem dia perfeito', () => {
    const r = combinePerfectDay(noMissionAnchors, false, { meal: false, water: false });
    expect(r).toEqual({ hasAnchors: false, allComplete: false, pendingTitles: [] });
  });
  it('só âncoras de missão continuam mandando', () => {
    expect(combinePerfectDay(missionAnchorsDone, false, { meal: false, water: false }).allComplete).toBe(true);
    expect(combinePerfectDay(missionAnchorsPending, false, { meal: true, water: true }).allComplete).toBe(false);
  });
});

describe('combinePerfectDay — saúde HABILITADA', () => {
  it('sem âncora de missão: dia perfeito exige refeição + água', () => {
    expect(combinePerfectDay(noMissionAnchors, true, { meal: true, water: true }).allComplete).toBe(true);
    const r = combinePerfectDay(noMissionAnchors, true, { meal: true, water: false });
    expect(r.hasAnchors).toBe(true);
    expect(r.allComplete).toBe(false);
    expect(r.pendingTitles).toContain('Água');
    expect(r.pendingTitles).not.toContain('Refeição');
  });

  it('combina com âncoras de missão: precisa das duas frentes', () => {
    // missões ok, mas falta água
    expect(combinePerfectDay(missionAnchorsDone, true, { meal: true, water: false }).allComplete).toBe(false);
    // saúde ok, mas falta missão
    expect(combinePerfectDay(missionAnchorsPending, true, { meal: true, water: true }).allComplete).toBe(false);
    // tudo ok
    expect(combinePerfectDay(missionAnchorsDone, true, { meal: true, water: true }).allComplete).toBe(true);
  });

  it('pendências acumulam missão + saúde', () => {
    const r = combinePerfectDay(missionAnchorsPending, true, { meal: false, water: false });
    expect(r.pendingTitles).toEqual(['Ler 10 páginas', 'Refeição', 'Água']);
  });
});
