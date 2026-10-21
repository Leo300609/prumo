import Link from 'next/link';
import { q } from '../../../db/index.ts';
import { forecast, seededRandom } from '../../../domain/forecast.ts';
import { Amount } from '../../../components/Amount.tsx';
import { ForecastChart } from '../../../components/ForecastChart.tsx';
import { addDays, localDate, monthStart } from '../../../lib/time.ts';

type Dre = { month: Date; receita_bruta: number; deducoes: number; receita_liquida: number; custos_fixos: number;
  custos_variaveis: number; nao_classificado: number; resultado_operacional: number; resultado_financeiro: number;
  lucro_liquido: number; margem_liquida: number | null };
type NetWorth = { caixa_cents: number; investimentos_cents: number; ativo_cents: number; passivo_cents: number; patrimonio_liquido_cents: number };
type Returns = { twr: number | null; twr_aa: number | null; days: number | null; cdi: number | null; pct_cdi: number | null };
type Recurring = { description: string; direction: number; months: number; expected_cents: number; typical_day: number };
type ForecastInputs = { available_cents: number; known_future: { month: string; cents: number }[]; history: { month: string; cents: number }[] };

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const horizon = [3, 6, 12].includes(Number((await searchParams).h)) ? Number((await searchParams).h) : 6;
  const month0 = monthStart();
  const today = localDate();

  const [dre, [nw], [r30], [r365], recurring, [fi]] = await Promise.all([
    q<Dre>('dre_month', [addMonths(month0, -2), addMonths(month0, 1)]),
    q<NetWorth>('net_worth'),
    q<Returns>('portfolio_returns', [addDays(today, -30), today]),
    q<Returns>('portfolio_returns', [addDays(today, -365), today]),
    q<Recurring>('recurring', [month0]),
    q<ForecastInputs>('forecast_inputs', [month0]),
  ]);

  // projeção: mês 0 = próximo mês; pendências do mês corrente entram no saldo de partida
  const known = new Map(fi.known_future.map((k) => [k.month.slice(0, 10), Number(k.cents)]));
  const start = fi.available_cents + (known.get(month0) ?? 0);
  const futureMonths = Array.from({ length: horizon }, (_, i) => addMonths(month0, i + 1));
  const history = fi.history.map((h) => Number(h.cents));
  const recurringMonthly = recurring.reduce((s, r) => s + r.expected_cents, 0);
  const points = history.length >= 3 ? forecast({
    startCents: start, horizon, recurringMonthlyCents: recurringMonthly,
    knownByMonthCents: futureMonths.map((m) => known.get(m) ?? 0),
    historyMonthlyNetCents: history, random: seededRandom(Number(month0.replace(/-/g, ''))),
  }) : null;
  const firstRisk = points?.find((p) => p.p10 < 0);

  // fôlego (runway): quantos meses o caixa cobre as despesas médias dos meses FECHADOS do período
  const closed = dre.filter((d) => d.month.toISOString().slice(0, 10) < month0);
  const avgSpend = closed.length
    ? -closed.reduce((s, d) => s + d.deducoes + d.custos_fixos + d.custos_variaveis
        + Math.min(0, d.resultado_financeiro) + Math.min(0, d.nao_classificado), 0) / closed.length
    : 0;
  const avgBurn = closed.length ? -closed.reduce((s, d) => s + Math.min(0, d.lucro_liquido), 0) / closed.length : 0;
  const runwayMonths = avgSpend > 0 ? nw.caixa_cents / avgSpend : null;

  return (
    <>
      <header className="topbar"><h1>Relatórios</h1></header>

      <section className="card">
        <h2>Patrimônio líquido</h2>
        <div style={{ fontSize: 28, fontWeight: 700 }}><Amount cents={nw.patrimonio_liquido_cents} balance /></div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span className="muted">Caixa</span><Amount cents={nw.caixa_cents} />
          <span className="muted">Investimentos</span><Amount cents={nw.investimentos_cents} />
          <span className="muted">Dívidas (faturas, cheque especial)</span><Amount cents={-nw.passivo_cents} />
        </div>
      </section>

      <section className="card">
        <h2>Fôlego</h2>
        {runwayMonths == null ? <p className="muted">Aparece depois do primeiro mês fechado.</p> : (
          <>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {runwayMonths.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              É quanto o caixa de hoje cobre das despesas médias (<Amount cents={Math.round(avgSpend)} /> por mês) sem nenhuma renda.
              {avgBurn > 0 ? <> Nos últimos meses você gastou <Amount cents={Math.round(avgBurn)} /> a mais do que ganhou, em média.</> : ' Nos últimos meses sobrou dinheiro: burn rate zero.'}
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Projeção de saldo</h2>
        <nav className="chips" aria-label="Horizonte" style={{ marginBottom: 8 }}>
          {[3, 6, 12].map((h) => (
            <Link key={h} href={`/relatorios?h=${h}`} className={`chip${h === horizon ? ' active' : ''}`}>{h} meses</Link>
          ))}
        </nav>
        {points ? (
          <>
            <ForecastChart start={start} points={points} labels={futureMonths.map((m) => shortMonth.format(new Date(m + 'T00:00:00Z')))} />
            <p style={{ marginBottom: 0 }}>
              Em {horizon} meses, o mais provável é <strong><Amount cents={points.at(-1)!.p50} balance /></strong>.
              {firstRisk && <> Há risco de saldo negativo a partir de <strong>{monthFmt.format(new Date(futureMonths[firstRisk.month - 1] + 'T00:00:00Z'))}</strong>.</>}
            </p>
          </>
        ) : <p className="muted">A projeção aparece depois de 3 meses de histórico.</p>}
      </section>

      <section className="card">
        <h2>Resultado do mês (DRE)</h2>
        {dre.length === 0 && <p className="muted">Sem lançamentos ainda.</p>}
        {[...dre].reverse().map((d) => (
          <details key={String(d.month)} open={d === dre.at(-1)} style={{ marginBottom: 8 }}>
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{monthFmt.format(d.month)}</span>
              <Amount cents={d.lucro_liquido} signed balance />
            </summary>
            <div className="kv">
              <span className="muted">Receitas</span><Amount cents={d.receita_bruta} />
              <span className="muted">Impostos e deduções</span><Amount cents={d.deducoes} />
              <span className="muted">Custos fixos</span><Amount cents={d.custos_fixos} />
              <span className="muted">Custos variáveis</span><Amount cents={d.custos_variaveis} />
              {d.nao_classificado !== 0 && <><span className="muted">Não classificado</span><Amount cents={d.nao_classificado} /></>}
              <span className="muted">Resultado financeiro</span><Amount cents={d.resultado_financeiro} />
              <span className="total">Sobrou no mês</span><span className="total"><Amount cents={d.lucro_liquido} signed balance /></span>
              <span className="muted">Taxa de poupança</span><span>{pct(d.margem_liquida)}</span>
            </div>
          </details>
        ))}
      </section>

      <section className="card">
        <h2>Investimentos</h2>
        <div className="kv">
          <span className="muted">Últimos 30 dias (TWR)</span><span>{pct(r30.twr)}</span>
          <span className="muted">Últimos 12 meses (TWR)</span><span>{pct(r365.twr)}</span>
          <span className="muted">CDI no mesmo período</span><span>{pct(r365.cdi)}</span>
          <span className="muted">Rendimento vs. CDI</span><span>{r365.pct_cdi == null ? '—' : `${Math.round(r365.pct_cdi * 100)}% do CDI`}</span>
        </div>
      </section>

      <section className="card">
        <h2>Recorrentes detectados</h2>
        {recurring.length === 0 && <p className="muted">Aparecem depois de 3 meses de lançamentos.</p>}
        <div className="kv">
          {recurring.slice(0, 12).map((r) => (
            <div key={r.description + r.direction} style={{ display: 'contents' }}>
              <span>{r.description}<span className="muted" style={{ display: 'block', fontSize: 13 }}>todo dia {r.typical_day}</span></span>
              <Amount cents={r.expected_cents} signed />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
