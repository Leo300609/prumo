import Link from 'next/link';
import { q } from '../../../db/index.ts';
import { getTopCategories, type TxListRow } from '../../../db/read.ts';
import { Amount } from '../../../components/Amount.tsx';
import { Icon } from '../../../components/Icon.tsx';
import { localDate } from '../../../lib/time.ts';
import { categorizeFromForm, mergeManual } from '../actions.ts';

type Match = { manual_id: string; bank_id: string; manual_description: string; bank_description: string;
  date: Date; amount_cents: number; account_name: string };

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Conciliação em um toque: um lançamento por vez, com as categorias que você mais usa.
export default async function RevisarPage() {
  const [queue, matches] = await Promise.all([
    q<TxListRow>('list_transactions', ['review', '', null, null, 30]),
    q<Match>('match_manual'),
  ]);
  const today = localDate();
  const current = queue.find((t) => t.date <= today) ?? queue[0];
  const top = current ? await getTopCategories(current.amount_cents > 0 ? 1 : -1, 9) : [];

  return (
    <>
      <header className="topbar">
        <h1>A classificar</h1>
        <span className="muted">{queue.length}{queue.length === 30 ? '+' : ''}</span>
      </header>

      {matches.length > 0 && (
        <section className="card">
          <h2>Lançamentos repetidos?</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
            Você registrou estes à mão e o banco trouxe um igual. Juntar mantém o do banco e herda sua categoria e nota.
          </p>
          {matches.slice(0, 3).map((m) => (
            <div key={m.manual_id} className="tx-row" style={{ paddingInline: 0 }}>
              <span className="tx-main">
                <span className="tx-desc">{m.manual_description} ↔ {m.bank_description}</span>
                <span className="tx-meta">{dateFmt.format(m.date)} · {m.account_name} · <Amount cents={m.amount_cents} /></span>
              </span>
              <form action={mergeManual.bind(null, m.manual_id, m.bank_id)}>
                <button className="btn primary">Juntar</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {!current ? (
        <div className="empty">
          <Icon name="check" size={40} />
          <p>Tudo classificado. Seu mês está no prumo.</p>
          <Link className="btn" href="/">Voltar ao início</Link>
        </div>
      ) : (
        <section className="card" aria-live="polite">
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}><Amount cents={current.amount_cents} signed /></div>
            <div style={{ fontWeight: 600 }}>{current.description}</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {dateFmt.format(new Date(current.date + 'T00:00:00Z'))} · {current.account_name}
            </div>
          </div>
          <form>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {top.map((c) => (
                <button key={c.id} className="chip" formAction={categorizeFromForm.bind(null, current.id, c.id, '/revisar')}>
                  <Icon name={c.icon ?? 'question'} size={18} /> {c.name}
                </button>
              ))}
            </div>
            <label className="chip" style={{ margin: '16px auto 0', display: 'flex', width: 'fit-content' }}>
              <input type="checkbox" name="learn" defaultChecked /> Lembrar para os parecidos
            </label>
          </form>
          <p style={{ textAlign: 'center', marginBottom: 0 }}>
            <Link href={`/lancamentos/${current.id}`} className="btn">Outra categoria…</Link>
          </p>
        </section>
      )}
    </>
  );
}
