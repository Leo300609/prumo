// MWR (taxa interna de retorno com datas, "XIRR"), por Newton-Raphson com fallback por bisseção.
// Fluxos do ponto de vista do investidor: aportes negativos; resgates e valor final positivos.
// Float aqui é aceitável: é uma taxa para exibir, não um valor contábil.

export type CashFlow = { date: string; amount: number }; // date: YYYY-MM-DD

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(iso + 'T00:00:00Z');

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((acc, f) => acc + f.amount / (1 + rate) ** ((t(f.date) - t0) / (365 * DAY)), 0);
}

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0), hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const sorted = [...flows].sort((a, b) => t(a.date) - t(b.date));
  const t0 = t(sorted[0].date);

  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    let f = 0, df = 0;
    for (const c of sorted) {
      const y = (t(c.date) - t0) / (365 * DAY);
      f += c.amount / (1 + r) ** y;
      df += (-y * c.amount) / (1 + r) ** (y + 1);
    }
    if (df === 0) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }

  // Newton não convergiu: bisseção entre -99% e +1000% a.a.
  let lo = -0.9999, hi = 10;
  let fLo = npv(lo, sorted, t0), fHi = npv(hi, sorted, t0);
  if (Math.sign(fLo) === Math.sign(fHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fMid = npv(mid, sorted, t0);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else { hi = mid; fHi = fMid; }
  }
  return (lo + hi) / 2;
}

/** Retorno real pela equação de Fisher: (1 + nominal) / (1 + inflação) − 1. */
export function realReturn(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

/** Anualiza um retorno acumulado em `days` dias corridos. */
export function annualize(cumulative: number, days: number): number {
  return (1 + cumulative) ** (365 / days) - 1;
}
