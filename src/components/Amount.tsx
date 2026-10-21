import { formatBRL } from '../lib/money.ts';

/** Valor monetário: entradas em verde com "+", saídas na cor do texto (sem vermelho para cada gasto). */
export function Amount({ cents, signed = false, balance = false, className = '' }: {
  cents: number; signed?: boolean; balance?: boolean; className?: string;
}) {
  const cls = ['amount', signed && cents > 0 ? 'in' : '', balance && cents < 0 ? 'negative-balance' : '', className]
    .filter(Boolean).join(' ');
  return <span className={cls}>{formatBRL(cents, { signed: signed && cents > 0 })}</span>;
}
