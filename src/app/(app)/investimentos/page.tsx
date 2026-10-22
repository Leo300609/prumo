import { db, q } from '../../../db/index.ts';
import { Amount } from '../../../components/Amount.tsx';
import { EvolutionChart } from '../../../components/EvolutionChart.tsx';
import { addDays, localDate } from '../../../lib/time.ts';

type Inv = {
  id: string; name: string; type: string; subtype: string | null; code: string | null;
  balance_cents: number; amount_original_cents: number | null; status: string | null; updated_at: Date;
  institution: string | null;
};
type Returns = { twr: number | null; twr_aa: number | null; days: number | null; cdi: number | null; pct_cdi: number | null };
type Flow = { date: Date; type: string; amount_cents: number; name: string };

const TYPE_LABEL: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa', EQUITY: 'Ações', ETF: 'ETFs', MUTUAL_FUND: 'Fundos',
  SECURITY: 'Títulos', COE: 'COE', MANUAL: 'Manual',
};
const TYPE_ORDER = ['FIXED_INCOME', 'MUTUAL_FUND', 'SECURITY', 'EQUITY', 'ETF', 'COE', 'MANUAL'];
const SUBTYPE_LABEL: Record<string, string> = {
  CDB: 'CDB', LCI: 'LCI', LCA: 'LCA', LC: 'LC', LF: 'LF', CRI: 'CRI', CRA: 'CRA', DEBENTURE: 'Debênture',
  TREASURY: 'Tesouro Direto', RETIREMENT: 'Previdência', STOCK: 'Ação', REAL_ESTATE_FUND: 'FII',
  MULTIMARKET_FUND: 'Multimercado', FIXED_INCOME_FUND: 'Fundo de renda fixa', ETF: 'ETF',
};
const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const dt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' });
const dtLocal = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const typeName = (t: string) => TYPE_LABEL[t] ?? t;
const subName = (s: string | null) => (s ? SUBTYPE_LABEL[s.toUpperCase()] ?? s : null);

export default async function InvestimentosPage() {
  const today = localDate();
  const [investments, snapshots, [r30], [r365], flows] = await Promise.all([
    db()<Inv[]>`
      select i.id, i.name, i.type, i.subtype, i.code, i.balance_cents, i.amount_original_cents, i.status, i.updated_at,
             c.connector_name as institution
      from investment i left join connection c on c.id = i.connection_id
      where i.balance_cents <> 0
      order by i.balance_cents desc`,
    db()<{ date: Date; market_value_cents: number }[]>`
      select date, market_value_cents from investment_snapshot
      where date >= ${addDays(today, -365)}::date order by date`,
    q<Returns>('portfolio_returns', [addDays(today, -30), today]),
    q<Returns>('portfolio_returns', [addDays(today, -365), today]),
    db()<Flow[]>`
      select f.date, f.type, f.amount_cents, i.name
      from investment_flow f join investment i on i.id = f.investment_id
      order by f.date desc, f.provider_tx_id limit 8`,
  ]);

  const total = investments.reduce((s, i) => s + i.balance_cents, 0);
  // rendimento só onde o banco informou o valor aplicado, para não misturar com ativos sem esse dado
  const withCost = investments.filter((i) => i.amount_original_cents != null && i.amount_original_cents > 0);
  const costBalance = withCost.reduce((s, i) => s + i.balance_cents, 0);
  const cost = withCost.reduce((s, i) => s + (i.amount_original_cents ?? 0), 0);
  const gain = costBalance - cost;

  const groups = new Map<string, Inv[]>();
  for (const i of investments) groups.set(i.type, [...(groups.get(i.type) ?? []), i]);
  const orderedTypes = [...groups.keys()].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const points = snapshots.map((s) => ({ date: s.date.toISOString().slice(0, 10), cents: s.market_value_cents }));
  const lastUpdate = investments.reduce<Date | null>((m, i) => (!m || i.updated_at > m ? i.updated_at : m), null);

  return (
    <>
      <header className="topbar"><h1>Investimentos</h1></header>

      {investments.length === 0 ? (
        <section className="card">
          <h2>Carteira</h2>
          <p className="muted" style={{ margin: 0 }}>
            Nenhum investimento encontrado. Eles aparecem aqui depois que você conecta um banco ou corretora com
            investimentos em <strong>Contas</strong>. Se já conectou, toque em atualizar no Início.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Total investido</h2>
            <div style={{ fontSize: 28, fontWeight: 700 }}><Amount cents={total} balance /></div>
            {withCost.length > 0 && (
              <div className="kv" style={{ marginTop: 8 }}>
                <span className="muted">Valor aplicado</span><Amount cents={cost} />
                <span className="muted">Rendimento</span>
                <span><Amount cents={gain} signed balance />{cost > 0 && <span className="muted"> ({pct(gain / cost)})</span>}</span>
              </div>
            )}
            {lastUpdate && <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Atualizado em {dtLocal.format(lastUpdate)}</p>}
          </section>

          <section className="card">
            <h2>Distribuição</h2>
            <div className="kv">
              {orderedTypes.map((t) => {
                const sum = groups.get(t)!.reduce((s, i) => s + i.balance_cents, 0);
                const share = total > 0 ? sum / total : 0;
                return (
                  <div key={t} style={{ display: 'contents' }}>
                    <span>
                      {typeName(t)}
                      <span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--surface-2)', marginTop: 4 }}>
                        <span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--brass)', width: `${Math.max(2, share * 100)}%` }} />
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}><Amount cents={sum} /><span className="muted" style={{ display: 'block', fontSize: 13 }}>{pct(share)}</span></span>
                  </div>
                );
              })}
            </div>
          </section>

          {orderedTypes.map((t) => (
            <section key={t} className="card">
              <h2>{typeName(t)}</h2>
              <div className="kv">
                {groups.get(t)!.map((i) => {
                  const g = i.amount_original_cents && i.amount_original_cents > 0 ? i.balance_cents - i.amount_original_cents : null;
                  return (
                    <div key={i.id} style={{ display: 'contents' }}>
                      <span>
                        {i.name}
                        <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                          {[subName(i.subtype), i.code, i.institution && i.institution.toLowerCase().replace(/\s/g, '') !== 'meupluggy' ? i.institution : null]
                            .filter(Boolean).join(' · ') || typeName(i.type)}
                        </span>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <Amount cents={i.balance_cents} balance />
                        {g != null && (
                          <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                            <Amount cents={g} signed balance /> ({pct(g / i.amount_original_cents!)})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {points.length >= 2 && (
            <section className="card">
              <h2>Evolução da carteira</h2>
              <EvolutionChart points={points} />
            </section>
          )}

          <section className="card">
            <h2>Rentabilidade</h2>
            <div className="kv">
              <span className="muted">Últimos 30 dias</span><span>{pct(r30?.twr ?? null)}</span>
              <span className="muted">Últimos 12 meses</span><span>{pct(r365?.twr ?? null)}</span>
              <span className="muted">CDI em 12 meses</span><span>{pct(r365?.cdi ?? null)}</span>
              <span className="muted">Rendimento vs. CDI</span>
              <span>{r365?.pct_cdi == null ? '—' : `${Math.round(r365.pct_cdi * 100)}% do CDI`}</span>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              O cálculo desconta aportes e resgates, então depósito novo não conta como lucro. Precisa de alguns dias de histórico.
            </p>
          </section>

          {flows.length > 0 && (
            <section className="card">
              <h2>Últimos aportes e resgates</h2>
              <div className="kv">
                {flows.map((f, idx) => (
                  <div key={idx} style={{ display: 'contents' }}>
                    <span>{f.name}<span className="muted" style={{ display: 'block', fontSize: 13 }}>{dt.format(f.date)}</span></span>
                    <Amount cents={f.amount_cents} signed />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
