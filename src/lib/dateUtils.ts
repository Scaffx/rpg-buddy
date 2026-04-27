// ============================================================
// Helpers de data — evita 'en-CA' espalhado pelo código.
// ============================================================

/**
 * Retorna a data de hoje no formato YYYY-MM-DD (fuso local).
 * Equivalente a `new Date().toLocaleDateString('en-CA')`.
 */
export function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Formata uma data no padrão YYYY-MM-DD.
 */
export function toDateString(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

/**
 * Retorna o nome do dia da semana abreviado em pt-BR.
 * Índice: 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
 */
const DAYS_PT: readonly string[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function dayNamePt(date: Date = new Date()): string {
  return DAYS_PT[date.getDay()];
}

/**
 * Converte uma string YYYY-MM-DD em objeto Date (meia-noite local).
 * Evita off-by-one do `new Date('2026-04-21')` que usa UTC.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Retorna true se a string representar o dia de hoje.
 */
export function isToday(dateStr: string): boolean {
  return dateStr === today();
}

/**
 * Retorna a string YYYY-MM-DD do dia anterior ao de hoje (fuso local).
 */
export function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateString(d);
}

/**
 * Retorna um label relativo para a data: "Hoje", "Ontem" ou a data formatada (dd/MM/yyyy).
 * Aceita string YYYY-MM-DD ou Date.
 */
export function formatRelativeDay(input: string | Date): string {
  const dateStr = typeof input === 'string' ? input : toDateString(input);
  if (dateStr === today()) return 'Hoje';
  if (dateStr === yesterdayStr()) return 'Ontem';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Retorna o token da semana atual (data da segunda-feira) em YYYY-MM-DD.
 * Útil para streak protector, refresh semanal de NPCs etc.
 */
export function currentWeekToken(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
