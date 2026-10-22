import { db, q } from '../../../db/index.ts';
import { Amount } from '../../../components/Amount.tsx';
import { EvolutionChart } from '../../../components/EvolutionChart.tsx';
import { groupName, invTitle, rateLabel } from '../../../domain/investments.ts';
import { addDays, localDate } from '../../../lib/time.ts';
import { updateInvestment } from '../actions.ts';

type Inv = {
  id: string; name: string; type: string; subtype: string | null; code: string | null;
  balance_cents: number; amount_original_cents: number | null; status: string | null; updated_at: Date;
  institution: string | null; nickname: string | null; group_label: string | null; connector: string | null;
  rate_type: string | null; rate: number | null; fixed_rate: number | null; issue_date: Date | null; due_date: Date | null;
};
type Returns = { twr: number | null; twr_aa: number | null; days: number | null; cdi: number | null; pct_cdi: number | null };
type Flow = { date: Date; type: string; amount_cents: number; name: string };

const TYPE_LABEL: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa', EQUITY: 'Ações', ETF: 'ETFs', MUTUAL_FUND: 'Fundos',
  SECURITY: 'Títulos', COE: 'COE', MANUAL: 'Manual',
};
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
             i.institution, i.nickname, i.group_label, c.connector_name as connector,
             i.rate_type, i.rate, i.fixed_rate, i.issue_date, i.due_date
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

  // por onde o dinheiro está (Inter, Nubank…), do maior para o menor; dentro de cada um, o maior primeiro
  const groups = new Map<string, Inv[]>();
  for (const i of investments) {
    const g = groupName(i);
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  const sumOf = (list: Inv[]) => list.reduce((t, i) => t + i.balance_cents, 0);
  const orderedGroups = [...groups.keys()].sort((x, y) => sumOf(groups.get(y)!) - sumOf(groups.get(x)!));

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
            <h2>Onde está o dinheiro</h2>
            <div className="kv">
              {orderedGroups.map((g) => {
                const sum = sumOf(groups.get(g)!);
                const share = total > 0 ? sum / total : 0;
                return (
                  <div key={g} style={{ display: 'contents' }}>
                    <span>
                      {g}
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

          {orderedGroups.map((g) => (
            <section key={g} className="card">
              <div className="inv-head">
                <h2>{g}</h2>
                <span><Amount cents={sumOf(groups.get(g)!)} balance /></span>
              </div>
              <ul className="inv-list">
                {groups.get(g)!.map((i) => {
                  const gain = i.amount_original_cents && i.amount_original_cents > 0 ? i.balance_cents - i.amount_original_cents : null;
                  const title = invTitle(i);
                  const rate = rateLabel(i.rate_type, i.rate, i.fixed_rate);
                  const kind = rate && i.subtype ? `${i.subtype} ${rate}` : subName(i.subtype) ?? typeName(i.type);
                  // o título já traz tipo e taxa quando não há apelido; com apelido, eles passam para a linha de baixo
                  const sub = [
                    i.nickname?.trim() || !rate ? kind : null,
                    i.issue_date ? `aplicado em ${dt.format(i.issue_date)}` : null,
                    i.due_date ? `vence em ${dt.format(i.due_date)}` : null,
                    i.code,
                  ].filter((part) => part && part !== title).join(' · ');
                  return (
                    <li key={i.id} className="inv-row">
                      <div className="inv-line">
                        <span className="inv-title">{title}<span className="inv-sub">{sub}</span></span>
                        <span className="inv-val">
                          <Amount cents={i.balance_cents} balance />
                          {gain != null && (
                            <span className="inv-sub"><Amount cents={gain} signed balance /> ({pct(gain / i.amount_original_cents!)})</span>
                          )}
                        </span>
                      </div>
                      <details className="inv-edit">
                        <summary>Renomear ou mudar de grupo</summary>
                        <form action={updateInvestment.bind(null, i.id)}>
                          <div className="field">
                            <label htmlFor={`n-${i.id}`}>Nome na lista</label>
                            <input id={`n-${i.id}`} name="nickname" defaultValue={i.nickname ?? ''} placeholder={i.name} maxLength={60} />
                          </div>
                          <div className="field">
                            <label htmlFor={`g-${i.id}`}>Grupo</label>
                            <input id={`g-${i.id}`} name="group" list="inv-groups" defaultValue={i.group_label ?? ''} placeholder={g} maxLength={40} />
                          </div>
                          <button className="btn primary block">Salvar</button>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <datalist id="inv-groups">{orderedGroups.map((g) => <option key={g} value={g} />)}</datalist>

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
