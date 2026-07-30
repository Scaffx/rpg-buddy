import { describe, it, expect } from 'vitest';
import {
  isQuietTime,
  decideNotification,
  pickMessage,
  MAX_PER_DAY,
  MIN_GAP_MINUTES,
  type ScheduledRecord,
  type NotificationKind,
} from '@/lib/notifications';

const at = (h: number, m = 0) => new Date(2026, 6, 28, h, m, 0);
const quiet = { sleepTime: '23:00', wakeTime: '07:00' };

function input(over: Partial<Parameters<typeof decideNotification>[1]> = {}) {
  return {
    now: at(14),
    quiet,
    restMode: false,
    history: [] as ScheduledRecord[],
    mutedKinds: [] as NotificationKind[],
    ...over,
  };
}

describe('horário de silêncio', () => {
  it('cala durante a madrugada, na janela que cruza a meia-noite', () => {
    expect(isQuietTime(at(23, 30), quiet)).toBe(true);
    expect(isQuietTime(at(3), quiet)).toBe(true);
    expect(isQuietTime(at(6, 59), quiet)).toBe(true);
  });

  it('libera durante o dia', () => {
    expect(isQuietTime(at(7), quiet)).toBe(false);
    expect(isQuietTime(at(14), quiet)).toBe(false);
    expect(isQuietTime(at(22, 59), quiet)).toBe(false);
  });

  it('protege a madrugada por padrão quando não há horário definido', () => {
    const semHorario = { sleepTime: null, wakeTime: null };
    expect(isQuietTime(at(2), semHorario)).toBe(true);
    expect(isQuietTime(at(15), semHorario)).toBe(false);
  });

  it('trata janela dentro do mesmo dia', () => {
    const diurno = { sleepTime: '13:00', wakeTime: '15:00' };
    expect(isQuietTime(at(14), diurno)).toBe(true);
    expect(isQuietTime(at(16), diurno)).toBe(false);
  });
});

describe('decisão de notificar', () => {
  it('escolhe missões antes das âncoras — a torneira vem primeiro', () => {
    const d = decideNotification(['water', 'missions_pending', 'meal'], input());
    expect(d).toEqual({ allowed: true, kind: 'missions_pending' });
  });

  it('cala no modo descanso', () => {
    const d = decideNotification(['missions_pending'], input({ restMode: true }));
    expect(d).toEqual({ allowed: false, reason: 'rest_mode' });
  });

  it('cala no horário de silêncio', () => {
    const d = decideNotification(['water'], input({ now: at(3) }));
    expect(d).toEqual({ allowed: false, reason: 'quiet' });
  });

  it('respeita o teto diário', () => {
    const history: ScheduledRecord[] = [
      { kind: 'meal', sentAt: at(8).toISOString() },
      { kind: 'water', sentAt: at(10).toISOString() },
      { kind: 'hp_low', sentAt: at(12).toISOString() },
    ];
    expect(history.length).toBe(MAX_PER_DAY);
    const d = decideNotification(['missions_pending'], input({ history }));
    expect(d).toEqual({ allowed: false, reason: 'daily_cap' });
  });

  it('respeita o intervalo mínimo entre duas', () => {
    const history: ScheduledRecord[] = [{ kind: 'meal', sentAt: at(13, 30).toISOString() }];
    const d = decideNotification(['missions_pending'], input({ history, now: at(14) }));
    expect(d).toEqual({ allowed: false, reason: 'too_soon' });
    // Passado o intervalo, libera.
    const depois = decideNotification(
      ['missions_pending'],
      input({ history, now: at(13, 30 + MIN_GAP_MINUTES + 1) }),
    );
    expect(depois).toEqual({ allowed: true, kind: 'missions_pending' });
  });

  it('não repete a mesma categoria no mesmo dia', () => {
    const history: ScheduledRecord[] = [{ kind: 'water', sentAt: at(9).toISOString() }];
    const d = decideNotification(['water'], input({ history }));
    expect(d.allowed).toBe(false);
  });

  it('pula categoria silenciada e usa a próxima da fila', () => {
    const d = decideNotification(['missions_pending', 'water'], input({ mutedKinds: ['missions_pending'] }));
    expect(d).toEqual({ allowed: true, kind: 'water' });
  });

  it('não inventa notificação quando nada está pendente', () => {
    const d = decideNotification([], input());
    expect(d.allowed).toBe(false);
  });

  it('history de ontem não conta para o teto de hoje', () => {
    const ontem = new Date(2026, 6, 27, 10).toISOString();
    const history: ScheduledRecord[] = [
      { kind: 'meal', sentAt: ontem },
      { kind: 'water', sentAt: ontem },
      { kind: 'hp_low', sentAt: ontem },
    ];
    const d = decideNotification(['missions_pending'], input({ history }));
    expect(d).toEqual({ allowed: true, kind: 'missions_pending' });
  });
});

describe('mensagens', () => {
  it('toda categoria tem texto e fala do herói, não da falha da pessoa', () => {
    const kinds: NotificationKind[] = ['missions_pending', 'fatigue_high', 'hp_low', 'water', 'meal', 'journal_empty'];
    for (const k of kinds) {
      const msg = pickMessage(k);
      expect(msg.title.length).toBeGreaterThan(0);
      expect(msg.body.length).toBeGreaterThan(0);
      expect(msg.body.toLowerCase()).not.toContain('você não');
    }
  });

  it('gira as variantes ao longo dos dias', () => {
    const a = pickMessage('water', new Date(2026, 0, 1));
    const b = pickMessage('water', new Date(2026, 0, 2));
    expect(a).not.toEqual(b);
  });
});
