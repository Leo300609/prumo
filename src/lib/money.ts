// Dinheiro sempre em centavos inteiros. number é seguro até 2^53 centavos (~R$ 90 trilhões).

/** Converte um valor decimal vindo de API (ex.: 45.9) para centavos, sem erro de ponto flutuante. */
export function toCents(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e13) throw new TypeError(`valor inválido: ${value}`);
  if (Math.abs(value) < 0.001) return 0; // evita notação exponencial (1e-7) abaixo; sempre arredonda a 0
  // toPrecision(15) recupera o decimal que a API escreveu (1.005 → "1.00500000000000",
  // 0.1 + 0.2 → "0.300000000000000"); arredondamos meio-para-cima nessa string.
  const [int, frac = ''] = Math.abs(value).toPrecision(15).split('.');
  const digits = (frac + '000').slice(0, 3);
  let cents = Number(int) * 100 + Number(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) cents += 1;
  return value < 0 ? -cents : cents;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlSigned = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero' });

/** 123456 → "R$ 1.234,56". Com signed, positivos ganham "+". */
export function formatBRL(cents: number, opts: { signed?: boolean } = {}): string {
  const f = opts.signed ? brlSigned : brl;
  // Intl usa espaço não separável entre "R$" e o número; trocamos por espaço comum p/ facilitar testes e cópia
  return f.format(cents / 100).replace(/ /g, ' ');
}

/** Aceita "1.234,56", "1234,56", "-45,9", "R$ 10", "10.5" (ponto como decimal quando não há vírgula). */
export function parseBRL(input: string): number {
  let s = input.trim().replace(/R\$\s?/i, '').replace(/\s/g, '');
  const negative = /^-|^\(.*\)$|-$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new TypeError(`valor inválido: "${input}"`);
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}
