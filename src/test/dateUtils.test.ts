import { describe, it, expect } from 'vitest';
import {
  today,
  toDateString,
  dayNamePt,
  parseLocalDate,
  isToday,
  currentWeekToken,
} from '@/lib/dateUtils';

describe('today', () => {
  it('retorna string no formato YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retorna a data atual', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(today()).toBe(expected);
  });
});

describe('toDateString', () => {
  it('formata corretamente', () => {
    expect(toDateString(new Date(2026, 3, 21))).toBe('2026-04-21'); // mês 0-indexed
  });
});

describe('dayNamePt', () => {
  it('domingo = Dom', () => {
    // 2026-04-19 é domingo
    const sunday = new Date(2026, 3, 19);
    expect(dayNamePt(sunday)).toBe('Dom');
  });

  it('segunda = Seg', () => {
    const monday = new Date(2026, 3, 20);
    expect(dayNamePt(monday)).toBe('Seg');
  });

  it('sábado = Sáb', () => {
    const saturday = new Date(2026, 3, 25);
    expect(dayNamePt(saturday)).toBe('Sáb');
  });
});

describe('parseLocalDate', () => {
  it('cria data sem offset UTC', () => {
    const d = parseLocalDate('2026-04-21');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // abril = 3
    expect(d.getDate()).toBe(21);
  });
});

describe('isToday', () => {
  it('retorna true para a data de hoje', () => {
    expect(isToday(today())).toBe(true);
  });

  it('retorna false para uma data passada', () => {
    expect(isToday('2000-01-01')).toBe(false);
  });
});

describe('currentWeekToken', () => {
  it('retorna string no formato YYYY-MM-DD', () => {
    expect(currentWeekToken()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retorna uma segunda-feira (getUTCDay === 1)', () => {
    const token = currentWeekToken();
    const d = new Date(token + 'T12:00:00Z');
    expect(d.getUTCDay()).toBe(1);
  });

  it('segunda-feira retorna ela mesma', () => {
    const monday = new Date(Date.UTC(2026, 3, 20)); // 2026-04-20 = segunda
    expect(currentWeekToken(monday)).toBe('2026-04-20');
  });

  it('domingo retorna a segunda anterior', () => {
    const sunday = new Date(Date.UTC(2026, 3, 26)); // 2026-04-26 = domingo
    expect(currentWeekToken(sunday)).toBe('2026-04-20');
  });

  it('sábado retorna a segunda da mesma semana', () => {
    const saturday = new Date(Date.UTC(2026, 3, 25)); // 2026-04-25 = sábado
    expect(currentWeekToken(saturday)).toBe('2026-04-20');
  });
});
