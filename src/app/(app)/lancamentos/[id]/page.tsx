import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategories, getTransaction } from '../../../../db/read.ts';
import { Amount } from '../../../../components/Amount.tsx';
import { Icon } from '../../../../components/Icon.tsx';
import { NoteForm } from '../../../../components/NoteForm.tsx';
import { safeFrom } from '../../../../lib/safe-from.ts';
import { categorizeFromForm, createCategory, deleteManual, saveNote, toggleReviewed, unpairTransfer } from '../../actions.ts';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });

export default async function TransactionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const back = safeFrom((await searchParams).from);
  const [tx, categories] = await Promise.all([getTransaction(id), getCategories()]);
  if (!tx) notFound();

  const sign = tx.amount_cents > 0 ? 1 : -1;
  const fits = categories.filter((c) => sign > 0
    ? ['income', 'transfer', 'investment'].includes(c.kind)
    : ['expense', 'transfer', 'investment'].includes(c.kind));
  const groups = new Map<string, typeof fits>();
  for (const c of fits) groups.set(c.parent_name ?? '', [...(groups.get(c.parent_name ?? '') ?? []), c]);

  return (
    <>
      <header className="topbar">
        <Link href={`${back}#tx-${id}`} className="icon-btn" aria-label="Voltar para a lista"><Icon name="back" /></Link>
        <h1 style={{ flex: 1, fontSize: 17 }}>Lançamento</h1>
      </header>

      <section className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 700 }}><Amount cents={tx.amount_cents} signed /></div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>{tx.description}</div>
        <div className="muted" style={{ fontSize: 14 }}>
          {dateFmt.format(new Date(tx.date + 'T00:00:00Z'))} · {tx.account_name}
          {tx.status === 'pending' && ' · pendente'}
          {tx.installment_total ? ` · parcela ${tx.installment_number}/${tx.installment_total}` : ''}
        </div>
        <div style={{ marginTop: 12 }}>
          <form action={toggleReviewed.bind(null, tx.id)} style={{ display: 'inline' }}>
            <button className={`chip${tx.reviewed ? ' active' : ''}`} aria-pressed={tx.reviewed}>
              <Icon name="check" size={18} /> {tx.reviewed ? 'Conferido' : 'Marcar como conferido'}
            </button>
          </form>
        </div>
      </section>

      {tx.is_transfer && (
        <div className="banner">
          <Icon name="arrows" />
          <span>Marcado como transferência entre suas contas (não conta como gasto).</span>
          <form action={unpairTransfer.bind(null, tx.id)}><button className="btn">Não é</button></form>
        </div>
      )}

      <section className="card">
        <h2>Categoria{tx.category_name ? `: ${tx.category_name}` : ''}</h2>
        <form>
          <label className="chip" style={{ marginBottom: 12 }}>
            <input type="checkbox" name="learn" defaultChecked /> Classificar os parecidos assim, sempre
          </label>
          {[...groups.entries()].map(([parent, cats]) => (
            <div key={parent} style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 13, margin: '4px 0 6px' }}>{parent || 'Outras categorias'}</div>
              <div className="chips">
                {cats.map((c) => (
                  <button key={c.id} className={`chip${c.id === tx.category_id ? ' active' : ''}`}
                    aria-pressed={c.id === tx.category_id}
                    formAction={categorizeFromForm.bind(null, tx.id, c.id, null)}>
                    <Icon name={c.icon ?? 'question'} size={18} /> {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </form>

        <details className="inv-edit" style={{ marginTop: 8 }}>
          <summary>Não achou? Criar uma categoria nova</summary>
          <form action={createCategory.bind(null, tx.id)}>
            <div className="field">
              <label htmlFor="cat-name">Nome da categoria</label>
              <input id="cat-name" name="name" required maxLength={40} placeholder="Ex.: Insumos" />
            </div>
            <div className="field">
              <label htmlFor="cat-parent">Dentro de qual grupo?</label>
              <select id="cat-parent" name="parent" defaultValue="">
                <option value="">Sem grupo (categoria própria)</option>
                {fits.filter((c) => !c.parent_name).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <label className="chip" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="learn" defaultChecked /> Classificar os parecidos assim, sempre
            </label>
            <button className="btn primary block">Criar e usar neste lançamento</button>
          </form>
        </details>
      </section>

      <section className="card">
        <NoteForm note={tx.note ?? ''} saveAction={saveNote.bind(null, tx.id)} />
      </section>

      {tx.source === 'manual' && (
        <form action={deleteManual.bind(null, tx.id)}>
          <button className="btn block">Excluir lançamento manual</button>
        </form>
      )}
    </>
  );
}
