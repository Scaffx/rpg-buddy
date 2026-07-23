import { describe, it, expect } from 'vitest';
import { computeAnchorStatusToday, type AnchorMissionLike } from '@/lib/anchors';

const TODAY = '2026-06-25';
const DAY = 'Qui';

const anchor = (title: string, done: boolean): AnchorMissionLike => ({
  title,
  is_anchor: true,
  days_of_week: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  daily_status: done ? { [TODAY]: 'completed' } : {},
});
const common = (done: boolean): AnchorMissionLike => ({
  title: 'Estudar',
  is_anchor: false,
  days_of_week: [DAY],
  daily_status: done ? { [TODAY]: 'completed' } : {},
});

describe('Âncoras do Dia (gate suave — incentivo, nunca dreno)', () => {
  it('âncoras completas → allComplete (bônus liberado)', () => {
    const s = computeAnchorStatusToday([anchor('Água', true), anchor('Refeições', true), common(true)], TODAY, DAY);
    expect(s.hasAnchors).toBe(true);
    expect(s.allComplete).toBe(true);
    expect(s.pendingTitles).toEqual([]);
  });

  it('âncora faltando → bloqueado (nada concedido), com título pendente pra copy', () => {
    const s = computeAnchorStatusToday([anchor('Água', true), anchor('Refeições', false), common(true)], TODAY, DAY);
    expect(s.hasAnchors).toBe(true);
    expect(s.allComplete).toBe(false);
    expect(s.pendingTitles).toEqual(['Refeições']);
  });

  it('usuário sem âncoras → comportamento atual preservado (sem gate)', () => {
    const s = computeAnchorStatusToday([common(false), common(true)], TODAY, DAY);
    expect(s.hasAnchors).toBe(false);
    expect(s.allComplete).toBe(false);
  });

  it('âncora agendada pra OUTRO dia não conta pra hoje', () => {
    const offDay: AnchorMissionLike = { title: 'Sauna', is_anchor: true, days_of_week: ['Seg'], daily_status: {} };
    const s = computeAnchorStatusToday([offDay], TODAY, DAY);
    expect(s.hasAnchors).toBe(false);
  });

  it("dias com/sem acento são equivalentes ('Sáb' == 'Sab')", () => {
    const sat: AnchorMissionLike = { title: 'Feira', is_anchor: true, days_of_week: ['Sab'], daily_status: {} };
    const s = computeAnchorStatusToday([sat], '2026-06-27', 'Sáb');
    expect(s.hasAnchors).toBe(true);
    expect(s.allComplete).toBe(false);
  });

  it('âncora falhada (is_failed) não trava o gate', () => {
    const failed: AnchorMissionLike = { ...anchor('Água', false), is_failed: true };
    const s = computeAnchorStatusToday([failed], TODAY, DAY);
    expect(s.hasAnchors).toBe(false);
  });

  it('execução semanal regular conta somente no dia em que ocorreu', () => {
    const weekly: AnchorMissionLike = {
      title: 'Estudar',
      is_anchor: true,
      frequency_type: 'weekly',
      target_count: 4,
      weekly_current_count: 3,
      weekly_last_completed_date: TODAY,
    };

    expect(computeAnchorStatusToday([weekly], TODAY, DAY)).toEqual({
      hasAnchors: true,
      allComplete: true,
      pendingTitles: [],
    });
    expect(computeAnchorStatusToday([weekly], '2026-06-26', 'Sex')).toEqual({
      hasAnchors: false,
      allComplete: false,
      pendingTitles: [],
    });
  });

  it('overflow semanal nunca conta como execução de âncora', () => {
    const overflow: AnchorMissionLike = {
      title: 'Estudar extra',
      is_anchor: true,
      frequency_type: 'weekly',
      target_count: 4,
      weekly_current_count: 5,
      weekly_last_completed_date: TODAY,
    };

    expect(computeAnchorStatusToday([overflow], TODAY, DAY)).toEqual({
      hasAnchors: false,
      allComplete: false,
      pendingTitles: [],
    });
  });
});
