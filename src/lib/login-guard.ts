// Regras de limite de tentativas do login, separadas da action para poderem ser testadas.
export const MAX_FAILS = 5;       // falhas por IP dentro da janela
export const WINDOW_MIN = 15;
const SOFT_GLOBAL = 20;           // falhas somadas de todos os IPs a partir das quais o login fica mais lento

/** IP do cliente. Na Vercel o x-real-ip é definido pela borda; shortcut: em outra hospedagem, só vale se o proxy o sobrescreve. */
export function clientIp(h: Headers): string {
  return (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? 'local').trim();
}

/**
 * Freio global suave: muitas falhas vindas de vários IPs atrasam cada tentativa em vez de bloquear.
 * Bloquear de vez deixaria qualquer um trancar o único dono do app de fora.
 */
export function softDelayMs(globalFails: number): number {
  return globalFails <= SOFT_GLOBAL ? 0 : Math.min(3000, (globalFails - SOFT_GLOBAL) * 250);
}
