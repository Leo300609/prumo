import { cookies } from 'next/headers';
import { db } from '../../../db/index.ts';
import { getAccounts, getConnections } from '../../../db/read.ts';
import { Amount } from '../../../components/Amount.tsx';
import { ConnectBank } from '../../../components/ConnectBank.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { ImportStatement } from '../../../components/ImportStatement.tsx';
import { createManualAccount, logout, setTheme, syncNow } from '../actions.ts';

const STATUS: Record<string, { label: string; tone: '' | 'warn' | 'error' }> = {
  active: { label: 'Em dia', tone: '' },
  syncing: { label: 'Sincronizando', tone: '' },
  needs_reauth: { label: 'Precisa reconectar', tone: 'error' },
  needs_action: { label: 'Aguardando você', tone: 'warn' },
  error: { label: 'Banco instável', tone: 'warn' },
};
const KIND: Record<string, string> = {
  checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão de crédito',
  cash: 'Dinheiro', wallet: 'Carteira digital', investment: 'Investimentos',
};
const dt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' });
const dtTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function ContasPage() {
  const [accounts, connections, theme, [lastJobError]] = await Promise.all([
    getAccounts(), getConnections(),
    cookies().then((c) => c.get('prumo_theme')?.value ?? 'system'),
    db()<{ kind: string; last_error: string }[]>`
      select kind, last_error from job where done_at is null and attempts >= max_attempts order by id desc limit 1`,
  ]);
  const manual = accounts.filter((a) => !a.connection_id);
  const isMeuPluggy = (name: string | null) => (name ?? '').toLowerCase().replace(/\s/g, '') === 'meupluggy';

  return (
    <>
      <header className="topbar">
        <h1>Contas</h1>
        <form action={syncNow}><button className="icon-btn" aria-label="Sincronizar agora"><Icon name="refresh" /></button></form>
      </header>

      <section className="card">
        <h2>Conexões</h2>
        {connections.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            Conecte seus bancos em <strong>meu.pluggy.ai</strong> e depois toque abaixo, escolhendo <strong>MeuPluggy</strong> no
            widget. É gratuito para uso pessoal (até 5 conexões).
          </p>
        )}
        {connections.map((c) => {
          const st = STATUS[c.status] ?? { label: c.status, tone: 'warn' as const };
          const expires = c.consent_expires_at;
          const soon = expires && expires.getTime() - Date.now() < 30 * 86_400_000;
          return (
            <div key={c.id} className="tx-row" style={{ paddingInline: 0, flexWrap: 'wrap' }}>
              <span className="tx-icon"><Icon name="link" size={20} /></span>
              <span className="tx-main">
                <span className="tx-desc">{c.connector_name ?? 'Conexão'}</span>
                <span className="tx-meta">
                  <span className={`badge ${st.tone}`}>{st.label}</span>
                  {c.last_synced_at && <> · {dtTime.format(c.last_synced_at)}</>}
                  {expires && <> · autorização até {dt.format(expires)}</>}
                </span>
              </span>
              {(c.status === 'needs_reauth' || soon) && (
                isMeuPluggy(c.connector_name)
                  // itens do MeuPluggy não aceitam atualização: renovar = autorizar de novo
                  ? <ConnectBank label="Renovar" />
                  : <ConnectBank label="Reconectar" updateItemId={c.item_id} />
              )}
              {c.status === 'needs_action' && (
                <a className="btn" href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">Abrir Meu Pluggy</a>
              )}
            </div>
          );
        })}
        <div style={{ marginTop: 12 }}><ConnectBank label="Conectar banco" /></div>
        {lastJobError && (
          <p className="muted" style={{ fontSize: 13 }}>Última falha persistente: {lastJobError.kind} — {lastJobError.last_error}</p>
        )}
      </section>

      <section className="card">
        <h2>Saldos</h2>
        <div className="kv">
          {accounts.map((a) => (
            <div key={a.id} style={{ display: 'contents' }}>
              <span>
                {a.name}
                <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                  {KIND[a.kind] ?? a.kind}{a.institution && !isMeuPluggy(a.institution) ? ` · ${a.institution}` : ''}
                  {a.kind === 'credit_card' && a.bill_due_date ? ` · vence ${dt.format(new Date(a.bill_due_date + 'T12:00:00Z'))}` : ''}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <Amount cents={a.balance_cents} balance={a.kind !== 'credit_card'} />
                {a.kind === 'credit_card' && a.available_limit_cents != null && (
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                    livre <Amount cents={a.available_limit_cents} />
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Conta manual</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Para dinheiro em espécie ou bancos fora do Open Finance (ex.: Revolut).</p>
        <form action={createManualAccount}>
          <div className="field"><label htmlFor="ma-name">Nome</label><input id="ma-name" name="name" required maxLength={60} /></div>
          <div className="field">
            <label htmlFor="ma-kind">Tipo</label>
            <select id="ma-kind" name="kind" defaultValue="cash">
              <option value="cash">Dinheiro</option><option value="wallet">Carteira digital</option>
              <option value="checking">Conta corrente</option><option value="credit_card">Cartão de crédito</option>
            </select>
          </div>
          <div className="field"><label htmlFor="ma-bal">Saldo inicial</label><input id="ma-bal" name="balance" inputMode="decimal" placeholder="0,00" /></div>
          <button className="btn block">Criar conta</button>
        </form>
      </section>

      <section className="card">
        <h2>Importar extrato</h2>
        <ImportStatement accounts={manual.map((a) => ({ id: a.id, name: a.name }))} />
      </section>

      <section className="card">
        <h2>Aparência</h2>
        <div className="chips">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <form key={t} action={setTheme.bind(null, t)}>
              <button className={`chip${theme === t ? ' active' : ''}`} aria-pressed={theme === t}>
                {t === 'system' ? 'Automático' : t === 'light' ? 'Claro' : 'Escuro'}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="card">
        <form action={logout.bind(null, false)}><button className="btn block"><Icon name="logout" /> Sair</button></form>
        <form action={logout.bind(null, true)} style={{ marginTop: 8 }}>
          <button className="btn block">Sair de todos os aparelhos</button>
        </form>
      </section>
    </>
  );
}
