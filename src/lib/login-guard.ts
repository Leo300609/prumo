// Regras de limite de tentativas do login, separadas da action para poderem ser testadas.
export const MAX_FAILS = 5;       // falhas por IP dentro da janela
export const WINDOW_MIN = 15;
const SOFT_GLOBAL = 20;           // falhas somadas de todos os IPs a partir das quais o login fica mais lento

/**
 * IP do cliente, só de fonte que o cliente não consegue forjar: na Vercel, o x-real-ip da borda;
 * fora dela, a ÚLTIMA entrada do x-forwarded-for (a que o proxy confiável acrescentou).
 * shortcut: assume um único proxy na frente; com mais de um, configure o cabeçalho do seu provedor.
 */
export function clientIp(h: Headers, onVercel = !!process.env.VERCEL): string {
  const raw = onVercel ? h.get('x-real-ip') : h.get('x-forwarded-for')?.split(',').pop();
  return raw?.trim() || 'local';
}

/**
 * Freio global suave: muitas falhas vindas de vários IPs atrasam cada tentativa em vez de bloquear.
 * Bloquear de vez deixaria qualquer um trancar o único dono do app de fora, e enfileirar as
 * tentativas faria o dono esperar atrás do atacante. O limite que não depende de IP é o por conta:
 * MAX_FAILS erros de código com a senha certa travam novas tentativas por WINDOW_MIN.
 */
export function softDelayMs(globalFails: number): number {
  return globalFails <= SOFT_GLOBAL ? 0 : Math.min(3000, (globalFails - SOFT_GLOBAL) * 250);
}
