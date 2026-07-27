import { describe, expect, it } from 'vitest';
import {
  WEEKEND_XP_BONUS,
  hasWeekendXpSchedule,
  isWeekendDate,
} from '@/lib/weekendXpBonus';

describe('bônus de XP de fim de semana', () => {
  it('marca recorrente agendada para sábado', () => {
    expect(hasWeekendXpSchedule({
      frequency_type: 'daily',
      days_of_week: ['Ter', 'Sáb'],
    })).toBe(true);
  });

  it('não marca recorrente sem sábado ou domingo', () => {
    expect(hasWeekendXpSchedule({
      frequency_type: 'daily',
      days_of_week: ['Seg', 'Ter'],
    })).toBe(false);
  });

  it('não marca missão única', () => {
    expect(hasWeekendXpSchedule({
      frequency_type: 'daily',
      days_of_week: [],
    })).toBe(false);
  });

  it('não marca frequência flexível semanal, mesmo com dia legado', () => {
    expect(hasWeekendXpSchedule({
      frequency_type: 'weekly',
      days_of_week: ['Dom'],
    })).toBe(false);
  });

  it('reconhece sábado e domingo, mas não terça-feira', () => {
    expect(isWeekendDate(new Date(2026, 6, 25, 12))).toBe(true);
    expect(isWeekendDate(new Date(2026, 6, 26, 12))).toBe(true);
    expect(isWeekendDate(new Date(2026, 6, 28, 12))).toBe(false);
    expect(WEEKEND_XP_BONUS).toBe(0.25);
  });
});
