/**
 * Notificações — regras de decisão.
 *
 * Um app de hábito vive ou morre pelo tom das notificações. A regra que rege
 * tudo aqui: a mensagem fala do HERÓI, nunca da falha da pessoa. "Seu cantil
 * está seco" convida; "você não bebeu água" acusa — e app que acusa é app que
 * a pessoa desinstala. É a mesma voz do resto do jogo, onde a primeira falha é
 * perdoada e a derrota não tira XP.
 *
 * Só a decisão mora neste módulo (puro e testável): quando pode falar, quantas
 * vezes, e qual mensagem tem prioridade. O disparo em si é do agendador.
 */

export type NotificationKind =
  | 'missions_pending'
  | 'fatigue_high'
  | 'hp_low'
  | 'water'
  | 'meal'
  | 'journal_empty';

/**
 * Prioridade quando mais de um gatilho está ativo no mesmo momento.
 * Missão vem primeiro porque é a torneira — a única fonte de XP. Fadiga e HP
 * vêm depois porque afetam o que a pessoa consegue fazer hoje. Água e refeição
 * são âncoras: importam, mas não travam nada.
 */
export const KIND_PRIORITY: NotificationKind[] = [
  'missions_pending',
  'fatigue_high',
  'hp_low',
  'water',
  'meal',
  'journal_empty',
];

/** Teto diário. Acima disto a pessoa desliga tudo — e aí o canal se perde para sempre. */
export const MAX_PER_DAY = 3;

/** Intervalo mínimo entre duas notificações, para não empilhar cutucadas. */
export const MIN_GAP_MINUTES = 90;

export type ScheduledRecord = {
  kind: NotificationKind;
  /** ISO do momento em que foi enviada. */
  sentAt: string;
};

export type QuietHours = {
  /** "HH:MM" — início do descanso (dormir). */
  sleepTime: string | null;
  /** "HH:MM" — fim do descanso (acordar). */
  wakeTime: string | null;
};

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Está dentro do horário de silêncio? Considera a virada da meia-noite
 * (dormir 23:00, acordar 07:00 é uma janela que cruza o dia).
 *
 * Sem horário definido, o padrão protege a madrugada: 22:00–08:00. Mandar
 * "beba água" às 2h da manhã é o tipo de erro que não se desfaz.
 */
export function isQuietTime(date: Date, quiet: QuietHours): boolean {
  const sleep = toMinutes(quiet.sleepTime) ?? 22 * 60;
  const wake = toMinutes(quiet.wakeTime) ?? 8 * 60;
  const now = date.getHours() * 60 + date.getMinutes();
  if (sleep === wake) return false;
  return sleep < wake
    ? now >= sleep && now < wake      // janela dentro do mesmo dia
    : now >= sleep || now < wake;     // janela que cruza a meia-noite
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function sentToday(history: ScheduledRecord[], now: Date): ScheduledRecord[] {
  return history.filter((r) => {
    const d = new Date(r.sentAt);
    return !Number.isNaN(d.getTime()) && sameLocalDay(d, now);
  });
}

export type CanNotifyInput = {
  now: Date;
  quiet: QuietHours;
  /** Modo descanso ligado: o app inteiro se cala. */
  restMode: boolean;
  history: ScheduledRecord[];
  /** Categorias que a pessoa desligou nas configurações. */
  mutedKinds: NotificationKind[];
};

export type NotifyDecision =
  | { allowed: true; kind: NotificationKind }
  | { allowed: false; reason: 'quiet' | 'rest_mode' | 'daily_cap' | 'too_soon' | 'muted' | 'nothing_pending' };

/**
 * Decide se pode notificar agora e qual gatilho vence.
 * `pending` são os gatilhos verdadeiros neste instante (calculados pelo app a
 * partir do estado real: missões, fadiga, HP, água, refeição).
 */
export function decideNotification(
  pending: NotificationKind[],
  input: CanNotifyInput,
): NotifyDecision {
  const { now, quiet, restMode, history, mutedKinds } = input;

  if (restMode) return { allowed: false, reason: 'rest_mode' };
  if (isQuietTime(now, quiet)) return { allowed: false, reason: 'quiet' };

  const today = sentToday(history, now);
  if (today.length >= MAX_PER_DAY) return { allowed: false, reason: 'daily_cap' };

  const last = today
    .map((r) => new Date(r.sentAt).getTime())
    .sort((a, b) => b - a)[0];
  if (last != null && now.getTime() - last < MIN_GAP_MINUTES * 60_000) {
    return { allowed: false, reason: 'too_soon' };
  }

  const muted = new Set(mutedKinds);
  // Não repetir a mesma categoria no mesmo dia: duas cobranças de água soam
  // como cobrança, não como lembrete.
  const usedToday = new Set(today.map((r) => r.kind));
  const candidates = KIND_PRIORITY.filter(
    (k) => pending.includes(k) && !muted.has(k) && !usedToday.has(k),
  );

  if (candidates.length === 0) {
    const havePending = pending.some((k) => !muted.has(k));
    return { allowed: false, reason: havePending ? 'nothing_pending' : 'muted' };
  }

  return { allowed: true, kind: candidates[0] };
}

/**
 * Texto de cada gatilho, na voz do herói. Várias variantes por categoria para
 * a mesma mensagem não virar ruído de fundo ao longo das semanas.
 */
export const MESSAGES: Record<NotificationKind, Array<{ title: string; body: string }>> = {
  missions_pending: [
    { title: '⚔️ Missões aguardando', body: 'Ainda há o que enfrentar hoje. Uma de cada vez.' },
    { title: '⚔️ O dia ainda não acabou', body: 'Suas missões continuam de pé — dá tempo.' },
  ],
  fatigue_high: [
    { title: '🌙 Exaustão pesando', body: 'Um descanso breve devolve o fôlego do herói.' },
    { title: '🌙 O corpo pede pausa', body: 'Descansar também é jogar bem.' },
  ],
  hp_low: [
    { title: '🩹 Você voltou ferido', body: 'Comida e água curam mais rápido que o tempo.' },
    { title: '🩹 Vida baixa', body: 'Uma refeição e um copo d’água recuperam o herói.' },
  ],
  water: [
    { title: '💧 O cantil está seco', body: 'Faz horas desde o último gole.' },
    { title: '💧 Hidratação', body: 'Um copo agora e o herói agradece.' },
  ],
  meal: [
    { title: '🍺 Estômago vazio', body: 'Nenhuma refeição registrada até agora.' },
    { title: '🍺 Hora de comer', body: 'Herói não luta em jejum.' },
  ],
  journal_empty: [
    { title: '📖 Diário em branco', body: 'Fez algo hoje? Marcar é o que conta.' },
    { title: '📖 Nada registrado', body: 'Se você cumpriu algo, vale registrar.' },
  ],
};

/** Escolhe a variante girando pelo dia do ano, para não repetir sempre a mesma. */
export function pickMessage(kind: NotificationKind, date = new Date()): { title: string; body: string } {
  const variants = MESSAGES[kind];
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return variants[dayOfYear % variants.length];
}
