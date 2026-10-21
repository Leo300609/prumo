// Datas no fuso do usuário. O servidor pode estar em UTC; a regra de negócio ("este mês",
// "rodar às 07:30") é sempre no horário de São Paulo.

export const APP_TZ = 'America/Sao_Paulo';

/** "YYYY-MM-DD" da data no fuso informado. */
export function localDate(d: Date = new Date(), tz: string = APP_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Primeiro dia do mês corrente no fuso, "YYYY-MM-01". */
export function monthStart(d: Date = new Date(), tz: string = APP_TZ): string {
  return localDate(d, tz).slice(0, 8) + '01';
}

/** Deslocamento do fuso em minutos naquele instante (São Paulo hoje = -180). */
export function tzOffsetMinutes(d: Date, tz: string = APP_TZ): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutes : minutes;
}

/**
 * Instante UTC do último horário agendado (hh:mm no fuso) que já passou em relação a `now`.
 * Ex.: agendado 07:30; às 07:29 de hoje devolve 07:30 de ontem; às 07:31 devolve 07:30 de hoje.
 */
export function lastScheduledInstant(hour: number, minute: number, now: Date = new Date(), tz: string = APP_TZ): Date {
  const today = localDate(now, tz);
  const [y, mo, d] = today.split('-').map(Number);
  const offset = tzOffsetMinutes(now, tz);
  const todayAt = new Date(Date.UTC(y, mo - 1, d, hour, minute) - offset * 60_000);
  return todayAt.getTime() <= now.getTime() ? todayAt : new Date(todayAt.getTime() - 86_400_000);
}

/** Soma dias a "YYYY-MM-DD" sem passar por fuso. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
