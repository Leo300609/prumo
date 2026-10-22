import Link from 'next/link';
import { q } from '../../../db/index.ts';
import { getAccounts, getConnections, type TxListRow } from '../../../db/read.ts';
import { Amount } from '../../../components/Amount.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { TxList } from '../../../components/TxList.tsx';
import { localDate, monthStart } from '../../../lib/time.ts';
import { syncNow, togglePrivacy } from '../actions.ts';
import { cookies } from 'next/headers';

type Summary = {
  available_cents: number; card_bills_cents: number; invested_cents: number;
  month_income_cents: number; month_expense_cents: number; to_review: number;
  connections_with_issue: number; next_consent_expiry: Date | null; last_synced_at: Date | null;
};

const timeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default async function HomePage() {
  const [[s], accounts, recent, connections, privacy] = await Promise.all([
    q<Summary>('home_summary', [monthStart()]),
    getAccounts(),
    q<TxListRow>('list_transactions', ['all', '', null, null, 8]),
    getConnections(),
    cookies().then((c) => c.get('prumo_privacy')?.value === '1'),
  ]);
  const result = s.month_income_cents + s.month_expense_cents;
  const issues = connections.filter((c) => ['needs_reauth', 'needs_action', 'error'].includes(c.status));
  const expiringSoon = s.next_consent_expiry && s.next_consent_expiry.getTime() - Date.now() < 30 * 86_400_000;

  return (
    <>
      <header className="topbar">
        <h1>Prumo</h1>
        <div>
          <form action={syncNow} style={{ display: 'inline' }}>
            <button className="icon-btn" aria-label="Atualizar agora"><Icon name="refresh" /></button>
          </form>
          <form action={togglePrivacy} style={{ display: 'inline' }}>
            <button className="icon-btn" aria-label={privacy ? 'Mostrar valores' : 'Esconder valores'}>
              <Icon name={privacy ? 'eye-off' : 'eye'} />
            </button>
          </form>
        </div>
      </header>

      {issues.length > 0 && (
        <div className="banner error" role="status">
          <Icon name="alert" />
          <span>{issues.length === 1 ? 'Uma conexão precisa' : `${issues.length} conexões precisam`} de atenção.</span>
          <Link className="btn" href="/contas">Ver</Link>
        </div>
      )}
      {!issues.length && expiringSoon && (
        <div className="banner" role="status">
          <Icon name="alert" />
          <span>A autorização do Meu Pluggy vence em breve.</span>
          <Link className="btn" href="/contas">Renovar</Link>
        </div>
      )}

      <section className="hero" aria-label="Saldo">
        <div className="hero-label">Disponível nas contas</div>
        <div className="hero-value"><Amount cents={s.available_cents} balance /></div>
        <div className="hero-row">
          <div><span>Faturas abertas</span><strong><Amount cents={s.card_bills_cents} /></strong></div>
          <div><span>Investido</span><strong><Amount cents={s.invested_cents} /></strong></div>
        </div>
      </section>

      <section className="card" aria-label="Este mês">
        <h2>Este mês</h2>
        <div className="kv">
          <span className="muted">Entradas</span><Amount cents={s.month_income_cents} signed />
          <span className="muted">Saídas</span><Amount cents={s.month_expense_cents} />
          <span className="total">Resultado</span><span className="total"><Amount cents={result} signed balance /></span>
        </div>
      </section>

      {s.to_review > 0 && (
        <Link href="/revisar" className="banner">
          <Icon name="check" />
          <span><strong>{s.to_review}</strong> lançamento{s.to_review > 1 ? 's' : ''} para classificar</span>
          <span className="btn primary">Revisar</span>
        </Link>
      )}

      <div className="section-title"><h2>Contas</h2><Link href="/contas">ver todas</Link></div>
      <div className="accounts">
        {accounts.map((a) => (
          <div key={a.id} className="account-chip">
            <div className="name">{a.name}</div>
            <div className="value">
              {a.kind === 'credit_card'
                ? <><Amount cents={a.balance_cents} /> <span className="muted" style={{ fontSize: 12 }}>fatura</span></>
                : <Amount cents={a.balance_cents} balance />}
            </div>
          </div>
        ))}
        {accounts.length === 0 && <Link className="btn" href="/contas">Conectar meus bancos</Link>}
      </div>

      <div className="section-title"><h2>Últimos lançamentos</h2><Link href="/lancamentos">ver todos</Link></div>
      <TxList rows={recent} today={localDate()} />

      <p className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 16 }}>
        {s.last_synced_at ? `Sincronizado em ${timeFmt.format(s.last_synced_at)}` : 'Ainda não sincronizado'}
      </p>
    </>
  );
}
