// Projeção de saldo para 3, 6 e 12 meses, com faixa de incerteza (P10–P90).
//
//   S_m = S_{m-1} + recorrentes + compromissos conhecidos do mês + variável sorteada do histórico
//
// • recorrentes: soma mensal esperada (salário, aluguel, assinaturas) vinda de db/queries/recurring.sql
// • compromissos: parcelas e agendamentos que já existem como PENDING com data futura
// • variável: resultado mensal histórico menos as recorrentes, sorteado com reposição (bootstrap)
// Aproximação conservadora: parcelas de compras antigas também aparecem no histórico variável,
// então a projeção tende a errar para o lado do saldo menor — o lado seguro.

export type ForecastInput = {
  startCents: number;
  horizon: number;                        // meses
  recurringMonthlyCents: number;
  knownByMonthCents: number[];            // índice 0 = próximo mês
  historyMonthlyNetCents: number[];       // resultado (receitas + despesas) de cada mês fechado
  runs?: number;
  random?: () => number;                  // injetável para testes
};

export type ForecastPoint = { month: number; p10: number; p50: number; p90: number; probNegative: number };

/** Gerador determinístico (mulberry32) — útil para testes e para resultados estáveis entre recargas. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

export function forecast(input: ForecastInput): ForecastPoint[] {
  const { startCents, horizon, recurringMonthlyCents, knownByMonthCents, historyMonthlyNetCents } = input;
  const runs = input.runs ?? 2000;
  const random = input.random ?? Math.random;
  const variable = historyMonthlyNetCents.map((net) => net - recurringMonthlyCents);
  if (variable.length === 0) variable.push(0);

  const columns: number[][] = Array.from({ length: horizon }, () => []);
  for (let k = 0; k < runs; k++) {
    let s = startCents;
    for (let m = 0; m < horizon; m++) {
      const sample = variable[Math.floor(random() * variable.length)];
      s += recurringMonthlyCents + (knownByMonthCents[m] ?? 0) + sample;
      columns[m].push(s);
    }
  }
  return columns.map((col, m) => {
    const sorted = col.sort((a, b) => a - b);
    return {
      month: m + 1,
      p10: quantile(sorted, 0.1),
      p50: quantile(sorted, 0.5),
      p90: quantile(sorted, 0.9),
      probNegative: sorted.filter((v) => v < 0).length / sorted.length,
    };
  });
}
